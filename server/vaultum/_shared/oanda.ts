declare const process: { env: Record<string, string | undefined> };

import { CHROME_UA } from '../../_shared/constants';

type OandaCandle = {
  time: string;
  volume: number;
  bid?: { o: string; h: string; l: string; c: string };
  ask?: { o: string; h: string; l: string; c: string };
  mid?: { o: string; h: string; l: string; c: string };
  complete: boolean;
};

const OANDA_SYMBOLS: Record<string, string> = {
  EURUSD: 'EUR_USD',
  'EURUSD=X': 'EUR_USD',
  GBPUSD: 'GBP_USD',
  'GBPUSD=X': 'GBP_USD',
  USDJPY: 'USD_JPY',
  'USDJPY=X': 'USD_JPY',
  GBPJPY: 'GBP_JPY',
  'GBPJPY=X': 'GBP_JPY',
  EURJPY: 'EUR_JPY',
  'EURJPY=X': 'EUR_JPY',
  XAUUSD: 'XAU_USD',
};

function env(name: string): string {
  return (process.env[name] || '').trim();
}

function oandaBaseUrl(): string {
  return env('OANDA_API_URL') || 'https://api-fxpractice.oanda.com';
}

export function oandaConfigured(): boolean {
  return Boolean(env('OANDA_API_KEY') && env('OANDA_ACCOUNT_ID'));
}

export function mapToOandaInstrument(symbol: string): string | null {
  return OANDA_SYMBOLS[symbol.toUpperCase()] ?? null;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env('OANDA_API_KEY')}`,
    Accept: 'application/json',
    'User-Agent': CHROME_UA,
  };
}

function midpoint(valueA: string | undefined, valueB: string | undefined): number | null {
  if (!valueA || !valueB) return null;
  const left = Number(valueA);
  const right = Number(valueB);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Number(((left + right) / 2).toFixed(5));
}

export async function fetchOandaPricingSnapshot(symbols: string[]): Promise<Map<string, { price: number }>> {
  const supported = symbols.flatMap((symbol) => {
    const instrument = mapToOandaInstrument(symbol);
    return instrument ? [{ symbol, instrument }] : [];
  });
  if (!supported.length || !oandaConfigured()) return new Map();

  const accountId = env('OANDA_ACCOUNT_ID');
  const instruments = [...new Set(supported.map((entry) => entry.instrument))].join(',');
  const url = `${oandaBaseUrl()}/v3/accounts/${encodeURIComponent(accountId)}/pricing?instruments=${encodeURIComponent(instruments)}`;
  const response = await fetch(url, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return new Map();

  const payload = await response.json() as {
    prices?: Array<{ instrument: string; closeoutBid?: string; closeoutAsk?: string; bids?: Array<{ price: string }>; asks?: Array<{ price: string }> }>;
  };
  const byInstrument = new Map<string, number>();
  (payload.prices ?? []).forEach((price) => {
    const topBid = price.bids?.[0]?.price ?? price.closeoutBid;
    const topAsk = price.asks?.[0]?.price ?? price.closeoutAsk;
    const mid = midpoint(topBid, topAsk);
    if (mid != null) byInstrument.set(price.instrument, mid);
  });

  return supported.reduce((map, entry) => {
    const price = byInstrument.get(entry.instrument);
    if (price != null) map.set(entry.symbol, { price });
    return map;
  }, new Map<string, { price: number }>());
}

export function granularityForOanda(timeframe: string): string {
  const value = timeframe.toUpperCase();
  if (value === '15M') return 'M15';
  if (value === '30M') return 'M30';
  if (value === '4H') return 'H4';
  if (value === '1D' || value === 'D') return 'D';
  return 'H1';
}

export async function fetchOandaCandles(symbol: string, granularity: string, count: number): Promise<Array<{ open: number; high: number; low: number; close: number; volume: number; time: string }>> {
  const instrument = mapToOandaInstrument(symbol);
  if (!instrument || !oandaConfigured()) return [];

  const url = `${oandaBaseUrl()}/v3/instruments/${encodeURIComponent(instrument)}/candles?price=BA&granularity=${encodeURIComponent(granularity)}&count=${count}`;
  const response = await fetch(url, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return [];

  const payload = await response.json() as { candles?: OandaCandle[] };
  return (payload.candles ?? [])
    .filter((candle) => candle.complete !== false)
    .flatMap((candle) => {
      const open = midpoint(candle.bid?.o, candle.ask?.o);
      const high = midpoint(candle.bid?.h, candle.ask?.h);
      const low = midpoint(candle.bid?.l, candle.ask?.l);
      const close = midpoint(candle.bid?.c, candle.ask?.c);
      if ([open, high, low, close].some((value) => value == null)) return [];
      return [{
        open: open as number,
        high: high as number,
        low: low as number,
        close: close as number,
        volume: candle.volume ?? 0,
        time: candle.time,
      }];
    });
}

export async function fetchOandaSparkline(symbol: string, granularity: string, count: number): Promise<{ change: number; sparkline: number[] } | null> {
  const candles = await fetchOandaCandles(symbol, granularity, count);
  if (candles.length < 2) return null;
  const first = candles[0]?.close ?? candles[candles.length - 2]?.close;
  const last = candles[candles.length - 1]?.close;
  if (!first || !last) return null;
  return {
    change: Number((((last - first) / first) * 100).toFixed(2)),
    sparkline: candles.map((candle) => candle.close),
  };
}
