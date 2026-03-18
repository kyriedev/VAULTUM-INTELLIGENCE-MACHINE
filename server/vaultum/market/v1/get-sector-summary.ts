declare const process: { env: Record<string, string | undefined> };

import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { fetchFinnhubQuote, fetchYahooQuotesBatch } from './_shared';

const SECTOR_SYMBOLS = ['XLK', 'XLF', 'XLE', 'XLV', 'XLY', 'XLI', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC', 'SMH'];

export async function getSectorSummary(): Promise<{ sectors: Array<{ symbol: string; change: number }> }> {
  const apiKey = process.env.FINNHUB_API_KEY;
  return getCachedOrCompute(cacheKey('market', 'sectors'), async () => {
    const sectors: Array<{ symbol: string; change: number }> = [];
    if (apiKey) {
      const results = await Promise.all(SECTOR_SYMBOLS.map((symbol) => fetchFinnhubQuote(symbol, apiKey)));
      results.forEach((quote) => {
        if (quote) sectors.push({ symbol: quote.symbol, change: quote.changePercent });
      });
    }
    if (sectors.length === 0) {
      const batch = await fetchYahooQuotesBatch(SECTOR_SYMBOLS);
      SECTOR_SYMBOLS.forEach((symbol) => {
        const quote = batch.results.get(symbol);
        if (quote) sectors.push({ symbol, change: quote.change });
      });
    }
    return { sectors };
  }, 600);
}
