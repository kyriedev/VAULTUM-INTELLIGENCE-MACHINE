declare const process: { env: Record<string, string | undefined> };

import { fetchJson } from '../../_shared/fetch-json';

type FinnhubLookupItem = {
  description?: string;
  displaySymbol?: string;
  symbol?: string;
  type?: string;
  mic?: string;
};

type FinnhubLookupPayload = {
  count?: number;
  result?: FinnhubLookupItem[];
};

type FinnhubQuotePayload = {
  c?: number;
  d?: number;
  dp?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
};

type FinnhubStatusPayload = {
  exchange?: string;
  holiday?: string;
  isOpen?: boolean;
  session?: string;
  timezone?: string;
  t?: number;
};

type FinnhubNewsItem = {
  id?: number;
  category?: string;
  datetime?: number;
  headline?: string;
  image?: string;
  related?: string;
  source?: string;
  summary?: string;
  url?: string;
};

type FinnhubNewsSentimentPayload = {
  buzz?: {
    articlesInLastWeek?: number;
    buzz?: number;
    weeklyAverage?: number;
  };
  companyNewsScore?: number;
  sectorAverageBullishPercent?: number;
  sectorAverageNewsScore?: number;
  sentiment?: {
    bearishPercent?: number;
    bullishPercent?: number;
  };
  symbol?: string;
};

type FinnhubEarningsCalendarPayload = {
  earningsCalendar?: Array<{
    date?: string;
    epsActual?: number;
    epsEstimate?: number;
    hour?: string;
    quarter?: number;
    revenueActual?: number;
    revenueEstimate?: number;
    symbol?: string;
    year?: number;
  }>;
};

type FinnhubHint = {
  query: string;
  proxySymbol?: string;
  preferredSymbols?: string[];
  preferredTypes?: string[];
  newsCategory?: 'general' | 'forex' | 'crypto';
};

export type FinnhubResolvedSymbol = {
  id: string;
  market: string;
  query: string;
  symbol: string;
  displaySymbol: string;
  description: string;
  type: string | null;
  mic: string | null;
  isProxy: boolean;
  proxySymbol: string | null;
};

export type FinnhubResearchHeadline = {
  id: string;
  title: string;
  source: string | null;
  summary: string | null;
  url: string | null;
  publishedAt: string | null;
  category: string | null;
};

const FINNHUB_BASE_URL = 'https://api.finnhub.io/api/v1';

const MARKET_HINTS: Record<string, FinnhubHint> = {
  XAUUSD: { query: 'GLD', proxySymbol: 'GLD', preferredSymbols: ['GLD'], preferredTypes: ['ETF'], newsCategory: 'general' },
  EURUSD: { query: 'FXE', proxySymbol: 'FXE', preferredSymbols: ['FXE'], preferredTypes: ['ETF'], newsCategory: 'forex' },
  GBPUSD: { query: 'FXB', proxySymbol: 'FXB', preferredSymbols: ['FXB'], preferredTypes: ['ETF'], newsCategory: 'forex' },
  USDJPY: { query: 'FXY', proxySymbol: 'FXY', preferredSymbols: ['FXY'], preferredTypes: ['ETF'], newsCategory: 'forex' },
  GBPJPY: { query: 'FXY', proxySymbol: 'FXY', preferredSymbols: ['FXY'], preferredTypes: ['ETF'], newsCategory: 'forex' },
  EURJPY: { query: 'FXY', proxySymbol: 'FXY', preferredSymbols: ['FXY'], preferredTypes: ['ETF'], newsCategory: 'forex' },
  DXY: { query: 'UUP', proxySymbol: 'UUP', preferredSymbols: ['UUP'], preferredTypes: ['ETF'], newsCategory: 'forex' },
  SPX: { query: 'SPY', proxySymbol: 'SPY', preferredSymbols: ['SPY'], preferredTypes: ['ETF'], newsCategory: 'general' },
  NDX: { query: 'QQQ', proxySymbol: 'QQQ', preferredSymbols: ['QQQ'], preferredTypes: ['ETF'], newsCategory: 'general' },
  VIX: { query: 'VIXY', proxySymbol: 'VIXY', preferredSymbols: ['VIXY'], preferredTypes: ['ETF'], newsCategory: 'general' },
  US30: { query: 'DIA', proxySymbol: 'DIA', preferredSymbols: ['DIA'], preferredTypes: ['ETF'], newsCategory: 'general' },
  WTI: { query: 'USO', proxySymbol: 'USO', preferredSymbols: ['USO'], preferredTypes: ['ETF'], newsCategory: 'general' },
  BTCUSD: { query: 'IBIT', proxySymbol: 'IBIT', preferredSymbols: ['IBIT'], preferredTypes: ['ETF'], newsCategory: 'crypto' },
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
    '^VIX': 'VIX',
    'DX-Y.NYB': 'DXY',
    'BTC-USD': 'BTCUSD',
  };
  return aliases[value] ?? value;
}

