import { fetchTdOptionChain, type TdContract } from '../../../../options/v1/_td-chain.ts';
import { getDealerPressure } from '../../../../options/v1/get-dealer-pressure.ts';
import { getGammaLevels } from '../../../../options/v1/get-gamma-levels.ts';
import { interpretStrikePressureFromOcr, interpretStrikePressureFromRows, type StrikePressureResponse } from '../../../../options/v1/_strike-pressure.ts';
import { buildDealerLogic } from './dealer-logic.ts';
import { buildOptionsChainStructure } from './chain-structure.ts';
import {
  confidenceFromParts,
  magnitudeToStrength,
  normalizeMarket,
  round,
  signedScoreToBias,
  type OptionsChainRowInput,
  type OptionsIntelligenceOutput,
} from '../shared.ts';

function convertTdChainToRows(contracts: TdContract[]): OptionsChainRowInput[] {
  const grouped = new Map<number, { call?: TdContract; put?: TdContract }>();
  const pickPreferred = (existing: TdContract | undefined, candidate: TdContract): TdContract => {
    if (!existing) return candidate;
    if (candidate.daysToExpiration !== existing.daysToExpiration) {
      return candidate.daysToExpiration < existing.daysToExpiration ? candidate : existing;
    }
    const existingInterest = existing.openInterest + existing.totalVolume;
    const candidateInterest = candidate.openInterest + candidate.totalVolume;
    return candidateInterest > existingInterest ? candidate : existing;
  };

  contracts.forEach((contract) => {
    const current = grouped.get(contract.strike) ?? {};
    if (contract.kind === 'call') current.call = pickPreferred(current.call, contract);
    if (contract.kind === 'put') current.put = pickPreferred(current.put, contract);
    grouped.set(contract.strike, current);
  });

  const rows: OptionsChainRowInput[] = [];

  [...grouped.entries()].forEach(([strike, pair]) => {
    if (!pair.call || !pair.put) return;
    rows.push({
      strike,
      callPrice: pair.call.mark ?? pair.call.last ?? null,
      putPrice: pair.put.mark ?? pair.put.last ?? null,
      callDelta: pair.call.delta != null ? Math.abs(pair.call.delta) : null,
      putDelta: pair.put.delta != null ? Math.abs(pair.put.delta) : null,
      impliedVol: pair.call.volatility ?? pair.put.volatility ?? null,
      callOpenInterest: pair.call.openInterest,
      putOpenInterest: pair.put.openInterest,
      callVolume: pair.call.totalVolume,
      putVolume: pair.put.totalVolume,
      expiryBucket: pair.call.daysToExpiration <= 7 ? '0-7d' : pair.call.daysToExpiration <= 30 ? '8-30d' : pair.call.daysToExpiration <= 90 ? '31-90d' : '90d+',
      daysToExpiration: Math.min(pair.call.daysToExpiration, pair.put.daysToExpiration),
    });
  });

  return rows.sort((left, right) => left.strike - right.strike);
}

