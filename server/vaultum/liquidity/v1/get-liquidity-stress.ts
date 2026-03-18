import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { fetchYahooQuotesBatch } from '../../market/v1/_shared';

export async function getLiquidityStress(): Promise<any> {
  return getCachedOrCompute(cacheKey('liquidity', 'stress'), async () => {
    const batch = await fetchYahooQuotesBatch(['DX-Y.NYB', '^VIX', '^TNX', 'JPY=X', 'GC=F']);
    const dxy = batch.results.get('DX-Y.NYB');
    const vix = batch.results.get('^VIX');
    const us10y = batch.results.get('^TNX');
    const jpy = batch.results.get('JPY=X');
    const gold = batch.results.get('GC=F');

    return {
      conclusion:
        (dxy?.change ?? 0) > 0.5 && (vix?.change ?? 0) > 3
          ? 'liquidity stress elevated'
          : 'liquidity stress contained-to-moderate',
      drivers: {
        dxy: dxy?.change ?? null,
        vix: vix?.change ?? null,
        us10y: us10y?.change ?? null,
        jpy: jpy?.change ?? null,
        gold: gold?.change ?? null,
      },
    };
  }, 300);
}
