import { invokeVaultumRpc } from '@/services/rpc';

export type InstitutionalMonitorResponse = {
  generatedAt: string;
  market: string;
  timeframe: string;
  summary: string;
  sourceLabel: string;
  items: Array<{
    key: 'rates' | 'dollar' | 'options' | 'cot' | 'liquidity' | 'policy' | 'stress';
    label: string;
    state: string;
    confidenceScore: number;
    confidence: 'low' | 'medium' | 'high';
    status: 'confirmed' | 'derived' | 'estimated';
    summary: string;
    sources: string[];
  }>;
  alerts: string[];
};

export async function fetchInstitutionalMonitor(market: string, timeframe: string): Promise<InstitutionalMonitorResponse | null> {
  return invokeVaultumRpc<InstitutionalMonitorResponse>('monitor', 'get-institutional-monitor', {
    market,
    timeframe,
  });
}
