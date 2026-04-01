import { invokeVaultumRpc } from '@/services/rpc';

export type TwelveDataResearchCard = {
  key: string;
  label: string;
  value: string;
  tone: 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'alert';
  detail: string;
};

export type TwelveDataResearchResponse = {
  generatedAt: string;
  market: string;
  query: string;
  requestedTimeframe: string;
  selectedInterval: string;
  matchedSymbolId: string | null;
  matchedSymbol: string | null;
  matchedDescription: string | null;
  exchange: string | null;
  type: string | null;
  country: string | null;
  currency: string | null;
  price: number | null;
  percentChange: number | null;
  marketStateLabel: string | null;
  marketOpen: boolean | null;
  selectedRecommendation: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell' | 'unavailable';
  consensus: 'bullish' | 'bearish' | 'mixed' | 'neutral' | 'unavailable';
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  sourceLabel: string;
  warnings: string[];
  cards: TwelveDataResearchCard[];
  indicators: {
    rsi: number | null;
    macd: number | null;
    macdSignal: number | null;
    macdHist: number | null;
    adx: number | null;
    plusDi: number | null;
    minusDi: number | null;
    ema20: number | null;
    ema50: number | null;
    ema200: number | null;
    sma200: number | null;
    atr: number | null;
    bbUpper: number | null;
    bbMiddle: number | null;
    bbLower: number | null;
    vwap: number | null;
  };
  unavailable?: boolean;
};

export async function fetchTwelveDataResearch(market: string, timeframe: string): Promise<TwelveDataResearchResponse | null> {
  return invokeVaultumRpc<TwelveDataResearchResponse>('market', 'get-twelve-data-research', { market, timeframe });
}
