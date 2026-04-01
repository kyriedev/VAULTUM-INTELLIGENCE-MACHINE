import type { PanelSnapshot } from '@/types';

type PredictionMarketRow = {
  venue: 'Polymarket' | 'Kalshi';
  title: string;
  probability: number;
  volume: number;
  spreadBps: number | null;
  liquidityGrade?: 'deep' | 'tradable' | 'thin' | 'unavailable';
  orderbookImbalance?: number | null;
  executionBuy?: { simulatedContracts: number; price: number | null; filledAmount: number; fullyFilled: boolean; slippageBps: number | null } | null;
  executionSell?: { simulatedContracts: number; price: number | null; filledAmount: number; fullyFilled: boolean; slippageBps: number | null } | null;
  url: string;
  eventDate: string | null;
};

type PredictionVenueRow = {
  venue: 'Polymarket' | 'Kalshi';
  marketCount: number;
  totalVolume: number;
  averageProbability: number;
  averageSpreadBps: number | null;
};

type PredictionBucketRow = {
  bucket: '1-20c' | '21-40c' | '41-60c' | '61-80c' | '81-99c';
  marketCount: number;
  volumeShare: number;
};

export type PredictionSnapshot = {
  generatedAt?: string;
  market?: string | null;
  theme?: string;
  query?: string;
  markets?: PredictionMarketRow[];
  weightedProbability?: number | null;
  convictionScore?: number;
  uncertaintyScore?: number;
  longshotShare?: number;
  favoriteShare?: number;
  balancedShare?: number;
  spreadCostBps?: number | null;
  executionCostBps?: number | null;
  fillQualityPct?: number;
  liquidityQuality?: 'deep' | 'tradable' | 'thin' | 'mixed' | 'unavailable';
  orderbookBias?: 'bid-heavy' | 'ask-heavy' | 'balanced' | 'unavailable';
  volumeConcentration?: number;
  crowdBias?: string;
  venueBreakdown?: PredictionVenueRow[];
  priceBuckets?: PredictionBucketRow[];
  nearTermEventCount?: number;
  summary?: string;
  warnings?: string[];
  unavailable?: boolean;
} | null;

