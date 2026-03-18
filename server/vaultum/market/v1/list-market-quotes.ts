declare const process: { env: Record<string, string | undefined> };

import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { YAHOO_ONLY_SYMBOLS, fetchFinnhubQuote, fetchYahooQuotesBatch } from './_shared';

export async function listMarketQuotes(input: { symbols: string[] }): Promise<{ quotes: Array<{ symbol: string; price: number; change: number; sparkline: number[] }>; rateLimited: boolean; skipReason?: string }> {
  const symbols = input.symbols ?? [];
  const key = cacheKey('market', `quotes:${symbols.sort().join(',')}`);
  const apiKey = process.env.FINNHUB_API_KEY;

  return getCachedOrCompute(key, async () => {
    if (!symbols.length) return { quotes: [], rateLimited: false };

    const finnhubSymbols = symbols.filter((symbol) => !YAHOO_ONLY_SYMBOLS.has(symbol));
    const yahooSymbols = symbols.filter((symbol) => YAHOO_ONLY_SYMBOLS.has(symbol));
    const quotes: Array<{ symbol: string; price: number; change: number; sparkline: number[] }> = [];

    if (apiKey) {
      const results = await Promise.all(finnhubSymbols.map((symbol) => fetchFinnhubQuote(symbol, apiKey)));
      results.forEach((quote) => {
        if (quote) quotes.push({ symbol: quote.symbol, price: quote.price, change: quote.changePercent, sparkline: [] });
      });
    }

    const missedFinnhub = apiKey ? finnhubSymbols.filter((symbol) => !quotes.some((quote) => quote.symbol === symbol)) : finnhubSymbols;
    const batch = await fetchYahooQuotesBatch([...yahooSymbols, ...missedFinnhub]);

    [...yahooSymbols, ...missedFinnhub].forEach((symbol) => {
      if (quotes.some((quote) => quote.symbol === symbol)) return;
      const yahoo = batch.results.get(symbol);
      if (yahoo) quotes.push({ symbol, price: yahoo.price, change: yahoo.change, sparkline: yahoo.sparkline });
    });

    return {
      quotes,
      rateLimited: batch.rateLimited && quotes.length === 0,
      ...(apiKey ? {} : { skipReason: 'FINNHUB_API_KEY not configured; Yahoo fallback used where possible.' }),
    };
  }, 480);
}