function resolveHint(market?: string, query?: string): FinnhubHint {
  const normalized = normalizeMarket(market);
  if (typeof query === 'string' && query.trim()) {
    const clean = query.trim().toUpperCase();
    return {
      query: clean,
      preferredSymbols: [clean],
      preferredTypes: /^[A-Z.\-]{1,10}$/.test(clean) ? ['Common Stock', 'ETF', 'ETP'] : [],
      newsCategory: /BTC|ETH|CRYPTO/.test(clean) ? 'crypto' : 'general',
    };
  }
  return MARKET_HINTS[normalized] ?? {
    query: normalized,
    preferredSymbols: [normalized],
    preferredTypes: ['Common Stock', 'ETF', 'ETP'],
    newsCategory: 'general',
  };
}

function buildId(item: FinnhubLookupItem): string {
  const symbol = String(item.symbol || item.displaySymbol || '').trim().toUpperCase();
  const mic = String(item.mic || '').trim().toUpperCase();
  return mic ? `${mic}:${symbol}` : symbol;
}

function normalizeLookupItem(market: string, query: string, hint: FinnhubHint, item: FinnhubLookupItem): FinnhubResolvedSymbol | null {
  const symbol = String(item.symbol || item.displaySymbol || '').trim().toUpperCase();
  if (!symbol) return null;

  const proxySymbol = hint.proxySymbol ? hint.proxySymbol.toUpperCase() : null;
  return {
    id: buildId(item),
    market,
    query,
    symbol,
    displaySymbol: String(item.displaySymbol || symbol).trim().toUpperCase(),
    description: String(item.description || item.displaySymbol || symbol).trim(),
    type: item.type ? String(item.type).trim() : null,
    mic: item.mic ? String(item.mic).trim().toUpperCase() : null,
    isProxy: Boolean(proxySymbol && symbol !== market && symbol === proxySymbol),
    proxySymbol,
  };
}

function chooseBestMatch(matches: FinnhubResolvedSymbol[], hint: FinnhubHint, market: string): FinnhubResolvedSymbol | null {
  if (!matches.length) return null;
  const preferredSymbolSet = new Set((hint.preferredSymbols ?? []).map((value) => value.toUpperCase()));
  const preferredTypeSet = new Set((hint.preferredTypes ?? []).map((value) => value.toUpperCase()));

  return [...matches].sort((left, right) => {
    const leftSymbol = preferredSymbolSet.has(left.symbol) ? 1 : 0;
    const rightSymbol = preferredSymbolSet.has(right.symbol) ? 1 : 0;
    if (leftSymbol !== rightSymbol) return rightSymbol - leftSymbol;

    const leftType = left.type && preferredTypeSet.has(left.type.toUpperCase()) ? 1 : 0;
    const rightType = right.type && preferredTypeSet.has(right.type.toUpperCase()) ? 1 : 0;
    if (leftType !== rightType) return rightType - leftType;

    const leftDirect = left.symbol === market ? 1 : 0;
    const rightDirect = right.symbol === market ? 1 : 0;
    if (leftDirect !== rightDirect) return rightDirect - leftDirect;

    const leftDesc = left.description.toUpperCase().includes(hint.query.toUpperCase()) ? 1 : 0;
    const rightDesc = right.description.toUpperCase().includes(hint.query.toUpperCase()) ? 1 : 0;
    return rightDesc - leftDesc;
  })[0] ?? null;
}

function formatParam(value: unknown): string {
  if (typeof value === 'boolean') return JSON.stringify(value);
  return String(value);
}

function isErrorPayload(payload: unknown): boolean {
  return Boolean(payload && typeof payload === 'object' && 'error' in payload);
}

function toIso(value: number | string | undefined): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value * 1000).toISOString();
  if (typeof value === 'string' && value.trim()) return value;
  return null;
}

export function finnhubConfigured(): boolean {
  return Boolean(env('FINNHUB_API_KEY'));
}

export function finnhubTimeframeToResolution(timeframe?: string): string {
  const normalized = String(timeframe || '1h').trim().toLowerCase();
  if (normalized === '15m') return '15';
  if (normalized === '30m') return '30';
  if (normalized === '1h' || normalized === '60m') return '60';
  if (normalized === '4h') return '240';
  if (normalized === '1d' || normalized === 'd') return 'D';
  if (normalized === '1w' || normalized === 'w') return 'W';
  return '60';
}

