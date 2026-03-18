import { POSITIONING_STATE } from './_shared';

export async function getPositioningRegime(input: { market: string }): Promise<{ market: string; regime: string; bias: string }> {
  return {
    market: input.market,
    regime: POSITIONING_STATE.regime,
    bias: POSITIONING_STATE.zScore >= 0 ? 'bullish' : 'bearish',
  };
}
