import { fetchTdOptionChain, type TdChainAnalytics, type TdContract } from './_td-chain.ts';

export type StrikePressureSourceMode =
  | 'structured-chain'
  | 'structured-input'
  | 'ocr-heuristic'
  | 'unavailable';

export type StrikePressureLegInput = {
  strike: number;
  kind: 'put' | 'call';
  price?: number | null;
  delta?: number | null;
  impliedVol?: number | null;
  expiryBucket?: string | null;
  daysToExpiration?: number | null;
  openInterest?: number | null;
  totalVolume?: number | null;
};

type StrikePressurePair = {
  strike: number;
  putPrice: number | null;
  callPrice: number | null;
  putDelta: number | null;
  callDelta: number | null;
  impliedVol: number | null;
  expiryBucket: string | null;
  daysToExpiration: number | null;
  totalOpenInterest: number | null;
  totalVolume: number | null;
};

type PressureBias = 'put-dominant' | 'call-dominant' | 'balanced' | 'unknown';

type PressureDirection = 'bearish' | 'bullish' | 'neutral';

export type StrikePressureReading = {
  strike: number;
  spotRelation: 'spot-below-strike' | 'spot-above-strike' | 'spot-at-strike' | 'spot-unknown';
  putPrice: number | null;
  callPrice: number | null;
  putDelta: number | null;
  callDelta: number | null;
  impliedVol: number | null;
  expiryBucket: string | null;
  daysToExpiration: number | null;
  premiumBias: PressureBias;
  deltaBias: PressureBias;
  bearishScore: number;
  bullishScore: number;
  pressureRead: 'bearish pressure zone' | 'bullish pressure zone' | 'neutral / balanced strike';
  dealerImplication: string;
  levelRole: 'resistance candidate' | 'support candidate' | 'balance / pin candidate' | 'unclear';
  confidence: number;
  confidenceLabel: 'low' | 'medium' | 'high';
  explanation: string;
  notes: string[];
  neighboringAlignmentScore: number;
  neighboringAlignmentSummary: string;
};

export type StrikePressureResponse = {
  symbol: string;
  sourceMode: StrikePressureSourceMode;
  sourceLabel: string;
  spotPrice: number | null;
  focusStrike: number | null;
  focusReading: StrikePressureReading | null;
  nearbyReadings: StrikePressureReading[];
  uiSummary: string;
  notes: string[];
  screenshotHeuristic: boolean;
};

export type StrikePressureRequest = {
  symbol?: string;
  focusStrike?: number | null;
  spotPrice?: number | null;
  expiryBucket?: string | null;
  neighboringDepth?: number | null;
  structuredRows?: StrikePressureLegInput[] | null;
  ocrText?: string | null;
  ocrTable?: string[][] | null;
};

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw);
  const cleaned = raw.replace(/[$,%]/g, '').replace(/[()]/g, '').replace(/,/g, '').trim();
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function expiryBucketFromDays(days: number | null | undefined): string | null {
  if (days == null || !Number.isFinite(days)) return null;
  if (days <= 7) return '0-7d';
  if (days <= 30) return '8-30d';
  if (days <= 90) return '31-90d';
  return '90d+';
}

function normalizeBucket(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (/^0-?7d?$|week|front/.test(normalized)) return '0-7d';
  if (/^8-?30d?$|1m|month/.test(normalized)) return '8-30d';
  if (/^31-?90d?$|quarter|3m/.test(normalized)) return '31-90d';
  if (/90|\+|long/.test(normalized)) return '90d+';
  return normalized;
}

function normalizedDifference(left: number | null, right: number | null): number | null {
  if (left == null || right == null) return null;
  const denominator = Math.max(Math.abs(left) + Math.abs(right), Math.abs(left), Math.abs(right), 0.01);
  return clamp((left - right) / denominator, -1, 1);
}

function classifyBias(diff: number | null): PressureBias {
  if (diff == null) return 'unknown';
  if (Math.abs(diff) < 0.08) return 'balanced';
  return diff > 0 ? 'put-dominant' : 'call-dominant';
}

