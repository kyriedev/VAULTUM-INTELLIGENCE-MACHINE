import { normalizeVaultumTimeframe } from '../../_shared/timeframes.ts';

type EntryMapSnapshot = any;

type ExecutionPhase = 'impulse' | 'correction' | 'continuation' | 'reversal' | 'transition';
type SetupType = 'continuation' | 'reversal' | 'no-trade';
type StructureStatus = 'valid' | 'invalid' | 'unclear';
type ParticipationState = 'confirmed' | 'building' | 'absent';
type Direction = 'long' | 'short' | 'neutral';
type AlignmentState = 'aligned' | 'mixed' | 'conflicted' | 'unknown';

type RawOhlcInput =
  | { time?: string | number; open?: number; high?: number; low?: number; close?: number; volume?: number | null }
  | [string | number, number, number, number, number, number?];

type NormalizedBar = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

type StructureBias = 'bullish' | 'bearish' | 'range' | 'transition';

type ParsedVisionChartLogic = {
  chartReadSummary?: string;
  chartBias?: 'bullish' | 'bearish' | 'neutral';
  majorStructure?: string;
  minorStructure?: string;
  phase?: ExecutionPhase | 'unclear';
  setupType?: SetupType;
  structureStatus?: StructureStatus;
  zoneLabel?: string;
  broadZone?: string;
  bestEntryPrice?: number;
  invalidation?: number;
  tp1?: number;
  tp2?: number;
  keyEvents?: string[];
  actionLines?: string[];
  missing?: string[];
  invalidates?: string[];
  extractedLevels?: string[];
  participation?: {
    state?: ParticipationState;
    liquidityInteraction?: string;
    displacementReaction?: string;
    microStructureShift?: string;
  };
};

export interface VaultumChartLogicDecision {
  majorStructure: string;
  minorStructure: string;
  phase: ExecutionPhase | 'unclear';
  setupType: SetupType;
  structureStatus: StructureStatus;
  bias: 'bullish' | 'bearish' | 'neutral';
  zoneLabel: string;
  zone: string;
  executionLayer: string;
  bestEntryPrice: string;
  invalidation: string;
  tp1: string;
  tp2: string;
  participation: {
    state: ParticipationState;
    liquidityInteraction: string;
    displacementReaction: string;
    microStructureShift: string;
  };
  keyEvents: string[];
  actionLines: string[];
  missing: string[];
  invalidates: string[];
  summary: string;
  sourceLineage: string[];
}

export interface VaultumChartLogicLiveReference {
  phase: ExecutionPhase;
  readiness: 'ready' | 'watch' | 'stand-aside';
  chartDirective: string;
  phaseSummary: string;
  tradeThesisSummary: string;
  institutionalReference: string;
  institutionalReferenceZone: string;
  entryZone: string;
  trimZone: string;
  invalidationLevel: string;
  modelTwoConfluenceScore: number;
  modelTwoConfluenceLabel: string;
  modelTwoConfluenceSummary: string;
  volumeContext: string;
  dealerContext: string;
  structureContext: string;
}

export interface VaultumChartLogicResponse {
  provider: string | null;
  providerTrace: string[];
  market: string;
  timeframe: string;
  mode: 'image+live' | 'image-only' | 'ohlc+live' | 'ohlc-only' | 'live-only';
  imageReviewed: boolean;
  ohlcReviewed: boolean;
  exampleStored: boolean;
  chartReadSummary: string;
  extractedLevels: string[];
  visualSignals: string[];
  liveAlignment: AlignmentState;
  chartLogic: VaultumChartLogicDecision;
  liveReference: VaultumChartLogicLiveReference | null;
  knowledgeContext: {
    summary: string;
    focusConcepts: string[];
    structureRules: Array<{ label: string; operationalUse: string; whenItMatters: string }>;
    macroRules: Array<{ label: string; operationalUse: string; whenItMatters: string }>;
    sourceLineage: string[];
    agentFocus: Array<{ key: string; label: string; mission: string }>;
    modelRouting: any;
  } | null;
}

function safeString(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function formatPrice(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : 'n/a';
}

function formatRange(low: number | null | undefined, high: number | null | undefined): string {
  if (low == null || high == null || !Number.isFinite(low) || !Number.isFinite(high)) return 'n/a';
  return `${Math.min(low, high).toFixed(2)}-${Math.max(low, high).toFixed(2)}`;
}

function parsePrice(text: string | null | undefined): number | null {
  const match = String(text || '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseNumbers(text: string | null | undefined): number[] {
  return [...String(text || '').matchAll(/-?\d+(?:\.\d+)?/g)]
    .map((match) => Number(match[0]))
    .filter((value) => Number.isFinite(value));
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function normalizeMarket(input?: string): string {
  const market = String(input || 'XAUUSD').trim().toUpperCase();
  if (market === 'GOLD' || market === 'XAU') return 'XAUUSD';
  return market || 'XAUUSD';
}

function normalizeTime(value: string | number | undefined, index: number): string {
  if (typeof value === 'string' && value.trim()) return new Date(value).toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  return new Date(Date.now() - ((index + 1) * 60_000)).toISOString();
}

function normalizeOhlcBars(input?: RawOhlcInput[]): NormalizedBar[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item, index) => Array.isArray(item)
      ? {
          time: normalizeTime(item[0], index),
          open: Number(item[1]),
          high: Number(item[2]),
          low: Number(item[3]),
          close: Number(item[4]),
          volume: item[5] == null ? null : Number(item[5]),
        }
      : {
          time: normalizeTime(item.time, index),
          open: Number(item.open),
          high: Number(item.high),
          low: Number(item.low),
          close: Number(item.close),
          volume: item.volume == null ? null : Number(item.volume),
        })
    .filter((bar) => Number.isFinite(bar.open) && Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close))
    .sort((left, right) => left.time.localeCompare(right.time));
}

