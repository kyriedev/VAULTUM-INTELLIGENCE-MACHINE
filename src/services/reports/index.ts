import { buildApiUrl } from '@/services/api-base';
import { invokeVaultumRpc } from '@/services/rpc';

export type VaultumReportPeriod = 'daily' | 'weekly' | 'quarterly';

export type VaultumReportOverview = {
  generatedAt: string;
  market: string;
  timezone: string;
  summary: string;
  reports: Array<{
    period: VaultumReportPeriod;
    label: string;
    timeframe: string;
    coveredLabel: string;
    readyAt: string;
    readyLocalLabel: string;
    anchorLocalLabel: string;
    status: 'ready' | 'pending';
    downloadUrl: string;
    note: string;
  }>;
};

export async function fetchReportOverview(market: string): Promise<VaultumReportOverview | null> {
  return invokeVaultumRpc<VaultumReportOverview>('reports', 'get-report-overview', { market });
}

export function buildReportDownloadUrl(period: VaultumReportPeriod, market: string): string {
  const params = new URLSearchParams({
    period,
    market: market.toUpperCase(),
  });
  return `${buildApiUrl('reports/pdf')}?${params.toString()}`;
}
