import type { PanelSnapshot } from '@/types';

export function buildTradePanels(input: {
  flows?: { flows?: Array<{ year: number; exports: number; imports: number; reporter: string; partner: string }> } | null;
  restrictions?: { restrictions?: Array<{ reporter: string; year: number; tariffRate: number }> } | null;
  tariffTrends?: { trends?: Array<{ bloc: string; trend: string }> } | null;
  barriers?: { barriers?: Array<{ barrier: string; marketEffect: string }> } | null;
}): Record<string, PanelSnapshot> {
  const latestFlow = input.flows?.flows?.slice(-1)[0];
  const topRestriction = input.restrictions?.restrictions?.[0];
  return {
    'trade-policy': {
      conclusion: 'Trade policy remains a slower structural macro force expressed through flows, tariffs, restrictions, and strategic barriers.',
      metrics: [
        { label: 'Flow Year', value: latestFlow ? String(latestFlow.year) : 'n/a', tone: 'neutral' },
        { label: 'Exports', value: latestFlow ? latestFlow.exports.toFixed(0) : 'n/a', tone: 'neutral' },
        { label: 'Imports', value: latestFlow ? latestFlow.imports.toFixed(0) : 'n/a', tone: 'neutral' },
        { label: 'Top Tariff', value: topRestriction ? `${topRestriction.tariffRate.toFixed(1)}%` : 'n/a', tone: topRestriction && topRestriction.tariffRate >= 10 ? 'alert' : 'neutral' },
      ],
      bullets: [
        latestFlow ? `Latest trade flow: ${latestFlow.reporter}/${latestFlow.partner} exports ${latestFlow.exports.toFixed(0)} imports ${latestFlow.imports.toFixed(0)}.` : 'Trade flow data unavailable.',
        topRestriction ? `Highest current tariff proxy: ${topRestriction.reporter} ${topRestriction.tariffRate.toFixed(1)}%.` : 'Restriction data unavailable.',
        `${(input.tariffTrends?.trends ?? []).map((item) => `${item.bloc}: ${item.trend}`).join(' | ') || 'Tariff trend data unavailable.'}`,
      ],
      table: {
        columns: ['Lens', 'Reading'],
        rows: [
          ['Latest Flow', latestFlow ? `${latestFlow.reporter}/${latestFlow.partner} ${latestFlow.year}` : 'unavailable'],
          ['Restriction', topRestriction ? `${topRestriction.reporter} ${topRestriction.tariffRate.toFixed(1)}%` : 'unavailable'],
          ['Tariff Trend', input.tariffTrends?.trends?.[0] ? `${input.tariffTrends.trends[0].bloc} ${input.tariffTrends.trends[0].trend}` : 'unavailable'],
          ['Barrier', input.barriers?.barriers?.[0] ? `${input.barriers.barriers[0].barrier} / ${input.barriers.barriers[0].marketEffect}` : 'unavailable'],
        ],
      },
      alerts: topRestriction && topRestriction.tariffRate >= 10
        ? ['Tariff and restriction pressure is high enough to matter for FX, commodity demand, and policy risk premia.']
        : [],
      status: 'mixed',
    },
  };
}
