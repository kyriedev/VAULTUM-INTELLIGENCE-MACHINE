import { cacheKey } from '../../../_shared/cache-keys';
import { CHROME_UA } from '../../../_shared/constants';
import { getCachedOrCompute } from '../../../_shared/redis';

type TradingViewIntervalKey = '15m' | '1h' | '4h' | '1d' | '1w';

type TradingViewHint = {
  query: string;
  filter?: 'stock' | 'futures' | 'forex' | 'cfd' | 'crypto' | 'index' | 'economic';
  preferredIds?: string[];
};

type TradingViewSearchApiSymbol = {
  symbol: string;
  exchange: string;
  description?: string;
  type?: string;
  prefix?: string;
};

type TradingViewScanResponse = {
  data?: Array<{
    s?: string;
    d?: Array<number | null>;
  }>;
};

export type TradingViewSearchMatch = {
  id: string;
  symbol: string;
  exchange: string;
  description: string;
  type: string;
};

export type TradingViewIntervalSummary = {
  timeframe: TradingViewIntervalKey;
  label: string;
  recommendation: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell' | 'unavailable';
  score: number | null;
  movingAverageRecommendation: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell' | 'unavailable';
  movingAverageScore: number | null;
  oscillatorRecommendation: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell' | 'unavailable';
  oscillatorScore: number | null;
};

export type TradingViewResearchResponse = {
  generatedAt: string;
  market: string;
  query: string;
  requestedTimeframe: string;
  selectedTimeframe: TradingViewIntervalKey;
  matchedSymbolId: string | null;
  matchedSymbol: string | null;
  matchedDescription: string | null;
  exchange: string | null;
  type: string | null;
  selectedRecommendation: TradingViewIntervalSummary['recommendation'];
  selectedScore: number | null;
  consensus: 'bullish' | 'bearish' | 'mixed' | 'neutral' | 'unavailable';
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  sourceLabel: string;
  warnings: string[];
  intervals: TradingViewIntervalSummary[];
  alternatives: TradingViewSearchMatch[];
  unavailable?: boolean;
};

const TRADINGVIEW_ORIGIN = 'https://www.tradingview.com';
const SEARCH_BASE = 'https://symbol-search.tradingview.com/symbol_search/v3';
const SCAN_BASE = 'https://scanner.tradingview.com/global/scan';

const INTERVAL_SPECS: Array<{ key: TradingViewIntervalKey; label: string; suffix: string | null }> = [
  { key: '15m', label: '15m', suffix: '15' },
  { key: '1h', label: '1h', suffix: '60' },
  { key: '4h', label: '4h', suffix: '240' },
  { key: '1d', label: '1d', suffix: null },
  { key: '1w', label: '1w', suffix: '1W' },
];

const MARKET_HINTS: Record<string, TradingViewHint> = {
  XAUUSD: {
    query: 'XAUUSD',
    filter: 'forex',
    preferredIds: ['OANDA:XAUUSD', 'FX:XAUUSD', 'TVC:GOLD'],
  },
  EURUSD: {
    query: 'EURUSD',
    filter: 'forex',
    preferredIds: ['FX:EURUSD', 'OANDA:EURUSD'],
  },
  GBPUSD: {
    query: 'GBPUSD',
    filter: 'forex',
    preferredIds: ['FX:GBPUSD', 'OANDA:GBPUSD'],
  },
  USDJPY: {
    query: 'USDJPY',
    filter: 'forex',
    preferredIds: ['FX:USDJPY', 'OANDA:USDJPY'],
  },
  DXY: {
    query: 'UUP',
    filter: 'stock',
    preferredIds: ['AMEX:UUP'],
  },
  SPX: {
    query: 'SPY',
    filter: 'stock',
    preferredIds: ['AMEX:SPY'],
  },
  NDX: {
    query: 'QQQ',
    filter: 'stock',
    preferredIds: ['NASDAQ:QQQ'],
  },
  VIX: {
    query: 'VIXY',
    filter: 'stock',
    preferredIds: ['AMEX:VIXY'],
  },
  US30: {
    query: 'US30',
    filter: 'cfd',
    preferredIds: ['BLACKBULL:US30', 'OANDA:US30USD', 'AMEX:DIA'],
  },
  WTI: {
    query: 'CL1!',
    filter: 'futures',
    preferredIds: ['NYMEX:CL1!', 'TVC:USOIL'],
  },
  BTCUSD: {
    query: 'BTCUSD',
    filter: 'crypto',
    preferredIds: ['BINANCE:BTCUSDT', 'COINBASE:BTCUSD'],
  },
};

