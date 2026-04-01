type PredictionTheme = {
  market: string | null;
  label: string;
  queryText: string;
  terms: string[];
};

export type PredictionMarketBucket =
  | '1-20c'
  | '21-40c'
  | '41-60c'
  | '61-80c'
  | '81-99c';

export type PredictionVenue = 'Polymarket' | 'Kalshi';

export type PredictionMarketRow = {
  id: string;
  venue: PredictionVenue;
  marketId: string | null;
  outcomeId: string | null;
  title: string;
  probability: number;
  volume: number;
  liquidity: number | null;
  openInterest: number | null;
  spreadBps: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  midPrice: number | null;
  orderbookImbalance: number | null;
  liquidityGrade: 'deep' | 'tradable' | 'thin' | 'unavailable';
  executionBuy: ExecutionEstimate | null;
  executionSell: ExecutionEstimate | null;
  executionQualityScore: number | null;
  url: string;
  eventDate: string | null;
  status: string;
  category: string | null;
  bucket: PredictionMarketBucket;
  relevanceScore: number;
};

export type PredictionVenueBreakdown = {
  venue: PredictionVenue;
  marketCount: number;
  totalVolume: number;
  averageProbability: number;
  averageSpreadBps: number | null;
};

export type PredictionBucketBreakdown = {
  bucket: PredictionMarketBucket;
  marketCount: number;
  volumeShare: number;
};

const MARKET_THEME_MAP: Record<string, { label: string; terms: string[] }> = {
  XAUUSD: {
    label: 'gold / rates / dollar',
    terms: ['gold', 'xau', 'bullion', 'fed', 'inflation', 'cpi', 'rates', 'dollar'],
  },
  GBPUSD: {
    label: 'sterling / BOE / dollar',
    terms: ['gbpusd', 'gbp', 'pound', 'sterling', 'boe', 'uk inflation', 'uk rates', 'dollar'],
  },
  EURUSD: {
    label: 'euro / ECB / dollar',
    terms: ['eurusd', 'eur', 'euro', 'ecb', 'eurozone', 'inflation', 'dollar'],
  },
  USDJPY: {
    label: 'yen / BOJ / rates',
    terms: ['usdjpy', 'yen', 'jpy', 'boj', 'japan', 'rates', 'dollar'],
  },
  SPX: {
    label: 'S&P 500 / risk',
    terms: ['s&p', 'spx', 'sp500', 'stocks', 'equities', 'earnings', 'fed'],
  },
  NDX: {
    label: 'Nasdaq / tech risk',
    terms: ['nasdaq', 'ndx', 'qqq', 'tech stocks', 'ai', 'earnings', 'fed'],
  },
  BTCUSD: {
    label: 'bitcoin / crypto',
    terms: ['bitcoin', 'btc', 'crypto', 'etf', 'sec'],
  },
  WTI: {
    label: 'oil / energy / geopolitics',
    terms: ['oil', 'wti', 'crude', 'energy', 'opec', 'hormuz'],
  },
  DXY: {
    label: 'dollar / rates / macro',
    terms: ['dollar', 'dxy', 'usd index', 'fed', 'rates', 'treasury'],
  },
};

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'what',
  'will',
  'this',
  'that',
  'into',
  'from',
  'your',
  'market',
  'price',
  'today',
  'week',
  'year',
  'next',
  'current',
]);

const BUCKETS: Array<{ bucket: PredictionMarketBucket; min: number; max: number }> = [
  { bucket: '1-20c', min: 0.01, max: 0.2 },
  { bucket: '21-40c', min: 0.21, max: 0.4 },
  { bucket: '41-60c', min: 0.41, max: 0.6 },
  { bucket: '61-80c', min: 0.61, max: 0.8 },
  { bucket: '81-99c', min: 0.81, max: 0.99 },
];

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

export function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0.01, Math.min(0.99, value));
}

export function inferPredictionBucket(probability: number): PredictionMarketBucket {
  const clamped = clampProbability(probability);
  return BUCKETS.find((bucket) => clamped >= bucket.min && clamped <= bucket.max)?.bucket ?? '41-60c';
}

export function resolvePredictionTheme(input: {
  market?: string;
  query?: string;
  category?: string;
}): PredictionTheme {
  const market = String(input.market || '').trim().toUpperCase();
  const mapped = MARKET_THEME_MAP[market];
  const queryTokens = String(input.query || '')
    .toLowerCase()
    .split(/[^a-z0-9+/.-]+/i)
    .map(normalizeToken)
    .filter((token) => token && !STOPWORDS.has(token) && token.length >= 2);
  const categoryTokens = String(input.category || '')
    .toLowerCase()
    .split(/[^a-z0-9+/.-]+/i)
    .map(normalizeToken)
    .filter(Boolean);

  const terms = [...new Set([...(mapped?.terms ?? []), ...queryTokens, ...categoryTokens])];

  return {
    market: mapped ? market : market || null,
    label: mapped?.label ?? (terms.length ? terms.join(' / ') : 'macro / finance'),
    queryText: String(input.query || market || input.category || 'macro').trim(),
    terms: terms.length ? terms : ['fed', 'inflation', 'rates', 'stocks', 'gold'],
  };
}

