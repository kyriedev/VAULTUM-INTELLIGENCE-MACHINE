import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { fetchYahooQuotesBatch } from '../../market/v1/_shared';

export async function getSafeHavenPressure(): Promise<any> {
  return getCachedOrCompute(cacheKey('liquidity', 'safe-haven'), async () => {
    const batch = await fetchYahooQuotesBatch(['GC=F', '^VIX', 'DX-Y.NYB', '^TNX']);
    const gold = batch.results.get('GC=F');
    const vix = batch.results.get('^VIX');
    const dxy = batch.results.get('DX-Y.NYB');
    const us10y = batch.results.get('^TNX');
    return {
      conclusion:
        (gold?.change ?? 0) > 0 && (((vix?.change ?? 0) > 0) || ((dxy?.change ?? 0) < 0))
          ? 'safe-haven demand active'
          : 'safe-haven demand contained',
      score:
        Math.max(
          0,
          Math.min(
            100,
            50 + (gold?.change ?? 0) * 12 + (vix?.change ?? 0) * 4 - (dxy?.change ?? 0) * 6 - (us10y?.change ?? 0) * 2,
          ),
        ),
      drivers: {
        gold: gold?.change ?? null,
        vix: vix?.change ?? null,
        dxy: dxy?.change ?? null,
        us10y: us10y?.change ?? null,
      },
    };
  }, 300);
}
