import type { PanelSnapshot } from '@/types';

export function buildPositioningPanels(input: {
  cot?: {
    market?: string;
    zScore?: number;
    summary?: string;
    nonCommercialLong?: number;
    nonCommercialShort?: number;
    commercialLong?: number;
    commercialShort?: number;
    nonReportableLong?: number;
    nonReportableShort?: number;
    spreading?: number;
    netPosition?: number;
    commercialNetPosition?: number;
    crowdedRisk?: string;
    longShortRatio?: number;
    reportDate?: string;
    source?: string;
    change?: number;
  } | null;
  regime?: { market?: string; regime?: string; bias?: string; source?: string } | null;
}): Record<string, PanelSnapshot> {
  return {
    'cot-positioning': {
      conclusion: input.cot?.summary ?? 'COT positioning unavailable.',
      metrics: [
        { label: 'Market', value: input.cot?.market ?? input.regime?.market ?? 'n/a', tone: 'neutral' },
        { label: 'Z-Score', value: input.cot?.zScore != null ? String(input.cot.zScore) : 'n/a', tone: (input.cot?.zScore ?? 0) >= 1.5 ? 'alert' : 'neutral' },
        { label: 'Crowding', value: input.cot?.crowdedRisk ?? 'unknown', tone: input.cot?.crowdedRisk === 'high' ? 'alert' : 'neutral' },
        { label: 'Bias', value: input.regime?.bias ?? 'unknown', tone: input.regime?.bias === 'bullish' ? 'bullish' : input.regime?.bias === 'bearish' ? 'bearish' : 'neutral' },
        { label: 'Report Date', value: input.cot?.reportDate ?? 'n/a', tone: 'neutral' },
        { label: 'L/S Ratio', value: input.cot?.longShortRatio != null ? input.cot.longShortRatio.toFixed(2) : 'n/a', tone: (input.cot?.longShortRatio ?? 1) >= 1.4 ? 'bullish' : (input.cot?.longShortRatio ?? 1) <= 0.8 ? 'bearish' : 'neutral' },
      ],
      bullets: [
        `Market: ${input.cot?.market ?? input.regime?.market ?? 'n/a'}.`,
        `Position z-score: ${input.cot?.zScore ?? 'n/a'}.`,
        `Regime: ${input.regime?.regime ?? 'unknown'}.`,
        `Source: ${input.cot?.source ?? input.regime?.source ?? 'unknown'}.`,
      ],
      table: {
        columns: ['Positioning Lens', 'Reading'],
        rows: [
          ['Non-Commercial Long', input.cot?.nonCommercialLong != null ? String(input.cot.nonCommercialLong) : 'n/a'],
          ['Non-Commercial Short', input.cot?.nonCommercialShort != null ? String(input.cot.nonCommercialShort) : 'n/a'],
          ['Net Position', input.cot?.netPosition != null ? String(input.cot.netPosition) : 'n/a'],
          ['Commercial Net', input.cot?.commercialNetPosition != null ? String(input.cot.commercialNetPosition) : 'n/a'],
          ['Weekly Change', input.cot?.change != null ? String(input.cot.change) : 'n/a'],
          ['Regime', input.regime?.regime ?? 'unknown'],
        ],
      },
      alerts: input.cot?.crowdedRisk === 'high'
        ? ['Crowded trade risk is elevated; squeeze and reversal odds are materially higher.']
        : (input.cot?.source ? [`Feed source: ${input.cot.source}.`] : []),
      status: input.cot?.reportDate ? 'confirmed' : input.cot ? 'mixed' : 'stale',
    },
  };
}
