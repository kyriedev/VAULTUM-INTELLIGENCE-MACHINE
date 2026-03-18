declare const process: { env: Record<string, string | undefined> };

import { CHROME_UA, yahooGate } from '../../../_shared/constants';

export const UPSTREAM_TIMEOUT_MS = 10000;

export const YAHOO_ONLY_SYMBOLS = new Set([
  '^GSPC', '^IXIC', '^VIX', '^TNX', '^IRX',
  'GC=F', 'CL=F', 'BZ=F', 'NG=F', 'SI=F', 'HG=F',
  'EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'GBPJPY=X', 'EURJPY=X', 'DX-Y.NYB'
]);

export async function fetchFinnhubQuote(symbol: string, apiKey: string): Promise<{ symbol: string; price: number; changePercent: number } | null> {
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
    const resp = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { c: number; dp: number; h: number; l: number };
    if (data.c === 0 && data.h === 0 && data.l === 0) return null;
    return { symbol, price: data.c, changePercent: data.dp };
  } catch {
    return null;
  }
}

export async function fetchYahooQuote(symbol: string): Promise<{ price: number; change: number; sparkline: number[] } | null> {
  try {
    await yahooGate();
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) return null;

    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose || meta.previousClose || price;
    const change = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const sparkline = closes.filter((v: number | null) => v != null);
    return { price, change, sparkline };
  } catch {
    return null;
  }
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
