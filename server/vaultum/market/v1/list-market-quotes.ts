declare const process: { env: Record<string, string | undefined> };

import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { describeBrokerStack } from '../../_shared/feed-status';
import { fetchOandaPricingSnapshot, fetchOandaSparkline, mapToOandaInstrument, oandaConfigured } from '../../_shared/oanda';
import { YAHOO_ONLY_SYMBOLS, fetchFinnhubQuote, fetchYahooQuotesBatch } from './_shared';

type MarketQuote = { symbol: string; price: number; change: number; sparkline: number[] };

type MarketQuoteResponse = {
  quotes: MarketQuote[];
  rateLimited: boolean;
  skipReason?: string;
  sourceSummary: string[];
  usedStaleFallback?: boolean;
};

const staleQuoteCache = new Map<string, { data: MarketQuoteResponse; timestamp: number }>();

function stableSymbolKey(symbols: string[]): string {
  return [...symbols].sort().join(',');
}

function baseSourceSummary(apiKeyPresent: boolean, brokerPresent: boolean): string[] {
  return [
    ...describeBrokerStack(),
    apiKeyPresent
      ? 'Finnhub is the primary feed for cash equity and ETF quotes.'
      : 'Finnhub is not configured, so market quotes lean on Yahoo Finance and cached fallbacks.',
    'Yahoo Finance covers indices, futures, DXY, and any symbols missed by broker or Finnhub feeds.',
    'TradingView is used only for chart rendering and does not supply Vaultum quote data.',
  ];
}

export async function listMarketQuotes(input: { symbols: string[] }): Promise<MarketQuoteResponse> {
  const symbols = input.symbols ?? [];
  const sortedSymbols = [...symbols].sort();
  const key = cacheKey('market', `quotes:${sortedSymbols.join(',')}`);
  const staleKey = stableSymbolKey(sortedSymbols);
  const apiKey = process.env.FINNHUB_API_KEY;
  const brokerEnabled = oandaConfigured();

  return getCachedOrCompute(key, async () => {
    if (!sortedSymbols.length) {
      return {
        quotes: [],
        rateLimited: false,
        sourceSummary: baseSourceSummary(Boolean(apiKey), brokerEnabled),
        usedStaleFallback: false,
      };
    }

    const oandaSymbols = sortedSymbols.filter((symbol) => mapToOandaInstrument(symbol) != null);
    const finnhubSymbols = sortedSymbols.filter((symbol) => !YAHOO_ONLY_SYMBOLS.has(symbol));
    const yahooSymbols = sortedSymbols.filter((symbol) => YAHOO_ONLY_SYMBOLS.has(symbol) && !oandaSymbols.includes(symbol));
    const quotes: MarketQuote[] = [];

    if (brokerEnabled && oandaSymbols.length) {
      const pricing = await fetchOandaPricingSnapshot(oandaSymbols);
      const sparklineResults = await Promise.all(
        oandaSymbols.map(async (symbol) => ({ symbol, data: await fetchOandaSparkline(symbol, 'H1', 30) })),
      );

      sparklineResults.forEach(({ symbol, data }) => {
        const price = pricing.get(symbol)?.price;
        if (price == null || !data) return;
        quotes.push({
          symbol,
          price,
          change: data.change,
          sparkline: data.sparkline,
        });
      });
    }

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

    if (quotes.length > 0) {
      const fresh: MarketQuoteResponse = {
        quotes,
        rateLimited: false,
        ...(apiKey || brokerEnabled ? {} : { skipReason: 'FINNHUB_API_KEY and OANDA broker feed not configured; Yahoo fallback used where possible.' }),
        sourceSummary: baseSourceSummary(Boolean(apiKey), brokerEnabled),
        usedStaleFallback: false,
      };
      staleQuoteCache.set(staleKey, { data: fresh, timestamp: Date.now() });
      return fresh;
    }

    const stale = staleQuoteCache.get(staleKey);
    if (stale) {
      return {
        ...stale.data,
        rateLimited: batch.rateLimited || stale.data.rateLimited,
        sourceSummary: [
          ...stale.data.sourceSummary,
          'Served the last successful market snapshot using the worldmonitor-style stale fallback cache.',
        ],
        usedStaleFallback: true,
      };
    }

    return {
      quotes: [],
      rateLimited: batch.rateLimited,
      ...(apiKey || brokerEnabled ? {} : { skipReason: 'FINNHUB_API_KEY and OANDA broker feed not configured; Yahoo fallback used where possible.' }),
      sourceSummary: [
        ...baseSourceSummary(Boolean(apiKey), brokerEnabled),
        batch.rateLimited
          ? 'Yahoo Finance returned a rate-limit condition and no cached snapshot was available.'
          : 'No upstream quote source returned usable data for this request.',
      ],
      usedStaleFallback: false,
    };
  }, 480);
}
