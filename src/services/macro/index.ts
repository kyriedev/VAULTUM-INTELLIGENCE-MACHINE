import type { PanelSnapshot } from '@/types';

function latestValue(series?: { observations?: Array<{ date: string; value: number | null }> } | null): number | null {
  return series?.observations?.find((item) => item.value != null)?.value ?? null;
}

export function buildMacroPanels(input: {
  macroSignals?: any;
  crossAssetRegime?: any;
  fred2y?: { observations?: Array<{ date: string; value: number | null }> } | null;
  fred10y?: { observations?: Array<{ date: string; value: number | null }> } | null;
  energyPrices?: { prices?: Array<{ symbol: string; price: number; change: number }> } | null;
  bisPolicyRates?: { rates?: Array<{ bank: string; rate: number }> } | null;
  bisExchangeRates?: { pairs?: Array<{ pair: string; bias: string }> } | null;
  bisCredit?: { credit?: Array<{ country: string; regime: string }> } | null;
}): Record<string, PanelSnapshot> {
  const macro = input.macroSignals ?? {};
  const cross = input.crossAssetRegime ?? {};
  const twoYear = latestValue(input.fred2y);
  const tenYear = latestValue(input.fred10y);
  const energy = input.energyPrices?.prices ?? [];
  const ratesScoreboard = Array.isArray(macro.ratesDifferentials?.scoreboard) ? macro.ratesDifferentials.scoreboard : [];
  const ratesRows = ratesScoreboard.map((item: any) => [
    item.pair,
    `${item.baseBank} ${item.basePolicyRate != null ? `${item.basePolicyRate.toFixed(2)}%` : 'n/a'} vs ${item.quoteBank} ${item.quotePolicyRate != null ? `${item.quotePolicyRate.toFixed(2)}%` : 'n/a'} (${item.differentialPts != null ? `${item.differentialPts >= 0 ? '+' : ''}${item.differentialPts.toFixed(2)} pts` : 'n/a'})`,
    `${item.directionalBias} / ${item.alignment} / repricing ${item.repricingRisk}`,
  ]);
  const providerRows = Object.entries(cross.providerHealth ?? {}).map(([provider, status]: [string, any]) => [
    provider,
    status?.state ?? 'unknown',
    status?.detail ?? 'No provider detail.',
  ]);

  return {
    'macro-regime': {
      conclusion: `${cross.regimeLabel ?? 'Transition'} with ${cross.componentScores?.confidenceScore?.toFixed?.(1) ?? 'n/a'} confidence. Macro overlay reads ${macro.regime ?? 'unknown'}, gold bias ${macro.goldBias ?? 'unknown'}, and synthetic flow ${cross.syntheticFlow?.label ?? 'unknown'} ${cross.syntheticFlow?.direction ?? 'balanced'}.`,
      metrics: [
        { label: 'Regime', value: cross.regimeLabel ?? cross.classification ?? 'unknown', tone: cross.classification === 'RISK_ON' ? 'bullish' : cross.classification === 'RISK_OFF' ? 'alert' : 'neutral' },
        { label: 'Liquidity', value: cross.componentScores?.liquidityScore != null ? String(cross.componentScores.liquidityScore.toFixed(1)) : 'n/a', tone: (cross.componentScores?.liquidityScore ?? 50) >= 60 ? 'bullish' : (cross.componentScores?.liquidityScore ?? 50) <= 40 ? 'alert' : 'neutral' },
        { label: 'Risk', value: cross.componentScores?.riskScore != null ? String(cross.componentScores.riskScore.toFixed(1)) : 'n/a', tone: (cross.componentScores?.riskScore ?? 50) >= 60 ? 'bullish' : (cross.componentScores?.riskScore ?? 50) <= 40 ? 'bearish' : 'neutral' },
        { label: 'Vol Stability', value: cross.componentScores?.volatilityScore != null ? String(cross.componentScores.volatilityScore.toFixed(1)) : 'n/a', tone: (cross.componentScores?.volatilityScore ?? 50) >= 60 ? 'bullish' : (cross.componentScores?.volatilityScore ?? 50) <= 40 ? 'alert' : 'neutral' },
        { label: 'Correlation', value: cross.componentScores?.correlationScore != null ? String(cross.componentScores.correlationScore.toFixed(1)) : 'n/a', tone: (cross.componentScores?.correlationScore ?? 50) >= 60 ? 'bullish' : (cross.componentScores?.correlationScore ?? 50) <= 40 ? 'alert' : 'neutral' },
        { label: 'Confidence', value: cross.componentScores?.confidenceScore != null ? String(cross.componentScores.confidenceScore.toFixed(1)) : 'n/a', tone: (cross.componentScores?.confidenceScore ?? 50) >= 60 ? 'bullish' : (cross.componentScores?.confidenceScore ?? 50) <= 45 ? 'alert' : 'neutral' },
      ],
      bullets: [
        ...(cross.drivers?.slice?.(0, 3) ?? [
          `Cross-asset regime is ${cross.regimeLabel ?? 'unknown'}.`,
          `Synthetic flow is ${cross.syntheticFlow?.label ?? 'unknown'} intensity.`,
          `Confidence is ${cross.componentScores?.confidenceScore ?? 'n/a'}.`,
        ]),
        `Rates overlay: 2Y ${twoYear != null ? `${twoYear.toFixed(2)}%` : 'n/a'} / 10Y ${tenYear != null ? `${tenYear.toFixed(2)}%` : 'n/a'} and carry stress ${macro.inferred?.carryStress ?? 'unknown'}.`,
        ...(ratesScoreboard.slice(0, 2).map((item: any) => item.summary)),
        `Energy overlay: ${energy.map((item) => `${item.symbol} ${item.change >= 0 ? '+' : ''}${item.change?.toFixed?.(2) ?? item.change}%`).join(', ') || 'unavailable'}.`,
      ],
      table: {
        columns: ['Provider', 'State', 'Detail'],
        rows: providerRows.length ? providerRows : [['providers', 'unknown', 'No provider health telemetry yet.']],
      },
      alerts: [
        ...(cross.warnings ?? []),
        ...(macro.regime?.includes('risk-off') ? ['Risk-off macro regime is active; equity beta and carry should require tighter confirmation.'] : []),
      ].slice(0, 5),
      status: cross.classification === 'RISK_ON' || cross.classification === 'RISK_OFF' ? 'confirmed' : 'mixed',
    },
    economic: {
      conclusion: 'Economic panel now carries the cross-country rates differential scoreboard so FX macro can be judged through policy gaps, alignment, and repricing risk instead of isolated rate prints.',
      metrics: [
        { label: 'Rates Lens', value: input.bisPolicyRates?.rates?.length ? 'live' : 'partial', tone: input.bisPolicyRates?.rates?.length ? 'bullish' : 'alert' },
        { label: 'FX Lens', value: input.bisExchangeRates?.pairs?.length ? 'live' : 'partial', tone: input.bisExchangeRates?.pairs?.length ? 'bullish' : 'alert' },
        { label: 'Credit Lens', value: input.bisCredit?.credit?.length ? 'live' : 'partial', tone: input.bisCredit?.credit?.length ? 'bullish' : 'alert' },
      ],
      bullets: [
        `Policy rates: ${(input.bisPolicyRates?.rates ?? []).map((item) => `${item.bank} ${item.rate}`).join(' | ') || 'unavailable'}.`,
        `Rates differential board: ${ratesScoreboard.length ? ratesScoreboard.map((item: any) => `${item.pair} ${item.directionalBias} / ${item.alignment}`).join(' | ') : 'unavailable'}.`,
        `Exchange-rate lens: ${(input.bisExchangeRates?.pairs ?? []).map((item) => `${item.pair} ${item.bias}`).join(' | ') || 'unavailable'}.`,
        `Credit lens: ${(input.bisCredit?.credit ?? []).map((item) => `${item.country} ${item.regime}`).join(' | ') || 'unavailable'}.`,
      ],
      table: {
        columns: ['Pair / Lens', 'Policy Gap', 'Status'],
        rows: ratesRows.length
          ? ratesRows
          : [
            ['Policy', input.bisPolicyRates?.rates?.[0] ? `${input.bisPolicyRates.rates[0].bank} ${input.bisPolicyRates.rates[0].rate}` : 'unavailable', input.bisPolicyRates?.rates?.length ? 'available' : 'degraded'],
            ['FX', input.bisExchangeRates?.pairs?.[0] ? `${input.bisExchangeRates.pairs[0].pair} ${input.bisExchangeRates.pairs[0].bias}` : 'unavailable', input.bisExchangeRates?.pairs?.length ? 'available' : 'degraded'],
            ['Credit', input.bisCredit?.credit?.[0] ? `${input.bisCredit.credit[0].country} ${input.bisCredit.credit[0].regime}` : 'unavailable', input.bisCredit?.credit?.length ? 'available' : 'degraded'],
          ],
      },
      alerts: ratesScoreboard
        .filter((item: any) => item.repricingRisk === 'high')
        .slice(0, 3)
        .map((item: any) => `${item.pair} repricing risk is high because spot is ${item.alignment} against the policy gap.`),
      status: 'mixed',
    },
  };
}
