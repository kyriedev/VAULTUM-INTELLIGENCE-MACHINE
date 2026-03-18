import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { fetchYahooQuotesBatch } from './_shared';

export async function listCommodityQuotes(input: { symbols: string[] }): Promise<{ quotes: Array<{ symbol: string; price: number; change: number; sparkline: number[] }> }> {
  const symbols = input.symbols ?? [];
  const key = cacheKey('market', `commodities:${symbols.sort().join(',')}`);

  return getCachedOrCompute(key, async () => {
    if (!symbols.length) return { quotes: [] };
    const batch = await fetchYahooQuotesBatch(symbols);
    const quotes = symbols.flatMap((symbol) => {
      const quote = batch.results.get(symbol);
      return quote ? [{ symbol, price: quote.price, change: quote.change, sparkline: quote.sparkline }] : [];
    });
    return { quotes };
  }, 600);
}