function barRange(bar: NormalizedBar): number {
  return Math.max(bar.high - bar.low, 0.0001);
}

function barBody(bar: NormalizedBar): number {
  return Math.abs(bar.close - bar.open);
}

function closeNearExtreme(bar: NormalizedBar, direction: Direction): boolean {
  const range = barRange(bar);
  if (direction === 'long') return ((bar.close - bar.low) / range) >= 0.72;
  if (direction === 'short') return ((bar.high - bar.close) / range) >= 0.72;
  return false;
}

function directionFromBias(bias: StructureBias): Direction {
  if (bias === 'bullish') return 'long';
  if (bias === 'bearish') return 'short';
  return 'neutral';
}

function biasLabel(direction: Direction): 'bullish' | 'bearish' | 'neutral' {
  if (direction === 'long') return 'bullish';
  if (direction === 'short') return 'bearish';
  return 'neutral';
}

function majorStructureLine(direction: Direction): string {
  if (direction === 'long') return 'Bullish major structure.';
  if (direction === 'short') return 'Bearish major structure.';
  return 'No trade.';
}

function minorStructureLine(direction: Direction, phase: ExecutionPhase | 'unclear'): string {
  if (direction === 'neutral' || phase === 'unclear' || phase === 'transition') return 'Structure is unclear.';
  if (phase === 'correction') return `Minor correction into ${direction === 'long' ? 'demand' : 'supply'}.`;
  if (phase === 'continuation') return `Continuation setup from the ${direction === 'long' ? 'demand' : 'supply'} side of structure.`;
  if (phase === 'reversal') return 'Reversal setup is forming inside the structure area.';
  if (phase === 'impulse') return 'Impulse is active. Wait for correction.';
  return 'Structure is unclear.';
}

function extractJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

function buildLiveReference(entryMap: EntryMapSnapshot): VaultumChartLogicLiveReference {
  return {
    phase: entryMap.phase,
    readiness: entryMap.readiness,
    chartDirective: entryMap.chartDirective ?? entryMap.executionRead,
    phaseSummary: entryMap.phaseSummary,
    tradeThesisSummary: entryMap.tradeThesisSummary,
    institutionalReference: entryMap.institutionalReference,
    institutionalReferenceZone: entryMap.institutionalReferenceZone,
    entryZone: entryMap.entryZone,
    trimZone: entryMap.trimZone,
    invalidationLevel: entryMap.invalidationLevel,
    modelTwoConfluenceScore: entryMap.modelTwoConfluenceScore,
    modelTwoConfluenceLabel: entryMap.modelTwoConfluenceLabel,
    modelTwoConfluenceSummary: entryMap.modelTwoConfluenceSummary,
    volumeContext: entryMap.volumeContext,
    dealerContext: entryMap.dealerContext,
    structureContext: entryMap.structureContext,
  };
}