function confidenceLabel(score: number): 'low' | 'medium' | 'high' {
  if (score >= 75) return 'high';
  if (score >= 52) return 'medium';
  return 'low';
}

function spotRelation(spotPrice: number | null, strike: number): StrikePressureReading['spotRelation'] {
  if (spotPrice == null) return 'spot-unknown';
  if (Math.abs(spotPrice - strike) <= Math.max(0.1, strike * 0.0004)) return 'spot-at-strike';
  return spotPrice < strike ? 'spot-below-strike' : 'spot-above-strike';
}

function chainPrice(contract: TdContract | undefined): number | null {
  if (!contract) return null;
  return contract.mark ?? contract.last ?? null;
}

function rowInterest(pair: StrikePressurePair): number {
  return Math.max((pair.totalOpenInterest ?? 0) + (pair.totalVolume ?? 0), 0);
}

function comparePairs(left: StrikePressurePair, right: StrikePressurePair): number {
  const leftDays = left.daysToExpiration ?? Number.MAX_SAFE_INTEGER;
  const rightDays = right.daysToExpiration ?? Number.MAX_SAFE_INTEGER;
  if (leftDays !== rightDays) return leftDays - rightDays;
  return rowInterest(right) - rowInterest(left);
}

function buildPairsFromTdChain(
  chain: TdChainAnalytics,
  expiryBucket: string | null | undefined,
): StrikePressurePair[] {
  const byExpiryStrike = new Map<string, { strike: number; expiryBucket: string | null; daysToExpiration: number | null; call?: TdContract; put?: TdContract }>();

  chain.contracts.forEach((contract) => {
    const bucket = expiryBucketFromDays(contract.daysToExpiration);
    if (expiryBucket && bucket !== normalizeBucket(expiryBucket)) return;
    const key = `${contract.strike}|${contract.expirationDate}`;
    const existing = byExpiryStrike.get(key) ?? {
      strike: contract.strike,
      expiryBucket: bucket,
      daysToExpiration: contract.daysToExpiration,
    };
    if (contract.kind === 'call') existing.call = contract;
    if (contract.kind === 'put') existing.put = contract;
    byExpiryStrike.set(key, existing);
  });

  const preferredByStrike = new Map<number, StrikePressurePair>();
  for (const grouped of byExpiryStrike.values()) {
    if (!grouped.call || !grouped.put) continue;
    const pair: StrikePressurePair = {
      strike: grouped.strike,
      putPrice: chainPrice(grouped.put),
      callPrice: chainPrice(grouped.call),
      putDelta: grouped.put.delta != null ? Math.abs(grouped.put.delta) : null,
      callDelta: grouped.call.delta != null ? Math.abs(grouped.call.delta) : null,
      impliedVol: grouped.call.volatility ?? grouped.put.volatility ?? null,
      expiryBucket: grouped.expiryBucket,
      daysToExpiration: grouped.daysToExpiration,
      totalOpenInterest: grouped.call.openInterest + grouped.put.openInterest,
      totalVolume: grouped.call.totalVolume + grouped.put.totalVolume,
    };
    const existing = preferredByStrike.get(pair.strike);
    if (!existing || comparePairs(pair, existing) < 0) {
      preferredByStrike.set(pair.strike, pair);
    }
  }

  return [...preferredByStrike.values()].sort((left, right) => left.strike - right.strike);
}