function resolveMarket(input?: string): string {
  const normalized = String(input || 'XAUUSD').trim().toUpperCase();
  if (MARKET_HINTS[normalized]) return normalized;
  if (normalized === 'GC=F') return 'XAUUSD';
  if (normalized === 'CL=F') return 'WTI';
  if (normalized === 'SPY') return 'SPX';
  if (normalized === 'QQQ') return 'NDX';
  if (normalized === 'UUP') return 'DXY';
  if (normalized === 'VIXY') return 'VIX';
  if (normalized === '^GSPC') return 'SPX';
  if (normalized === '^IXIC') return 'NDX';
  if (
    normalized === '^DJI'
    || normalized === 'DJI'
    || normalized === 'DIA'
    || normalized === 'YM=F'
    || normalized === 'BLACKBULL:US30'
    || normalized === 'US30USD'
  ) return 'US30';
  return normalized || 'XAUUSD';
}

function resolveHint(market: string, query?: string): TradingViewHint {
  if (query && query.trim()) {
    const raw = query.trim().toUpperCase();
    if (raw.includes(':')) return { query: raw, preferredIds: [raw] };
    return {
      query: query.trim(),
      preferredIds: MARKET_HINTS[market]?.preferredIds ?? [],
      filter: MARKET_HINTS[market]?.filter,
    };
  }
  return MARKET_HINTS[market] ?? { query: market, preferredIds: [] };
}

function timeframeKey(timeframe?: string): TradingViewIntervalKey {
  const normalized = String(timeframe || '1h').trim().toLowerCase();
  if (normalized === '15m') return '15m';
  if (normalized === '30m') return '1h';
  if (normalized === '1h' || normalized === '60m') return '1h';
  if (normalized === '4h') return '4h';
  if (normalized === '1d' || normalized === 'd') return '1d';
  if (normalized === '1w' || normalized === 'w') return '1w';
  return '1h';
}

function recommendationFromScore(score: number | null | undefined): TradingViewIntervalSummary['recommendation'] {
  if (score == null || Number.isNaN(score)) return 'unavailable';
  if (score >= 0.5) return 'strong-buy';
  if (score >= 0.1) return 'buy';
  if (score <= -0.5) return 'strong-sell';
  if (score <= -0.1) return 'sell';
  return 'neutral';
}

function biasFromRecommendation(value: TradingViewIntervalSummary['recommendation']): 'bullish' | 'bearish' | 'neutral' {
  if (value === 'buy' || value === 'strong-buy') return 'bullish';
  if (value === 'sell' || value === 'strong-sell') return 'bearish';
  return 'neutral';
}

function confidenceFromRecommendation(
  selected: TradingViewIntervalSummary['recommendation'],
  consensus: TradingViewResearchResponse['consensus'],
): 'low' | 'medium' | 'high' {
  if (selected === 'strong-buy' || selected === 'strong-sell') return consensus === 'mixed' ? 'medium' : 'high';
  if (selected === 'buy' || selected === 'sell') return consensus === 'mixed' ? 'low' : 'medium';
  return consensus === 'unavailable' ? 'low' : 'medium';
}

function buildSearchId(item: TradingViewSearchApiSymbol): string {
  const exchange = item.exchange.split(' ')[0]?.toUpperCase() || '';
  return item.prefix ? `${item.prefix}:${item.symbol}` : `${exchange}:${item.symbol}`;
}

function normalizeSearchItem(item: TradingViewSearchApiSymbol): TradingViewSearchMatch {
  return {
    id: buildSearchId(item),
    symbol: item.symbol,
    exchange: item.exchange,
    description: item.description ?? item.symbol,
    type: item.type ?? 'unknown',
  };
}