function buildChartLogicFromEntryMap(entryMap: EntryMapSnapshot): VaultumChartLogicDecision {
  const direction = entryMap.direction;
  const zone = entryMap.institutionalReferenceZone || entryMap.structureZone || entryMap.entryZone || 'n/a';
  const preferredEntry = parsePrice(entryMap.preferredEntryLevel || entryMap.executionLayer?.rankedLevels?.[0]?.level || '');
  const invalidation = parsePrice(entryMap.invalidationLevel);
  const targets = unique(parseNumbers(entryMap.targetLogic).map((value) => formatPrice(value)));
  const liquidityStatus = entryMap.operatorChecklist.find((item: any) => item.key === 'liquidity-sweep')?.status ?? 'fail';
  const displacementStatus = entryMap.operatorChecklist.find((item: any) => item.key === 'displacement')?.status ?? 'fail';
  const minorStatus = entryMap.operatorChecklist.find((item: any) => item.key === 'minor-structure')?.status ?? 'fail';
  const participationState: ParticipationState =
    liquidityStatus === 'pass' && displacementStatus === 'pass' && minorStatus === 'pass'
      ? 'confirmed'
      : liquidityStatus !== 'fail' || displacementStatus !== 'fail' || minorStatus !== 'fail'
        ? 'building'
        : 'absent';
  const setupType: SetupType = direction === 'neutral' || entryMap.phase === 'transition'
    ? 'no-trade'
    : entryMap.phase === 'reversal'
      ? 'reversal'
      : 'continuation';

  const actionWord = direction === 'short' ? 'sell' : 'buy';
  const actionLines = direction === 'neutral' || entryMap.phase === 'transition'
    ? ['No trade.', 'Structure is unclear.']
    : [
        majorStructureLine(direction),
        minorStructureLine(direction, entryMap.phase),
        `Plot zone: ${zone}.`,
        entryMap.readiness === 'ready'
          ? `${actionWord === 'buy' ? 'Buy' : 'Sell'} from this price: ${formatPrice(preferredEntry)}.`
          : entryMap.phase === 'impulse'
            ? `Wait for correction. Best ${actionWord} price: ${formatPrice(preferredEntry)}.`
            : 'Wait for reaction.',
        `Best ${actionWord} price: ${formatPrice(preferredEntry)}.`,
        `SL: ${formatPrice(invalidation)}.`,
        targets[0] ? `TP1: ${targets[0]}.` : null,
        targets[1] ? `TP2: ${targets[1]}.` : null,
      ].filter((item): item is string => Boolean(item));

  return {
    majorStructure: entryMap.majorStructure ?? majorStructureLine(direction),
    minorStructure: entryMap.minorStructure ?? minorStructureLine(direction, entryMap.phase),
    phase: entryMap.phase,
    setupType,
    structureStatus: direction === 'neutral' || entryMap.phase === 'transition' ? 'unclear' : 'valid',
    bias: biasLabel(direction),
    zoneLabel: direction === 'long' ? 'demand' : direction === 'short' ? 'supply' : 'neutral',
    zone,
    executionLayer: entryMap.executionLayer.rankingSummary,
    bestEntryPrice: formatPrice(preferredEntry),
    invalidation: formatPrice(invalidation),
    tp1: targets[0] ?? 'n/a',
    tp2: targets[1] ?? 'n/a',
    participation: {
      state: participationState,
      liquidityInteraction: entryMap.operatorChecklist.find((item: any) => item.key === 'liquidity-sweep')?.detail ?? 'Liquidity interaction is still unclear.',
      displacementReaction: entryMap.operatorChecklist.find((item: any) => item.key === 'displacement')?.detail ?? 'Displacement still needs confirmation.',
      microStructureShift: entryMap.operatorChecklist.find((item: any) => item.key === 'minor-structure')?.detail ?? 'Micro structure shift is still unclear.',
    },
    keyEvents: unique([
      entryMap.breakOfStructure,
      entryMap.institutionalReference,
      entryMap.triggerPattern,
      entryMap.footprintConfluence,
      entryMap.absorptionContext,
      ...entryMap.supportingSignals.slice(0, 4),
    ]),
    actionLines,
    missing: unique([...entryMap.explainability.whatIsMissing.slice(0, 4), ...entryMap.noTradeReasons.slice(0, 3)]),
    invalidates: unique([...entryMap.explainability.whatInvalidates.slice(0, 4), `Bias invalidates beyond ${entryMap.invalidationLevel}.`]),
    summary: entryMap.tradeThesisSummary,
    sourceLineage: ['Structure-first map from analytics.get_entry_map.', `Execution layer from ${entryMap.institutionalReference} at ${zone}.`, entryMap.volumeContext],
  };
}

function detectStructureBias(bars: NormalizedBar[], windowSize: number): {
  bias: StructureBias;
  quality: 'clear' | 'building' | 'weak';
  rangeLow: number;
  rangeHigh: number;
  summary: string;
} {
  const recent = bars.slice(-Math.max(windowSize, 8));
  if (recent.length < 8) {
    return {
      bias: 'transition',
      quality: 'weak',
      rangeLow: NaN,
      rangeHigh: NaN,
      summary: 'Structure is still loading.',
    };
  }

  const split = Math.max(4, Math.floor(recent.length / 2));
  const early = recent.slice(0, split);
  const late = recent.slice(-split);
  const earlyHigh = Math.max(...early.map((bar) => bar.high));
  const earlyLow = Math.min(...early.map((bar) => bar.low));
  const lateHigh = Math.max(...late.map((bar) => bar.high));
  const lateLow = Math.min(...late.map((bar) => bar.low));
  const drift = recent[recent.length - 1]!.close - recent[0]!.close;
  const avgRange = average(recent.map(barRange));
  const directionalDistance = Math.abs(drift) / Math.max(avgRange, 0.0001);
  const higherHighs = lateHigh > earlyHigh;
  const higherLows = lateLow > earlyLow;
  const lowerHighs = lateHigh < earlyHigh;
  const lowerLows = lateLow < earlyLow;

  let bias: StructureBias = 'transition';
  if (higherHighs && higherLows && drift > 0) bias = 'bullish';
  else if (lowerHighs && lowerLows && drift < 0) bias = 'bearish';
  else if (Math.abs(drift) <= avgRange * 1.15) bias = 'range';

  const quality = bias === 'range' || bias === 'transition'
    ? directionalDistance >= 1.6 ? 'building' : 'weak'
    : directionalDistance >= 2.2 ? 'clear' : directionalDistance >= 1.2 ? 'building' : 'weak';

  return {
    bias,
    quality,
    rangeLow: Math.min(...recent.map((bar) => bar.low)),
    rangeHigh: Math.max(...recent.map((bar) => bar.high)),
    summary: bias === 'bullish'
      ? 'Bullish structure is printing higher highs and higher lows.'
      : bias === 'bearish'
        ? 'Bearish structure is printing lower highs and lower lows.'
        : bias === 'range'
          ? 'Structure is balanced and rotational.'
          : 'Structure is transitioning and still unstable.',
  };
}

