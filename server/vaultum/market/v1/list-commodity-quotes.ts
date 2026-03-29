import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { fetchYahooQuotesBatch } from './_shared';

type CommodityQuote = { symbol: string; price: number; change: number; sparkline: number[] };

type CommodityQuoteResponse = {
  quotes: CommodityQuote[];
  sourceSummary: string[];
  usedStaleFallback?: boolean;
};

const staleCommodityCache = new Map<string, { data: CommodityQuoteResponse; timestamp: number }>();

function stableSymbolKey(symbols: string[]): string {
  return [...symbols].sort().join(',');
}

export async function listCommodityQuotes(input: { symbols: string[] }): Promise<CommodityQuoteResponse> {
  const symbols = input.symbols ?? [];
  const sortedSymbols = [...symbols].sort();
  const key = cacheKey('market', `commodities:${sortedSymbols.join(',')}`);
  const staleKey = stableSymbolKey(sortedSymbols);

  return getCachedOrCompute(key, async () => {
    if (!sortedSymbols.length) {
      return {
        quotes: [],
        sourceSummary: [
          'Commodity futures are sourced from Yahoo Finance chart endpoints.',
          'TradingView is used only for chart rendering and does not supply Vaultum quote data.',
        ],
        usedStaleFallback: false,
      };
    }

    const batch = await fetchYahooQuotesBatch(sortedSymbols);
    const quotes = sortedSymbols.flatMap((symbol) => {
      const quote = batch.results.get(symbol);
      return quote ? [{ symbol, price: quote.price, change: quote.change, sparkline: quote.sparkline }] : [];
    });

    if (quotes.length > 0) {
      const fresh: CommodityQuoteResponse = {
        quotes,
        sourceSummary: [
          'Commodity futures are sourced from Yahoo Finance chart endpoints.',
          'TradingView is used only for chart rendering and does not supply Vaultum quote data.',
        ],
        usedStaleFallback: false,
      };
      staleCommodityCache.set(staleKey, { data: fresh, timestamp: Date.now() });
      return fresh;
    }

    const stale = staleCommodityCache.get(staleKey);
    if (stale) {
      return {
        ...stale.data,
        sourceSummary: [
          ...stale.data.sourceSummary,
          'Served the last successful commodity snapshot using the worldmonitor-style stale fallback cache.',
        ],
        usedStaleFallback: true,
      };
    }

    return {
      quotes: [],
      sourceSummary: [
        'Commodity futures are sourced from Yahoo Finance chart endpoints.',
        batch.rateLimited
          ? 'Yahoo Finance returned a rate-limit condition and no cached commodity snapshot was available.'
          : 'Yahoo Finance did not return usable commodity data for this request.',
        'TradingView is used only for chart rendering and does not supply Vaultum quote data.',
      ],
      usedStaleFallback: false,
    };
  }, 600);
}
