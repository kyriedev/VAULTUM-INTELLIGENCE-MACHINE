declare const process: { env: Record<string, string | undefined> };

import { fetchJson } from '../../_shared/fetch-json';

type TwelveDataSearchApiItem = {
  symbol?: string;
  instrument_name?: string;
  exchange?: string;
  mic_code?: string;
  country?: string;
  type?: string;
  currency?: string;
};

type TwelveDataSearchPayload = {
  data?: TwelveDataSearchApiItem[];
  status?: string;
  message?: string;
};

type TwelveDataQuotePayload = {
  symbol?: string;
  name?: string;
  exchange?: string;
  currency?: string;
  close?: string | number;
  previous_close?: string | number;
  percent_change?: string | number;
  change?: string | number;
  high?: string | number;
  low?: string | number;
  open?: string | number;
  volume?: string | number;
  is_market_open?: boolean;
  fifty_two_week?: {
    low?: string | number;
    high?: string | number;
    low_change?: string | number;
    high_change?: string | number;
  };
  status?: string;
  message?: string;
};

type TwelveDataMarketStatePayload = {
  exchange?: string;
  name?: string;
  code?: string;
  country?: string;
  is_market_open?: boolean;
  market_state?: string;
  session?: string;
  status?: string;
  message?: string;
};

type TwelveDataIndicatorPayload = {
  values?: Array<Record<string, string | number>>;
  status?: string;
  message?: string;
} & Record<string, unknown>;

type TwelveDataHint = {
  query: string;
  preferredSymbols?: string[];
  preferredTypes?: string[];
  preferredExchanges?: string[];
};

export type TwelveDataResolvedSymbol = {
  id: string;
  market: string;
  query: string;
  symbol: string;
  description: string;
  exchange: string | null;
  micCode: string | null;
  country: string | null;
  type: string | null;
  currency: string | null;
};

const TWELVE_DATA_BASE_URL = 'https://api.twelvedata.com';

const MARKET_HINTS: Record<string, TwelveDataHint> = {
  XAUUSD: { query: 'XAU/USD', preferredSymbols: ['XAU/USD', 'XAUUSD'], preferredTypes: ['Physical Currency'] },
  EURUSD: { query: 'EUR/USD', preferredSymbols: ['EUR/USD', 'EURUSD'], preferredTypes: ['Physical Currency'] },
  GBPUSD: { query: 'GBP/USD', preferredSymbols: ['GBP/USD', 'GBPUSD'], preferredTypes: ['Physical Currency'] },
  USDJPY: { query: 'USD/JPY', preferredSymbols: ['USD/JPY', 'USDJPY'], preferredTypes: ['Physical Currency'] },
  GBPJPY: { query: 'GBP/JPY', preferredSymbols: ['GBP/JPY', 'GBPJPY'], preferredTypes: ['Physical Currency'] },
  EURJPY: { query: 'EUR/JPY', preferredSymbols: ['EUR/JPY', 'EURJPY'], preferredTypes: ['Physical Currency'] },
  DXY: { query: 'DXY', preferredSymbols: ['DXY'], preferredTypes: ['Index'] },
  SPX: { query: 'SPX', preferredSymbols: ['SPX', 'GSPC'], preferredTypes: ['Index'] },
  NDX: { query: 'NDX', preferredSymbols: ['NDX'], preferredTypes: ['Index'] },
  VIX: { query: 'VIX', preferredSymbols: ['VIX'], preferredTypes: ['Index'] },
  US30: { query: 'DIA', preferredSymbols: ['DIA', 'DJI'], preferredTypes: ['ETF', 'Index'] },
  WTI: { query: 'WTI', preferredSymbols: ['USOIL', 'WTI', 'CL'], preferredTypes: ['Commodity'] },
  BTCUSD: { query: 'BTC/USD', preferredSymbols: ['BTC/USD', 'BTCUSD', 'BTCUSDT'], preferredTypes: ['Digital Currency'] },
};

function env(name: string): string {
  return (process.env[name] || '').trim();
}

function normalizeMarket(market?: string): string {
  const value = String(market || 'XAUUSD').trim().toUpperCase();
  const aliases: Record<string, string> = {
    GOLD: 'XAUUSD',
    'GC=F': 'XAUUSD',
    OIL: 'WTI',
    'CL=F': 'WTI',
    'EURUSD=X': 'EURUSD',
    'GBPUSD=X': 'GBPUSD',
    'USDJPY=X': 'USDJPY',
    'GBPJPY=X': 'GBPJPY',
    'EURJPY=X': 'EURJPY',
    '^GSPC': 'SPX',
    '^IXIC': 'NDX',
    '^DJI': 'US30',
    DJI: 'US30',
    DIA: 'US30',
    'YM=F': 'US30',
    'DX-Y.NYB': 'DXY',
    'BTC-USD': 'BTCUSD',
  };
  return aliases[value] ?? value;
}

