import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { CHROME_UA } from '../../../_shared/constants';
import { fetchJson } from '../../../_shared/fetch-json';
import {
  buildPredictionAnalytics,
  clampProbability,
  inferPredictionBucket,
  predictionRelevanceScore,
  resolvePredictionTheme,
  type PredictionMarketRow,
} from './_shared';
import {
  analyzePredictionMicrostructure,
  normalizeKalshiYesOrderBook,
  normalizePolymarketOrderBook,
} from './_microstructure';

const POLYMARKET_BASE = 'https://gamma-api.polymarket.com';
const POLYMARKET_CLOB_BASE = 'https://clob.polymarket.com';
const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
const SIMULATED_PREDICTION_SIZE = 100;

type ListPredictionMarketsInput = {
  market?: string;
  category?: string;
  query?: string;
  mode?: 'markets' | 'events';
  limit?: number;
};

type PolymarketRecord = Record<string, any>;
type KalshiRecord = Record<string, any>;

function safeJsonParseArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function asNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function marketWeight(row: PredictionMarketRow): number {
  return Math.max(row.volume, row.liquidity ?? 0, row.openInterest ?? 0, 1);
}

function computeKalshiSpreadBps(yesBid: number | null, yesAsk: number | null): number | null {
  if (yesBid == null || yesAsk == null) return null;
  const bid = yesBid / 100;
  const ask = yesAsk / 100;
  const mid = (bid + ask) / 2;
  if (!Number.isFinite(mid) || mid <= 0 || ask < bid) return null;
  return ((ask - bid) / mid) * 10000;
}

function normalizePolymarketRecord(
  item: PolymarketRecord,
  terms: string[],
): PredictionMarketRow | null {
  const title = String(item.question || item.title || '').trim();
  if (!title) return null;

  const outcomes = safeJsonParseArray(item.outcomes);
  const outcomePrices = safeJsonParseArray(item.outcomePrices);
  const clobTokenIds = safeJsonParseArray(item.clobTokenIds).map((value) => String(value).trim()).filter(Boolean);
  const probability = clampProbability(asNumber(outcomePrices[0]) ?? 0.5);
  const slug = String(item.slug || '').trim();
  const category = String(item.category || item.tag_slug || '').trim() || null;
  const relevanceScore = predictionRelevanceScore(
    [title, slug, category, outcomes.join(' ')],
    terms,
  );

  return {
    id: `polymarket:${String(item.id || slug || title).trim()}`,
    venue: 'Polymarket',
    marketId: String(item.id || '').trim() || null,
    outcomeId: clobTokenIds[0] ?? null,
    title,
    probability,
    volume: Number(asNumber(item.volumeNum) ?? asNumber(item.volume) ?? 0),
    liquidity: asNumber(item.liquidity),
    openInterest: null,
    spreadBps: null,
    bestBid: null,
    bestAsk: null,
    midPrice: null,
    orderbookImbalance: null,
    liquidityGrade: 'unavailable',
    executionBuy: null,
    executionSell: null,
    executionQualityScore: null,
    url: slug ? `https://polymarket.com/event/${slug}` : 'https://polymarket.com',
    eventDate: String(item.endDate || item.end_date || '').trim() || null,
    status: item.closed ? 'closed' : item.active ? 'open' : 'inactive',
    category,
    bucket: inferPredictionBucket(probability),
    relevanceScore,
  };
}

