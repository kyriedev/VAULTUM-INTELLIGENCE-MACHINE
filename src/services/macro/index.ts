import type { PanelSnapshot } from '@/types';

function latestValue(series?: { observations?: Array<{ date: string; value: number | null }> } | null): number | null {
  return series?.observations?.find((item) => item.value != null)?.value ?? null;
}

export function buildMacroPanels(input: {
  macroSignals?: any;
  fred2y?: { observations?: Array<{ date: string; value: number | null }> } | null;
  fred10y?: { observations?: Array<{ date: string; value: number | null }> } | null;
  energyPrices?: { prices?: Array<{ symbol: string; price: number; change: number }> } | null;
  bisPolicyRates?: { rates?: Array<{ bank: string; rate: number }> } | null;
  bisExchangeRates?: { pairs?: Array<{ pair: string; bias: string }> } | null;
  bisCredit?: { credit?: Array<{ country: string; regime: string }> } | null;
}): Record<string, PanelSnapshot> {
  const macro = input.macroSignals ?? {};
  const twoYear = latestValue(input.fred2y);
  const tenYear = latestValue(input.fred10y);
  const energy = input.energyPrices?.prices ?? [];

  return {
    'macro-regime': {
      conclusion: `Macro regime reads ${macro.regime ?? 'unknown'}, with gold bias ${macro.goldBias ?? 'unknown'} and safe-haven pressure ${macro.safeHavenPressure ?? 'unknown'}.`,
      metrics: [
        { label: 'Regime', value: macro.regime ?? 'unknown', tone: macro.regime?.includes('risk-off') ? 'alert' : 'neutral' },
        { label: 'Gold Bias', value: macro.goldBias ?? 'unknown', tone: macro.goldBias === 'bullish' ? 'bullish' : macro.goldBias === 'bearish' ? 'bearish' : 'neutral' },
        { label: 'Safe Haven', value: macro.safeHavenPressure ?? 'unknown', tone: macro.safeHavenPressure === 'high' ? 'alert' : 'neutral' },
        { label: '2Y Yield', value: twoYear != null ? `${twoYear.toFixed(2)}%` : 'n/a', tone: 'neutral' },
        { label: '10Y Yield', value: tenYear != null ? `${tenYear.toFixed(2)}%` : 'n/a', tone: 'neutral' },
        { label: 'Carry Stress', value: macro.inferred?.carryStress ?? 'unknown', tone: macro.inferred?.carryStress === 'elevated' ? 'alert' : 'neutral' },
      ],
      bullets: [
        `Confirmed signal: 2Y ${twoYear ?? 'n/a'} / 10Y ${tenYear ?? 'n/a'} with DXY ROC ${macro.confirmed?.dxyRoc20 ?? 'n/a'}.`,
        `Inferred implication: dollar liquidity pressure is ${macro.inferred?.dollarLiquidityPressure ?? 'unknown'} and carry stress is ${macro.inferred?.carryStress ?? 'unknown'}.`,
        `Energy overlay: ${energy.map((item) => `${item.symbol} ${item.change >= 0 ? '+' : ''}${item.change?.toFixed?.(2) ?? item.change}%`).join(', ') || 'unavailable'}.`,
      ],
      table: {
        columns: ['Driver', 'Reading'],
        rows: [
          ['Regime', macro.regime ?? 'unknown'],
          ['Gold Bias', macro.goldBias ?? 'unknown'],
          ['Safe Haven', macro.safeHavenPressure ?? 'unknown'],
          ['Dollar Liquidity', macro.inferred?.dollarLiquidityPressure ?? 'unknown'],
          ['Carry Stress', macro.inferred?.carryStress ?? 'unknown'],
          ['10Y Yield', tenYear != null ? `${tenYear.toFixed(2)}%` : 'n/a'],
        ],
      },
      alerts: macro.regime?.includes('risk-off') ? ['Risk-off macro regime is active; equity beta and carry should require tighter confirmation.'] : [],
      status: 'mixed',
    },
    economic: {
      conclusion: 'Economic panel frames the policy path through rates, energy, BIS policy divergence, and credit backdrop rather than isolated prints.',
      metrics: [
        { label: 'Rates Lens', value: input.bisPolicyRates?.rates?.length ? 'live' : 'partial', tone: input.bisPolicyRates?.rates?.length ? 'bullish' : 'alert' },
        { label: 'FX Lens', value: input.bisExchangeRates?.pairs?.length ? 'live' : 'partial', tone: input.bisExchangeRates?.pairs?.length ? 'bullish' : 'alert' },
        { label: 'Credit Lens', value: input.bisCredit?.credit?.length ? 'live' : 'partial', tone: input.bisCredit?.credit?.length ? 'bullish' : 'alert' },
      ],
      bullets: [
        `Policy rates: ${(input.bisPolicyRates?.rates ?? []).map((item) => `${item.bank} ${item.rate}`).join(' | ') || 'unavailable'}.`,
        `Exchange-rate lens: ${(input.bisExchangeRates?.pairs ?? []).map((item) => `${item.pair} ${item.bias}`).join(' | ') || 'unavailable'}.`,
        `Credit lens: ${(input.bisCredit?.credit ?? []).map((item) => `${item.country} ${item.regime}`).join(' | ') || 'unavailable'}.`,
      ],
      table: {
        columns: ['Macro Lens', 'Top Reading', 'Status'],
        rows: [
          ['Policy', input.bisPolicyRates?.rates?.[0] ? `${input.bisPolicyRates.rates[0].bank} ${input.bisPolicyRates.rates[0].rate}` : 'unavailable', input.bisPolicyRates?.rates?.length ? 'available' : 'degraded'],
          ['FX', input.bisExchangeRates?.pairs?.[0] ? `${input.bisExchangeRates.pairs[0].pair} ${input.bisExchangeRates.pairs[0].bias}` : 'unavailable', input.bisExchangeRates?.pairs?.length ? 'available' : 'degraded'],
          ['Credit', input.bisCredit?.credit?.[0] ? `${input.bisCredit.credit[0].country} ${input.bisCredit.credit[0].regime}` : 'unavailable', input.bisCredit?.credit?.length ? 'available' : 'degraded'],
        ],
      },
      status: 'mixed',
    },
  };
}
