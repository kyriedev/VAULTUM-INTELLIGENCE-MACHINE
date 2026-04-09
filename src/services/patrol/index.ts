import type { EntryMapResponse } from '@/services/entry-map';
import { invokeVaultumRpc } from '@/services/rpc';

export type SetupPatrolResponse = {
  generatedAt: string;
  market: string;
  timeframe: string;
  patrolState: 'armed' | 'monitoring' | 'standby';
  summary: string;
  chartAutomation: {
    canScanLive: boolean;
    canAutoPanChart: boolean;
    note: string;
  };
  whyNow: string[];
  whatIsMissing: string[];
  triggerChecklist: Array<{
    label: string;
    state: string;
    detail: string;
  }>;
  alertConditions: string[];
  entryMap?: EntryMapResponse;
};

export async function fetchSetupPatrol(market: string, timeframe: string): Promise<SetupPatrolResponse | null> {
  return invokeVaultumRpc<SetupPatrolResponse>('analytics', 'get-setup-patrol', {
    market,
    timeframe,
  });
}
