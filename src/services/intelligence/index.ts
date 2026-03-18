import type { PanelSnapshot } from '@/types';

export function buildIntelligencePanels(input: {
  riskScores?: { scores?: Record<string, number> } | null;
  proxyTension?: { conclusion?: string; regions?: Array<{ region: string; status: string }> } | null;
  countryBrief?: { brief?: string } | null;
  searchResults?: { results?: Array<{ title: string; type: string }> } | null;
}): Record<string, PanelSnapshot> {
  const scores = input.riskScores?.scores ?? {};
  const topRisk = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return {
    'geopolitical-risk': {
      conclusion: input.proxyTension?.conclusion ?? 'Geopolitical market-impact context unavailable.',
      metrics: [
        { label: 'Top Risk', value: topRisk ? `${topRisk[0]} ${topRisk[1]}` : 'unavailable', tone: topRisk && topRisk[1] >= 70 ? 'alert' : 'neutral' },
        { label: 'Regions', value: String((input.proxyTension?.regions ?? []).length || 0), tone: 'neutral' },
        { label: 'Gold Support', value: input.proxyTension?.conclusion?.toLowerCase().includes('gold') ? 'active' : 'mixed', tone: input.proxyTension?.conclusion?.toLowerCase().includes('gold') ? 'bullish' : 'neutral' },
      ],
      bullets: [
        `Top risk bucket: ${topRisk ? `${topRisk[0]} ${topRisk[1]}` : 'unavailable'}.`,
        `Regional stress: ${(input.proxyTension?.regions ?? []).map((item) => `${item.region} ${item.status}`).join(' | ') || 'unavailable'}.`,
        'Market impact should be judged through oil, gold, shipping, sanctions, and carry channels.',
      ],
      table: {
        columns: ['Region', 'Status'],
        rows: (input.proxyTension?.regions ?? []).slice(0, 5).map((item) => [item.region, item.status]),
      },
      alerts: (input.proxyTension?.regions ?? []).some((item) => /elevated|high|critical/i.test(item.status))
        ? ['Escalation-sensitive regions are active enough to matter for oil, gold, and FX carry pricing.']
        : [],
      status: 'mixed',
    },
    'news-intel': {
      conclusion: input.countryBrief?.brief ?? 'Country brief unavailable; fallback to classified news/search context.',
      metrics: [
        { label: 'Documents', value: String((input.searchResults?.results ?? []).length || 0), tone: 'neutral' },
        { label: 'Brief', value: input.countryBrief?.brief ? 'available' : 'degraded', tone: input.countryBrief?.brief ? 'bullish' : 'alert' },
      ],
      bullets: [
        ...(input.searchResults?.results ?? []).slice(0, 3).map((item) => `${item.type}: ${item.title}`),
        'Confirmed signal must be separated from inferred implication and missing-data risk.',
      ],
      table: {
        columns: ['Type', 'Headline'],
        rows: (input.searchResults?.results ?? []).slice(0, 5).map((item) => [item.type, item.title]),
      },
      status: 'mixed',
    },
  };
}