export function buildPredictionPanels(input: {
  prediction?: PredictionSnapshot;
}): Record<string, PanelSnapshot> {
  const prediction = input.prediction;
  const markets = prediction?.markets ?? [];
  const venueSummary = prediction?.venueBreakdown?.map((venue) => {
    const spread = venue.averageSpreadBps != null ? `${venue.averageSpreadBps.toFixed(0)}bps` : 'n/a';
    return `${venue.venue} ${venue.marketCount} mkts / vol ${venue.totalVolume.toFixed(0)} / spread ${spread}`;
  }) ?? [];
  const bucketSummary = prediction?.priceBuckets
    ?.filter((bucket) => bucket.volumeShare > 0)
    .map((bucket) => `${bucket.bucket} ${bucket.volumeShare.toFixed(1)}%`)
    ?? [];

  const topMarket = markets[0];
  const topSpread = prediction?.spreadCostBps != null ? `${prediction.spreadCostBps.toFixed(0)}bps` : 'n/a';
  const executionCost = prediction?.executionCostBps != null ? `${prediction.executionCostBps.toFixed(0)}bps` : 'n/a';

  return {
    prediction: {
      conclusion: prediction?.summary
        ?? (topMarket
          ? `Prediction crowd is focused on ${topMarket.title} at ${(topMarket.probability * 100).toFixed(1)}% with ${prediction?.crowdBias ?? 'mixed'} structure.`
          : 'Prediction-market context unavailable or blocked; treat crowd-belief layer as missing.'),
      metrics: [
        { label: 'Crowd Bias', value: prediction?.crowdBias ?? 'n/a', tone: prediction?.crowdBias?.includes('favorite') ? 'bullish' : prediction?.crowdBias?.includes('longshot') ? 'alert' : 'neutral' },
        { label: 'Conviction', value: prediction?.convictionScore != null ? `${prediction.convictionScore}` : 'n/a', tone: (prediction?.convictionScore ?? 0) >= 65 ? 'bullish' : (prediction?.convictionScore ?? 0) <= 40 ? 'alert' : 'neutral' },
        { label: 'Surprise', value: prediction?.uncertaintyScore != null ? `${prediction.uncertaintyScore}` : 'n/a', tone: (prediction?.uncertaintyScore ?? 0) >= 60 ? 'alert' : 'neutral' },
        { label: 'Longshots', value: prediction?.longshotShare != null ? `${prediction.longshotShare.toFixed(1)}%` : 'n/a', tone: (prediction?.longshotShare ?? 0) >= 40 ? 'alert' : 'neutral' },
        { label: 'Favorites', value: prediction?.favoriteShare != null ? `${prediction.favoriteShare.toFixed(1)}%` : 'n/a', tone: (prediction?.favoriteShare ?? 0) >= 40 ? 'bullish' : 'neutral' },
        { label: 'Spread', value: topSpread, tone: (prediction?.spreadCostBps ?? 0) >= 900 ? 'alert' : 'neutral' },
        { label: 'Execution', value: executionCost, tone: (prediction?.executionCostBps ?? 0) >= 120 ? 'alert' : 'neutral' },
        { label: 'Fill Quality', value: prediction?.fillQualityPct != null ? `${prediction.fillQualityPct}%` : 'n/a', tone: (prediction?.fillQualityPct ?? 0) >= 70 ? 'bullish' : (prediction?.fillQualityPct ?? 0) > 0 && (prediction?.fillQualityPct ?? 0) <= 45 ? 'alert' : 'neutral' },
        { label: 'Book Tone', value: prediction?.orderbookBias ?? 'n/a', tone: prediction?.orderbookBias === 'bid-heavy' ? 'bullish' : prediction?.orderbookBias === 'ask-heavy' ? 'alert' : 'neutral' },
      ],
      bullets: [
        prediction?.theme ? `Theme: ${prediction.theme}.` : null,
        topMarket ? `Top contract: ${topMarket.venue} ${topMarket.title} ${(topMarket.probability * 100).toFixed(1)}% vol ${topMarket.volume.toFixed(0)}.` : null,
        topMarket?.liquidityGrade ? `Top contract book is ${topMarket.liquidityGrade} with ${topMarket.executionBuy?.fullyFilled ? 'full' : 'partial'} ${topMarket.executionBuy?.simulatedContracts ?? 100}-lot buy simulation.` : null,
        venueSummary.length ? `Venues: ${venueSummary.join(' | ')}.` : null,
        bucketSummary.length ? `Probability buckets: ${bucketSummary.join(' | ')}.` : null,
        prediction?.liquidityQuality ? `Crowd book quality reads ${prediction.liquidityQuality} with ${prediction?.orderbookBias ?? 'balanced'} tone.` : null,
        prediction?.nearTermEventCount ? `${prediction.nearTermEventCount} relevant event contracts roll into the next 72h.` : null,
      ].filter((value): value is string => Boolean(value)),
      table: {
        columns: ['Venue', 'Market', 'Probability', 'Volume', 'Spread', 'Exec'],
        rows: markets.slice(0, 5).map((market) => [
          market.venue,
          market.title,
          `${(market.probability * 100).toFixed(1)}%`,
          market.volume.toFixed(0),
          market.spreadBps != null ? `${market.spreadBps.toFixed(0)}bps` : 'n/a',
          market.executionBuy?.slippageBps != null ? `${market.executionBuy.slippageBps.toFixed(0)}bps` : market.liquidityGrade ?? 'n/a',
        ]),
      },
      alerts: [
        ...(prediction?.warnings ?? []),
        ...(prediction?.unavailable ? ['Prediction-market crowd-belief layer is unavailable; do not infer consensus from absence of data.'] : []),
      ],
      status: markets.length ? 'mixed' : 'stale',
    },
  };
}
