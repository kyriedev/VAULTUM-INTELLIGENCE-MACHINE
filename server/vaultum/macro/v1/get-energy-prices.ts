import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { fetchYahooQuotesBatch } from '../../market/v1/_shared';

const ENERGY_SYMBOLS = ['CL=F', 'BZ=F', 'NG=F'];

export async function getEnergyPrices(): Promise<{ prices: Array<{ symbol: string; price: number; change: number }> }> {
  return getCachedOrCompute(cacheKey('macro', 'energy-prices'), async () => {
    const batch = await fetchYahooQuotesBatch(ENERGY_SYMBOLS);
    return {
      prices: ENERGY_SYMBOLS.flatMap((symbol) => {
        const quote = batch.results.get(symbol);
        return quote ? [{ symbol, price: quote.price, change: Number(quote.change.toFixed(2)) }] : [];
      }),
    };
  }, 900);
}