function resolveHint(market?: string, query?: string): TwelveDataHint {
  const normalized = normalizeMarket(market);
  if (typeof query === 'string' && query.trim()) {
    return {
      query: query.trim(),
      preferredSymbols: [query.trim().toUpperCase()],
    };
  }
  if (MARKET_HINTS[normalized]) return MARKET_HINTS[normalized]!;
  return {
    query: normalized,
    preferredSymbols: [normalized],
  };
}

function toNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function isErrorPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const status = String((payload as { status?: unknown }).status || '').toLowerCase();
  return status === 'error';
}

function buildId(item: TwelveDataSearchApiItem): string {
  const exchange = String(item.exchange || 'UNKNOWN').trim().toUpperCase();
  const symbol = String(item.symbol || '').trim().toUpperCase();
  return symbol ? `${exchange}:${symbol}` : exchange;
}

function normalizeSearchItem(market: string, query: string, item: TwelveDataSearchApiItem): TwelveDataResolvedSymbol | null {
  const symbol = String(item.symbol || '').trim();
  if (!symbol) return null;
  return {
    id: buildId(item),
    market,
    query,
    symbol,
    description: String(item.instrument_name || symbol).trim(),
    exchange: item.exchange ? String(item.exchange).trim() : null,
    micCode: item.mic_code ? String(item.mic_code).trim() : null,
    country: item.country ? String(item.country).trim() : null,
    type: item.type ? String(item.type).trim() : null,
    currency: item.currency ? String(item.currency).trim() : null,
  };
}

function commonQuoteParams(match: TwelveDataResolvedSymbol): Record<string, string> {
  const params: Record<string, string> = {
    symbol: match.symbol,
  };
  if (match.exchange) params.exchange = match.exchange;
  if (match.country) params.country = match.country;
  if (match.type) params.type = match.type;
  if (match.micCode) params.mic_code = match.micCode;
  return params;
}