function matchSymbol(results: TradingViewSearchMatch[], market: string, preferredIds: string[]): TradingViewSearchMatch | null {
  const preferred = preferredIds
    .map((id) => id.toUpperCase())
    .map((id) => results.find((result) => result.id.toUpperCase() === id))
    .find((item): item is TradingViewSearchMatch => Boolean(item));
  if (preferred) return preferred;

  const exactSymbol = results.find((result) => result.symbol.toUpperCase() === market);
  if (exactSymbol) return exactSymbol;

  return results[0] ?? null;
}

async function searchTradingViewSymbols(hint: TradingViewHint, limit = 6): Promise<TradingViewSearchMatch[]> {
  try {
    const url = new URL(SEARCH_BASE);
    const raw = hint.query.trim();
    const parts = raw.toUpperCase().split(':');
    if (parts.length === 2) url.searchParams.set('exchange', parts[0]);
    url.searchParams.set('text', parts.length === 2 ? parts[1] : raw);
    url.searchParams.set('hl', '1');
    url.searchParams.set('lang', 'en');
    url.searchParams.set('domain', 'production');
    url.searchParams.set('start', '0');
    if (hint.filter) url.searchParams.set('search_type', hint.filter);

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        Origin: TRADINGVIEW_ORIGIN,
        Referer: TRADINGVIEW_ORIGIN,
        'User-Agent': CHROME_UA,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return [];
    const payload = await response.json() as { symbols?: TradingViewSearchApiSymbol[] };
    return (payload.symbols ?? []).slice(0, limit).map(normalizeSearchItem);
  } catch {
    return [];
  }
}

