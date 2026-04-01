import { resolveAllVaultumReportWindows } from './_schedule';

export async function getReportOverview(input: {
  market?: string;
}): Promise<{
  generatedAt: string;
  market: string;
  timezone: string;
  summary: string;
  reports: Array<{
    period: 'daily' | 'weekly' | 'quarterly';
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
}> {
  const market = String(input.market || 'XAUUSD').toUpperCase();
  const reports = resolveAllVaultumReportWindows().map((window) => ({
    period: window.period,
    label: window.label,
    timeframe: window.timeframe,
    coveredLabel: window.coveredLabel,
    readyAt: window.readyAt,
    readyLocalLabel: window.readyLocalLabel,
    anchorLocalLabel: window.anchorLocalLabel,
    status: window.status,
    downloadUrl: `/api/reports/pdf?period=${encodeURIComponent(window.period)}&market=${encodeURIComponent(market)}`,
    note:
      window.period === 'daily'
        ? 'Built for next-session positioning and bias review right after the New York close / FX roll.'
        : window.period === 'weekly'
          ? 'Built for weekend desk prep, carry review, and next-week catalyst planning.'
          : 'Built for quarter-end regime review and strategic positioning work.',
  }));

  return {
    generatedAt: new Date().toISOString(),
    market,
    timezone: 'Africa/Nairobi (UTC+3)',
    summary: `${market} report desk tracks daily, weekly, and quarterly PDF notes off the close window and exposes them for direct download.`,
    reports,
  };
}
