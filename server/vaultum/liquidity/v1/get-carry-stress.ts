import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { fetchYahooQuotesBatch } from '../../market/v1/_shared';

export async function getCarryStress(): Promise<any> {
  return getCachedOrCompute(cacheKey('liquidity', 'carry-stress'), async () => {
    const batch = await fetchYahooQuotesBatch(['JPY=X', '^VIX', '^TNX', 'GBPJPY=X', 'EURJPY=X']);
    const jpy = batch.results.get('JPY=X');
    const vix = batch.results.get('^VIX');
    return {
      conclusion: (jpy?.change ?? 0) < -1 || (vix?.change ?? 0) > 4 ? 'JPY/carry stress elevated' : 'carry stress moderate',
      pairs: [
        { pair: 'GBPJPY', change: batch.results.get('GBPJPY=X')?.change ?? null },
        { pair: 'EURJPY', change: batch.results.get('EURJPY=X')?.change ?? null },
      ],
      drivers: {
        jpy: jpy?.change ?? null,
        vix: vix?.change ?? null,
      },
    };
  }, 300);
}