function buildPairsFromStructuredRows(
  rows: StrikePressureLegInput[],
  expiryBucket: string | null | undefined,
): StrikePressurePair[] {
  const grouped = new Map<string, { strike: number; expiryBucket: string | null; daysToExpiration: number | null; call?: StrikePressureLegInput; put?: StrikePressureLegInput }>();
  const bucketFilter = normalizeBucket(expiryBucket);

  rows.forEach((row) => {
    const strike = normalizeNumber(row.strike);
    if (strike == null) return;
    const rowBucket = normalizeBucket(row.expiryBucket ?? expiryBucketFromDays(row.daysToExpiration ?? null));
    if (bucketFilter && rowBucket !== bucketFilter) return;
    const key = `${strike}|${rowBucket ?? 'all'}|${row.daysToExpiration ?? 'na'}`;
    const existing = grouped.get(key) ?? {
      strike,
      expiryBucket: rowBucket,
      daysToExpiration: row.daysToExpiration ?? null,
    };
    if (row.kind === 'call') existing.call = row;
    if (row.kind === 'put') existing.put = row;
    grouped.set(key, existing);
  });

  const preferredByStrike = new Map<number, StrikePressurePair>();
  for (const value of grouped.values()) {
    if (!value.call || !value.put) continue;
    const pair: StrikePressurePair = {
      strike: value.strike,
      putPrice: normalizeNumber(value.put.price),
      callPrice: normalizeNumber(value.call.price),
      putDelta: normalizeNumber(value.put.delta) != null ? Math.abs(normalizeNumber(value.put.delta) as number) : null,
      callDelta: normalizeNumber(value.call.delta) != null ? Math.abs(normalizeNumber(value.call.delta) as number) : null,
      impliedVol: normalizeNumber(value.call.impliedVol) ?? normalizeNumber(value.put.impliedVol),
      expiryBucket: value.expiryBucket,
      daysToExpiration: value.daysToExpiration,
      totalOpenInterest: (normalizeNumber(value.call.openInterest) ?? 0) + (normalizeNumber(value.put.openInterest) ?? 0),
      totalVolume: (normalizeNumber(value.call.totalVolume) ?? 0) + (normalizeNumber(value.put.totalVolume) ?? 0),
    };
    const existing = preferredByStrike.get(pair.strike);
    if (!existing || comparePairs(pair, existing) < 0) {
      preferredByStrike.set(pair.strike, pair);
    }
  }

  return [...preferredByStrike.values()].sort((left, right) => left.strike - right.strike);
}

function normalizeHeaderCell(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function buildRowsFromOcrText(ocrText: string | null | undefined): string[][] {
  return String(ocrText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes('|')) return line.split('|').map((part) => part.trim()).filter(Boolean);
      if (line.includes('\t')) return line.split(/\t+/).map((part) => part.trim()).filter(Boolean);
      if (line.includes(',')) return line.split(',').map((part) => part.trim()).filter(Boolean);
      return line.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
    })
    .filter((row) => row.length >= 3);
}

function findHeaderIndex(rows: string[][]): number {
  for (let index = 0; index < rows.length; index += 1) {
    const header = rows[index] ?? [];
    const normalized = header.map(normalizeHeaderCell);
    if (normalized.some((cell) => cell.includes('strike'))) return index;
    if (normalized.some((cell) => cell.includes('call')) && normalized.some((cell) => cell.includes('put'))) return index;
  }
  return rows.length && rows[0]!.some((cell) => /[a-z]/i.test(cell)) ? 0 : -1;
}

function headerIndex(headers: string[], predicate: (normalized: string) => boolean): number {
  return headers.findIndex((header) => predicate(normalizeHeaderCell(header)));
}

