import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import {
  fetchYahooQuoteSnapshot,
  fetchYahooScreener,
  searchYahooFinance,
  type YahooNewsMatch,
  type YahooScreenerMatch,
  type YahooSearchMatch,
} from '../../_shared/yahoo';

type YahooResearchTone = 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'alert';

type YahooResearchCard = {
  key: string;
  label: string;
  value: string;
  tone: YahooResearchTone;
  detail: string;
};

type YahooResearchBoard = {
  key: 'most_actives' | 'day_gainers' | 'day_losers';
  label: string;
  items: YahooScreenerMatch[];
};

export type YahooResearchResponse = {
  generatedAt: string;
  market: string;
  query: string;
  requestedTimeframe: string;
  matchedSymbolId: string | null;
  matchedSymbol: string | null;
  matchedDescription: string | null;
  exchange: string | null;
  type: string | null;
  price: number | null;
  percentChange: number | null;
  sentiment: 'bullish' | 'bearish' | 'mixed' | 'neutral' | 'unavailable';
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  sourceLabel: string;
  warnings: string[];
  cards: YahooResearchCard[];
  related: YahooSearchMatch[];
  headlines: YahooNewsMatch[];
  boards: YahooResearchBoard[];
  unavailable?: boolean;
};

function resolveMarket(input?: string): string {
  const normalized = String(input || 'XAUUSD').trim().toUpperCase();
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
  return aliases[normalized] ?? normalized;
}

function queryForMarket(market: string, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  const queries: Record<string, string> = {
    XAUUSD: 'GC=F',
    WTI: 'CL=F',
    EURUSD: 'EURUSD=X',
    GBPUSD: 'GBPUSD=X',
    USDJPY: 'USDJPY=X',
    GBPJPY: 'GBPJPY=X',
    EURJPY: 'EURJPY=X',
    DXY: 'DX-Y.NYB',
    SPX: 'SPY',
    NDX: 'QQQ',
    VIX: '^VIX',
    US30: 'DIA',
    BTCUSD: 'BTC-USD',
  };
  return queries[market] ?? market;
}

function preferredSymbols(market: string): string[] {
  const symbols: Record<string, string[]> = {
    XAUUSD: ['GC=F', 'XAUUSD=X'],
    WTI: ['CL=F'],
    EURUSD: ['EURUSD=X'],
    GBPUSD: ['GBPUSD=X'],
    USDJPY: ['USDJPY=X'],
    GBPJPY: ['GBPJPY=X'],
    EURJPY: ['EURJPY=X'],
    DXY: ['DX-Y.NYB'],
    SPX: ['SPY', '^GSPC'],
    NDX: ['QQQ', '^IXIC'],
    VIX: ['^VIX'],
    US30: ['DIA', '^DJI'],
    BTCUSD: ['BTC-USD'],
  };
  return symbols[market] ?? [market];
}

function pickMatch(quotes: YahooSearchMatch[], market: string): YahooSearchMatch | null {
  const preferred = preferredSymbols(market);
  return preferred
    .map((symbol) => quotes.find((item) => item.symbol.toUpperCase() === symbol.toUpperCase()))
    .find((item): item is YahooSearchMatch => Boolean(item))
    ?? quotes[0]
    ?? null;
}

function toneFromChange(percentChange: number | null): YahooResearchTone {
  if (percentChange == null || Number.isNaN(percentChange)) return 'neutral';
  if (percentChange >= 1) return 'bullish';
  if (percentChange <= -1) return 'bearish';
  return 'neutral';
}

function confidenceFor(match: YahooSearchMatch | null, quoteReady: boolean, headlineCount: number, boardCount: number): 'low' | 'medium' | 'high' {
  if (match && quoteReady && headlineCount >= 2 && boardCount >= 1) return 'high';
  if (match && (quoteReady || headlineCount >= 1)) return 'medium';
  return 'low';
}

function shouldLoadBoards(market: string, match: YahooSearchMatch | null): boolean {
  if (market === 'SPX' || market === 'NDX' || market === 'US30') return true;
  const type = String(match?.quoteType || '').toUpperCase();
  return type.includes('EQUITY') || type.includes('ETF');
}

function summaryFor(
  label: string,
  percentChange: number | null,
  headlines: YahooNewsMatch[],
  boards: YahooResearchBoard[],
): string {
  const changeText = percentChange == null
    ? 'with price change unavailable'
    : `with a ${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}% move`;
  const headlineText = headlines.length
    ? `${headlines.length} fresh Yahoo catalyst head${headlines.length === 1 ? 'line' : 'lines'}`
    : 'no fresh Yahoo catalyst headlines';
  const boardText = boards.length
    ? `${boards.length} stock-board read${boards.length === 1 ? '' : 's'}`
    : 'symbol-map context only';
  return `${label} ${changeText}, ${headlineText}, and ${boardText}.`;
}

function fmt(value: number | null | undefined, digits = 2, suffix = ''): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return `${value.toFixed(digits)}${suffix}`;
}