async function requestTwelveData<T>(endpoint: string, params: Record<string, string | number | boolean | undefined>): Promise<T | null> {
  const apiKey = env('TWELVEDATA_API_KEY');
  if (!apiKey) return null;

  const url = new URL(`${TWELVE_DATA_BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('format', 'JSON');

  const payload = await fetchJson<T>(url.toString(), { timeoutMs: 12_000 });
  return isErrorPayload(payload) ? null : payload;
}

function timeframeToInterval(timeframe?: string): string {
  switch (String(timeframe || '1h').trim().toLowerCase()) {
    case '15m':
      return '15min';
    case '30m':
      return '30min';
    case '4h':
      return '4h';
    case '1d':
    case 'd':
      return '1day';
    case '1w':
    case 'w':
      return '1week';
    default:
      return '1h';
  }
}

function chooseBestMatch(matches: TwelveDataResolvedSymbol[], hint: TwelveDataHint): TwelveDataResolvedSymbol | null {
  if (!matches.length) return null;

  const preferredSymbolSet = new Set((hint.preferredSymbols ?? []).map((value) => value.toUpperCase()));
  const preferredTypeSet = new Set((hint.preferredTypes ?? []).map((value) => value.toUpperCase()));
  const preferredExchangeSet = new Set((hint.preferredExchanges ?? []).map((value) => value.toUpperCase()));

  const ranked = [...matches].sort((left, right) => {
    const leftExact = preferredSymbolSet.has(left.symbol.toUpperCase()) ? 1 : 0;
    const rightExact = preferredSymbolSet.has(right.symbol.toUpperCase()) ? 1 : 0;
    if (leftExact !== rightExact) return rightExact - leftExact;

    const leftType = left.type && preferredTypeSet.has(left.type.toUpperCase()) ? 1 : 0;
    const rightType = right.type && preferredTypeSet.has(right.type.toUpperCase()) ? 1 : 0;
    if (leftType !== rightType) return rightType - leftType;

    const leftExchange = left.exchange && preferredExchangeSet.has(left.exchange.toUpperCase()) ? 1 : 0;
    const rightExchange = right.exchange && preferredExchangeSet.has(right.exchange.toUpperCase()) ? 1 : 0;
    if (leftExchange !== rightExchange) return rightExchange - leftExchange;

    const leftQuery = left.description.toUpperCase().includes(hint.query.toUpperCase()) ? 1 : 0;
    const rightQuery = right.description.toUpperCase().includes(hint.query.toUpperCase()) ? 1 : 0;
    return rightQuery - leftQuery;
  });

  return ranked[0] ?? null;
}

export function twelveDataConfigured(): boolean {
  return Boolean(env('TWELVEDATA_API_KEY'));
}

export async function searchTwelveDataSymbols(market?: string, query?: string): Promise<TwelveDataResolvedSymbol[]> {
  const normalizedMarket = normalizeMarket(market);
  const hint = resolveHint(normalizedMarket, query);
  const payload = await requestTwelveData<TwelveDataSearchPayload | TwelveDataSearchApiItem[]>('/symbol_search', {
    symbol: hint.query,
    outputsize: 8,
    show_plan: false,
  });
  const rawItems = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as TwelveDataSearchPayload | null)?.data)
      ? (payload as TwelveDataSearchPayload).data!
      : [];

  return rawItems
    .map((item) => normalizeSearchItem(normalizedMarket, hint.query, item))
    .filter((item): item is TwelveDataResolvedSymbol => Boolean(item));
}

export async function resolveTwelveDataSymbol(market?: string, query?: string): Promise<TwelveDataResolvedSymbol | null> {
  const normalizedMarket = normalizeMarket(market);
  const hint = resolveHint(normalizedMarket, query);
  const matches = await searchTwelveDataSymbols(normalizedMarket, query);
  return chooseBestMatch(matches, hint);
}

export async function fetchTwelveDataQuote(match: TwelveDataResolvedSymbol): Promise<{
  price: number | null;
  previousClose: number | null;
  percentChange: number | null;
  change: number | null;
  volume: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  raw: TwelveDataQuotePayload | null;
}> {
  const quote = await requestTwelveData<TwelveDataQuotePayload>('/quote', {
    ...commonQuoteParams(match),
    interval: '1day',
    prepost: false,
  });
  if (quote) {
    return {
      price: toNumber(quote.close),
      previousClose: toNumber(quote.previous_close),
      percentChange: toNumber(quote.percent_change),
      change: toNumber(quote.change),
      volume: toNumber(quote.volume),
      high: toNumber(quote.high),
      low: toNumber(quote.low),
      open: toNumber(quote.open),
      raw: quote,
    };
  }

  const price = await requestTwelveData<{ price?: string | number }>('/price', {
    ...commonQuoteParams(match),
    prepost: false,
  });
  return {
    price: toNumber(price?.price),
    previousClose: null,
    percentChange: null,
    change: null,
    volume: null,
    high: null,
    low: null,
    open: null,
    raw: quote,
  };
}

export async function fetchTwelveDataIndicator(
  match: TwelveDataResolvedSymbol,
  endpoint: string,
  timeframe?: string,
  extraParams: Record<string, string | number | boolean | undefined> = {},
): Promise<Record<string, string | number> | null> {
  const payload = await requestTwelveData<TwelveDataIndicatorPayload>(`/${endpoint}`, {
    ...commonQuoteParams(match),
    interval: timeframeToInterval(timeframe),
    outputsize: 2,
    order: 'desc',
    timezone: 'Exchange',
    ...extraParams,
  });
  if (!payload) return null;

  if (Array.isArray(payload.values) && payload.values.length) {
    return payload.values[0] ?? null;
  }

  const entries = Object.entries(payload).filter(([key]) => key !== 'status' && key !== 'message' && key !== 'meta');
  if (!entries.length) return null;
  return entries.reduce<Record<string, string | number>>((map, [key, value]) => {
    if (typeof value === 'string' || typeof value === 'number') map[key] = value;
    return map;
  }, {});
}

export async function fetchTwelveDataMarketState(match: TwelveDataResolvedSymbol): Promise<TwelveDataMarketStatePayload | null> {
  if (!match.exchange && !match.country && !match.micCode) return null;
  const payload = await requestTwelveData<TwelveDataMarketStatePayload | TwelveDataMarketStatePayload[]>('/market_state', {
    exchange: match.exchange ?? undefined,
    country: match.country ?? undefined,
    code: match.micCode ?? undefined,
  });
  if (!payload) return null;
  return Array.isArray(payload) ? (payload[0] ?? null) : payload;
}

export async function fetchTwelveDataOptionsExpirations(match: TwelveDataResolvedSymbol): Promise<string[]> {
  const payload = await requestTwelveData<{ dates?: string[] }>('/options/expiration', {
    ...commonQuoteParams(match),
  });
  return Array.isArray(payload?.dates) ? payload.dates.filter((value): value is string => typeof value === 'string') : [];
}

export async function fetchTwelveDataOptionsChain(
  match: TwelveDataResolvedSymbol,
  expirationDate: string,
  side?: 'call' | 'put',
): Promise<any | null> {
  if (!expirationDate) return null;
  return requestTwelveData<any>('/options/chain', {
    ...commonQuoteParams(match),
    expiration_date: expirationDate,
    side,
  });
}