function normalizeKalshiRecord(
  item: KalshiRecord,
  terms: string[],
): PredictionMarketRow | null {
  const title = String(item.title || item.subtitle || item.ticker || '').trim();
  if (!title) return null;

  const yesBid = asNumber(item.yes_bid);
  const yesAsk = asNumber(item.yes_ask);
  const lastPrice = asNumber(item.last_price);
  const midpoint = yesBid != null && yesAsk != null ? (yesBid + yesAsk) / 2 / 100 : null;
  const probability = clampProbability(midpoint ?? (lastPrice != null ? lastPrice / 100 : 0.5));
  const category = String(item.event_ticker || '').trim() || null;
  const relevanceScore = predictionRelevanceScore(
    [title, category, item.ticker, item.yes_sub_title, item.no_sub_title],
    terms,
  );

  return {
    id: `kalshi:${String(item.ticker || title).trim()}`,
    venue: 'Kalshi',
    marketId: String(item.ticker || '').trim() || null,
    outcomeId: String(item.ticker || '').trim() || null,
    title,
    probability,
    volume: Number(asNumber(item.volume_24h) ?? asNumber(item.volume) ?? 0),
    liquidity: null,
    openInterest: asNumber(item.open_interest),
    spreadBps: computeKalshiSpreadBps(yesBid, yesAsk),
    bestBid: yesBid != null ? yesBid / 100 : null,
    bestAsk: yesAsk != null ? yesAsk / 100 : null,
    midPrice: midpoint,
    orderbookImbalance: null,
    liquidityGrade: 'unavailable',
    executionBuy: null,
    executionSell: null,
    executionQualityScore: null,
    url: item.ticker ? `https://kalshi.com/markets/${String(item.ticker).toLowerCase()}` : 'https://kalshi.com',
    eventDate: String(item.close_time || item.expiration_time || '').trim() || null,
    status: String(item.status || 'open'),
    category,
    bucket: inferPredictionBucket(probability),
    relevanceScore,
  };
}

