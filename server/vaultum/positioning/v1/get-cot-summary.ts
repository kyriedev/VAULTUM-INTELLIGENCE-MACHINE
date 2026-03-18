import { POSITIONING_STATE } from './_shared';

export async function getCotSummary(input: { market: string }): Promise<{
  market: string;
  zScore: number;
  summary: string;
  nonCommercialLong: number;
  nonCommercialShort: number;
  netPosition: number;
  crowdedRisk: string;
}> {
  const nonCommercialLong = 268_000;
  const nonCommercialShort = 91_000;
  return {
    market: input.market,
    zScore: POSITIONING_STATE.zScore,
    summary: 'Positioning is long-biased but not yet at full contrarian extreme.',
    nonCommercialLong,
    nonCommercialShort,
    netPosition: nonCommercialLong - nonCommercialShort,
    crowdedRisk: POSITIONING_STATE.zScore >= 1.5 ? 'high' : 'moderate',
  };
}
