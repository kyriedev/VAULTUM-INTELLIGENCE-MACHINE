import { invokeVaultumRpc } from '@/services/rpc';

export type AnalystOsResponse = {
  generatedAt: string;
  market: string;
  timeframe: string;
  focus: 'desk' | 'macro' | 'execution' | 'risk' | 'portfolio' | 'catalyst';
  mission: string;
  summary: string;
  decisionChain: Array<{
    key: 'regime' | 'phase' | 'setup' | 'execution' | 'risk' | 'review';
    label: string;
    state: string;
    confidence: 'low' | 'medium' | 'high';
    reason: string;
    action: string;
    sources: string[];
  }>;
  blindspots: string[];
  nextQueries: string[];
  operatorPlan: string[];
  steeringTracks: Array<{
    key: string;
    title: string;
    priority: 'now' | 'soon' | 'later';
    status: 'active' | 'building' | 'missing';
    summary: string;
  }>;
  trustSummary: string;
  dataSummary: string;
  trustScore: number;
  dataMoatScore: number;
};

export async function fetchAnalystOs(market: string, timeframe: string, question = ''): Promise<AnalystOsResponse | null> {
  return invokeVaultumRpc<AnalystOsResponse>('analyst', 'get-os', {
    market,
    timeframe,
    question,
  });
}

