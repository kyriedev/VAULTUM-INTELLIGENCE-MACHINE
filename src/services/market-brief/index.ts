import { invokeVaultumRpc } from '@/services/rpc';

export type MarketBriefWatchItem = {
  symbol: string;
  display: string;
  price: number | null;
  change: number | null;
  stance: 'bullish' | 'neutral' | 'defensive';
  note: string;
};

export type MarketBriefResponse = {
  generatedAt: string;
  market: string;
  timeframe: string;
  stance: string;
  confidence: string;
  sourceLabel: string;
  summary: string;
  actionPlan: string;
  riskWatch: string;
  watchlist: MarketBriefWatchItem[];
  confirmationChecklist: string[];
  metrics: {
    sentiment: number | null;
    sentimentLabel: string;
    macro: string;
    pressure: string;
    orderflow: string;
    targetHitProbability: number | null;
    invalidationProbability: number | null;
  };
};

export async function fetchMarketBrief(market: string, timeframe: string): Promise<MarketBriefResponse | null> {
  return invokeVaultumRpc<MarketBriefResponse>('intelligence', 'get-market-brief', { market, timeframe });
}