function detectSweep(bars: NormalizedBar[]): { direction: Direction; level: number | null; summary: string; present: boolean } {
  if (bars.length < 6) return { direction: 'neutral', level: null, summary: 'Liquidity interaction is unavailable.', present: false };
  const last = bars[bars.length - 1]!;
  const prior = bars.slice(-6, -1);
  const priorHigh = Math.max(...prior.map((bar) => bar.high));
  const priorLow = Math.min(...prior.map((bar) => bar.low));

  if (last.low < priorLow && last.close > priorLow) {
    return {
      direction: 'long',
      level: priorLow,
      summary: `Liquidity sweep took the prior low ${formatPrice(priorLow)} and price reclaimed it.`,
      present: true,
    };
  }

  if (last.high > priorHigh && last.close < priorHigh) {
    return {
      direction: 'short',
      level: priorHigh,
      summary: `Liquidity sweep took the prior high ${formatPrice(priorHigh)} and price slipped back below it.`,
      present: true,
    };
  }

  return { direction: 'neutral', level: null, summary: 'No clean liquidity sweep is active right now.', present: false };
}

function detectDisplacement(bars: NormalizedBar[], direction: Direction): { present: boolean; origin: number | null; summary: string } {
  if (bars.length < 4 || direction === 'neutral') return { present: false, origin: null, summary: 'Displacement cannot be confirmed yet.' };
  const recent = bars.slice(-6);
  const reference = recent.slice(0, -1);
  const current = recent[recent.length - 1]!;
  const avgBody = average(reference.map(barBody));
  const avgRange = average(reference.map(barRange));
  const correctDirection = direction === 'long' ? current.close > current.open : current.close < current.open;
  const present = barBody(current) >= avgBody * 1.35 && barRange(current) >= avgRange * 1.2 && closeNearExtreme(current, direction) && correctDirection;

  return present
    ? {
        present: true,
        origin: direction === 'long' ? Math.min(current.open, current.close) : Math.max(current.open, current.close),
        summary: `Displacement is present with a strong ${direction === 'long' ? 'bullish' : 'bearish'} body and range expansion.`,
      }
    : {
        present: false,
        origin: null,
        summary: 'Displacement is still too weak or overlapping to trust.',
      };
}

function detectConsolidation(bars: NormalizedBar[]): boolean {
  if (bars.length < 8) return false;
  const recent = bars.slice(-5);
  const prior = bars.slice(-12, -5);
  const recentRange = Math.max(...recent.map((bar) => bar.high)) - Math.min(...recent.map((bar) => bar.low));
  const priorAvgRange = average(prior.map(barRange)) * Math.max(prior.length, 1);
  return recentRange <= Math.max(priorAvgRange * 0.55, 0.0001);
}

function detectRejection(bars: NormalizedBar[], direction: Direction): { present: boolean; summary: string } {
  if (bars.length < 3 || direction === 'neutral') return { present: false, summary: 'Rejection is unavailable.' };
  const last = bars[bars.length - 1]!;
  const range = barRange(last);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const upperWick = last.high - Math.max(last.open, last.close);
  const wickRatio = direction === 'long' ? lowerWick / range : upperWick / range;
  return wickRatio >= 0.28
    ? { present: true, summary: `Rejection is visible with a ${direction === 'long' ? 'lower' : 'upper'} wick response.` }
    : { present: false, summary: 'Rejection is not clean enough yet.' };
}

function buildTargetsFromRange(direction: Direction, low: number, high: number): { tp1: number | null; tp2: number | null } {
  const range = Math.max(high - low, 0.0001);
  if (direction === 'long') return { tp1: high, tp2: high + (range * 0.272) };
  if (direction === 'short') return { tp1: low, tp2: low - (range * 0.272) };
  return { tp1: null, tp2: null };
}