async function requestFinnhub<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  apiKeyOverride?: string,
): Promise<T | null> {
  const token = (apiKeyOverride || env('FINNHUB_API_KEY')).trim();
  if (!token) return null;

  const url = new URL(`${FINNHUB_BASE_URL}/${path.replace(/^\//, '')}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return;
    url.searchParams.set(key, formatParam(value));
  });
  url.searchParams.set('token', token);

  const payload = await fetchJson<T>(url.toString(), { timeoutMs: 12_000 });
  return isErrorPayload(payload) ? null : payload;
}

export async function searchFinnhubSymbols(market?: string, query?: string): Promise<FinnhubResolvedSymbol[]> {
  const normalizedMarket = normalizeMarket(market);
  const hint = resolveHint(normalizedMarket, query);
  const payload = await requestFinnhub<FinnhubLookupPayload>('search', { q: hint.query });
  const items = Array.isArray(payload?.result) ? payload.result : [];

  return items
    .map((item) => normalizeLookupItem(normalizedMarket, hint.query, hint, item))
    .filter((item): item is FinnhubResolvedSymbol => Boolean(item));
}

export async function resolveFinnhubSymbol(market?: string, query?: string): Promise<FinnhubResolvedSymbol | null> {
  const normalizedMarket = normalizeMarket(market);
  const hint = resolveHint(normalizedMarket, query);
  const matches = await searchFinnhubSymbols(normalizedMarket, query);
  return chooseBestMatch(matches, hint, normalizedMarket);
}

export async function fetchFinnhubQuoteSnapshot(
  symbol: string,
  apiKeyOverride?: string,
): Promise<{
  price: number;
  change: number | null;
  percentChange: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  previousClose: number | null;
  timestamp: string | null;
} | null> {
  const payload = await requestFinnhub<FinnhubQuotePayload>('quote', { symbol }, apiKeyOverride);
  const price = Number(payload?.c ?? 0);
  const high = Number(payload?.h ?? 0);
  const low = Number(payload?.l ?? 0);
  if ((!price || Number.isNaN(price)) && (!high || Number.isNaN(high)) && (!low || Number.isNaN(low))) return null;

  const toNumber = (value: unknown): number | null => {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? number : null;
  };

  return {
    price,
    change: toNumber(payload?.d),
    percentChange: toNumber(payload?.dp),
    high: toNumber(payload?.h),
    low: toNumber(payload?.l),
    open: toNumber(payload?.o),
    previousClose: toNumber(payload?.pc),
    timestamp: toIso(payload?.t),
  };
}

export async function fetchFinnhubAggregateIndicator(symbol: string, resolution: string): Promise<any | null> {
  return requestFinnhub<any>('scan/technical-indicator', { symbol, resolution });
}

export async function fetchFinnhubSupportResistance(symbol: string, resolution: string): Promise<any | null> {
  return requestFinnhub<any>('scan/support-resistance', { symbol, resolution });
}

export async function fetchFinnhubPatternRecognition(symbol: string, resolution: string): Promise<any | null> {
  return requestFinnhub<any>('scan/pattern', { symbol, resolution });
}

export async function fetchFinnhubCompanyNews(symbol: string, from: string, to: string): Promise<FinnhubResearchHeadline[]> {
  const payload = await requestFinnhub<FinnhubNewsItem[]>('company-news', {
    symbol,
    from,
    to,
  });
  return Array.isArray(payload) ? payload.map(normalizeHeadline).filter((item): item is FinnhubResearchHeadline => Boolean(item)) : [];
}

export async function fetchFinnhubGeneralNews(category: 'general' | 'forex' | 'crypto'): Promise<FinnhubResearchHeadline[]> {
  const payload = await requestFinnhub<FinnhubNewsItem[]>('news', {
    category,
    minId: 0,
  });
  return Array.isArray(payload) ? payload.map(normalizeHeadline).filter((item): item is FinnhubResearchHeadline => Boolean(item)) : [];
}

export async function fetchFinnhubNewsSentiment(symbol: string): Promise<FinnhubNewsSentimentPayload | null> {
  return requestFinnhub<FinnhubNewsSentimentPayload>('news-sentiment', { symbol });
}

export async function fetchFinnhubEarningsCalendar(
  from: string,
  to: string,
  symbol: string,
): Promise<FinnhubEarningsCalendarPayload['earningsCalendar']> {
  const payload = await requestFinnhub<FinnhubEarningsCalendarPayload>('calendar/earnings', {
    from,
    to,
    symbol,
    international: false,
  });
  return Array.isArray(payload?.earningsCalendar) ? payload.earningsCalendar : [];
}

export async function fetchFinnhubMarketStatus(exchange = 'US'): Promise<FinnhubStatusPayload | null> {
  return requestFinnhub<FinnhubStatusPayload>('stock/market-status', { exchange });
}

export async function fetchFinnhubMarketHoliday(exchange = 'US'): Promise<FinnhubStatusPayload | FinnhubStatusPayload[] | null> {
  return requestFinnhub<FinnhubStatusPayload | FinnhubStatusPayload[]>('stock/market-holiday', { exchange });
}

function normalizeHeadline(item: FinnhubNewsItem): FinnhubResearchHeadline | null {
  const title = String(item.headline || '').trim();
  if (!title) return null;
  const baseId = item.id != null ? String(item.id) : `${title}:${item.datetime ?? ''}`;
  return {
    id: baseId,
    title,
    source: item.source ? String(item.source).trim() : null,
    summary: item.summary ? String(item.summary).trim() : null,
    url: item.url ? String(item.url).trim() : null,
    publishedAt: toIso(item.datetime),
    category: item.category ? String(item.category).trim() : null,
  };
}

export function finnhubHintSummary(market?: string, query?: string): {
  market: string;
  hint: FinnhubHint;
} {
  const normalizedMarket = normalizeMarket(market);
  return {
    market: normalizedMarket,
    hint: resolveHint(normalizedMarket, query),
  };
}
