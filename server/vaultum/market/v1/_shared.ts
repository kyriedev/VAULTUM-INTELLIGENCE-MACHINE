declare const process: { env: Record<string, string | undefined> };

import { CHROME_UA } from '../../../_shared/constants';
import { fetchFinnhubQuoteSnapshot } from '../../_shared/finnhub';
import { fetchYahooQuoteSnapshot } from '../../_shared/yahoo';

export const UPSTREAM_TIMEOUT_MS = 10000;

export const YAHOO_ONLY_SYMBOLS = new Set([
  '^GSPC', '^IXIC', '^VIX', '^TNX', '^IRX',
  'GC=F', 'CL=F', 'BZ=F', 'NG=F', 'SI=F', 'HG=F',
  'EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'GBPJPY=X', 'EURJPY=X', 'DX-Y.NYB'
]);

export async function fetchFinnhubQuote(symbol: string, apiKey: string): Promise<{ symbol: string; price: number; changePercent: number } | null> {
  const quote = await fetchFinnhubQuoteSnapshot(symbol, apiKey);
  if (!quote) return null;
  return {
    symbol,
    price: quote.price,
    changePercent: quote.percentChange ?? 0,
  };
}

export async function fetchYahooQuote(symbol: string): Promise<{ price: number; change: number; sparkline: number[] } | null> {
  const quote = await fetchYahooQuoteSnapshot(symbol);
  if (!quote) return null;
  return { price: quote.price, change: quote.change, sparkline: quote.sparkline };
}

export async function fetchYahooQuotesBatch(symbols: string[]): Promise<{ results: Map<string, { price: number; change: number; sparkline: number[] }>; rateLimited: boolean }> {
  const results = new Map<string, { price: number; change: number; sparkline: number[] }>();
  let misses = 0;
  for (const symbol of symbols) {
    const quote = await fetchYahooQuote(symbol);
    if (quote) results.set(symbol, quote);
    else misses++;
    if (misses >= 3 && results.size === 0) break;
  }
  return { results, rateLimited: misses >= 3 && results.size === 0 };
}

export async function fetchCoinGeckoMarkets(ids: string[]): Promise<any[]> {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(',')}&order=market_cap_desc&sparkline=true&price_change_percentage=24h`;
  const resp = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': CHROME_UA },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}