function parseOcrRowsToStructuredInput(input: {
  ocrText?: string | null;
  ocrTable?: string[][] | null;
  expiryBucket?: string | null;
}): { rows: StrikePressureLegInput[]; inferredSpotPrice: number | null; notes: string[] } {
  const notes: string[] = [];
  const rows = (input.ocrTable?.length ? input.ocrTable : buildRowsFromOcrText(input.ocrText)).map((row) => row.map((cell) => cell.trim()));
  if (!rows.length) {
    return { rows: [], inferredSpotPrice: null, notes: ['No OCR rows were supplied to the strike-pressure parser.'] };
  }

  const headerIdx = findHeaderIndex(rows);
  if (headerIdx < 0) {
    return {
      rows: [],
      inferredSpotPrice: extractSpotPriceFromOcr(input.ocrText),
      notes: ['OCR table could not identify a header row. Supply OCR text with strike/call/put labels for better parsing.'],
    };
  }

  const headers = rows[headerIdx] ?? [];
  const dataRows = rows.slice(headerIdx + 1);
  const strikeIdx = headerIndex(headers, (value) => value.includes('strike'));
  const callPriceIdx = headerIndex(headers, (value) => /(call|calls|ce)/.test(value) && /(price|mark|mid|last|premium|ltp|value|close)/.test(value));
  const putPriceIdx = headerIndex(headers, (value) => /(put|puts|pe)/.test(value) && /(price|mark|mid|last|premium|ltp|value|close)/.test(value));
  const callDeltaIdx = headerIndex(headers, (value) => /(call|calls|ce)/.test(value) && value.includes('delta'));
  const putDeltaIdx = headerIndex(headers, (value) => /(put|puts|pe)/.test(value) && value.includes('delta'));
  const callIvIdx = headerIndex(headers, (value) => /(call|calls|ce)/.test(value) && /(iv|imp|impliedvol)/.test(value));
  const putIvIdx = headerIndex(headers, (value) => /(put|puts|pe)/.test(value) && /(iv|imp|impliedvol)/.test(value));

  if (strikeIdx < 0 || (callPriceIdx < 0 && putPriceIdx < 0 && callDeltaIdx < 0 && putDeltaIdx < 0)) {
    return {
      rows: [],
      inferredSpotPrice: extractSpotPriceFromOcr(input.ocrText),
      notes: ['OCR table did not expose strike plus paired call/put columns clearly enough to interpret.'],
    };
  }

  const structuredRows: StrikePressureLegInput[] = [];
  dataRows.forEach((row) => {
    const strike = normalizeNumber(row[strikeIdx] ?? null);
    if (strike == null) return;

    const callPrice = normalizeNumber(callPriceIdx >= 0 ? row[callPriceIdx] : null);
    const putPrice = normalizeNumber(putPriceIdx >= 0 ? row[putPriceIdx] : null);
    const callDelta = normalizeNumber(callDeltaIdx >= 0 ? row[callDeltaIdx] : null);
    const putDelta = normalizeNumber(putDeltaIdx >= 0 ? row[putDeltaIdx] : null);
    const callIv = normalizeNumber(callIvIdx >= 0 ? row[callIvIdx] : null);
    const putIv = normalizeNumber(putIvIdx >= 0 ? row[putIvIdx] : null);

    if (callPrice != null || callDelta != null || callIv != null) {
      structuredRows.push({
        strike,
        kind: 'call',
        price: callPrice,
        delta: callDelta,
        impliedVol: callIv,
        expiryBucket: input.expiryBucket ?? null,
      });
    }

    if (putPrice != null || putDelta != null || putIv != null) {
      structuredRows.push({
        strike,
        kind: 'put',
        price: putPrice,
        delta: putDelta,
        impliedVol: putIv,
        expiryBucket: input.expiryBucket ?? null,
      });
    }
  });

  if (!structuredRows.length) {
    notes.push('OCR parsing found the strike header but could not recover usable numeric legs.');
  } else {
    notes.push('OCR screenshot mode is heuristic only until chain/OI/volume confirms the same strike pressure.');
  }

  return {
    rows: structuredRows,
    inferredSpotPrice: extractSpotPriceFromOcr(input.ocrText),
    notes,
  };
}