export function buildChartLogicFromOhlcBars(input: {
  bars: RawOhlcInput[];
  market?: string;
  timeframe?: string;
}): VaultumChartLogicDecision {
  const bars = normalizeOhlcBars(input.bars);
  if (bars.length < 12) {
    return {
      majorStructure: 'Structure is still loading.',
      minorStructure: 'Structure is still loading.',
      phase: 'unclear',
      setupType: 'no-trade',
      structureStatus: 'unclear',
      bias: 'neutral',
      zoneLabel: 'neutral',
      zone: 'n/a',
      executionLayer: 'Need more bars before building an execution layer.',
      bestEntryPrice: 'n/a',
      invalidation: 'n/a',
      tp1: 'n/a',
      tp2: 'n/a',
      participation: { state: 'absent', liquidityInteraction: 'Need more bars.', displacementReaction: 'Need more bars.', microStructureShift: 'Need more bars.' },
      keyEvents: ['Not enough OHLC history for structure classification.'],
      actionLines: ['No trade.', 'Structure is unclear.'],
      missing: ['Need at least 12 valid bars to classify structure cleanly.'],
      invalidates: ['Re-run once more bars are available.'],
      summary: 'OHLC-only structure detection is still loading.',
      sourceLineage: ['Deterministic OHLC heuristic.'],
    };
  }

  const major = detectStructureBias(bars, 28);
  const minor = detectStructureBias(bars, 10);
  const majorDirection = directionFromBias(major.bias);
  const minorDirection = directionFromBias(minor.bias);
  const dominantDirection = majorDirection !== 'neutral' ? majorDirection : minorDirection;
  const sweep = detectSweep(bars);
  const consolidation = detectConsolidation(bars);
  const displacement = detectDisplacement(bars, dominantDirection);
  const rejection = detectRejection(bars, dominantDirection);
  const last = bars[bars.length - 1]!;
  const rangeLow = major.rangeLow;
  const rangeHigh = major.rangeHigh;
  const range = Math.max(rangeHigh - rangeLow, 0.0001);
  const zoneLow = rangeLow + (range * 0.50);
  const zoneHigh = rangeLow + (range * 0.705);
  const bestEntry = rangeLow + (range * 0.618);
  const invalidation = dominantDirection === 'long'
    ? Math.min(zoneLow, sweep.level ?? zoneLow) - (range * 0.08)
    : dominantDirection === 'short'
      ? Math.max(zoneHigh, sweep.level ?? zoneHigh) + (range * 0.08)
      : NaN;
  const zoneTouched = dominantDirection === 'long' ? last.low <= zoneHigh : dominantDirection === 'short' ? last.high >= zoneLow : false;

  let phase: ExecutionPhase | 'unclear' = 'transition';
  if (majorDirection === 'neutral' && minorDirection === 'neutral') phase = 'unclear';
  else if (majorDirection !== 'neutral' && minorDirection !== 'neutral' && majorDirection !== minorDirection) phase = sweep.present && sweep.direction === minorDirection && displacement.present ? 'reversal' : 'correction';
  else if (majorDirection !== 'neutral' && minorDirection === majorDirection) phase = displacement.present && consolidation ? 'continuation' : displacement.present ? 'impulse' : 'continuation';

  const setupType: SetupType = dominantDirection === 'neutral' || phase === 'unclear' || phase === 'transition' ? 'no-trade' : phase === 'reversal' ? 'reversal' : 'continuation';
  const liquidityState: ParticipationState = sweep.present ? 'confirmed' : zoneTouched ? 'building' : 'absent';
  const displacementState: ParticipationState = displacement.present ? 'confirmed' : rejection.present ? 'building' : 'absent';
  const microShiftState: ParticipationState = minorDirection === dominantDirection && dominantDirection !== 'neutral' ? 'confirmed' : minorDirection !== 'neutral' ? 'building' : 'absent';
  const participationState: ParticipationState =
    liquidityState === 'confirmed' && displacementState === 'confirmed' && microShiftState === 'confirmed'
      ? 'confirmed'
      : liquidityState !== 'absent' || displacementState !== 'absent' || microShiftState !== 'absent'
        ? 'building'
        : 'absent';
  const actionWord = dominantDirection === 'short' ? 'sell' : 'buy';
  const targets = buildTargetsFromRange(dominantDirection, rangeLow, rangeHigh);
  const actionLines = dominantDirection === 'neutral' || setupType === 'no-trade'
    ? ['No trade.', 'Structure is unclear.']
    : [
        majorStructureLine(dominantDirection),
        minorStructureLine(dominantDirection, phase),
        `Plot zone: ${formatRange(zoneLow, zoneHigh)}.`,
        phase === 'impulse' && !zoneTouched
          ? `Wait for correction. Best ${actionWord} price: ${formatPrice(bestEntry)}.`
          : participationState === 'confirmed' && zoneTouched
            ? `${actionWord === 'buy' ? 'Buy' : 'Sell'} from this price: ${formatPrice(bestEntry)}.`
            : 'Wait for reaction.',
        `Best ${actionWord} price: ${formatPrice(bestEntry)}.`,
        `SL: ${formatPrice(invalidation)}.`,
        targets.tp1 != null ? `TP1: ${formatPrice(targets.tp1)}.` : null,
        targets.tp2 != null ? `TP2: ${formatPrice(targets.tp2)}.` : null,
      ].filter((item): item is string => Boolean(item));

  return {
    majorStructure: major.summary,
    minorStructure: minor.summary,
    phase,
    setupType,
    structureStatus: dominantDirection === 'neutral' || major.bias === 'transition' ? 'unclear' : 'valid',
    bias: biasLabel(dominantDirection),
    zoneLabel: dominantDirection === 'long' ? 'demand' : dominantDirection === 'short' ? 'supply' : 'neutral',
    zone: formatRange(zoneLow, zoneHigh),
    executionLayer: displacement.present ? `Displacement origin ${formatPrice(displacement.origin)} inside ${formatRange(zoneLow, zoneHigh)} is the preferred execution layer.` : `Use ${formatPrice(bestEntry)} inside ${formatRange(zoneLow, zoneHigh)} as the provisional execution layer.`,
    bestEntryPrice: formatPrice(bestEntry),
    invalidation: formatPrice(invalidation),
    tp1: formatPrice(targets.tp1),
    tp2: formatPrice(targets.tp2),
    participation: {
      state: participationState,
      liquidityInteraction: sweep.summary,
      displacementReaction: displacement.present ? displacement.summary : rejection.summary,
      microStructureShift: minorDirection === dominantDirection && dominantDirection !== 'neutral' ? 'Minor structure is already aligned with the dominant side.' : 'Minor structure still needs a cleaner shift.',
    },
    keyEvents: unique([sweep.present ? sweep.summary : null, displacement.summary, consolidation ? 'Recent consolidation created a base for continuation or reversal.' : null, rejection.present ? rejection.summary : null]),
    actionLines,
    missing: unique([major.bias === 'transition' ? 'Major structure is not clean enough yet.' : null, participationState !== 'confirmed' ? 'Participation confirmation is incomplete.' : null, !zoneTouched ? 'Price has not interacted with the execution layer yet.' : null]),
    invalidates: unique([dominantDirection !== 'neutral' ? `Bias invalidates beyond ${formatPrice(invalidation)}.` : 'Bias invalidates until structure becomes directional.', sweep.present ? `Failure back through sweep level ${formatPrice(sweep.level)} weakens the setup.` : null]),
    summary: [majorStructureLine(dominantDirection), minorStructureLine(dominantDirection, phase), `Execution layer ${formatPrice(bestEntry)} inside ${formatRange(zoneLow, zoneHigh)}.`].join(' '),
    sourceLineage: ['Deterministic OHLC heuristic.', `Range ${formatRange(rangeLow, rangeHigh)} from recent structure.`],
  };
}

