import { interpretStrikePressureFromRows } from '../../../../options/v1/_strike-pressure.ts';
import type { OptionsChainRowInput, OptionsStrikeLevel } from '../shared.ts';
import { clamp, round } from '../shared.ts';

function expandRows(rows: OptionsChainRowInput[]): Array<{
  strike: number;
  kind: 'call' | 'put';
  price: number | null;
  delta: number | null;
  impliedVol?: number | null;
  openInterest?: number | null;
  totalVolume?: number | null;
  expiryBucket?: string | null;
  daysToExpiration?: number | null;
}> {
  return rows.flatMap((row) => ([
    {
      strike: row.strike,
      kind: 'call' as const,
      price: row.callPrice,
      delta: row.callDelta,
      impliedVol: row.impliedVol ?? null,
      openInterest: row.callOpenInterest ?? null,
      totalVolume: row.callVolume ?? null,
      expiryBucket: row.expiryBucket ?? null,
      daysToExpiration: row.daysToExpiration ?? null,
    },
    {
      strike: row.strike,
      kind: 'put' as const,
      price: row.putPrice,
      delta: row.putDelta != null ? -Math.abs(row.putDelta) : null,
      impliedVol: row.impliedVol ?? null,
      openInterest: row.putOpenInterest ?? null,
      totalVolume: row.putVolume ?? null,
      expiryBucket: row.expiryBucket ?? null,
      daysToExpiration: row.daysToExpiration ?? null,
    },
  ]));
}

function topLevels(levels: OptionsStrikeLevel[], role: OptionsStrikeLevel['role']): OptionsStrikeLevel[] {
  return levels.filter((item) => item.role === role).sort((left, right) => right.score - left.score).slice(0, 4);
}

export function buildOptionsChainStructure(input: {
  market: string;
  spotPrice: number | null;
  rows: OptionsChainRowInput[];
}): {
  supportCandidates: OptionsStrikeLevel[];
  resistanceCandidates: OptionsStrikeLevel[];
  magnetStrikes: OptionsStrikeLevel[];
  crowdedStrikes: OptionsStrikeLevel[];
  focusStrike: number | null;
} {
  if (!input.rows.length) {
    return {
      supportCandidates: [],
      resistanceCandidates: [],
      magnetStrikes: [],
      crowdedStrikes: [],
      focusStrike: null,
    };
  }

  const structuredRows = expandRows(input.rows);
  const maxInterest = Math.max(...input.rows.map((row) => (row.callOpenInterest ?? 0) + (row.putOpenInterest ?? 0)), 1);
  const maxVolume = Math.max(...input.rows.map((row) => (row.callVolume ?? 0) + (row.putVolume ?? 0)), 1);
  const maxDistance = Math.max(...input.rows.map((row) => Math.abs((input.spotPrice ?? row.strike) - row.strike)), 1);
  const levels: OptionsStrikeLevel[] = [];
  const focusStrike = [...input.rows].sort((left, right) => Math.abs(left.strike - (input.spotPrice ?? left.strike)) - Math.abs(right.strike - (input.spotPrice ?? right.strike)))[0]?.strike ?? null;

  input.rows.forEach((row) => {
    const reading = interpretStrikePressureFromRows({
      symbol: input.market,
      spotPrice: input.spotPrice,
      focusStrike: row.strike,
      rows: structuredRows,
      neighboringDepth: 2,
    }).focusReading;
    if (!reading) return;
    const interestWeight = clamp(((row.callOpenInterest ?? 0) + (row.putOpenInterest ?? 0)) / maxInterest, 0, 1);
    const volumeWeight = clamp(((row.callVolume ?? 0) + (row.putVolume ?? 0)) / maxVolume, 0, 1);
    const proximityWeight = clamp(1 - (Math.abs((input.spotPrice ?? row.strike) - row.strike) / maxDistance), 0, 1);
    const balancedWeight = reading.pressureRead === 'neutral / balanced strike' ? 0.55 : 0.15;
    const supportScore = round(((reading.bullishScore / 100) * 0.55) + (interestWeight * 0.2) + (volumeWeight * 0.15) + (proximityWeight * 0.1), 3);
    const resistanceScore = round(((reading.bearishScore / 100) * 0.55) + (interestWeight * 0.2) + (volumeWeight * 0.15) + (proximityWeight * 0.1), 3);
    const magnetScore = round((balancedWeight * 0.45) + (interestWeight * 0.35) + (volumeWeight * 0.1) + (proximityWeight * 0.1), 3);
    const crowdedScore = round((interestWeight * 0.6) + (volumeWeight * 0.3) + (reading.confidence / 100 * 0.1), 3);

    if (supportScore >= 0.26) {
      levels.push({
        strike: row.strike,
        score: supportScore,
        role: 'support',
        explanation: `Call-side pressure and participation support this strike as a buy-pressure / support candidate.`,
      });
    }
    if (resistanceScore >= 0.26) {
      levels.push({
        strike: row.strike,
        score: resistanceScore,
        role: 'resistance',
        explanation: `Put-side pressure and participation support this strike as a sell-pressure / resistance candidate.`,
      });
    }
    if (magnetScore >= 0.36) {
      levels.push({
        strike: row.strike,
        score: magnetScore,
        role: 'magnet',
        explanation: `Balanced premium plus concentrated interest make this strike a magnet / pin candidate.`,
      });
    }
    if (crowdedScore >= 0.42) {
      levels.push({
        strike: row.strike,
        score: crowdedScore,
        role: 'crowded',
        explanation: `Open interest / volume concentration make this strike crowded enough to matter for dealer behavior.`,
      });
    }
  });

  return {
    supportCandidates: topLevels(levels, 'support'),
    resistanceCandidates: topLevels(levels, 'resistance'),
    magnetStrikes: topLevels(levels, 'magnet'),
    crowdedStrikes: topLevels(levels, 'crowded'),
    focusStrike,
  };
}
