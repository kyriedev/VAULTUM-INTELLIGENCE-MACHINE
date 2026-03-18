import type { PanelSnapshot } from '@/types';

export function buildOptionsPanels(input: {
  gamma?: { symbol?: string; callWall?: number; putWall?: number; gammaFlip?: number; netGamma?: number; volatilityZone?: string; keyStrikes?: number[] } | null;
  dealer?: { symbol?: string; conclusion?: string; bias?: string; pressureScore?: number; expansionRisk?: string } | null;
  snapshots?: { symbol?: string; snapshots?: Array<{ tenor: string; bias: string; impliedVol?: number }> } | null;
}): Record<string, PanelSnapshot> {
  return {
    'options-gamma': {
      conclusion: input.gamma
        ? `${input.gamma.symbol} call wall ${input.gamma.callWall}, put wall ${input.gamma.putWall}, gamma flip ${input.gamma.gammaFlip}.`
        : 'Options gamma levels unavailable.',
      metrics: [
        { label: 'Call Wall', value: input.gamma?.callWall != null ? String(input.gamma.callWall) : 'n/a', tone: 'bullish' },
        { label: 'Put Wall', value: input.gamma?.putWall != null ? String(input.gamma.putWall) : 'n/a', tone: 'bearish' },
        { label: 'Gamma Flip', value: input.gamma?.gammaFlip != null ? String(input.gamma.gammaFlip) : 'n/a', tone: 'alert' },
        { label: 'Net Gamma', value: input.gamma?.netGamma != null ? String(input.gamma.netGamma) : 'n/a', tone: (input.gamma?.netGamma ?? 0) >= 0 ? 'bullish' : 'bearish' },
        { label: 'Vol Zone', value: input.gamma?.volatilityZone ?? 'unknown', tone: input.gamma?.volatilityZone?.includes('expansion') ? 'alert' : 'neutral' },
      ],
      bullets: [
        `Net gamma: ${input.gamma?.netGamma ?? 'n/a'}.`,
        ...(input.snapshots?.snapshots ?? []).slice(0, 2).map((item) => `${item.tenor}: ${item.bias}`),
        'Treat options structure as market context, not certainty.',
      ],
      table: {
        columns: ['Tenor', 'Bias', 'IV'],
        rows: (input.snapshots?.snapshots ?? []).slice(0, 5).map((item) => [item.tenor, item.bias, item.impliedVol != null ? `${item.impliedVol.toFixed(1)}%` : 'n/a']),
      },
      alerts: input.gamma?.keyStrikes?.length ? [`Key strikes clustered near ${input.gamma.keyStrikes.slice(0, 3).join(', ')}; expect pinning or squeeze behavior around those zones.`] : [],
      status: input.gamma ? 'mixed' : 'stale',
    },
    'dealer-pressure': {
      conclusion: input.dealer?.conclusion ?? 'Dealer pressure unavailable.',
      metrics: [
        { label: 'Bias', value: input.dealer?.bias ?? 'unknown', tone: input.dealer?.bias?.includes('expansion') ? 'alert' : 'neutral' },
        { label: 'Pressure', value: input.dealer?.pressureScore != null ? `${input.dealer.pressureScore}` : 'n/a', tone: (input.dealer?.pressureScore ?? 0) >= 65 ? 'alert' : 'neutral' },
        { label: 'Expansion', value: input.dealer?.expansionRisk ?? 'unknown', tone: input.dealer?.expansionRisk === 'high' ? 'alert' : 'neutral' },
      ],
      bullets: [
        `Bias: ${input.dealer?.bias ?? 'unknown'}.`,
        `Structure source: ${input.snapshots?.symbol ?? input.dealer?.symbol ?? 'n/a'}.`,
        'Dealer flow matters most around crowded strikes and catalyst windows.',
      ],
      table: {
        columns: ['Lens', 'Reading'],
        rows: [
          ['Symbol', input.dealer?.symbol ?? input.snapshots?.symbol ?? 'n/a'],
          ['Bias', input.dealer?.bias ?? 'unknown'],
          ['Expansion Risk', input.dealer?.expansionRisk ?? 'unknown'],
        ],
      },
      status: input.dealer ? 'mixed' : 'stale',
    },
  };
}