async function fetchPolymarketMarkets(
  input: ListPredictionMarketsInput,
  fetchLimit: number,
  terms: string[],
): Promise<PredictionMarketRow[]> {
  const params = new URLSearchParams({
    closed: 'false',
    active: 'true',
    archived: 'false',
    order: 'volume',
    ascending: 'false',
    end_date_min: new Date().toISOString(),
    limit: String(fetchLimit),
  });
  if (input.category) params.set('tag_slug', input.category);

  const resp = await fetch(`${POLYMARKET_BASE}/markets?${params}`, {
    headers: { Accept: 'application/json', 'User-Agent': CHROME_UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) return [];

  const data = await resp.json() as PolymarketRecord[] | { markets?: PolymarketRecord[] };
  const records = Array.isArray(data) ? data : (data?.markets ?? []);

  return records
    .map((item) => normalizePolymarketRecord(item, terms))
    .filter((item): item is PredictionMarketRow => Boolean(item));
}

async function fetchKalshiMarkets(
  fetchLimit: number,
  terms: string[],
): Promise<PredictionMarketRow[]> {
  const params = new URLSearchParams({
    limit: String(fetchLimit),
    status: 'open',
  });

  const resp = await fetch(`${KALSHI_BASE}/markets?${params}`, {
    headers: { Accept: 'application/json', 'User-Agent': CHROME_UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) return [];

  const data = await resp.json() as { markets?: KalshiRecord[] };
  return (data?.markets ?? [])
    .map((item) => normalizeKalshiRecord(item, terms))
    .filter((item): item is PredictionMarketRow => Boolean(item));
}

async function enrichPredictionMicrostructure(markets: PredictionMarketRow[], depth = 8): Promise<PredictionMarketRow[]> {
  const targets = markets.slice(0, Math.min(depth, markets.length));
  const enriched = await Promise.all(targets.map(async (market) => {
    try {
      if (market.venue === 'Polymarket' && market.outcomeId) {
        const raw = await fetchJson<any>(
          `${POLYMARKET_CLOB_BASE}/book?token_id=${encodeURIComponent(market.outcomeId)}`,
          { timeoutMs: 8_000, headers: { Accept: 'application/json', 'User-Agent': CHROME_UA } },
        );
        if (!raw) return market;
        const micro = analyzePredictionMicrostructure(normalizePolymarketOrderBook(raw), SIMULATED_PREDICTION_SIZE);
        return { ...market, ...micro };
      }

      if (market.venue === 'Kalshi' && market.marketId) {
        const raw = await fetchJson<any>(
          `${KALSHI_BASE}/markets/${encodeURIComponent(market.marketId)}/orderbook`,
          { timeoutMs: 8_000, headers: { Accept: 'application/json', 'User-Agent': CHROME_UA } },
        );
        if (!raw) return market;
        const micro = analyzePredictionMicrostructure(normalizeKalshiYesOrderBook(raw), SIMULATED_PREDICTION_SIZE);
        return { ...market, ...micro };
      }
    } catch {
      return market;
    }

    return market;
  }));

  const patchMap = new Map(enriched.map((market) => [market.id, market]));
  return markets.map((market) => patchMap.get(market.id) ?? market);
}

export async function listPredictionMarkets(input: ListPredictionMarketsInput): Promise<{
  generatedAt: string;
  market: string | null;
  theme: string;
  query: string;
  markets: PredictionMarketRow[];
  weightedProbability: number | null;
  convictionScore: number;
  uncertaintyScore: number;
  longshotShare: number;
  favoriteShare: number;
  balancedShare: number;
  spreadCostBps: number | null;
  executionCostBps: number | null;
  fillQualityPct: number;
  liquidityQuality: 'deep' | 'tradable' | 'thin' | 'mixed' | 'unavailable';
  orderbookBias: 'bid-heavy' | 'ask-heavy' | 'balanced' | 'unavailable';
  volumeConcentration: number;
  crowdBias: string;
  venueBreakdown: Array<{
    venue: 'Polymarket' | 'Kalshi';
    marketCount: number;
    totalVolume: number;
    averageProbability: number;
    averageSpreadBps: number | null;
  }>;
  priceBuckets: Array<{
    bucket: '1-20c' | '21-40c' | '41-60c' | '61-80c' | '81-99c';
    marketCount: number;
    volumeShare: number;
  }>;
  nearTermEventCount: number;
  summary: string;
  warnings: string[];
  unavailable?: boolean;
}> {
  const limit = Math.min(Math.max(Number(input.limit ?? 12), 5), 24);
  const theme = resolvePredictionTheme(input);
  const key = cacheKey(
    'prediction',
    `${input.mode ?? 'markets'}:${theme.market ?? 'none'}:${input.category ?? 'all'}:${theme.queryText}:${limit}`,
  );

  return getCachedOrCompute(key, async () => {
    try {
      const fetchLimit = Math.max(limit * 3, 40);
      const [polymarket, kalshi] = await Promise.all([
        fetchPolymarketMarkets(input, fetchLimit, theme.terms),
        fetchKalshiMarkets(fetchLimit, theme.terms),
      ]);

      const ranked = [...polymarket, ...kalshi]
        .filter((market) => market.relevanceScore > 0 || theme.terms.length === 0)
        .sort((left, right) => {
          const leftScore = (left.relevanceScore * 1000) + marketWeight(left);
          const rightScore = (right.relevanceScore * 1000) + marketWeight(right);
          return rightScore - leftScore;
        });

      const markets = await enrichPredictionMicrostructure(ranked.slice(0, limit));
      const analytics = buildPredictionAnalytics(markets);

      return {
        generatedAt: new Date().toISOString(),
        market: theme.market,
        theme: theme.label,
        query: theme.queryText,
        markets,
        weightedProbability: analytics.weightedProbability,
        convictionScore: analytics.convictionScore,
        uncertaintyScore: analytics.uncertaintyScore,
        longshotShare: analytics.longshotShare,
        favoriteShare: analytics.favoriteShare,
        balancedShare: analytics.balancedShare,
        spreadCostBps: analytics.spreadCostBps,
        executionCostBps: analytics.executionCostBps,
        fillQualityPct: analytics.fillQualityPct,
        liquidityQuality: analytics.liquidityQuality,
        orderbookBias: analytics.orderbookBias,
        volumeConcentration: analytics.volumeConcentration,
        crowdBias: analytics.crowdBias,
        venueBreakdown: analytics.venueBreakdown,
        priceBuckets: analytics.bucketBreakdown,
        nearTermEventCount: analytics.nearTermEventCount,
        summary: analytics.summary,
        warnings: analytics.warnings,
        unavailable: !markets.length,
      };
    } catch {
      return {
        generatedAt: new Date().toISOString(),
        market: theme.market,
        theme: theme.label,
        query: theme.queryText,
        markets: [],
        weightedProbability: null,
        convictionScore: 0,
        uncertaintyScore: 0,
        longshotShare: 0,
        favoriteShare: 0,
        balancedShare: 0,
        spreadCostBps: null,
        executionCostBps: null,
        fillQualityPct: 0,
        liquidityQuality: 'unavailable',
        orderbookBias: 'unavailable',
        volumeConcentration: 0,
        crowdBias: 'unavailable',
        venueBreakdown: [],
        priceBuckets: [],
        nearTermEventCount: 0,
        summary: 'Prediction-market crowd-belief layer is unavailable.',
        warnings: ['Prediction-market crowd-belief layer is unavailable; do not infer consensus from absence of data.'],
        unavailable: true,
      };
    }
  }, 600);
}
