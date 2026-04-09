import type { PanelSnapshot } from '@/types';

export function buildLiquidityPanels(input: {
  stress?: { conclusion?: string; drivers?: Record<string, number | null>; score?: number; warnings?: string[] } | null;
  carry?: { conclusion?: string; pairs?: Array<{ pair: string; change: number | null }> } | null;
  haven?: { conclusion?: string; score?: number } | null;
  crossAsset?: { regime?: string; regimeLabel?: string; riskState?: string; componentScores?: { liquidityScore?: number; confidenceScore?: number }; syntheticFlow?: { intensity?: number; label?: string }; warnings?: string[] } | null;
}): Record<string, PanelSnapshot> {
  return {
    'liquidity-stress': {
      conclusion: input.stress?.conclusion ?? `Liquidity lens reads ${input.crossAsset?.regimeLabel ?? input.crossAsset?.regime ?? 'unavailable'}.`,
      metrics: [
        { label: 'DXY', value: input.stress?.drivers?.dxy != null ? `${input.stress.drivers.dxy >= 0 ? '+' : ''}${input.stress.drivers.dxy.toFixed(2)}%` : 'n/a', tone: (input.stress?.drivers?.dxy ?? 0) > 0 ? 'alert' : 'neutral' },
        { label: 'VIX', value: input.stress?.drivers?.vix != null ? `${input.stress.drivers.vix >= 0 ? '+' : ''}${input.stress.drivers.vix.toFixed(2)}%` : 'n/a', tone: (input.stress?.drivers?.vix ?? 0) > 0 ? 'alert' : 'neutral' },
        { label: '10Y', value: input.stress?.drivers?.us10y != null ? `${input.stress.drivers.us10y >= 0 ? '+' : ''}${input.stress.drivers.us10y.toFixed(2)}%` : 'n/a', tone: (input.stress?.drivers?.us10y ?? 0) > 0 ? 'alert' : 'neutral' },
        { label: 'JPY', value: input.stress?.drivers?.jpy != null ? `${input.stress.drivers.jpy >= 0 ? '+' : ''}${input.stress.drivers.jpy.toFixed(2)}%` : 'n/a', tone: (input.stress?.drivers?.jpy ?? 0) > 0 ? 'alert' : 'neutral' },
        { label: 'Safe Haven', value: input.haven?.score != null ? String(input.haven.score) : 'n/a', tone: (input.haven?.score ?? 0) >= 60 ? 'alert' : 'neutral' },
        { label: 'Liquidity', value: input.crossAsset?.componentScores?.liquidityScore != null ? `${input.crossAsset.componentScores.liquidityScore.toFixed(1)}` : 'n/a', tone: (input.crossAsset?.componentScores?.liquidityScore ?? 50) >= 60 ? 'bullish' : (input.crossAsset?.componentScores?.liquidityScore ?? 50) <= 40 ? 'alert' : 'neutral' },
      ],
      bullets: [
        `Cross-asset regime: ${input.crossAsset?.regimeLabel ?? input.crossAsset?.regime ?? 'unknown'}.`,
        `Carry stress: ${input.carry?.conclusion ?? 'unknown'}.`,
        `Safe haven pressure: ${input.haven?.conclusion ?? 'unknown'}.`,
        `Synthetic flow: ${input.crossAsset?.syntheticFlow?.intensity != null ? `${input.crossAsset.syntheticFlow.intensity.toFixed(1)} ${input.crossAsset.syntheticFlow.label}` : 'unknown'}.`,
      ],
      table: {
        columns: ['Liquidity Lens', 'Reading'],
        rows: [
          ['DXY Driver', input.stress?.drivers?.dxy != null ? `${input.stress.drivers.dxy.toFixed(2)}%` : 'n/a'],
          ['VIX Driver', input.stress?.drivers?.vix != null ? `${input.stress.drivers.vix.toFixed(2)}%` : 'n/a'],
          ['Carry Stress', input.carry?.conclusion ?? 'unknown'],
          ['Cross-Asset Regime', input.crossAsset?.regimeLabel ?? input.crossAsset?.regime ?? 'unknown'],
        ],
      },
      alerts: [
        ...((input.stress?.drivers?.dxy ?? 0) > 0.5 && (input.stress?.drivers?.vix ?? 0) > 3
          ? ['Dollar and volatility are rising together; funding stress is more credible than a one-factor move.']
          : []),
        ...(input.stress?.warnings?.slice?.(0, 2) ?? input.crossAsset?.warnings?.slice?.(0, 2) ?? []),
      ],
      status: input.stress ? 'mixed' : 'stale',
    },
  };
}
