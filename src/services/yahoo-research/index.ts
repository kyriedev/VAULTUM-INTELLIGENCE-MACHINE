import { invokeVaultumRpc } from '@/services/rpc';

export type YahooResearchCard = {
  key: string;
  label: string;
  value: string;
  tone: 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'alert';
  detail: string;
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
  related: Array<{
    symbol: string;
    name: string;
    exchange: string | null;
    quoteType: string | null;
    score: number | null;
  }>;
  headlines: Array<{
    uuid: string;
    title: string;
    publisher: string | null;
    link: string | null;
    publishedAt: string | null;
    type: string | null;
  }>;
  boards: Array<{
    key: 'most_actives' | 'day_gainers' | 'day_losers';
    label: string;
    items: Array<{
      symbol: string;
      name: string;
      exchange: string | null;
      price: number | null;
      percentChange: number | null;
      volume: number | null;
    }>;
  }>;
  unavailable?: boolean;
};

export async function fetchYahooResearch(market: string, timeframe: string): Promise<YahooResearchResponse | null> {
  return invokeVaultumRpc<YahooResearchResponse>('market', 'get-yahoo-research', { market, timeframe });
}
