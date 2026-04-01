import { invokeVaultumRpc } from '@/services/rpc';

export type TradingViewResearchInterval = {
  timeframe: '15m' | '1h' | '4h' | '1d' | '1w';
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
  selectedTimeframe: '15m' | '1h' | '4h' | '1d' | '1w';
  matchedSymbolId: string | null;
  matchedSymbol: string | null;
  matchedDescription: string | null;
  exchange: string | null;
  type: string | null;
  selectedRecommendation: TradingViewResearchInterval['recommendation'];
  selectedScore: number | null;
  consensus: 'bullish' | 'bearish' | 'mixed' | 'neutral' | 'unavailable';
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  sourceLabel: string;
  warnings: string[];
  intervals: TradingViewResearchInterval[];
  alternatives: Array<{
    id: string;
    symbol: string;
    exchange: string;
    description: string;
    type: string;
  }>;
  unavailable?: boolean;
};

export async function fetchTradingViewResearch(market: string, timeframe: string): Promise<TradingViewResearchResponse | null> {
  return invokeVaultumRpc<TradingViewResearchResponse>('market', 'get-tradingview-research', { market, timeframe });
}