function extractSpotPriceFromOcr(ocrText: string | null | undefined): number | null {
  const text = String(ocrText || '');
  const match = text.match(/(?:spot|underlying|last|price)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  return match ? normalizeNumber(match[1]) : null;
}

function pickFocusPair(
  pairs: StrikePressurePair[],
  focusStrike: number | null | undefined,
  spotPrice: number | null | undefined,
): StrikePressurePair | null {
  if (!pairs.length) return null;
  const anchor = normalizeNumber(focusStrike) ?? spotPrice ?? null;
  if (anchor != null) {
    return [...pairs].sort((left, right) => Math.abs(left.strike - anchor) - Math.abs(right.strike - anchor))[0] ?? null;
  }
  return pairs[Math.floor(pairs.length / 2)] ?? null;
}

function directionalBiasFromScores(bearishScore: number, bullishScore: number): PressureDirection {
  const dominant = Math.max(bearishScore, bullishScore);
  if (dominant < 20) return 'neutral';
  if (Math.abs(bearishScore - bullishScore) < 8 && dominant < 35) return 'neutral';
  return bearishScore > bullishScore ? 'bearish' : 'bullish';
}

function neighborAlignmentSummary(direction: PressureDirection, neighbors: StrikePressurePair[]): {
  score: number;
  summary: string;
} {
  if (!neighbors.length || direction === 'neutral') {
    return { score: 50, summary: 'No meaningful neighboring-strike confirmation yet.' };
  }

  let aligned = 0;
  let conflicting = 0;
  let neutral = 0;

  neighbors.forEach((neighbor) => {
    const premium = normalizedDifference(neighbor.putPrice, neighbor.callPrice);
    const delta = normalizedDifference(neighbor.putDelta, neighbor.callDelta);
    const bearish = Math.max(premium ?? 0, 0) * 0.55 + Math.max(delta ?? 0, 0) * 0.45;
    const bullish = Math.max(-(premium ?? 0), 0) * 0.55 + Math.max(-(delta ?? 0), 0) * 0.45;
    const directionForNeighbor = directionalBiasFromScores(Math.round(bearish * 100), Math.round(bullish * 100));
    if (directionForNeighbor === 'neutral') neutral += 1;
    else if (directionForNeighbor === direction) aligned += 1;
    else conflicting += 1;
  });

  const effective = aligned + conflicting + neutral;
  if (!effective) return { score: 50, summary: 'No meaningful neighboring-strike confirmation yet.' };
  const score = clamp(Math.round(((aligned + (neutral * 0.5)) / effective) * 100), 0, 100);
  if (aligned > conflicting) {
    return { score, summary: `${aligned} nearby strike(s) broadly agree with the read and ${conflicting} conflict.` };
  }
  if (conflicting > aligned) {
    return { score, summary: `${conflicting} nearby strike(s) conflict with the read, so treat this level cautiously.` };
  }
  return { score, summary: 'Nearby strikes are mixed, so the single-strike read is not strongly confirmed.' };
}

function evaluatePair(input: {
  pair: StrikePressurePair;
  spotPrice: number | null;
  sourceMode: StrikePressureSourceMode;
  neighboringPairs: StrikePressurePair[];
}): StrikePressureReading {
  const premiumDiff = normalizedDifference(input.pair.putPrice, input.pair.callPrice);
  const deltaDiff = normalizedDifference(input.pair.putDelta, input.pair.callDelta);
  const premiumBias = classifyBias(premiumDiff);
  const deltaBias = classifyBias(deltaDiff);

  const premiumWeight = premiumDiff == null ? 0 : 0.55;
  const deltaWeight = deltaDiff == null ? 0 : 0.45;
  const totalWeight = premiumWeight + deltaWeight || 1;
  const bearishScore = Math.round((((Math.max(premiumDiff ?? 0, 0) * premiumWeight) + (Math.max(deltaDiff ?? 0, 0) * deltaWeight)) / totalWeight) * 100);
  const bullishScore = Math.round((((Math.max(-(premiumDiff ?? 0), 0) * premiumWeight) + (Math.max(-(deltaDiff ?? 0), 0) * deltaWeight)) / totalWeight) * 100);
  const direction = directionalBiasFromScores(bearishScore, bullishScore);
  const neighborAlignment = neighborAlignmentSummary(direction, input.neighboringPairs);

  let confidence = 35;
  if (premiumBias !== 'unknown') confidence += 14;
  if (deltaBias !== 'unknown') confidence += 14;
  if (premiumBias !== 'balanced' && premiumBias !== 'unknown' && premiumBias === deltaBias) confidence += 14;
  if (
    premiumBias !== 'unknown'
    && deltaBias !== 'unknown'
    && premiumBias !== 'balanced'
    && deltaBias !== 'balanced'
    && premiumBias !== deltaBias
  ) confidence -= 8;
  if (input.pair.impliedVol != null) confidence += 4;
  if ((input.pair.totalOpenInterest ?? 0) > 0 || (input.pair.totalVolume ?? 0) > 0) {
    confidence += clamp(Math.round(Math.log10(1 + rowInterest(input.pair)) * 3), 2, 10);
  }
  confidence += Math.round((neighborAlignment.score - 50) * 0.12);
  if (input.sourceMode === 'structured-chain') confidence += 10;
  if (input.sourceMode === 'structured-input') confidence += 5;
  if (input.sourceMode === 'ocr-heuristic') confidence -= 12;
  if (direction === 'neutral') confidence -= 6;
  confidence = clamp(confidence, 18, 94);

  const role: StrikePressureReading['levelRole'] = direction === 'bearish'
    ? 'resistance candidate'
    : direction === 'bullish'
      ? 'support candidate'
      : premiumBias === 'balanced' && deltaBias === 'balanced'
        ? 'balance / pin candidate'
        : 'unclear';

  const pressureRead: StrikePressureReading['pressureRead'] = direction === 'bearish'
    ? 'bearish pressure zone'
    : direction === 'bullish'
      ? 'bullish pressure zone'
      : 'neutral / balanced strike';

  const dealerImplication = direction === 'bearish'
    ? 'Put-side pressure is stronger here, so rallies into this strike can meet dealer sell-into-strength or resistance-style hedging pressure.'
    : direction === 'bullish'
      ? 'Call-side pressure is stronger here, so dips into this strike can attract buy-on-dip or support-style dealer hedging pressure.'
      : 'The strike looks more balanced than directional, so it is better treated as a pin / balance zone until nearby strikes or flow confirm a stronger lean.';

  const notes = [
    'Single-strike premium and delta are only a heuristic until neighboring strikes, gamma, open interest, volume, and expiry structure agree.',
    ...(input.sourceMode === 'ocr-heuristic' ? ['Screenshot-based strike reads are heuristic until the structured chain confirms the same pattern.'] : []),
    ...(neighborAlignment.score < 45 ? ['Neighboring strikes are not confirming this read yet.'] : []),
    ...((input.pair.totalOpenInterest ?? 0) <= 0 && (input.pair.totalVolume ?? 0) <= 0 ? ['Open-interest and volume support are missing at this strike.'] : []),
  ];

  const premiumClause = premiumBias === 'put-dominant'
    ? 'puts are more expensive than calls'
    : premiumBias === 'call-dominant'
      ? 'calls are more expensive than puts'
      : premiumBias === 'balanced'
        ? 'put and call premium look broadly balanced'
        : 'premium data are incomplete';
  const deltaClause = deltaBias === 'put-dominant'
    ? 'put delta is stronger than call delta'
    : deltaBias === 'call-dominant'
      ? 'call delta is stronger than put delta'
      : deltaBias === 'balanced'
        ? 'put and call delta look balanced'
        : 'delta data are incomplete';
  const implicationClause = direction === 'bearish'
    ? 'This leans toward downside protection demand and a resistance-style response if price rallies into the strike.'
    : direction === 'bullish'
      ? 'This leans toward upside participation and a support-style response if price dips into the strike.'
      : 'This is closer to a balance / pin read than a directional pressure zone.';

  return {
    strike: input.pair.strike,
    spotRelation: spotRelation(input.spotPrice, input.pair.strike),
    putPrice: input.pair.putPrice,
    callPrice: input.pair.callPrice,
    putDelta: input.pair.putDelta,
    callDelta: input.pair.callDelta,
    impliedVol: input.pair.impliedVol,
    expiryBucket: input.pair.expiryBucket,
    daysToExpiration: input.pair.daysToExpiration,
    premiumBias,
    deltaBias,
    bearishScore,
    bullishScore,
    pressureRead,
    dealerImplication,
    levelRole: role,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    explanation: `At strike ${round(input.pair.strike, 2)}, ${premiumClause} and ${deltaClause}. ${implicationClause}`,
    notes: [...new Set(notes)],
    neighboringAlignmentScore: neighborAlignment.score,
    neighboringAlignmentSummary: neighborAlignment.summary,
  };
}

function buildUnavailableResponse(symbol: string, notes: string[], sourceMode: StrikePressureSourceMode = 'unavailable'): StrikePressureResponse {
  return {
    symbol,
    sourceMode,
    sourceLabel: sourceMode === 'ocr-heuristic'
      ? 'OCR screenshot parsing is available, but the table did not yield enough paired strike data to classify pressure.'
      : 'Direct strike-pressure interpretation is unavailable because neither a structured same-strike chain nor usable OCR table was supplied.',
    spotPrice: null,
    focusStrike: null,
    focusReading: null,
    nearbyReadings: [],
    uiSummary: 'Strike pressure unavailable.',
    notes,
    screenshotHeuristic: sourceMode === 'ocr-heuristic',
  };
}

function buildResponseFromPairs(input: {
  symbol: string;
  sourceMode: StrikePressureSourceMode;
  spotPrice: number | null;
  focusStrike?: number | null;
  neighboringDepth?: number | null;
  notes?: string[];
  pairs: StrikePressurePair[];
}): StrikePressureResponse {
  if (!input.pairs.length) {
    return buildUnavailableResponse(
      input.symbol,
      [...(input.notes ?? []), 'No same-strike put/call pairs were available after filtering the input.'],
      input.sourceMode,
    );
  }

  const focusPair = pickFocusPair(input.pairs, input.focusStrike, input.spotPrice);
  if (!focusPair) {
    return buildUnavailableResponse(
      input.symbol,
      [...(input.notes ?? []), 'No focus strike could be resolved from the available pairs.'],
      input.sourceMode,
    );
  }

  const neighboringDepth = Math.max(1, Math.min(4, Math.round(input.neighboringDepth ?? 2)));
  const nearbyPairs = [...input.pairs]
    .filter((pair) => pair.strike !== focusPair.strike)
    .sort((left, right) => Math.abs(left.strike - focusPair.strike) - Math.abs(right.strike - focusPair.strike))
    .slice(0, neighboringDepth * 2);

  const focusReading = evaluatePair({
    pair: focusPair,
    spotPrice: input.spotPrice,
    sourceMode: input.sourceMode,
    neighboringPairs: nearbyPairs,
  });
  const nearbyReadings = nearbyPairs
    .slice(0, neighboringDepth)
    .map((pair) => evaluatePair({
      pair,
      spotPrice: input.spotPrice,
      sourceMode: input.sourceMode,
      neighboringPairs: input.pairs.filter((candidate) => candidate.strike !== pair.strike).slice(0, neighboringDepth),
    }));

  const sourceLabel = input.sourceMode === 'structured-chain'
    ? 'Strike pressure uses same-strike call/put premium plus delta from the structured option chain. Confirm it with gamma, OI, volume, and nearby strikes.'
    : input.sourceMode === 'structured-input'
      ? 'Strike pressure uses supplied structured option rows and shares the same scoring/caveat schema as live chain mode.'
      : 'Strike pressure uses OCR-parsed screenshot rows. Treat it as heuristic until chain data confirms the same strike pattern.';

  return {
    symbol: input.symbol,
    sourceMode: input.sourceMode,
    sourceLabel,
    spotPrice: input.spotPrice,
    focusStrike: focusPair.strike,
    focusReading,
    nearbyReadings,
    uiSummary: focusReading.explanation,
    notes: [...new Set([...(input.notes ?? []), ...focusReading.notes])],
    screenshotHeuristic: input.sourceMode === 'ocr-heuristic',
  };
}

export function interpretStrikePressureFromRows(input: {
  symbol?: string;
  spotPrice?: number | null;
  focusStrike?: number | null;
  expiryBucket?: string | null;
  neighboringDepth?: number | null;
  rows: StrikePressureLegInput[];
  sourceMode?: Exclude<StrikePressureSourceMode, 'structured-chain' | 'unavailable'>;
}): StrikePressureResponse {
  const symbol = String(input.symbol || 'XAUUSD').toUpperCase();
  const sourceMode = input.sourceMode ?? 'structured-input';
  const pairs = buildPairsFromStructuredRows(input.rows, input.expiryBucket);
  return buildResponseFromPairs({
    symbol,
    sourceMode,
    spotPrice: input.spotPrice ?? null,
    focusStrike: input.focusStrike,
    neighboringDepth: input.neighboringDepth,
    notes: sourceMode === 'ocr-heuristic'
      ? ['OCR mode can recover strike pressure, but it remains a heuristic until chain/OI/volume confirm it.']
      : [],
    pairs,
  });
}

export function interpretStrikePressureFromOcr(input: {
  symbol?: string;
  spotPrice?: number | null;
  focusStrike?: number | null;
  expiryBucket?: string | null;
  neighboringDepth?: number | null;
  ocrText?: string | null;
  ocrTable?: string[][] | null;
}): StrikePressureResponse {
  const symbol = String(input.symbol || 'XAUUSD').toUpperCase();
  const parsed = parseOcrRowsToStructuredInput(input);
  if (!parsed.rows.length) {
    return buildUnavailableResponse(symbol, parsed.notes, 'ocr-heuristic');
  }

  return interpretStrikePressureFromRows({
    symbol,
    spotPrice: input.spotPrice ?? parsed.inferredSpotPrice,
    focusStrike: input.focusStrike,
    expiryBucket: input.expiryBucket,
    neighboringDepth: input.neighboringDepth,
    rows: parsed.rows,
    sourceMode: 'ocr-heuristic',
  });
}

export async function interpretStrikePressure(input: StrikePressureRequest): Promise<StrikePressureResponse> {
  const symbol = String(input.symbol || 'XAUUSD').toUpperCase();

  if (input.ocrText || input.ocrTable?.length) {
    return interpretStrikePressureFromOcr({
      symbol,
      spotPrice: input.spotPrice,
      focusStrike: input.focusStrike,
      expiryBucket: input.expiryBucket,
      neighboringDepth: input.neighboringDepth,
      ocrText: input.ocrText,
      ocrTable: input.ocrTable,
    });
  }

  if (input.structuredRows?.length) {
    return interpretStrikePressureFromRows({
      symbol,
      spotPrice: input.spotPrice,
      focusStrike: input.focusStrike,
      expiryBucket: input.expiryBucket,
      neighboringDepth: input.neighboringDepth,
      rows: input.structuredRows,
    });
  }

  const chain = await fetchTdOptionChain(symbol);
  if (!chain) {
    return buildUnavailableResponse(
      symbol,
      ['No structured option chain is available for this symbol. Provide OCR output or structured rows to use screenshot mode or external chain mode.'],
    );
  }

  const pairs = buildPairsFromTdChain(chain, input.expiryBucket);
  return buildResponseFromPairs({
    symbol,
    sourceMode: 'structured-chain',
    spotPrice: chain.underlyingPrice,
    focusStrike: input.focusStrike,
    neighboringDepth: input.neighboringDepth,
    pairs,
    notes: [
      `Underlying proxy ${chain.proxyUnderlying} with ${chain.totalOpenInterest.toLocaleString()} total OI and ${chain.totalVolume.toLocaleString()} total volume.`,
      'Single-strike readings stay heuristic unless nearby strikes, gamma context, open interest, volume, and expiry structure agree.',
    ],
  });
}
