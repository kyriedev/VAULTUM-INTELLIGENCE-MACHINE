import type { PanelSnapshot } from '@/types';

export function buildOptionsPanels(input: {
  gamma?: {
    symbol?: string;
    sourceSymbol?: string;
    callWall?: number;
    putWall?: number;
    gammaFlip?: number;
    netGamma?: number;
    volatilityZone?: string;
    keyStrikes?: number[];
    price?: number;
    atr14?: number;
    realizedVol20?: number;
    realizedVol60?: number;
    volPercentile?: number;
    momentum20?: number;
    tickMomentum?: number;
    rangeExpansion?: number;
    mode?: string;
    sourceLabel?: string;
  } | null;
  dealer?: {
    symbol?: string;
    sourceSymbol?: string;
    conclusion?: string;
    bias?: string;
    pressureScore?: number;
    expansionRisk?: string;
    price?: number;
    atr14?: number;
    realizedVol20?: number;
    realizedVol60?: number;
    volPercentile?: number;
    tickMomentum?: number;
    rangeExpansion?: number;
    mode?: string;
    sourceLabel?: string;
  } | null;
  snapshots?: {
    symbol?: string;
    sourceSymbol?: string;
    mode?: string;
    sourceLabel?: string;
    snapshots?: Array<{ tenor: string; bias: string; impliedVol?: number }>;
  } | null;
}): Record<string, PanelSnapshot> {
  return {
    'options-gamma': {
      conclusion: input.gamma
        ? `${input.gamma.symbol} proxy walls cluster at ${input.gamma.putWall} / ${input.gamma.gammaFlip} / ${input.gamma.callWall} with ${input.gamma.volatilityZone}.`
        : 'Options gamma levels unavailable.',
      metrics: [
        { label: 'Call Wall', value: input.gamma?.callWall != null ? String(input.gamma.callWall) : 'n/a', tone: 'bullish' },
        { label: 'Put Wall', value: input.gamma?.putWall != null ? String(input.gamma.putWall) : 'n/a', tone: 'bearish' },
        { label: 'Gamma Flip', value: input.gamma?.gammaFlip != null ? String(input.gamma.gammaFlip) : 'n/a', tone: 'alert' },
        { label: 'Net Gamma', value: input.gamma?.netGamma != null ? String(input.gamma.netGamma) : 'n/a', tone: (input.gamma?.netGamma ?? 0) >= 0 ? 'bullish' : 'bearish' },
        { label: 'Vol Zone', value: input.gamma?.volatilityZone ?? 'unknown', tone: input.gamma?.volatilityZone?.includes('expansion') ? 'alert' : 'neutral' },
        { label: 'Vol %ile', value: input.gamma?.volPercentile != null ? `${input.gamma.volPercentile}` : 'n/a', tone: (input.gamma?.volPercentile ?? 0) >= 70 ? 'alert' : 'neutral' },
      ],
      charts: input.gamma
        ? [
          {
            label: 'Vol Stack',
            points: [
              input.gamma.realizedVol60 ?? 0,
              input.gamma.realizedVol20 ?? 0,
              input.gamma.volPercentile ?? 0,
              Math.max((input.gamma.rangeExpansion ?? 0) * 25, 0),
            ],
            tone: input.gamma.netGamma != null && input.gamma.netGamma < 0 ? 'alert' : 'bullish',
          },
        ]
        : [],
      bullets: [
        `Source mode: ${input.gamma?.mode ?? input.snapshots?.mode ?? 'unknown'}.`,
        `Spot ${input.gamma?.price ?? 'n/a'} | ATR14 ${input.gamma?.atr14 ?? 'n/a'} | RV20 ${input.gamma?.realizedVol20 ?? 'n/a'}% | tick momentum ${input.gamma?.tickMomentum ?? 'n/a'}%.`,
        ...(input.snapshots?.snapshots ?? []).slice(0, 2).map((item) => `${item.tenor}: ${item.bias}`),
        input.gamma?.sourceLabel ?? input.snapshots?.sourceLabel ?? 'Treat options structure as market context, not certainty.',
      ],
      table: {
        columns: ['Tenor', 'Bias', 'IV'],
        rows: (input.snapshots?.snapshots ?? []).slice(0, 5).map((item) => [item.tenor, item.bias, item.impliedVol != null ? `${item.impliedVol.toFixed(1)}%` : 'n/a']),
      },
      alerts: input.gamma?.keyStrikes?.length
        ? [
          `Key strikes clustered near ${input.gamma.keyStrikes.slice(0, 3).join(', ')}; expect pinning or squeeze behavior around those zones.`,
          input.gamma.sourceLabel ?? 'Synthetic proxy mode.',
        ]
        : (input.gamma?.sourceLabel ? [input.gamma.sourceLabel] : []),
      status: input.gamma ? 'mixed' : 'stale',
    },
    'dealer-pressure': {
      conclusion: input.dealer?.conclusion ?? 'Dealer pressure unavailable.',
      metrics: [
        { label: 'Bias', value: input.dealer?.bias ?? 'unknown', tone: input.dealer?.bias?.includes('expansion') ? 'alert' : 'neutral' },
        { label: 'Pressure', value: input.dealer?.pressureScore != null ? `${input.dealer.pressureScore}` : 'n/a', tone: (input.dealer?.pressureScore ?? 0) >= 65 ? 'alert' : 'neutral' },
        { label: 'Expansion', value: input.dealer?.expansionRisk ?? 'unknown', tone: input.dealer?.expansionRisk === 'high' ? 'alert' : 'neutral' },
        { label: 'RV20', value: input.dealer?.realizedVol20 != null ? `${input.dealer.realizedVol20}%` : 'n/a', tone: (input.dealer?.realizedVol20 ?? 0) >= (input.dealer?.realizedVol60 ?? 999) ? 'alert' : 'neutral' },
      ],
      charts: input.dealer
        ? [
          {
            label: 'Pressure Stack',
            points: [
              input.dealer.realizedVol60 ?? 0,
              input.dealer.realizedVol20 ?? 0,
              input.dealer.volPercentile ?? 0,
              input.dealer.pressureScore ?? 0,
            ],
            tone: input.dealer.pressureScore != null && input.dealer.pressureScore >= 65 ? 'alert' : 'neutral',
          },
        ]
        : [],
      bullets: [
        `Bias: ${input.dealer?.bias ?? 'unknown'}.`,
        `Structure source: ${input.dealer?.sourceSymbol ?? input.snapshots?.sourceSymbol ?? input.dealer?.symbol ?? 'n/a'}.`,
        `Price ${input.dealer?.price ?? 'n/a'} | ATR14 ${input.dealer?.atr14 ?? 'n/a'} | range expansion ${input.dealer?.rangeExpansion ?? 'n/a'} | tick momentum ${input.dealer?.tickMomentum ?? 'n/a'}%.`,
        input.dealer?.sourceLabel ?? 'Dealer flow matters most around crowded strikes and catalyst windows.',
      ],
      table: {
        columns: ['Lens', 'Reading'],
        rows: [
          ['Symbol', input.dealer?.symbol ?? input.snapshots?.symbol ?? 'n/a'],
          ['Source', input.dealer?.sourceSymbol ?? input.snapshots?.sourceSymbol ?? 'n/a'],
          ['Bias', input.dealer?.bias ?? 'unknown'],
          ['Expansion Risk', input.dealer?.expansionRisk ?? 'unknown'],
        ],
      },
      alerts: input.dealer?.sourceLabel ? [input.dealer.sourceLabel] : [],
      status: input.dealer ? 'mixed' : 'stale',
    },
  };
}
