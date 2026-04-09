import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import {
  fetchFinvizForexPerformance,
  fetchFinvizInsiderRows,
  fetchFinvizNewsAndBlogs,
  fetchFinvizQuoteSnapshot,
  fetchFinvizScreener,
  type FinvizForexRow,
  type FinvizHeadline,
  type FinvizInsiderRow,
  type FinvizScreenerRow,
} from '../../_shared/finviz.ts';

type FinvizResearchTone = 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'alert';

type FinvizResearchCard = {
  key: string;
  label: string;
  value: string;
  tone: FinvizResearchTone;
  detail: string;
};

type FinvizResearchBoard = {
  key: 'most-active' | 'unusual-volume' | 'recent-insider-buying';
  label: string;
  items: FinvizScreenerRow[];
};

type FinvizTarget = {
  market: string;
  query: string;
  quoteTicker: string | null;
  forexPair: string | null;
  proxyMode: 'direct' | 'proxy' | 'forex-board' | 'global';
  proxyLabel: string | null;
};

export type FinvizResearchResponse = {
  generatedAt: string;
  market: string;
  query: string;
  requestedTimeframe: string;
  matchedSymbolId: string | null;
  matchedDescription: string | null;
  company: string | null;
  exchange: string | null;
  proxyMode: FinvizTarget['proxyMode'];
  proxyLabel: string | null;
  sentiment: 'bullish' | 'bearish' | 'mixed' | 'neutral' | 'unavailable';
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  sourceLabel: string;
  warnings: string[];
  cards: FinvizResearchCard[];
  headlines: FinvizHeadline[];
  blogs: FinvizHeadline[];
  quoteNews: FinvizHeadline[];
  insider: FinvizInsiderRow[];
  forex: FinvizForexRow[];
  screeners: FinvizResearchBoard[];
  fundamentals: Record<string, string>;
  unavailable?: boolean;
};

const FX_MARKETS = new Set(['EURUSD', 'GBPUSD', 'USDJPY', 'EURJPY', 'GBPJPY', 'AUDUSD', 'USDCHF', 'USDCAD', 'NZDUSD']);

const MARKET_ALIASES: Record<string, string> = {
  GOLD: 'XAUUSD',
  GC: 'XAUUSD',
  'GC=F': 'XAUUSD',
  SILVER: 'XAGUSD',
  'SI=F': 'XAGUSD',
  OIL: 'WTI',
  'CL=F': 'WTI',
  WTIUSD: 'WTI',
  SPY: 'SPX',
  '^GSPC': 'SPX',
  'ES1!': 'SPX',
  QQQ: 'NDX',
  '^IXIC': 'NDX',
  'NQ1!': 'NDX',
  DIA: 'US30',
  DJI: 'US30',
  '^DJI': 'US30',
  'YM1!': 'US30',
  VIXY: 'VIX',
  '^VIX': 'VIX',
  UUP: 'DXY',
  DOLLAR: 'DXY',
  BTC: 'BTCUSD',
  BTCUSDT: 'BTCUSD',
  'BTC-USD': 'BTCUSD',
  IBIT: 'BTCUSD',
};