export function predictionRelevanceScore(
  values: Array<string | null | undefined>,
  terms: string[],
): number {
  if (!terms.length) return 0;
  const haystack = values
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' ')
    .toLowerCase();

  if (!haystack) return 0;

  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (haystack.includes(term)) score += term.length >= 5 ? 1.4 : 1;
  }

  return Number((score / Math.max(terms.length, 1)).toFixed(3));
}

function weightedAverage(values: Array<{ value: number | null; weight: number }>): number | null {
  let numerator = 0;
  let denominator = 0;
  for (const item of values) {
    if (item.value == null || !Number.isFinite(item.value) || !Number.isFinite(item.weight) || item.weight <= 0) continue;
    numerator += item.value * item.weight;
    denominator += item.weight;
  }
  return denominator > 0 ? numerator / denominator : null;
}

export function buildPredictionAnalytics(markets: PredictionMarketRow[]): {
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
  venueBreakdown: PredictionVenueBreakdown[];
  bucketBreakdown: PredictionBucketBreakdown[];
  nearTermEventCount: number;
  summary: string;
  warnings: string[];
} {
  if (!markets.length) {
    return {
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
      bucketBreakdown: BUCKETS.map((bucket) => ({ bucket: bucket.bucket, marketCount: 0, volumeShare: 0 })),
      nearTermEventCount: 0,
      summary: 'Prediction-market layer is unavailable.',
      warnings: ['Prediction-market crowd-belief layer is unavailable.'],
    };
  }

  const weights = markets.map((market) => ({
    market,
    weight: Math.max(market.volume, market.liquidity ?? 0, market.openInterest ?? 0, 1),
  }));
  const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
  const weightedProbability = weightedAverage(weights.map((item) => ({
    value: item.market.probability,
    weight: item.weight,
  })));
  const convictionRaw = weightedAverage(weights.map((item) => ({
    value: Math.abs(item.market.probability - 0.5) * 2,
    weight: item.weight,
  }))) ?? 0;
  const uncertaintyRaw = weightedAverage(weights.map((item) => ({
    value: 1 - Math.abs(item.market.probability - 0.5) * 2,
    weight: item.weight,
  }))) ?? 0;

  const bucketBreakdown = BUCKETS.map(({ bucket }) => {
    const bucketMarkets = weights.filter((item) => item.market.bucket === bucket);
    const weight = bucketMarkets.reduce((sum, item) => sum + item.weight, 0);
    return {
      bucket,
      marketCount: bucketMarkets.length,
      volumeShare: totalWeight > 0 ? Number(((weight / totalWeight) * 100).toFixed(1)) : 0,
    } satisfies PredictionBucketBreakdown;
  });

  const longshotShare = bucketBreakdown
    .filter((bucket) => bucket.bucket === '1-20c' || bucket.bucket === '21-40c')
    .reduce((sum, bucket) => sum + bucket.volumeShare, 0);
  const favoriteShare = bucketBreakdown
    .filter((bucket) => bucket.bucket === '61-80c' || bucket.bucket === '81-99c')
    .reduce((sum, bucket) => sum + bucket.volumeShare, 0);
  const balancedShare = bucketBreakdown
    .filter((bucket) => bucket.bucket === '41-60c')
    .reduce((sum, bucket) => sum + bucket.volumeShare, 0);

  const spreadCostBps = weightedAverage(weights.map((item) => ({
    value: item.market.spreadBps,
    weight: item.weight,
  })));
  const executionCostBps = weightedAverage(weights.map((item) => ({
    value: (() => {
      const values = [item.market.executionBuy?.slippageBps, item.market.executionSell?.slippageBps]
        .filter((value): value is number => value != null);
      if (!values.length) return null;
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    })(),
    weight: item.weight,
  })));
  const fillQualityPct = Math.round(weightedAverage(weights.map((item) => ({
    value: item.market.executionQualityScore,
    weight: item.weight,
  }))) ?? 0);
  const imbalanceScore = weightedAverage(weights.map((item) => ({
    value: item.market.orderbookImbalance,
    weight: item.weight,
  })));

  const volumeConcentration = totalWeight > 0
    ? Number(weights.reduce((sum, item) => sum + Math.pow(item.weight / totalWeight, 2), 0) * 10000)
    : 0;

  const liquidityMix = weights.map((item) => item.market.liquidityGrade).filter(Boolean);
  const liquidityQuality =
    liquidityMix.length === 0 || liquidityMix.every((grade) => grade === 'unavailable')
      ? 'unavailable'
      : liquidityMix.every((grade) => grade === 'deep')
        ? 'deep'
        : liquidityMix.every((grade) => grade === 'thin')
          ? 'thin'
          : liquidityMix.some((grade) => grade === 'deep' || grade === 'tradable')
            ? 'tradable'
            : 'mixed';
  const orderbookBias =
    imbalanceScore == null
      ? 'unavailable'
      : imbalanceScore >= 12
        ? 'bid-heavy'
        : imbalanceScore <= -12
          ? 'ask-heavy'
          : 'balanced';

  const venueBreakdown = (['Polymarket', 'Kalshi'] as PredictionVenue[]).map((venue) => {
    const venueMarkets = weights.filter((item) => item.market.venue === venue);
    const venueWeight = venueMarkets.reduce((sum, item) => sum + item.weight, 0);
    return {
      venue,
      marketCount: venueMarkets.length,
      totalVolume: Number(venueMarkets.reduce((sum, item) => sum + item.market.volume, 0).toFixed(0)),
      averageProbability: Number((weightedAverage(venueMarkets.map((item) => ({
        value: item.market.probability,
        weight: item.weight,
      }))) ?? 0.5).toFixed(3)),
      averageSpreadBps: weightedAverage(venueMarkets.map((item) => ({
        value: item.market.spreadBps,
        weight: item.weight,
      }))),
    } satisfies PredictionVenueBreakdown;
  }).filter((venue) => venue.marketCount > 0);

  const now = Date.now();
  const nearTermEventCount = markets.filter((market) => {
    if (!market.eventDate) return false;
    const eventTime = Date.parse(market.eventDate);
    return Number.isFinite(eventTime) && eventTime >= now && eventTime <= now + (72 * 60 * 60 * 1000);
  }).length;

  const convictionScore = Math.round(convictionRaw * 100);
  const uncertaintyScore = Math.round(uncertaintyRaw * 100);
  const crowdBias = favoriteShare >= longshotShare + 15
    ? 'favorite-heavy'
    : longshotShare >= favoriteShare + 15
      ? 'longshot-heavy'
      : balancedShare >= 35
        ? 'balanced-two-sided'
        : 'mixed';

  const warnings = [
    spreadCostBps != null && spreadCostBps >= 900 ? `Prediction-market spread cost is elevated around ${spreadCostBps.toFixed(0)} bps.` : null,
    executionCostBps != null && executionCostBps >= 120 ? `Prediction-market execution slippage is elevated around ${executionCostBps.toFixed(0)} bps for the simulated crowd clip.` : null,
    fillQualityPct > 0 && fillQualityPct <= 45 ? `Prediction-market fill quality is thin at roughly ${fillQualityPct}% for the simulated clip.` : null,
    volumeConcentration >= 2400 ? 'Prediction-market volume is concentrated in a small number of contracts.' : null,
    nearTermEventCount >= 3 ? `${nearTermEventCount} prediction contracts are rolling into a near-term catalyst window.` : null,
  ].filter((value): value is string => Boolean(value));

  const summary = `Prediction crowd is ${crowdBias} with ${convictionScore} conviction, ${uncertaintyScore} surprise risk, ${longshotShare.toFixed(1)}% longshot share, ${favoriteShare.toFixed(1)}% favorite share, ${volumeConcentration.toFixed(0)} concentration, ${liquidityQuality} book quality, ${fillQualityPct}% fill quality, and ${orderbookBias} orderbook tone on the active venue mix.`;

  return {
    weightedProbability: weightedProbability != null ? Number(weightedProbability.toFixed(3)) : null,
    convictionScore,
    uncertaintyScore,
    longshotShare: Number(longshotShare.toFixed(1)),
    favoriteShare: Number(favoriteShare.toFixed(1)),
    balancedShare: Number(balancedShare.toFixed(1)),
    spreadCostBps: spreadCostBps != null ? Number(spreadCostBps.toFixed(0)) : null,
    executionCostBps: executionCostBps != null ? Number(executionCostBps.toFixed(0)) : null,
    fillQualityPct,
    liquidityQuality,
    orderbookBias,
    volumeConcentration: Number(volumeConcentration.toFixed(0)),
    crowdBias,
    venueBreakdown,
    bucketBreakdown,
    nearTermEventCount,
    summary,
    warnings,
  };
}
import type { ExecutionEstimate } from './_microstructure';
