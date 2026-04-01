import { invokeVaultumRpc } from '@/services/rpc';

export type FinnhubResearchCard = {
  key: string;
  label: string;
  value: string;
  tone: 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'alert';
  detail: string;
};

export type FinnhubResearchResponse = {
  generatedAt: string;
  market: string;
  query: string;
  requestedTimeframe: string;
  selectedResolution: string;
  matchedSymbolId: string | null;
  matchedSymbol: string | null;
  matchedDescription: string | null;
  matchedType: string | null;
  matchedMic: string | null;
  proxyMode: 'direct' | 'proxy';
  proxyLabel: string | null;
  price: number | null;
  percentChange: number | null;
  marketOpen: boolean | null;
  sessionLabel: string | null;
  technicalSignal: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell' | 'unavailable';
  technicalBias: 'bullish' | 'bearish' | 'mixed' | 'neutral' | 'unavailable';
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  sourceLabel: string;
  warnings: string[];
  cards: FinnhubResearchCard[];
  headlines: Array<{
    id: string;
    title: string;
    source: string | null;
    summary: string | null;
    url: string | null;
    publishedAt: string | null;
    category: string | null;
  }>;
  technical: {
    overallSignal: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell' | 'unavailable';
    movingAverageSignal: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell' | 'unavailable';
    oscillatorSignal: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell' | 'unavailable';
    bullishCount: number | null;
    neutralCount: number | null;
    bearishCount: number | null;
  };
  levels: {
    support: number | null;
    resistance: number | null;
  };
  pattern: {
    name: string | null;
    bias: 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'unavailable';
  };
  sentiment: {
    bullishPercent: number | null;
    bearishPercent: number | null;
    companyNewsScore: number | null;
    sectorAverageBullishPercent: number | null;
    buzz: number | null;
    weeklyAverage: number | null;
    articlesInLastWeek: number | null;
  };
  upcomingEvent: {
    date: string;
    label: string;
    hour: string | null;
    epsEstimate: number | null;
    revenueEstimate: number | null;
  } | null;
  holidayNote: string | null;
  unavailable?: boolean;
};

export async function fetchFinnhubResearch(market: string, timeframe: string): Promise<FinnhubResearchResponse | null> {
  return invokeVaultumRpc<FinnhubResearchResponse>('market', 'get-finnhub-research', { market, timeframe });
}