function levelMapFromNearby(reading: StrikePressureResponse['nearbyReadings'], role: 'support' | 'resistance'): Array<{ strike: number; score: number; role: 'support' | 'resistance' | 'magnet' | 'crowded'; explanation: string }> {
  return reading
    .filter((item) => role === 'support' ? item.levelRole === 'support candidate' : item.levelRole === 'resistance candidate')
    .map((item) => ({
      strike: item.strike,
      score: round((item.confidence / 100) * (role === 'support' ? Math.max(item.bullishScore, 10) / 100 : Math.max(item.bearishScore, 10) / 100), 3),
      role,
      explanation: item.dealerImplication,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
}

export async function buildOptionsIntelligence(input: {
  market: string;
  spotPrice?: number | null;
  focusStrike?: number | null;
  structuredRows?: OptionsChainRowInput[] | null;
  ocrText?: string | null;
  ocrTable?: string[][] | null;
}): Promise<OptionsIntelligenceOutput> {
  const market = normalizeMarket(input.market);
  const gammaLevels = await getGammaLevels({ symbol: market });
  const dealerPressure = await getDealerPressure({ symbol: market });
  const liveSpot = input.spotPrice ?? gammaLevels?.price ?? dealerPressure?.price ?? null;

  let rows = input.structuredRows ?? [];
  let sourceMode: OptionsIntelligenceOutput['rawInputs']['sourceMode'] = 'unavailable';
  let screenshotExplainer: OptionsIntelligenceOutput['derivedMetrics']['screenshotExplainer'] = null;
  let strikeResponse: StrikePressureResponse | null = null;

  if (input.ocrText || input.ocrTable?.length) {
    strikeResponse = interpretStrikePressureFromOcr({
      symbol: market,
      spotPrice: liveSpot,
      focusStrike: input.focusStrike,
      ocrText: input.ocrText,
      ocrTable: input.ocrTable,
    });
    sourceMode = 'ocr-heuristic';
    screenshotExplainer = {
      approximate: true,
      summary: strikeResponse.uiSummary,
    };
  } else if (rows.length) {
    strikeResponse = interpretStrikePressureFromRows({
      symbol: market,
      spotPrice: liveSpot,
      focusStrike: input.focusStrike,
      rows: rows.flatMap((row) => ([
        { strike: row.strike, kind: 'call' as const, price: row.callPrice, delta: row.callDelta, impliedVol: row.impliedVol, openInterest: row.callOpenInterest, totalVolume: row.callVolume, expiryBucket: row.expiryBucket, daysToExpiration: row.daysToExpiration },
        { strike: row.strike, kind: 'put' as const, price: row.putPrice, delta: row.putDelta != null ? -Math.abs(row.putDelta) : null, impliedVol: row.impliedVol, openInterest: row.putOpenInterest, totalVolume: row.putVolume, expiryBucket: row.expiryBucket, daysToExpiration: row.daysToExpiration },
      ])),
    });
    sourceMode = 'structured-input';
  } else {
    const chain = await fetchTdOptionChain(market);
    if (chain?.contracts?.length) {
      rows = convertTdChainToRows(chain.contracts);
      strikeResponse = interpretStrikePressureFromRows({
        symbol: market,
        spotPrice: chain.underlyingPrice,
        focusStrike: input.focusStrike,
        rows: rows.flatMap((row) => ([
          { strike: row.strike, kind: 'call' as const, price: row.callPrice, delta: row.callDelta, impliedVol: row.impliedVol, openInterest: row.callOpenInterest, totalVolume: row.callVolume, expiryBucket: row.expiryBucket, daysToExpiration: row.daysToExpiration },
          { strike: row.strike, kind: 'put' as const, price: row.putPrice, delta: row.putDelta != null ? -Math.abs(row.putDelta) : null, impliedVol: row.impliedVol, openInterest: row.putOpenInterest, totalVolume: row.putVolume, expiryBucket: row.expiryBucket, daysToExpiration: row.daysToExpiration },
        ])),
      });
      sourceMode = 'structured-chain';
    } else {
      sourceMode = 'synthetic-live';
      strikeResponse = {
        symbol: market,
        sourceMode: 'unavailable',
        sourceLabel: 'Structured chain unavailable. Options intelligence is falling back to synthetic dealer and gamma context.',
        spotPrice: liveSpot,
        focusStrike: gammaLevels?.gammaFlip ?? null,
        focusReading: null,
        nearbyReadings: [],
        uiSummary: 'Strike-by-strike pressure could not be confirmed from a structured chain.',
        notes: ['Structured option chain unavailable; using synthetic dealer and wall context only.'],
        screenshotHeuristic: false,
      };
    }
  }

  const chainStructure = rows.length
    ? buildOptionsChainStructure({
      market,
      spotPrice: liveSpot,
      rows,
    })
    : {
      supportCandidates: levelMapFromNearby(strikeResponse?.nearbyReadings ?? [], 'support'),
      resistanceCandidates: levelMapFromNearby(strikeResponse?.nearbyReadings ?? [], 'resistance'),
      magnetStrikes: [],
      crowdedStrikes: [],
      focusStrike: strikeResponse?.focusStrike ?? null,
    };

  const dealerLogic = buildDealerLogic({
    spotPrice: liveSpot,
    focusStrike: strikeResponse?.focusStrike ?? chainStructure.focusStrike ?? null,
    focusPressureRead: strikeResponse?.focusReading?.pressureRead ?? null,
    focusLevelRole: strikeResponse?.focusReading?.levelRole ?? null,
    focusConfidence: strikeResponse?.focusReading?.confidence ?? null,
    gammaLevels,
    dealerPressure,
    crowdedStrikes: chainStructure.crowdedStrikes,
  });

  const biasScore = (
    (strikeResponse?.focusReading?.levelRole === 'support candidate' ? 0.38 : strikeResponse?.focusReading?.levelRole === 'resistance candidate' ? -0.38 : 0)
    + (dealerLogic.bias === 'bullish' ? 0.18 : dealerLogic.bias === 'bearish' ? -0.18 : 0)
    + ((chainStructure.supportCandidates[0]?.score ?? 0) * 0.15)
    - ((chainStructure.resistanceCandidates[0]?.score ?? 0) * 0.15)
  );
  const bias = signedScoreToBias(biasScore);
  const confidence = confidenceFromParts([
    strikeResponse?.focusReading?.confidence != null ? strikeResponse.focusReading.confidence / 100 : 0.42,
    dealerLogic.confidence,
    sourceMode === 'structured-chain' ? 0.9 : sourceMode === 'structured-input' ? 0.74 : sourceMode === 'ocr-heuristic' ? 0.58 : 0.46,
  ]);
  const strength = magnitudeToStrength(Math.abs(biasScore));
  const summary = [
    strikeResponse?.uiSummary ?? 'Strike pressure unavailable.',
    dealerLogic.summary,
    chainStructure.supportCandidates[0]
      ? `Support candidates: ${chainStructure.supportCandidates.slice(0, 2).map((item) => item.strike).join(' / ')}.`
      : 'No strong support strike candidates were resolved.',
    chainStructure.resistanceCandidates[0]
      ? `Resistance candidates: ${chainStructure.resistanceCandidates.slice(0, 2).map((item) => item.strike).join(' / ')}.`
      : 'No strong resistance strike candidates were resolved.',
  ].join(' ');

  return {
    source: 'Vaultum options intelligence engine',
    timestamp: new Date().toISOString(),
    asset: market,
    bias,
    strength,
    confidence,
    summary,
    uiSummary: `${strikeResponse?.uiSummary ?? 'Strike pressure unavailable.'} ${dealerLogic.summary}`,
    notes: [
      strikeResponse?.sourceLabel ?? 'Options structure unavailable.',
      'Premium and delta are fast strike heuristics and should be confirmed with nearby strikes, gamma, OI, volume, and expiry structure.',
      sourceMode === 'ocr-heuristic' ? 'Screenshot interpretation remains approximate until structured chain context confirms it.' : 'Structured chain context was used where available.',
    ],
    rawInputs: {
      market,
      spotPrice: liveSpot,
      focusStrike: input.focusStrike ?? strikeResponse?.focusStrike ?? null,
      sourceMode,
    },
    derivedMetrics: {
      supportCandidates: chainStructure.supportCandidates,
      resistanceCandidates: chainStructure.resistanceCandidates,
      magnetStrikes: chainStructure.magnetStrikes,
      crowdedStrikes: chainStructure.crowdedStrikes,
      strikePressure: strikeResponse?.focusReading
        ? {
          focusStrike: strikeResponse.focusStrike,
          pressureRead: strikeResponse.focusReading.pressureRead,
          levelRole: strikeResponse.focusReading.levelRole,
          confidence: strikeResponse.focusReading.confidence,
          summary: strikeResponse.uiSummary,
          notes: strikeResponse.notes,
        }
        : null,
      dealerLogic: {
        gammaRegime: dealerLogic.gammaRegime,
        hedgePressure: dealerLogic.hedgePressure,
        tendency: dealerLogic.tendency,
        pinRisk: dealerLogic.pinRisk,
        confidence: dealerLogic.confidence,
        label: dealerLogic.label,
      },
      screenshotExplainer,
    },
  };
}
