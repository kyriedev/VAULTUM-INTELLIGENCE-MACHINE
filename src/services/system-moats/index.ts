import { invokeVaultumRpc } from '@/services/rpc';

export type DataMoatResponse = {
  generatedAt: string;
  market: string;
  timeframe: string;
  moatScore: number;
  status: 'strong' | 'building' | 'thin';
  summary: string;
  strengths: string[];
  blindspots: string[];
  lenses: Array<{
    key: string;
    label: string;
    score: number;
    status: 'strong' | 'building' | 'thin';
    sourceMode: 'direct' | 'mixed' | 'proxy';
    summary: string;
  }>;
  roadmap: Array<{
    key: string;
    title: string;
    priority: 'now' | 'soon' | 'later';
    status: 'active' | 'building' | 'missing';
    summary: string;
  }>;
};

export type TrustMoatResponse = {
  generatedAt: string;
  market: string;
  timeframe: string;
  trustScore: number;
  status: 'strong' | 'building' | 'fragile';
  summary: string;
  safeguards: string[];
  warnings: string[];
  sourceLedger: Array<{
    key: string;
    label: string;
    sourceType: 'direct' | 'mixed' | 'proxy';
    quality: string;
    detail: string;
  }>;
};

export type FeedHealthResponse = {
  generatedAt: string;
  market: string;
  timeframe: string;
  overallStatus: 'OK' | 'WARN' | 'STALE' | 'EMPTY';
  overallTrustHaircut: number;
  summary: string;
  feeds: Array<{
    key: string;
    label: string;
    generatedAt: string;
    lastUpdatedAt: string | null;
    ageMinutes: number | null;
    staleAfterMinutes: number;
    status: 'OK' | 'WARN' | 'STALE' | 'EMPTY';
    sourceMode: string;
    trustHaircut: number;
    activeMonitoring: boolean;
    fallbackState: 'primary' | 'fallback' | 'stale-fallback' | 'inactive';
    detail: string;
    notes: string[];
  }>;
};

export async function fetchDataMoat(market: string, timeframe: string): Promise<DataMoatResponse | null> {
  return invokeVaultumRpc<DataMoatResponse>('system', 'get-data-moat', {
    market,
    timeframe,
  });
}

export async function fetchTrustMoat(market: string, timeframe: string): Promise<TrustMoatResponse | null> {
  return invokeVaultumRpc<TrustMoatResponse>('system', 'get-trust-moat', {
    market,
    timeframe,
  });
}

export async function fetchFeedHealth(market: string, timeframe: string): Promise<FeedHealthResponse | null> {
  return invokeVaultumRpc<FeedHealthResponse>('system', 'get-feed-health', {
    market,
    timeframe,
  });
}