const MARKET_TARGETS: Record<string, Omit<FinvizTarget, 'market' | 'query'>> = {
  XAUUSD: { quoteTicker: 'GLD', forexPair: null, proxyMode: 'proxy', proxyLabel: 'Finviz commodity proxy via GLD because direct spot-gold fundamentals are not exposed there.' },
  XAGUSD: { quoteTicker: 'SLV', forexPair: null, proxyMode: 'proxy', proxyLabel: 'Finviz commodity proxy via SLV because direct spot-silver fundamentals are not exposed there.' },
  WTI: { quoteTicker: 'USO', forexPair: null, proxyMode: 'proxy', proxyLabel: 'Finviz energy proxy via USO because direct WTI futures fundamentals are not exposed there.' },
  SPX: { quoteTicker: 'SPY', forexPair: null, proxyMode: 'proxy', proxyLabel: 'Finviz index proxy via SPY for S&P 500 workflow.' },
  NDX: { quoteTicker: 'QQQ', forexPair: null, proxyMode: 'proxy', proxyLabel: 'Finviz index proxy via QQQ for Nasdaq workflow.' },
  US30: { quoteTicker: 'DIA', forexPair: null, proxyMode: 'proxy', proxyLabel: 'Finviz index proxy via DIA for Dow / US30 workflow.' },
  VIX: { quoteTicker: 'VIXY', forexPair: null, proxyMode: 'proxy', proxyLabel: 'Finviz volatility proxy via VIXY because the screener and quote tables are equity-oriented.' },
  DXY: { quoteTicker: 'UUP', forexPair: null, proxyMode: 'proxy', proxyLabel: 'Finviz dollar proxy via UUP for DXY workflow.' },
  BTCUSD: { quoteTicker: 'IBIT', forexPair: null, proxyMode: 'proxy', proxyLabel: 'Finviz bitcoin proxy via IBIT because Finviz fundamentals are ETF and equity-oriented.' },
  EURUSD: { quoteTicker: null, forexPair: 'EURUSD', proxyMode: 'forex-board', proxyLabel: 'Finviz forex-performance board is being used because direct pair fundamentals are limited.' },
  GBPUSD: { quoteTicker: null, forexPair: 'GBPUSD', proxyMode: 'forex-board', proxyLabel: 'Finviz forex-performance board is being used because direct pair fundamentals are limited.' },
  USDJPY: { quoteTicker: null, forexPair: 'USDJPY', proxyMode: 'forex-board', proxyLabel: 'Finviz forex-performance board is being used because direct pair fundamentals are limited.' },
  EURJPY: { quoteTicker: null, forexPair: 'EURJPY', proxyMode: 'forex-board', proxyLabel: 'Finviz forex-performance board is being used because direct pair fundamentals are limited.' },
  GBPJPY: { quoteTicker: null, forexPair: 'GBPJPY', proxyMode: 'forex-board', proxyLabel: 'Finviz forex-performance board is being used because direct pair fundamentals are limited.' },
  AUDUSD: { quoteTicker: null, forexPair: 'AUDUSD', proxyMode: 'forex-board', proxyLabel: 'Finviz forex-performance board is being used because direct pair fundamentals are limited.' },
  USDCHF: { quoteTicker: null, forexPair: 'USDCHF', proxyMode: 'forex-board', proxyLabel: 'Finviz forex-performance board is being used because direct pair fundamentals are limited.' },
  USDCAD: { quoteTicker: null, forexPair: 'USDCAD', proxyMode: 'forex-board', proxyLabel: 'Finviz forex-performance board is being used because direct pair fundamentals are limited.' },
  NZDUSD: { quoteTicker: null, forexPair: 'NZDUSD', proxyMode: 'forex-board', proxyLabel: 'Finviz forex-performance board is being used because direct pair fundamentals are limited.' },
};

function resolveMarket(input?: string): string {
  const raw = String(input || 'SPY').trim().toUpperCase();
  if (!raw) return 'SPY';
  return MARKET_ALIASES[raw] ?? raw;
}

function resolveTarget(input?: string): FinvizTarget {
  const market = resolveMarket(input);
  const configured = MARKET_TARGETS[market];
  if (configured) {
    return {
      market,
      query: configured.quoteTicker ?? configured.forexPair ?? market,
      ...configured,
    };
  }
  return {
    market,
    query: market,
    quoteTicker: market,
    forexPair: FX_MARKETS.has(market) ? market : null,
    proxyMode: FX_MARKETS.has(market) ? 'forex-board' : 'direct',
    proxyLabel: FX_MARKETS.has(market)
      ? 'Finviz forex-performance board is being used because direct pair fundamentals are limited.'
      : null,
  };
}