async function extractVisionChartLogic(input: {
  imageDataUrl: string;
  market: string;
  timeframe: string;
  question: string;
  liveReference: VaultumChartLogicLiveReference | null;
}): Promise<{ provider: string | null; providerTrace: string[]; parsed: ParsedVisionChartLogic | null }> {
  const { callVisionProvider, discoverVisionProviders } = await import('../../ai/v1/_shared.ts');
  const liveContext = input.liveReference
    ? [
        `Live phase: ${input.liveReference.phase} / ${input.liveReference.readiness}`,
        `Live directive: ${input.liveReference.chartDirective}`,
        `Live structure: ${input.liveReference.structureContext}`,
        `Live zone: ${input.liveReference.institutionalReferenceZone}`,
        `Live invalidation: ${input.liveReference.invalidationLevel}`,
      ].join('\n')
    : 'No live structure context was provided. Read the image on its own.';

  const systemPrompt = `You are VAULTUM's chart-to-logic converter.

Read the chart screenshot in a structure-first way.
Do not let generic SMC or ICT labels dominate the answer.
Structure is first. Precision inside the zone is second. Participation confirmation is third.
Return strict JSON only.

Required JSON:
{
  "chartReadSummary": "what the chart visibly shows",
  "chartBias": "bullish|bearish|neutral",
  "majorStructure": "short sentence",
  "minorStructure": "short sentence",
  "phase": "impulse|correction|continuation|reversal|transition|unclear",
  "setupType": "continuation|reversal|no-trade",
  "structureStatus": "valid|invalid|unclear",
  "zoneLabel": "demand|supply|neutral",
  "broadZone": "price range if visible",
  "bestEntryPrice": 0,
  "invalidation": 0,
  "tp1": 0,
  "tp2": 0,
  "keyEvents": ["..."],
  "actionLines": ["simple execution line"],
  "missing": ["..."],
  "invalidates": ["..."],
  "extractedLevels": ["..."],
  "participation": {
    "state": "confirmed|building|absent",
    "liquidityInteraction": "short sentence",
    "displacementReaction": "short sentence",
    "microStructureShift": "short sentence"
  }
}`;

  const userPrompt = [
    `Market: ${input.market}`,
    `Timeframe: ${input.timeframe}`,
    `Request: ${input.question}`,
    '',
    'Live reference:',
    liveContext,
    '',
    'Instructions:',
    '- Extract only what is visible or strongly inferable from the chart.',
    '- Keep outputs simple and execution-focused.',
    '- If the chart is unclear, say so directly.',
  ].join('\n');

  const result = await callVisionProvider(systemPrompt, userPrompt, input.imageDataUrl);
  return {
    provider: result.provider,
    providerTrace: result.attempted.length ? result.attempted : discoverVisionProviders().map((provider) => `${provider.provider}:${provider.model}`),
    parsed: extractJson<ParsedVisionChartLogic>(result.content),
  };
}

