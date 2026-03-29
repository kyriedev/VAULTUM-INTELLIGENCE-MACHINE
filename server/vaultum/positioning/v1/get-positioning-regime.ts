import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { fetchOfficialCotMarket } from './_cftc-shared';

export async function getPositioningRegime(input: { market: string }): Promise<{ market: string; regime: string; bias: string; source: string }> {
  const market = (input.market || 'GOLD').toUpperCase();

  return getCachedOrCompute(cacheKey('positioning', `regime:${market}`), async () => {
    const data = await fetchOfficialCotMarket(market);
    if (!data || !data.openInterest) {
      return {
        market,
        regime: 'unavailable',
        bias: 'unknown',
        source: 'CFTC unavailable',
      };
    }

    const netShare = (data.nonCommercialNet / data.openInterest) * 100;
    const regime = Math.abs(netShare) >= 12
      ? 'crowded-extreme'
      : Math.abs(netShare) >= 6
        ? 'extended-but-tradable'
        : 'balanced-to-building';
    const bias = netShare > 2 ? 'bullish' : netShare < -2 ? 'bearish' : 'neutral';

    return {
      market,
      regime,
      bias,
      source: 'CFTC Disaggregated COT',
    };
  }, 21600);
}
