import { CHROME_UA } from '../../../_shared/constants.ts';
import { RELAY_CONFIG, resolveRequestedAsset, resolveTradingViewHint } from './_config.ts';
import { fetchJsonWithRetry } from './_http.ts';
import type {
  RelayProviderStatus,
  TradingViewUnofficialSnapshot,
} from './_types.ts';

type TradingViewSearchApiSymbol = {
  symbol: string;
  exchange: string;
  description?: string;
  prefix?: string;
};

type TradingViewScanResponse = {
  data?: Array<{
    s?: string;
    d?: Array<number | null>;
  }>;
};

const TRADINGVIEW_ORIGIN = 'https://www.tradingview.com';
const SEARCH_URL = 'https://symbol-search.tradingview.com/symbol_search/v3';
const SCAN_URL = 'https://scanner.tradingview.com/global/scan';

function stripMarkup(value: string): string {
  return String(value || '').replace(/<[^>]+>/g, '');
}

function buildId(item: TradingViewSearchApiSymbol): string {
  const symbol = stripMarkup(item.symbol).toUpperCase();
  const exchange = stripMarkup(item.prefix || item.exchange).split(' ')[0]?.toUpperCase() || 'UNKNOWN';
  return `${exchange}:${symbol}`;
}

function providerStatus(state: RelayProviderStatus['state'], detail: string, source: string | null): RelayProviderStatus {
  return {
    provider: 'tradingview-unofficial',
    state,
    detail,
    updatedAt: new Date().toISOString(),
    source,
  };
}

function scoreToRecommendation(score: number | null): TradingViewUnofficialSnapshot['recommendation'] {
  if (score == null || Number.isNaN(score)) return 'unavailable';
  if (score >= 0.5) return 'strong-buy';
  if (score >= 0.1) return 'buy';
  if (score <= -0.5) return 'strong-sell';
  if (score <= -0.1) return 'sell';
  return 'neutral';
}

async function searchTradingView(
  query: string,
  filter: string,
  preferredIds: string[],
): Promise<Array<{ id: string; description: string }>> {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('text', query);
  url.searchParams.set('hl', '1');
  url.searchParams.set('lang', 'en');
  url.searchParams.set('domain', 'production');
  url.searchParams.set('start', '0');
  if (filter) url.searchParams.set('search_type', filter);

  const response = await fetchJsonWithRetry<{ symbols?: TradingViewSearchApiSymbol[] }>(url.toString(), {
    headers: {
      Accept: 'application/json',
      Origin: TRADINGVIEW_ORIGIN,
      Referer: TRADINGVIEW_ORIGIN,
      'User-Agent': CHROME_UA,
    },
    timeoutMs: 8_000,
    retries: 1,
  });

  const rows = (response.data.symbols ?? []).map((item) => ({
    id: buildId(item),
    description: stripMarkup(item.description || item.symbol),
  }));

  const unique = new Map<string, { id: string; description: string }>();
  [...preferredIds.map((id) => ({ id, description: id.split(':')[1] || id })), ...rows].forEach((item) => {
    if (!unique.has(item.id.toUpperCase())) unique.set(item.id.toUpperCase(), item);
  });
  return [...unique.values()];
}

async function fetchTradingViewScore(symbolId: string): Promise<number | null> {
  const response = await fetchJsonWithRetry<TradingViewScanResponse>(SCAN_URL, {
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
      columns: ['Recommend.All|60'],
    }),
    timeoutMs: 8_000,
    retries: 1,
  });

  const score = response.data.data?.[0]?.d?.[0];
  return typeof score === 'number' ? score : null;
}

export async function getTradingViewUnofficialSnapshot(asset?: string): Promise<TradingViewUnofficialSnapshot | null> {
  if (!RELAY_CONFIG.tradingViewUnofficialEnabled) {
    return {
      requestedAsset: resolveRequestedAsset(asset),
      matchedSymbolId: null,
      recommendation: 'unavailable',
      score: null,
      summary: 'Unofficial TradingView sidecar is disabled in relay configuration.',
      source: 'searchMarketV3 + global scan',
      warnings: ['Unofficial TradingView relay sidecar is disabled.'],
      provider: providerStatus('disabled', 'Unofficial TradingView sidecar disabled by configuration.', 'searchMarketV3 + global scan'),
    };
  }

  const requestedAsset = resolveRequestedAsset(asset);
  const hint = resolveTradingViewHint(requestedAsset);
  const warnings: string[] = [];

  try {
    const matches = await searchTradingView(hint.query, hint.filter, hint.preferredIds);
    let matchedSymbolId: string | null = null;
    let matchedDescription = requestedAsset;
    let score: number | null = null;

    for (const match of matches) {
      const candidateScore = await fetchTradingViewScore(match.id);
      if (matchedSymbolId == null) {
        matchedSymbolId = match.id;
        matchedDescription = match.description;
        score = candidateScore;
      }
      if (candidateScore != null) {
        matchedSymbolId = match.id;
        matchedDescription = match.description;
        score = candidateScore;
        break;
      }
    }

    if (matchedSymbolId == null) {
      return {
        requestedAsset,
        matchedSymbolId: null,
        recommendation: 'unavailable',
        score: null,
        summary: 'TradingView symbol discovery did not return a usable match.',
        source: 'searchMarketV3 + global scan',
        warnings: ['TradingView unofficial symbol discovery returned no usable candidates.'],
        provider: providerStatus('error', 'TradingView symbol discovery returned no usable match.', 'searchMarketV3 + global scan'),
      };
    }

    if (score == null) warnings.push(`TradingView scanner score is currently unavailable for ${matchedSymbolId}.`);

    return {
      requestedAsset,
      matchedSymbolId,
      recommendation: scoreToRecommendation(score),
      score,
      summary: score == null
        ? `${matchedSymbolId} was matched, but TradingView scanner did not return a usable recommendation.`
        : `${matchedSymbolId} is reading ${scoreToRecommendation(score)} on the unofficial TradingView technical sidecar.`,
      source: 'searchMarketV3 + global scan',
      warnings,
      provider: providerStatus(score == null ? 'error' : 'live', score == null ? `Matched ${matchedDescription} but scanner score was unavailable.` : `Matched ${matchedDescription} with a usable scanner score.`, 'searchMarketV3 + global scan'),
    };
  } catch (error) {
    return {
      requestedAsset,
      matchedSymbolId: null,
      recommendation: 'unavailable',
      score: null,
      summary: 'Unofficial TradingView relay sidecar failed on this request.',
      source: 'searchMarketV3 + global scan',
      warnings: [error instanceof Error ? error.message : 'Unknown TradingView unofficial relay error'],
      provider: providerStatus('error', error instanceof Error ? error.message : 'Unknown TradingView unofficial relay error', 'searchMarketV3 + global scan'),
    };
  }
}