function determineAlignment(input: {
  liveDecision: VaultumChartLogicDecision | null;
  vision: ParsedVisionChartLogic | null;
}): AlignmentState {
  if (!input.vision || !input.liveDecision) return 'unknown';
  const liveBias = input.liveDecision.bias;
  const visualBias = input.vision.chartBias
    ?? (input.vision.majorStructure?.toLowerCase().includes('bear') ? 'bearish' : input.vision.majorStructure?.toLowerCase().includes('bull') ? 'bullish' : 'neutral');
  const livePhase = input.liveDecision.phase;
  const visualPhase = input.vision.phase ?? 'unclear';
  if (visualBias === liveBias && (visualPhase === livePhase || visualPhase === 'unclear')) return 'aligned';
  if (visualBias !== 'neutral' && liveBias !== 'neutral' && visualBias !== liveBias) return 'conflicted';
  return 'mixed';
}

function mergeChartLogic(input: {
  liveDecision: VaultumChartLogicDecision | null;
  ohlcDecision: VaultumChartLogicDecision | null;
  vision: ParsedVisionChartLogic | null;
}): VaultumChartLogicDecision {
  const base = input.liveDecision ?? input.ohlcDecision;
  if (!base && !input.vision) {
    return {
      majorStructure: 'Structure is unavailable.',
      minorStructure: 'Structure is unavailable.',
      phase: 'unclear',
      setupType: 'no-trade',
      structureStatus: 'unclear',
      bias: 'neutral',
      zoneLabel: 'neutral',
      zone: 'n/a',
      executionLayer: 'No execution layer is available.',
      bestEntryPrice: 'n/a',
      invalidation: 'n/a',
      tp1: 'n/a',
      tp2: 'n/a',
      participation: { state: 'absent', liquidityInteraction: 'Unavailable.', displacementReaction: 'Unavailable.', microStructureShift: 'Unavailable.' },
      keyEvents: ['No chart logic could be extracted.'],
      actionLines: ['No trade.', 'Structure is unclear.'],
      missing: ['Need either a screenshot or valid OHLC history.'],
      invalidates: ['Re-run once data is available.'],
      summary: 'Chart logic is unavailable.',
      sourceLineage: ['Fallback.'],
    };
  }

  if (!input.vision) return base!;
  return {
    ...base!,
    majorStructure: safeString(input.vision.majorStructure, base?.majorStructure ?? 'Structure is unavailable.'),
    minorStructure: safeString(input.vision.minorStructure, base?.minorStructure ?? 'Structure is unavailable.'),
    zoneLabel: safeString(input.vision.zoneLabel, base?.zoneLabel ?? 'neutral'),
    zone: safeString(input.vision.broadZone, base?.zone ?? 'n/a'),
    bestEntryPrice: formatPrice(input.vision.bestEntryPrice ?? parsePrice(base?.bestEntryPrice)),
    invalidation: formatPrice(input.vision.invalidation ?? parsePrice(base?.invalidation)),
    tp1: formatPrice(input.vision.tp1 ?? parsePrice(base?.tp1)),
    tp2: formatPrice(input.vision.tp2 ?? parsePrice(base?.tp2)),
    participation: {
      state: input.vision.participation?.state ?? base!.participation.state,
      liquidityInteraction: safeString(input.vision.participation?.liquidityInteraction, base!.participation.liquidityInteraction),
      displacementReaction: safeString(input.vision.participation?.displacementReaction, base!.participation.displacementReaction),
      microStructureShift: safeString(input.vision.participation?.microStructureShift, base!.participation.microStructureShift),
    },
    keyEvents: unique([...(base?.keyEvents ?? []), ...(input.vision.keyEvents ?? [])]),
    actionLines: input.vision.actionLines?.length ? input.vision.actionLines : base?.actionLines ?? ['No trade.', 'Structure is unclear.'],
    missing: unique([...(base?.missing ?? []), ...(input.vision.missing ?? [])]),
    invalidates: unique([...(base?.invalidates ?? []), ...(input.vision.invalidates ?? [])]),
    summary: safeString(input.vision.chartReadSummary, base?.summary ?? 'Chart logic is unavailable.'),
    sourceLineage: unique([...(base?.sourceLineage ?? []), 'Screenshot interpretation from the vision sidecar.']),
  };
}