async function scanTradingViewTechnical(symbolId: string): Promise<TradingViewIntervalSummary[]> {
  const columns = INTERVAL_SPECS.flatMap((interval) => {
    const suffix = interval.suffix ? `|${interval.suffix}` : '';
    return [`Recommend.All${suffix}`, `Recommend.MA${suffix}`, `Recommend.Other${suffix}`];
  });

  try {
    const response = await fetch(SCAN_BASE, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: TRADINGVIEW_ORIGIN,
        Referer: TRADINGVIEW_ORIGIN,
        'User-Agent': CHROME_UA,
      },
      body: JSON.stringify({
        symbols: { tickers: [symbolId] },
        columns,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return [];
    const payload = await response.json() as TradingViewScanResponse;
    const row = payload.data?.[0]?.d ?? [];
    if (!row.length) return [];

    return INTERVAL_SPECS.map((interval, index) => {
      const base = index * 3;
      const score = typeof row[base] === 'number' ? row[base] : null;
      const maScore = typeof row[base + 1] === 'number' ? row[base + 1] : null;
      const oscScore = typeof row[base + 2] === 'number' ? row[base + 2] : null;

      return {
        timeframe: interval.key,
        label: interval.label,
        recommendation: recommendationFromScore(score),
        score,
        movingAverageRecommendation: recommendationFromScore(maScore),
        movingAverageScore: maScore,
        oscillatorRecommendation: recommendationFromScore(oscScore),
        oscillatorScore: oscScore,
      };
    });
  } catch {
    return [];
  }
}

function summarizeConsensus(intervals: TradingViewIntervalSummary[]): TradingViewResearchResponse['consensus'] {
  if (!intervals.length) return 'unavailable';
  const bullish = intervals.filter((interval) => biasFromRecommendation(interval.recommendation) === 'bullish').length;
  const bearish = intervals.filter((interval) => biasFromRecommendation(interval.recommendation) === 'bearish').length;

  if (!bullish && !bearish) return 'neutral';
  if (bullish >= 3 && bearish <= 1) return 'bullish';
  if (bearish >= 3 && bullish <= 1) return 'bearish';
  return 'mixed';
}

function buildSummary(
  selected: TradingViewIntervalSummary | null,
  consensus: TradingViewResearchResponse['consensus'],
  match: TradingViewSearchMatch | null,
): string {
  if (!selected || !match) {
    return 'TradingView research sidecar is unavailable for the requested market.';
  }
  return `${match.id} is ${selected.recommendation} on ${selected.label} with ${consensus} cross-timeframe alignment.`;
}

export async function getTradingViewResearch(input: {
  market?: string;
  timeframe?: string;
  query?: string;
}): Promise<TradingViewResearchResponse> {
  const market = resolveMarket(input.market);
  const requestedTimeframe = String(input.timeframe || '1h').toLowerCase();
  const selectedTimeframe = timeframeKey(requestedTimeframe);
  const hint = resolveHint(market, input.query);
  const key = cacheKey('market', `tradingview-research:${market}:${requestedTimeframe}:${hint.query.toUpperCase()}`);

  return getCachedOrCompute(key, async () => {
    const warnings: string[] = [];
    if (requestedTimeframe === '30m') {
      warnings.push('TradingView scanner sidecar does not expose a native 30m recommendation, so 1h is used instead.');
    }

    const alternatives = await searchTradingViewSymbols(hint);
    const match = matchSymbol(alternatives, market, hint.preferredIds ?? []);
    const fallbackMatch = !match && hint.preferredIds?.[0]
      ? {
          id: hint.preferredIds[0],
          symbol: hint.preferredIds[0].split(':').pop() ?? hint.preferredIds[0],
          exchange: hint.preferredIds[0].split(':')[0] ?? 'UNKNOWN',
          description: hint.query,
          type: hint.filter ?? 'unknown',
        } satisfies TradingViewSearchMatch
      : null;
    const activeMatch = match ?? fallbackMatch;

    if (!activeMatch) {
      return {
        generatedAt: new Date().toISOString(),
        market,
        query: hint.query,
        requestedTimeframe,
        selectedTimeframe,
        matchedSymbolId: null,
        matchedSymbol: null,
        matchedDescription: null,
        exchange: null,
        type: null,
        selectedRecommendation: 'unavailable',
        selectedScore: null,
        consensus: 'unavailable',
        confidence: 'low',
        summary: 'TradingView symbol discovery did not return a usable match for this market.',
        sourceLabel: 'TradingView is being used only as a supplemental symbol-discovery and scanner-research sidecar, not as Vaultum quote truth.',
        warnings: [...warnings, 'No TradingView symbol match was found for the requested market.'],
        intervals: [],
        alternatives,
        unavailable: true,
      };
    }

    const intervals = await scanTradingViewTechnical(activeMatch.id);
    const selected = intervals.find((interval) => interval.timeframe === selectedTimeframe) ?? null;
    const consensus = summarizeConsensus(intervals);

    if (!selected || !intervals.length) {
      return {
        generatedAt: new Date().toISOString(),
        market,
        query: hint.query,
        requestedTimeframe,
        selectedTimeframe,
        matchedSymbolId: activeMatch.id,
        matchedSymbol: activeMatch.symbol,
        matchedDescription: activeMatch.description,
        exchange: activeMatch.exchange,
        type: activeMatch.type,
        selectedRecommendation: 'unavailable',
        selectedScore: null,
        consensus: 'unavailable',
        confidence: 'low',
        summary: `TradingView scanner did not return a usable technical matrix for ${activeMatch.id}.`,
        sourceLabel: 'TradingView is being used only as a supplemental symbol-discovery and scanner-research sidecar, not as Vaultum quote truth.',
        warnings: [...warnings, 'TradingView scanner matrix is unavailable for the selected symbol right now.'],
        intervals,
        alternatives,
        unavailable: true,
      };
    }

    return {
      generatedAt: new Date().toISOString(),
      market,
      query: hint.query,
      requestedTimeframe,
      selectedTimeframe,
      matchedSymbolId: activeMatch.id,
      matchedSymbol: activeMatch.symbol,
      matchedDescription: activeMatch.description,
      exchange: activeMatch.exchange,
      type: activeMatch.type,
      selectedRecommendation: selected.recommendation,
      selectedScore: selected.score,
      consensus,
      confidence: confidenceFromRecommendation(selected.recommendation, consensus),
      summary: buildSummary(selected, consensus, activeMatch),
      sourceLabel: 'TradingView scanner is a supplemental technical-consensus and symbol-search sidecar only. Vaultum quote truth still comes from its own backend feed stack.',
      warnings,
      intervals,
      alternatives,
    };
  }, 240);
}