function parsePercent(value: string | null | undefined): number | null {
  const raw = String(value || '').trim();
  if (!raw || raw === '-') return null;
  const normalized = raw.replace(/,/g, '').replace(/%/g, '');
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseNumber(value: string | null | undefined): number | null {
  const raw = String(value || '').trim();
  if (!raw || raw === '-') return null;
  const normalized = raw.replace(/,/g, '').replace(/%/g, '');
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function quoteField(fundamentals: Record<string, string>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = fundamentals[key];
    if (value && value.trim()) return value;
  }
  return null;
}

function toneFromSignedValue(value: number | null, threshold = 0.25): FinvizResearchTone {
  if (value == null || Number.isNaN(value)) return 'neutral';
  if (value >= threshold) return 'bullish';
  if (value <= -threshold) return 'bearish';
  return 'neutral';
}

function confidenceFor(input: {
  quoteReady: boolean;
  headlineCount: number;
  blogCount: number;
  insiderCount: number;
  forexReady: boolean;
  screenerCount: number;
}): 'low' | 'medium' | 'high' {
  const score = Number(input.quoteReady)
    + Number(input.forexReady)
    + Math.min(input.headlineCount, 2)
    + Math.min(input.blogCount, 1)
    + Number(input.insiderCount > 0)
    + Number(input.screenerCount > 0);
  if (score >= 5) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

function sentimentFromInputs(input: {
  perfWeek: number | null;
  perfMonth: number | null;
  rsi: number | null;
  perfDayFx: number | null;
  perfWeekFx: number | null;
  insiderCount: number;
  boardHits: number;
}): FinvizResearchResponse['sentiment'] {
  let bullish = 0;
  let bearish = 0;

  const signals = [
    toneFromSignedValue(input.perfWeek, 0.4),
    toneFromSignedValue(input.perfMonth, 1),
    input.perfDayFx == null ? 'neutral' : toneFromSignedValue(input.perfDayFx, 0.08),
    input.perfWeekFx == null ? 'neutral' : toneFromSignedValue(input.perfWeekFx, 0.2),
  ];
  for (const tone of signals) {
    if (tone === 'bullish') bullish += 1;
    if (tone === 'bearish') bearish += 1;
  }

  if (input.rsi != null) {
    if (input.rsi >= 55) bullish += 1;
    else if (input.rsi <= 45) bearish += 1;
  }
  if (input.insiderCount > 0) bullish += 1;
  if (input.boardHits > 0) bullish += 1;

  if (!bullish && !bearish) return 'neutral';
  if (bullish >= 2 && !bearish) return 'bullish';
  if (bearish >= 2 && !bullish) return 'bearish';
  return 'mixed';
}

function technicalCard(fundamentals: Record<string, string>, forexRow: FinvizForexRow | null): FinvizResearchCard {
  const perfWeek = quoteField(fundamentals, 'Perf Week');
  const perfMonth = quoteField(fundamentals, 'Perf Month');
  const rsi = quoteField(fundamentals, 'RSI (14)');
  const atr = quoteField(fundamentals, 'ATR');

  if (perfWeek || perfMonth || rsi || atr) {
    return {
      key: 'technical',
      label: 'Technical Pulse',
      value: `RSI ${rsi ?? 'n/a'} | W ${perfWeek ?? 'n/a'} | M ${perfMonth ?? 'n/a'}`,
      tone: toneFromSignedValue(parsePercent(perfWeek)),
      detail: `Finviz quote metrics with ATR ${atr ?? 'n/a'} and moving-performance context for the active symbol or proxy.`,
    };
  }

  if (forexRow) {
    return {
      key: 'technical',
      label: 'Technical Pulse',
      value: `Day ${forexRow.perfDay != null ? `${forexRow.perfDay >= 0 ? '+' : ''}${forexRow.perfDay.toFixed(2)}%` : 'n/a'} | Week ${forexRow.perfWeek != null ? `${forexRow.perfWeek >= 0 ? '+' : ''}${forexRow.perfWeek.toFixed(2)}%` : 'n/a'}`,
      tone: toneFromSignedValue(forexRow.perfDay, 0.08),
      detail: 'Finviz forex-performance board is filling the technical lane because direct pair-level fundamentals are limited.',
    };
  }

  return {
    key: 'technical',
    label: 'Technical Pulse',
    value: 'limited',
    tone: 'neutral',
    detail: 'Finviz did not expose enough direct technical fields for this market on the current request.',
  };
}

function fundamentalCard(fundamentals: Record<string, string>, target: FinvizTarget): FinvizResearchCard {
  const marketCap = quoteField(fundamentals, 'Market Cap');
  const pe = quoteField(fundamentals, 'P/E', 'Forward P/E');
  const salesQq = quoteField(fundamentals, 'Sales Q/Q');
  const epsQq = quoteField(fundamentals, 'EPS Q/Q');
  const roe = quoteField(fundamentals, 'ROE');
  const tone = toneFromSignedValue(parsePercent(salesQq) ?? parsePercent(epsQq), 1);

  return {
    key: 'fundamental',
    label: 'Fundamental Frame',
    value: `${marketCap ?? 'n/a'} | P/E ${pe ?? 'n/a'} | ROE ${roe ?? 'n/a'}`,
    tone: target.proxyMode === 'forex-board' ? 'neutral' : tone,
    detail: target.proxyMode === 'forex-board'
      ? 'Direct pair fundamentals are not available from Finviz, so this lane stays lightweight for forex workflows.'
      : `Growth and balance-sheet context from Finviz fundamentals, including Sales Q/Q ${salesQq ?? 'n/a'} and EPS Q/Q ${epsQq ?? 'n/a'}.`,
  };
}

function insiderCard(insider: FinvizInsiderRow[], matchedTicker: string | null): FinvizResearchCard {
  const latest = insider[0];
  return {
    key: 'insider',
    label: 'Insider Tape',
    value: insider.length
      ? `${insider.length} recent buy${insider.length === 1 ? '' : 's'}`
      : 'no direct match',
    tone: insider.length ? 'alert' : 'neutral',
    detail: insider.length
      ? `${matchedTicker ?? latest?.ticker ?? 'Ticker'} insider activity is led by ${latest?.relationship ?? 'an insider'} at ${latest?.company ?? latest?.ticker ?? 'the company'}.`
      : 'No direct matched ticker appeared in the latest Finviz insider-buy tables; market-wide boards may still be useful.',
  };
}

function catalystCard(news: FinvizHeadline[], blogs: FinvizHeadline[], quoteNews: FinvizHeadline[]): FinvizResearchCard {
  const latest = quoteNews[0] ?? news[0] ?? blogs[0] ?? null;
  return {
    key: 'catalyst',
    label: 'News / Blogs',
    value: `${quoteNews.length} quote | ${news.length} news | ${blogs.length} blogs`,
    tone: latest ? 'alert' : 'neutral',
    detail: latest
      ? `Latest Finviz catalyst item: ${latest.title}`
      : 'Finviz did not return fresh news or blog rows for this request.',
  };
}

function screenerCard(screeners: FinvizResearchBoard[], matchedTicker: string | null): FinvizResearchCard {
  const hits = matchedTicker
    ? screeners.filter((board) => board.items.some((item) => item.ticker.toUpperCase() === matchedTicker.toUpperCase()))
    : [];
  const lead = screeners
    .map((board) => `${board.label} ${board.items[0]?.ticker ?? 'n/a'}`)
    .filter((value) => !value.endsWith('n/a'))
    .join(' | ');
  return {
    key: 'screener',
    label: 'Screener Flow',
    value: lead || 'no active boards',
    tone: hits.length ? 'bullish' : screeners.length ? 'mixed' : 'neutral',
    detail: hits.length
      ? `${matchedTicker} is showing up in ${hits.map((board) => board.label).join(', ')} on the current Finviz boards.`
      : 'Most Active, Unusual Volume, and Recent Insider Buying boards were loaded as broad market context.',
  };
}

function summaryFor(input: {
  label: string;
  proxyMode: FinvizTarget['proxyMode'];
  sentiment: FinvizResearchResponse['sentiment'];
  newsCount: number;
  blogCount: number;
  insiderCount: number;
  forexRow: FinvizForexRow | null;
}): string {
  const venue = input.proxyMode === 'direct'
    ? 'direct Finviz symbol context'
    : input.proxyMode === 'proxy'
      ? 'Finviz proxy context'
      : input.proxyMode === 'forex-board'
        ? 'Finviz forex-board context'
        : 'Finviz market-wide context';
  const catalystText = `${input.newsCount} news item${input.newsCount === 1 ? '' : 's'} and ${input.blogCount} blog item${input.blogCount === 1 ? '' : 's'}`;
  const insiderText = input.insiderCount
    ? `${input.insiderCount} recent insider buy${input.insiderCount === 1 ? '' : 's'}`
    : 'no matched insider tape';
  const fxText = input.forexRow
    ? `forex day move ${input.forexRow.perfDay != null ? `${input.forexRow.perfDay >= 0 ? '+' : ''}${input.forexRow.perfDay.toFixed(2)}%` : 'n/a'}`
    : 'no forex-board match';
  return `${input.label} is ${input.sentiment} on ${venue}, with ${catalystText}, ${insiderText}, and ${fxText}.`;
}

async function safeLoad<T>(
  label: string,
  warnings: string[],
  loader: () => Promise<T>,
): Promise<T | null> {
  try {
    return await loader();
  } catch (error) {
    warnings.push(`${label} unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
    return null;
  }
}

export async function getFinvizResearch(input: {
  market?: string;
  timeframe?: string;
  query?: string;
}): Promise<FinvizResearchResponse> {
  const target = resolveTarget(input.market ?? input.query);
  const requestedTimeframe = String(input.timeframe || '1h').toLowerCase();
  const key = cacheKey('market', `finviz-research:${target.market}:${requestedTimeframe}:${target.query}`);

  return getCachedOrCompute(key, async () => {
    const warnings: string[] = [];
    if (target.proxyLabel) warnings.push(target.proxyLabel);
    const quoteTicker = target.quoteTicker;

    const [
      newsAndBlogs,
      quote,
      latestInsider,
      ownerInsider,
      forexRows,
      mostActive,
      unusualVolume,
      recentInsiderBuying,
    ] = await Promise.all([
      safeLoad('Finviz news/blog feed', warnings, () => fetchFinvizNewsAndBlogs()),
      quoteTicker ? safeLoad(`Finviz quote snapshot ${quoteTicker}`, warnings, () => fetchFinvizQuoteSnapshot(quoteTicker)) : Promise.resolve(null),
      safeLoad('Finviz insider latest-buys board', warnings, () => fetchFinvizInsiderRows('latest-buys')),
      safeLoad('Finviz insider top-owner board', warnings, () => fetchFinvizInsiderRows('top-owner-buys')),
      target.forexPair ? safeLoad('Finviz forex-performance board', warnings, () => fetchFinvizForexPerformance()) : Promise.resolve(null),
      safeLoad('Finviz most-active screener', warnings, () => fetchFinvizScreener('Most Active')),
      safeLoad('Finviz unusual-volume screener', warnings, () => fetchFinvizScreener('Unusual Volume')),
      safeLoad('Finviz recent-insider-buying screener', warnings, () => fetchFinvizScreener('Recent Insider Buying')),
    ]);

    const fundamentals = quote?.fundamentals ?? {};
    const matchedTicker = target.quoteTicker ?? target.forexPair ?? null;
    const filteredLatestInsider = (latestInsider ?? []).filter((row) => matchedTicker && row.ticker.toUpperCase() === matchedTicker.toUpperCase());
    const filteredOwnerInsider = (ownerInsider ?? []).filter((row) => matchedTicker && row.ticker.toUpperCase() === matchedTicker.toUpperCase());
    const insider = (filteredLatestInsider.length ? filteredLatestInsider : filteredOwnerInsider.length ? filteredOwnerInsider : (latestInsider ?? []).slice(0, 4)).slice(0, 4);
    const forexRow = (forexRows ?? []).find((row) => row.pair.toUpperCase() === (target.forexPair ?? '').toUpperCase()) ?? null;
    const forex = forexRow ? [forexRow] : (forexRows ?? []).slice(0, 4);
    const screenerBoards: FinvizResearchBoard[] = [
      { key: 'most-active', label: 'Most Active', items: (mostActive ?? []).slice(0, 4) },
      { key: 'unusual-volume', label: 'Unusual Volume', items: (unusualVolume ?? []).slice(0, 4) },
      { key: 'recent-insider-buying', label: 'Recent Insider Buying', items: (recentInsiderBuying ?? []).slice(0, 4) },
    ];
    const screeners = screenerBoards.filter((board) => board.items.length);

    const perfWeek = parsePercent(quoteField(fundamentals, 'Perf Week'));
    const perfMonth = parsePercent(quoteField(fundamentals, 'Perf Month'));
    const rsi = parseNumber(quoteField(fundamentals, 'RSI (14)'));
    const boardHits = matchedTicker
      ? screeners.reduce((count, board) => count + Number(board.items.some((item) => item.ticker.toUpperCase() === matchedTicker.toUpperCase())), 0)
      : 0;

    const sentiment = sentimentFromInputs({
      perfWeek,
      perfMonth,
      rsi,
      perfDayFx: forexRow?.perfDay ?? null,
      perfWeekFx: forexRow?.perfWeek ?? null,
      insiderCount: filteredLatestInsider.length + filteredOwnerInsider.length,
      boardHits,
    });

    if (!quote && target.quoteTicker) {
      warnings.push(`Finviz quote snapshot for ${target.quoteTicker} was unavailable, so the sidecar is leaning on broad news, insider, or board context.`);
    }
    if (target.forexPair && !forexRow) {
      warnings.push(`Finviz forex-performance board did not return a direct row for ${target.forexPair} on this request.`);
    }
    if (!filteredLatestInsider.length && !filteredOwnerInsider.length && matchedTicker) {
      warnings.push(`No direct insider rows were matched to ${matchedTicker}; broader market insider tape is shown instead.`);
    }
    if (!screeners.length) {
      warnings.push('Finviz screener boards were unavailable on this request.');
    }

    const headlines = (newsAndBlogs?.news ?? []).slice(0, 4);
    const blogs = (newsAndBlogs?.blogs ?? []).slice(0, 3);
    const quoteNews = (quote?.news ?? []).slice(0, 4);
    const cards: FinvizResearchCard[] = [
      technicalCard(fundamentals, forexRow),
      fundamentalCard(fundamentals, target),
      insiderCard(insider, matchedTicker),
      catalystCard(headlines, blogs, quoteNews),
      screenerCard(screeners, matchedTicker),
    ];
    const confidence = confidenceFor({
      quoteReady: Boolean(quote),
      headlineCount: headlines.length + quoteNews.length,
      blogCount: blogs.length,
      insiderCount: insider.length,
      forexReady: Boolean(forexRow),
      screenerCount: screeners.length,
    });

    if (!quote && !headlines.length && !blogs.length && !insider.length && !forex.length && !screeners.length) {
      return {
        generatedAt: new Date().toISOString(),
        market: target.market,
        query: target.query,
        requestedTimeframe,
        matchedSymbolId: matchedTicker,
        matchedDescription: target.proxyLabel,
        company: null,
        exchange: null,
        proxyMode: target.proxyMode,
        proxyLabel: target.proxyLabel,
        sentiment: 'unavailable',
        confidence: 'low',
        summary: `Finviz did not return usable quote, board, or news context for ${target.market}.`,
        sourceLabel: 'Finviz is being used as a supplemental HTML-sidecar for catalysts, fundamentals, insider tape, forex board context, and equity screeners when restricted feeds fail.',
        warnings: [...new Set(warnings)],
        cards: [],
        headlines: [],
        blogs: [],
        quoteNews: [],
        insider: [],
        forex: [],
        screeners: [],
        fundamentals: {},
        unavailable: true,
      };
    }

    return {
      generatedAt: new Date().toISOString(),
      market: target.market,
      query: target.query,
      requestedTimeframe,
      matchedSymbolId: matchedTicker,
      matchedDescription: quote?.company ?? target.proxyLabel ?? matchedTicker,
      company: quote?.company ?? null,
      exchange: quote?.exchange ?? null,
      proxyMode: target.proxyMode,
      proxyLabel: target.proxyLabel,
      sentiment,
      confidence,
      summary: summaryFor({
        label: quote?.company ?? matchedTicker ?? target.market,
        proxyMode: target.proxyMode,
        sentiment,
        newsCount: headlines.length + quoteNews.length,
        blogCount: blogs.length,
        insiderCount: insider.length,
        forexRow,
      }),
      sourceLabel: 'Finviz is being used as a supplemental HTML-sidecar for catalysts, fundamentals, insider tape, forex board context, and equity screeners when restricted feeds fail.',
      warnings: [...new Set(warnings)],
      cards,
      headlines,
      blogs,
      quoteNews,
      insider,
      forex,
      screeners,
      fundamentals,
    };
  }, 300);
}