export async function getChartLogic(input: {
  market?: string;
  timeframe?: string;
  question?: string;
  imageDataUrl?: string;
  ohlc?: RawOhlcInput[];
}): Promise<VaultumChartLogicResponse> {
  const market = normalizeMarket(input.market);
  const timeframe = normalizeVaultumTimeframe(input.timeframe);
  const question = safeString(input.question, 'Convert this chart into structure-first trading logic and keep the output simple.');
  const hasImage = /^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(String(input.imageDataUrl || '').trim());
  const normalizedBars = normalizeOhlcBars(input.ohlc);
  const hasOhlc = normalizedBars.length >= 12;
  const { discoverVisionProviders } = await import('../../ai/v1/_shared.ts');

  const liveEntryMap = market
    ? await import('./get-entry-map.ts')
        .then(({ getEntryMap }) => getEntryMap({ market, chartTimeframe: timeframe }))
        .catch(() => null)
    : null;
  const knowledgeContext = await import('../../system/v1/_knowledge-context-pack.ts')
    .then(({ getKnowledgeContextPack }) => getKnowledgeContextPack({
      market,
      question,
      task: hasImage ? 'chart-review' : 'chart-analysis',
      phase: liveEntryMap?.phase,
      readiness: liveEntryMap?.readiness,
      confidence: liveEntryMap?.confidence,
      macroReflexivity: liveEntryMap?.macroReflexivity,
      eventRisk: liveEntryMap?.macroBlindspots?.some((item: string) => /minutes|event|repricing/i.test(String(item)))
        ? 'soon'
        : 'clear',
    }))
    .catch(() => null);
  const liveReference = liveEntryMap ? buildLiveReference(liveEntryMap) : null;
  const liveDecision = liveEntryMap ? buildChartLogicFromEntryMap(liveEntryMap) : null;
  const ohlcDecision = hasOhlc ? buildChartLogicFromOhlcBars({ bars: normalizedBars, market, timeframe }) : null;
  const vision = hasImage
    ? await extractVisionChartLogic({ imageDataUrl: String(input.imageDataUrl), market, timeframe, question, liveReference })
    : { provider: null, providerTrace: discoverVisionProviders().map((provider) => `${provider.provider}:${provider.model}`), parsed: null };
  const chartLogic = mergeChartLogic({ liveDecision, ohlcDecision, vision: vision.parsed });
  chartLogic.sourceLineage = unique([
    ...chartLogic.sourceLineage,
    ...(knowledgeContext?.sourceLineage?.map((item: string) => `Knowledge source ${item}.`) ?? []),
  ]);
  const liveAlignment = determineAlignment({ liveDecision, vision: vision.parsed });
  const extractedLevels = unique([
    chartLogic.zone !== 'n/a' ? `Zone ${chartLogic.zone}` : null,
    chartLogic.bestEntryPrice !== 'n/a' ? `Best entry ${chartLogic.bestEntryPrice}` : null,
    chartLogic.invalidation !== 'n/a' ? `Invalidation ${chartLogic.invalidation}` : null,
    chartLogic.tp1 !== 'n/a' ? `TP1 ${chartLogic.tp1}` : null,
    chartLogic.tp2 !== 'n/a' ? `TP2 ${chartLogic.tp2}` : null,
    ...(vision.parsed?.extractedLevels ?? []),
  ]);

  let exampleStored = false;
  if (hasImage) {
    try {
      const { rememberSituation } = await import('./_situation-memory.ts');
      await rememberSituation({
        namespace: 'chart-logic',
        market,
        timeframe,
        situation: safeString(vision.parsed?.chartReadSummary, chartLogic.summary),
        recommendation: chartLogic.actionLines.join(' '),
        outcome: 'open',
        tags: unique([chartLogic.bias, chartLogic.phase, chartLogic.setupType, chartLogic.zoneLabel]),
      });
      exampleStored = true;
    } catch {
      exampleStored = false;
    }
  }

  return {
    provider: vision.provider,
    providerTrace: vision.providerTrace,
    market,
    timeframe,
    mode: hasImage && liveReference ? 'image+live' : hasImage ? 'image-only' : hasOhlc && liveReference ? 'ohlc+live' : hasOhlc ? 'ohlc-only' : 'live-only',
    imageReviewed: hasImage,
    ohlcReviewed: hasOhlc,
    exampleStored,
    chartReadSummary: safeString(vision.parsed?.chartReadSummary, chartLogic.summary),
    extractedLevels,
    visualSignals: unique([
      ...(vision.parsed?.keyEvents ?? []),
      ...(vision.parsed?.actionLines ?? []),
      ...(knowledgeContext?.focusConcepts?.slice(0, 6).map((item: string) => `Doctrine focus: ${item}`) ?? []),
    ]),
    liveAlignment,
    chartLogic,
    liveReference,
    knowledgeContext: knowledgeContext
      ? {
          summary: safeString(knowledgeContext.summary, `Knowledge context pack for ${market}.`),
          focusConcepts: Array.isArray(knowledgeContext.focusConcepts) ? knowledgeContext.focusConcepts.slice(0, 12) : [],
          structureRules: Array.isArray(knowledgeContext.structureRules) ? knowledgeContext.structureRules.slice(0, 8) : [],
          macroRules: Array.isArray(knowledgeContext.macroRules) ? knowledgeContext.macroRules.slice(0, 8) : [],
          sourceLineage: Array.isArray(knowledgeContext.sourceLineage) ? knowledgeContext.sourceLineage.slice(0, 12) : [],
          agentFocus: Array.isArray(knowledgeContext.agentFocus) ? knowledgeContext.agentFocus.slice(0, 6) : [],
          modelRouting: knowledgeContext.modelRouting ?? null,
        }
      : null,
  };
}
