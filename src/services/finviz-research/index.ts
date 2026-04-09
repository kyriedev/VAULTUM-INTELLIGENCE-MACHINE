import { invokeVaultumRpc } from '@/services/rpc';

export type FinvizResearchCard = {
  key: string;
  label: string;
  value: string;
  tone: 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'alert';
  detail: string;
};

export type FinvizResearchResponse = {
  generatedAt: string;
  market: string;
  query: string;
  requestedTimeframe: string;
  matchedSymbolId: string | null;
  matchedDescription: string | null;
  company: string | null;
  exchange: string | null;
  proxyMode: 'direct' | 'proxy' | 'forex-board' | 'global';
  proxyLabel: string | null;
  sentiment: 'bullish' | 'bearish' | 'mixed' | 'neutral' | 'unavailable';
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  sourceLabel: string;
  warnings: string[];
  cards: FinvizResearchCard[];
  headlines: Array<{
    date: string;
    title: string;
    source: string;
    link: string;
  }>;
  blogs: Array<{
    date: string;
    title: string;
    source: string;
    link: string;
  }>;
  quoteNews: Array<{
    date: string;
    title: string;
    source: string;
    link: string;
  }>;
  insider: Array<{
    ticker: string;
    company: string;
    relationship: string;
    date: string;
    transaction: string;
    cost: string;
    shares: string;
    value: string;
    sharesTotal: string;
    secForm4Url: string | null;
  }>;
  forex: Array<{
    pair: string;
    price: number | null;
    perf5Min: number | null;
    perfHour: number | null;
    perfDay: number | null;
    perfWeek: number | null;
    perfMonth: number | null;
    perfQuarter: number | null;
    perfHalf: number | null;
    perfYtd: number | null;
    perfYear: number | null;
  }>;
  screeners: Array<{
    key: 'most-active' | 'unusual-volume' | 'recent-insider-buying';
    label: string;
    items: Array<{
      ticker: string;
      company: string;
      sector: string;
      industry: string;
      country: string;
      marketCap: string;
      pe: string;
      price: number | null;
      change: number | null;
      volume: number | null;
    }>;
  }>;
  fundamentals: Record<string, string>;
  unavailable?: boolean;
};

export async function fetchFinvizResearch(market: string, timeframe: string): Promise<FinvizResearchResponse | null> {
  return invokeVaultumRpc<FinvizResearchResponse>('market', 'get-finviz-research', { market, timeframe });
}