export async function getYahooResearch(input: {
  market?: string;
  timeframe?: string;
  query?: string;
}): Promise<YahooResearchResponse> {
  const market = resolveMarket(input.market);
  const requestedTimeframe = String(input.timeframe || '1h').toLowerCase();
  const query = queryForMarket(market, input.query);
  const key = cacheKey('market', `yahoo-research:${market}:${requestedTimeframe}:${query.toUpperCase()}`);

  return getCachedOrCompute(key, async () => {
    const { quotes, news } = await searchYahooFinance(query, { maxResults: 8, newsCount: 5 });
    const match = pickMatch(quotes, market);
    const matchedSymbol = match?.symbol ?? preferredSymbols(market)[0] ?? null;
    const quote = matchedSymbol ? await fetchYahooQuoteSnapshot(matchedSymbol) : null;
    const boards = shouldLoadBoards(market, match)
      ? (await Promise.all([
          fetchYahooScreener('most_actives', 5),
          fetchYahooScreener('day_gainers', 5),
        ])).map((items, index) => ({
          key: index === 0 ? 'most_actives' as const : 'day_gainers' as const,
          label: index === 0 ? 'Most Actives' : 'Day Gainers',
          items,
        })).filter((board) => board.items.length)
      : [];

    if (!match && !quote && !news.length && !boards.length) {
      return {
        generatedAt: new Date().toISOString(),
        market,
        query,
        requestedTimeframe,
        matchedSymbolId: null,
        matchedSymbol: null,
        matchedDescription: null,
        exchange: null,
        type: null,
        price: null,
        percentChange: null,
        sentiment: 'unavailable',
        confidence: 'low',
        summary: `Yahoo research did not return usable symbol, quote, or headline context for ${market}.`,
        sourceLabel: 'Yahoo Finance sidecar adds symbol discovery, catalyst headlines, repaired chart/quote context, and selective stock-board reads. It is supplemental, not Vaultum quote truth.',
        warnings: ['Yahoo symbol discovery returned no usable match for the requested market.'],
        cards: [],
        related: [],
        headlines: [],
        boards: [],
        unavailable: true,
      };
    }

    const warnings: string[] = [];
    if (!match) warnings.push('Yahoo search returned no exact symbol match; the sidecar is running on fallback symbol context.');
    if (!quote) warnings.push('Yahoo quote snapshot was unavailable; catalyst and search context may still be usable.');
    if (quote?.repairedRows) warnings.push(`Yahoo quote repair normalized ${quote.repairedRows} suspicious row${quote.repairedRows === 1 ? '' : 's'} before building the sidecar view.`);
    warnings.push(...(quote?.warnings ?? []).slice(0, 2));
    if (!news.length) warnings.push('Yahoo search returned no fresh headlines for the current query.');
    if (boards.length && !boards.some((board) => board.items.some((item) => item.symbol.toUpperCase() === matchedSymbol?.toUpperCase()))) {
      warnings.push('The matched symbol is not currently showing up in the loaded Yahoo stock boards.');
    }

    const sentiment = !quote
      ? 'neutral'
      : quote.change >= 1
        ? 'bullish'
        : quote.change <= -1
          ? 'bearish'
          : boards.length
            ? 'mixed'
            : 'neutral';
    const confidence = confidenceFor(match, Boolean(quote), news.length, boards.length);
    const cards: YahooResearchCard[] = [
      {
        key: 'quote',
        label: 'Quote Pulse',
        value: `${fmt(quote?.price)} | ${quote?.change == null ? 'n/a' : `${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)}%`}`,
        tone: toneFromChange(quote?.change ?? null),
        detail: `Yahoo repaired-quote sidecar for ${matchedSymbol ?? 'unmatched symbol'} using the latest normalized chart snapshot.`,
      },
      {
        key: 'symbol',
        label: 'Symbol Map',
        value: `${match?.symbol ?? matchedSymbol ?? 'n/a'} | ${match?.exchange ?? 'n/a'} | ${match?.quoteType ?? 'n/a'}`,
        tone: 'neutral',
        detail: `Yahoo search query "${query}" was mapped to ${match?.name ?? matchedSymbol ?? 'an unavailable symbol record'}.`,
      },
      {
        key: 'catalyst',
        label: 'Catalyst Pulse',
        value: `${news.length} headline${news.length === 1 ? '' : 's'}`,
        tone: news.length >= 3 ? 'alert' : news.length ? 'mixed' : 'neutral',
        detail: news[0]?.title
          ? `Latest Yahoo headline: ${news[0].title}`
          : 'No fresh Yahoo catalyst headlines were returned for the current query.',
      },
      {
        key: 'board',
        label: 'Stock Board',
        value: boards.length
          ? boards.map((board) => `${board.label} ${board.items[0]?.symbol ?? 'n/a'}`).join(' | ')
          : 'not in use',
        tone: boards.length ? 'mixed' : 'neutral',
        detail: boards.length
          ? 'Yahoo predefined boards add a fast active/gainer read for stock and ETF workflow.'
          : 'Yahoo predefined stock boards are only loaded when the current workflow is equity/ETF relevant.',
      },
    ];

    return {
      generatedAt: new Date().toISOString(),
      market,
      query,
      requestedTimeframe,
      matchedSymbolId: matchedSymbol,
      matchedSymbol,
      matchedDescription: match?.name ?? matchedSymbol ?? null,
      exchange: match?.exchange ?? null,
      type: match?.quoteType ?? null,
      price: quote?.price ?? null,
      percentChange: quote?.change ?? null,
      sentiment,
      confidence,
      summary: summaryFor(match?.name ?? matchedSymbol ?? market, quote?.change ?? null, news, boards),
      sourceLabel: 'Yahoo Finance sidecar adds symbol discovery, catalyst headlines, repaired chart/quote context, and selective stock-board reads. It is supplemental, not Vaultum quote truth.',
      warnings: [...new Set(warnings)].filter(Boolean),
      cards,
      related: quotes.filter((item) => item.symbol !== matchedSymbol).slice(0, 5),
      headlines: news.slice(0, 4),
      boards,
    };
  }, 300);
}
