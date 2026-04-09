import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { normalizeVaultumTimeframe, structuralTimeframeFor } from '../../_shared/timeframes';
import { getEconomicCalendar } from '../../calendar/v1/get-economic-calendar';
import { getProxyTensionStatus } from '../../intelligence/v1/get-proxy-tension-status';
import { getCrossAssetRegime } from '../../liquidity/v1/get-cross-asset-regime';
import { getSafeHavenPressure } from '../../liquidity/v1/get-safe-haven-pressure';
import { getMacroSignals } from '../../macro/v1/get-macro-signals';
import { getDealerPressure } from '../../options/v1/get-dealer-pressure';
import { getFlowProxy } from '../../options/v1/get-flow-proxy';
import { getGammaLevels } from '../../options/v1/get-gamma-levels';
import { getOrderflowEngine } from '../../orderflow/v1/get-engine';
import { getLevels } from '../../pivots/v1/get-levels';
import { getCotSummary } from '../../positioning/v1/get-cot-summary';
import { getPositioningRegime } from '../../positioning/v1/get-positioning-regime';
import { getBuyerSellerPressure } from '../../pressure/v1/get-buyer-seller-pressure';
import { getProfile } from '../../volume/v1/get-profile';

type MonitorItem = {
  key: 'rates' | 'dollar' | 'options' | 'cot' | 'liquidity' | 'policy' | 'stress';
  label: string;
  state: string;
  confidenceScore: number;
  confidence: 'low' | 'medium' | 'high';
  status: 'confirmed' | 'derived' | 'estimated';
  summary: string;
  sources: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function confidenceBand(score: number): 'low' | 'medium' | 'high' {
  if (score >= 72) return 'high';
  if (score >= 48) return 'medium';
  return 'low';
}

function buildItem(input: {
  key: MonitorItem['key'];
  label: string;
  state: string;
  status: MonitorItem['status'];
  summary: string;
  sources: Array<string | null | undefined>;
  signalStrength: number;
  mode?: string | null;
  feedQuality?: string | null;
  caveatPenalty?: number;
}): MonitorItem {
  const sources = [...new Set(input.sources.filter((value): value is string => Boolean(value && value.trim())))].slice(0, 6);
  const feedAdjustment =
    input.feedQuality === 'strong' ? 10
      : input.feedQuality === 'usable' ? 4
        : input.feedQuality === 'weak' ? -10
          : 0;
  const modeAdjustment =
    input.mode === 'direct' ? 10
      : input.mode === 'volume-backed' ? 6
      : input.mode === 'proxy' ? -2
        : input.mode === 'estimated' || input.mode === 'synthetic-live' ? -8
          : 0;
  const statusBase =
    input.status === 'confirmed' ? 72
      : input.status === 'derived' ? 58
        : 40;
  const confidenceScore = clamp(Math.round(
    (statusBase * 0.45)
    + (clamp(input.signalStrength, 20, 90) * 0.35)
    + Math.min(14, sources.length * 3)
    + feedAdjustment
    + modeAdjustment
    - (input.caveatPenalty ?? 0),
  ), 18, 95);

  return {
    key: input.key,
    label: input.label,
    state: input.state,
    confidenceScore,
    confidence: confidenceBand(confidenceScore),
    status: input.status,
    summary: input.summary,
    sources,
  };
}

function resolveCotMarket(market: string): 'GOLD' | 'WTI' | null {
  const normalized = market.toUpperCase();
  if (normalized === 'XAUUSD' || normalized === 'GOLD') return 'GOLD';
  if (normalized === 'WTI' || normalized === 'OIL') return 'WTI';
  return null;
}

export async function getInstitutionalMonitor(input: {
  market?: string;
  timeframe?: string;
}): Promise<{
  generatedAt: string;
  market: string;
  timeframe: string;
  summary: string;
  sourceLabel: string;
  items: MonitorItem[];
  alerts: string[];
}> {
  const market = String(input.market || 'XAUUSD').toUpperCase();
  const timeframe = normalizeVaultumTimeframe(input.timeframe);
  const structuralTimeframe = structuralTimeframeFor(timeframe);
  const cotMarket = resolveCotMarket(market);

  return getCachedOrCompute(cacheKey('monitor', `institutional:${market}:${timeframe}`), async () => {
    const [
      macro,
      flowProxy,
      dealer,
      gamma,
      cotSummary,
      positioningRegime,
      orderflow,
      pressure,
      pivots,
      profile,
      calendar,
      crossAsset,
      safeHaven,
      tension,
    ] = await Promise.all([
      getMacroSignals({ market }),
      getFlowProxy({ symbol: market }),
      getDealerPressure({ symbol: market }),
      getGammaLevels({ symbol: market }),
      cotMarket ? getCotSummary({ market: cotMarket }) : Promise.resolve(null),
      cotMarket ? getPositioningRegime({ market: cotMarket }) : Promise.resolve(null),
      getOrderflowEngine({ market, timeframe }),
      getBuyerSellerPressure({ market, timeframe, mode: 'auto' }),
      getLevels({ market, timeframe: structuralTimeframe }),
      getProfile({ market, timeframe: structuralTimeframe }),
      getEconomicCalendar({ market }),
      getCrossAssetRegime(),
      getSafeHavenPressure(),
      getProxyTensionStatus(),
    ]);

    const nextEvent = calendar?.events?.find((event: any) => event.isUpcoming) ?? null;
    const macroFocus = macro?.focus ?? null;
    const ratesFocus = macro?.ratesDifferentials?.focus ?? null;
    const items: MonitorItem[] = [
      buildItem({
        key: 'rates',
        label: 'Rates / Real Yields',
        state: macro?.inferred?.realYieldPressure ?? 'unknown',
        status: macro?.rates?.real10y != null ? 'confirmed' : 'estimated',
        summary: `US real 10Y is ${macro?.rates?.real10y ?? 'n/a'} with ${macro?.inferred?.realYieldPressure ?? 'unknown'} pressure and a ${macro?.rates?.curveShape ?? 'unknown'} 2s10s curve at ${macro?.rates?.curve2s10s ?? 'n/a'}.`,
        sources: ['FRED DFII10', 'FRED DGS2', 'FRED DGS10'],
        signalStrength: macro?.inferred?.realYieldPressure === 'restrictive' ? 78 : 62,
      }),
      buildItem({
        key: 'dollar',
        label: 'Dollar Regime',
        state: macro?.inferred?.dollarRegime ?? 'unknown',
        status: 'confirmed',
        summary: `Dollar regime is ${macro?.inferred?.dollarRegime ?? 'unknown'} with DXY change ${macro?.confirmed?.dxyChange ?? 'n/a'}% and dollar-liquidity pressure ${macro?.inferred?.dollarLiquidityPressure ?? 'unknown'}.`,
        sources: ['Yahoo DXY chart', 'Macro signal engine'],
        signalStrength: macro?.inferred?.dollarRegime === 'strong-dollar' ? 76 : macro?.inferred?.dollarRegime === 'weak-dollar' ? 72 : 56,
      }),
      buildItem({
        key: 'options',
        label: 'Options / Dealers',
        state: `${flowProxy?.dealerPositioning ?? 'unknown'} / ${flowProxy?.squeezeRisk ?? 'unknown'} squeeze risk`,
        status: 'estimated',
        summary: `Dealer posture reads ${flowProxy?.dealerPositioning ?? 'unknown'} with ${flowProxy?.flowBias ?? 'unknown'}, gamma flip ${gamma?.gammaFlip ?? 'n/a'}, corridor width ${dealer?.dealerCorridorWidth ?? 'n/a'}, and ${flowProxy?.squeezeRisk ?? 'unknown'} squeeze risk.`,
        sources: [
          flowProxy?.sourceLabel,
          gamma?.sourceLabel,
          dealer?.sourceLabel,
          flowProxy?.surfaceFit?.quality ? `Smile fit ${flowProxy.surfaceFit.quality}` : null,
        ],
        mode: flowProxy?.mode,
        signalStrength: flowProxy?.squeezeRisk === 'high' ? 80 : 66,
        caveatPenalty: 6,
      }),
      buildItem({
        key: 'cot',
        label: 'COT / Positioning',
        state: positioningRegime?.regime ?? 'unavailable',
        status: cotSummary ? 'confirmed' : 'estimated',
        summary: cotSummary
          ? `${cotSummary.summary} ${cotSummary.marketImpact ?? ''} Positioning regime is ${positioningRegime?.regime ?? 'unknown'} with bias ${positioningRegime?.bias ?? 'unknown'}, commercial change ${cotSummary.commercialChange ?? 'n/a'}, and spec change ${cotSummary.change ?? 'n/a'} contracts.`
          : 'Official COT context is not configured for this market mapping yet.',
        sources: cotSummary ? [cotSummary.source, positioningRegime?.source] : ['CFTC unavailable for this market mapping'],
        signalStrength: cotSummary?.crowdedRisk === 'high' ? 76 : cotSummary ? 64 : 28,
        caveatPenalty: cotSummary ? 0 : 14,
      }),
      buildItem({
        key: 'liquidity',
        label: 'Orderflow / Liquidity Map',
        state: orderflow?.dominance ?? pressure?.dominance ?? 'unknown',
        status: orderflow?.feedQuality === 'strong' ? 'confirmed' : orderflow?.feedQuality === 'usable' ? 'derived' : 'estimated',
        summary: `${orderflow?.liquidityMapSummary ?? 'Liquidity map unavailable.'} Value area is ${profile?.valueAreaPosition ?? 'unknown'}, structure is ${pivots?.structure ?? 'unknown'}, and stop-cluster bias is ${orderflow?.stopClusterBias ?? 'unknown'}.`,
        sources: [
          orderflow?.sourceLabel,
          pressure?.sourceLabel,
          'Session highs/lows',
          'Volume profile',
          'Mapped pivots',
        ],
        mode: orderflow?.mode,
        feedQuality: orderflow?.feedQuality,
        signalStrength: orderflow?.liquiditySweepRisk === 'elevated' ? 78 : 64,
      }),
      buildItem({
        key: 'policy',
        label: 'Central Bank / Policy',
        state: macroFocus?.bias ? `${macro?.inferred?.policyDivergence ?? 'unknown'} / ${macroFocus.bias}` : (macro?.inferred?.policyDivergence ?? 'unknown'),
        status: macro?.policy?.fedRate != null ? 'confirmed' : 'estimated',
        summary: `${macroFocus?.summary ?? `Policy divergence reads ${macro?.inferred?.policyDivergence ?? 'unknown'}.`} ${ratesFocus?.summary ?? ''} Fed ${macro?.policy?.fedRate ?? 'n/a'}%, ECB ${macro?.policy?.ecbRate ?? 'n/a'}%, BOE ${macro?.policy?.boeRate ?? 'n/a'}%, BOJ ${macro?.policy?.bojRate ?? 'n/a'}%, and next event ${nextEvent ? `${nextEvent.currency} ${nextEvent.event}` : 'none on the near tape'}.`.trim(),
        sources: ['BIS policy rates', 'Economic calendar'],
        signalStrength: Number(nextEvent?.importance ?? 0) >= 3 ? 80 : Math.max(52, macroFocus?.convictionScore ?? 68),
      }),
      buildItem({
        key: 'stress',
        label: 'Geopolitical / Cross-Asset Stress',
        state: macro?.inferred?.geopoliticalStress ?? 'unknown',
        status: 'derived',
        summary: `${tension?.conclusion ?? 'Proxy geopolitical stress unavailable.'} Cross-asset regime is ${crossAsset?.regime ?? 'unknown'} and safe-haven pressure is ${safeHaven?.conclusion ?? 'unknown'} at score ${safeHaven?.score ?? 'n/a'}.`,
        sources: [
          'Yahoo gold chart',
          'Yahoo oil chart',
          'Yahoo VIX chart',
          'Yahoo DXY chart',
          'Safe-haven pressure engine',
        ],
        signalStrength: tension?.score ?? 58,
      }),
    ];

    const alerts = [
      macro?.inferred?.realYieldPressure === 'restrictive' ? 'Real-yield pressure is still restrictive and can lean against duration-sensitive risk and dollar-funded longs.' : null,
      macro?.inferred?.dollarRegime === 'strong-dollar' ? 'Dollar regime is firm, so non-USD risk and gold need stronger flow confirmation.' : null,
      flowProxy?.squeezeRisk === 'high' ? 'Short-gamma-like conditions raise stop-hunt and acceleration risk.' : null,
      orderflow?.liquiditySweepRisk === 'elevated' ? `Liquidity sweep risk is elevated around ${orderflow?.stopClusterAbove ?? 'n/a'} / ${orderflow?.stopClusterBelow ?? 'n/a'}.` : null,
      Number(nextEvent?.importance ?? 0) >= 3 && nextEvent ? `High-impact calendar risk is live through ${nextEvent.currency} ${nextEvent.event}.` : null,
      macro?.inferred?.geopoliticalStress === 'elevated' ? 'Cross-asset geopolitical stress is elevated and can distort normal intraday behavior.' : null,
      ratesFocus?.repricingRisk === 'high' ? `${ratesFocus.pair} is trading against or well beyond the current policy-rate gap, so repricing risk is elevated.` : null,
      macroFocus?.blindspots?.[0] ?? null,
    ].filter((item): item is string => Boolean(item));

    const strongest = [...items]
      .sort((left, right) => right.confidenceScore - left.confidenceScore)
      .slice(0, 3)
      .map((item) => `${item.label}: ${item.state}`);

    return {
      generatedAt: new Date().toISOString(),
      market,
      timeframe,
      summary: `Vaultum institutional monitor for ${market} is anchored by ${strongest.join(' | ')}${ratesFocus?.summary ? ` | rates board ${ratesFocus.summary}` : ''}.`,
      sourceLabel: 'Vaultum institutional monitor combines rates, dollar regime, cross-country rates differentials when relevant, options/dealers, COT, liquidity map, policy divergence, and cross-asset stress into one confidence-scored stack.',
      items,
      alerts,
    };
  }, 180);
}
