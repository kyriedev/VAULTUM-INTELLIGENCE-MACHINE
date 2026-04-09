import { REGIME_CONFIG, REGIME_PROXY_ORDER, type RegimeClassification, type RegimeProxyId } from '../../../../src/config/regime.ts';
import type {
  BrokerVolumeEnhancement,
  NormalizedMarketSeries,
  ProviderHealthSnapshot,
} from '../../../../src/lib/market/types.ts';

type ProxySeriesMap = Record<RegimeProxyId, NormalizedMarketSeries | null>;
type ProviderHealthMap = Record<'finnhub' | 'alphavantage' | 'yahooRelay', ProviderHealthSnapshot>;

type SyntheticFlowSnapshot = {
  intensity: number;
  direction: 'risk-on-expansion' | 'risk-off-expansion' | 'reversal' | 'balanced';
  label: 'low' | 'moderate' | 'high';
  note: string;
  components: {
    velocity: number;
    rangeExpansion: number;
    volatilityExpansion: number;
    confirmation: number;
    persistence: number;
    reversalPressure: number;
  };
  brokerEnhanced: boolean;
};

type FactorScoreSnapshot = {
  liquidityScore: number;
  riskScore: number;
  volatilityScore: number;
  correlationScore: number;
  confidenceScore: number;
  compositeScore: number;
};

export type CrossAssetRegimeSnapshot = {
  classification: RegimeClassification;
  regime: RegimeClassification;
  regimeLabel: string;
  riskState: 'risk-on' | 'risk-off' | 'neutral' | 'transition';
  componentScores: FactorScoreSnapshot;
  syntheticFlow: SyntheticFlowSnapshot;
  drivers: string[];
  warnings: string[];
  providerHealth: ProviderHealthMap;
  timestamp: string;
  lookbacksUsed: {
    returns: number[];
    atr: number;
    correlation: number;
    persistence: number;
  };
  proxies: Record<RegimeProxyId, {
    label: string;
    symbol: string | null;
    source: string | null;
    last: number | null;
    changePct: number | null;
    atr: number | null;
    rangePct: number | null;
    timestamp: string | null;
    returns: Record<string, number | null>;
  }>;
  supporting: {
    dxy: number | null;
    gold: number | null;
    us10y: number | null;
    spx: number | null;
    ndx: number | null;
    vix: number | null;
    btc: number | null;
    oil: number | null;
    jpy: number | null;
  };
  optionalEnhancements: {
    brokerVolume: BrokerVolumeEnhancement;
  };
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function average(values: Array<number | null | undefined>): number | null {
  const usable = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!usable.length) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function minMax(values: number[]): { min: number; max: number } | null {
  if (!values.length) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

function scoreCentered(value: number | null, scale: number): number {
  if (value == null) return 50;
  return round(clamp(50 + ((value / scale) * 50), 0, 100), 1);
}

function scorePositive(value: number | null, scale: number): number {
  if (value == null) return 50;
  return round(clamp((value / scale) * 100, 0, 100), 1);
}

function centeredFromScore(score: number): number {
  return score - 50;
}

function returnOf(series: NormalizedMarketSeries | null, window: number): number | null {
  return series?.returns?.[`${window}d`] ?? null;
}

function stateLabel(classification: RegimeClassification): string {
  switch (classification) {
    case 'RISK_ON':
      return 'Risk On';
    case 'RISK_OFF':
      return 'Risk Off';
    case 'NEUTRAL':
      return 'Neutral';
    default:
      return 'Transition';
  }
}

function riskState(classification: RegimeClassification): CrossAssetRegimeSnapshot['riskState'] {
  switch (classification) {
    case 'RISK_ON':
      return 'risk-on';
    case 'RISK_OFF':
      return 'risk-off';
    case 'NEUTRAL':
      return 'neutral';
    default:
      return 'transition';
  }
}

function agreementScore(values: Array<number | null | undefined>, targetPositive: boolean): number {
  const usable = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!usable.length) return 50;
  const matches = usable.filter((value) => (targetPositive ? value >= 0 : value <= 0)).length;
  return round((matches / usable.length) * 100, 1);
}

function freshestTimestamp(seriesMap: ProxySeriesMap): string {
  const timestamps = REGIME_PROXY_ORDER
    .map((proxy) => seriesMap[proxy]?.timestamp)
    .filter((value): value is string => Boolean(value))
    .sort();
  return timestamps[timestamps.length - 1] ?? new Date().toISOString();
}

export function calculateSyntheticFlow(
  seriesMap: ProxySeriesMap,
  compositeBias: number,
  brokerVolume: BrokerVolumeEnhancement,
): SyntheticFlowSnapshot {
  const riskAssets: RegimeProxyId[] = ['spx', 'nasdaq', 'btc'];
  const velocity = scorePositive(
    average(riskAssets.map((asset) => Math.abs(seriesMap[asset]?.derived.velocity ?? 0))),
    REGIME_CONFIG.normalization.shortMoveScale,
  );
  const rangeExpansion = scorePositive(
    average(riskAssets.map((asset) => (seriesMap[asset]?.derived.rangeExpansion ?? 1) - 1)),
    REGIME_CONFIG.normalization.volatilityScale,
  );
  const volatilityExpansion = scorePositive(
    average(['spx', 'nasdaq', 'btc', 'gold', 'oil'].map((asset) => (seriesMap[asset as RegimeProxyId]?.derived.atrExpansion ?? 1) - 1)),
    REGIME_CONFIG.normalization.volatilityScale,
  );

  const targetPositive = compositeBias >= 0;
  const confirmation = average([
    agreementScore([returnOf(seriesMap.spx, 20), returnOf(seriesMap.nasdaq, 20), returnOf(seriesMap.btc, 20)], targetPositive),
    agreementScore([returnOf(seriesMap.usd, 20), returnOf(seriesMap.jpy, 20), returnOf(seriesMap.volatility, 20)], !targetPositive),
  ]) ?? 50;

  const persistence = average(riskAssets.map((asset) => seriesMap[asset]?.derived.persistence)) ?? 50;
  const reversalPressure = average(riskAssets.map((asset) => seriesMap[asset]?.derived.reversalPressure)) ?? 0;

  let intensity = round(
    (velocity * REGIME_CONFIG.factors.syntheticFlow.velocity)
    + (rangeExpansion * REGIME_CONFIG.factors.syntheticFlow.rangeExpansion)
    + (volatilityExpansion * REGIME_CONFIG.factors.syntheticFlow.volatilityExpansion)
    + (confirmation * REGIME_CONFIG.factors.syntheticFlow.confirmation)
    + (persistence * REGIME_CONFIG.factors.syntheticFlow.persistence)
    + (reversalPressure * REGIME_CONFIG.factors.syntheticFlow.reversalPressure),
    1,
  );

  let brokerEnhanced = false;
  if (brokerVolume.available && brokerVolume.flowScore != null) {
    intensity = round(clamp((intensity * 0.88) + (brokerVolume.flowScore * 0.12), 0, 100), 1);
    brokerEnhanced = true;
  }

  const direction =
    reversalPressure >= 60 && confirmation < 54
      ? 'reversal'
      : compositeBias >= 0 && confirmation >= 54
        ? 'risk-on-expansion'
        : compositeBias < 0 && confirmation >= 54
          ? 'risk-off-expansion'
          : 'balanced';

  const label = intensity >= 72 ? 'high' : intensity >= 50 ? 'moderate' : 'low';
  const note =
    direction === 'reversal'
      ? 'Derived flow is energetic but reversal pressure is high, so follow-through quality is unstable.'
      : direction === 'risk-on-expansion'
        ? 'Derived flow is leaning into constructive cross-asset expansion.'
        : direction === 'risk-off-expansion'
          ? 'Derived flow is leaning into defensive / risk-off expansion.'
          : 'Derived flow is balanced and should be treated as confirmation, not a primary signal.';

  return {
    intensity,
    direction,
    label,
    note,
    components: {
      velocity,
      rangeExpansion,
      volatilityExpansion,
      confirmation: round(confirmation, 1),
      persistence: round(persistence, 1),
      reversalPressure: round(reversalPressure, 1),
    },
    brokerEnhanced,
  };
}

export function calculateConfidenceScore(
  factorScores: Omit<FactorScoreSnapshot, 'confidenceScore' | 'compositeScore'>,
  seriesMap: ProxySeriesMap,
  providerHealth: ProviderHealthMap,
  classificationHint: RegimeClassification,
): number {
  const usableFactors = [
    factorScores.liquidityScore,
    factorScores.riskScore,
    factorScores.volatilityScore,
    factorScores.correlationScore,
  ];
  const factorSpan = minMax(usableFactors);
  const factorAgreement = factorSpan ? clamp(100 - ((factorSpan.max - factorSpan.min) * 1.2), 0, 100) : 50;
  const freshnessScore = average(REGIME_PROXY_ORDER.map((proxy) => {
    const freshnessDays = (seriesMap[proxy]?.freshnessMs ?? (7 * 24 * 60 * 60 * 1000)) / (24 * 60 * 60 * 1000);
    return clamp(100 - (freshnessDays * 18), 0, 100);
  })) ?? 40;
  const completenessScore = round((REGIME_PROXY_ORDER.filter((proxy) => Boolean(seriesMap[proxy])).length / REGIME_PROXY_ORDER.length) * 100, 1);

  const fallbackHits = providerHealth.alphavantage.successes + providerHealth.yahooRelay.successes;
  const staleHits = providerHealth.finnhub.staleHits + providerHealth.alphavantage.staleHits + providerHealth.yahooRelay.staleHits;
  const failures = providerHealth.finnhub.failures + providerHealth.alphavantage.failures + providerHealth.yahooRelay.failures;
  const providerAgreement = clamp(92 - (fallbackHits * 6) - (staleHits * 8) - (failures * 6), 18, 95);

  let score = round(
    (factorAgreement * REGIME_CONFIG.confidence.factorAgreementWeight)
    + (freshnessScore * REGIME_CONFIG.confidence.freshnessWeight)
    + (providerAgreement * REGIME_CONFIG.confidence.providerAgreementWeight)
    + (completenessScore * REGIME_CONFIG.confidence.completenessWeight),
    1,
  );

  const missingSeries = REGIME_PROXY_ORDER.filter((proxy) => !seriesMap[proxy]).length;
  score -= missingSeries * REGIME_CONFIG.confidence.missingSeriesPenalty;
  score -= staleHits * REGIME_CONFIG.confidence.stalePenalty;
  if (classificationHint === 'TRANSITION') score -= REGIME_CONFIG.confidence.transitionPenalty;

  return round(clamp(score, 0, 100), 1);
}

export function classifyCrossAssetRegime(input: {
  liquidityScore: number;
  riskScore: number;
  volatilityScore: number;
  correlationScore: number;
  syntheticFlow: SyntheticFlowSnapshot;
  confidenceScore: number;
}): { classification: RegimeClassification; compositeScore: number } {
  const baseComposite = round(
    (centeredFromScore(input.liquidityScore) * 0.32)
    + (centeredFromScore(input.riskScore) * 0.32)
    + (centeredFromScore(input.volatilityScore) * 0.20)
    + (centeredFromScore(input.correlationScore) * 0.16),
    1,
  );

  const flowAdjustment =
    input.syntheticFlow.direction === 'risk-on-expansion'
      ? input.syntheticFlow.intensity * 0.08
      : input.syntheticFlow.direction === 'risk-off-expansion'
        ? -input.syntheticFlow.intensity * 0.08
        : 0;
  const compositeScore = round(baseComposite + flowAdjustment, 1);

  const disagreement =
    Math.abs(input.liquidityScore - input.riskScore) > 30
    || Math.abs(input.riskScore - input.volatilityScore) > 40;

  const lowConfidence = input.confidenceScore < REGIME_CONFIG.classification.minimumConfidence;
  const transition =
    Math.abs(compositeScore) <= REGIME_CONFIG.classification.transitionBand
    || input.syntheticFlow.direction === 'reversal'
    || disagreement
    || lowConfidence;

  if (transition) return { classification: 'TRANSITION', compositeScore };
  if (compositeScore >= REGIME_CONFIG.classification.riskOnThreshold) return { classification: 'RISK_ON', compositeScore };
  if (compositeScore <= REGIME_CONFIG.classification.riskOffThreshold) return { classification: 'RISK_OFF', compositeScore };
  return { classification: 'NEUTRAL', compositeScore };
}

function buildDrivers(seriesMap: ProxySeriesMap, classification: RegimeClassification, scores: FactorScoreSnapshot, syntheticFlow: SyntheticFlowSnapshot): string[] {
  const drivers: string[] = [];
  const usd20 = returnOf(seriesMap.usd, 20);
  const rates20 = returnOf(seriesMap.rates, 20);
  const spx20 = returnOf(seriesMap.spx, 20);
  const qqq20 = returnOf(seriesMap.nasdaq, 20);
  const btc20 = returnOf(seriesMap.btc, 20);
  const gold20 = returnOf(seriesMap.gold, 20);
  const vixy20 = returnOf(seriesMap.volatility, 20);

  if (usd20 != null && Math.abs(usd20) >= 1.2) {
    drivers.push(`Dollar proxy is ${usd20 >= 0 ? 'firmer' : 'softer'} by ${round(Math.abs(usd20), 2)}% over 20d, shaping the liquidity backdrop.`);
  }
  if (rates20 != null && Math.abs(rates20) >= 1) {
    drivers.push(`US duration proxy moved ${rates20 >= 0 ? 'higher' : 'lower'} by ${round(Math.abs(rates20), 2)}% over 20d, implying ${rates20 >= 0 ? 'easier' : 'tighter'} yield pressure.`);
  }
  if (spx20 != null && qqq20 != null) {
    drivers.push(`SPY ${round(spx20, 2)}% and QQQ ${round(qqq20, 2)}% over 20d show ${Math.sign(spx20) === Math.sign(qqq20) ? 'aligned' : 'split'} equity leadership.`);
  }
  if (btc20 != null && Math.abs(btc20) >= 2) {
    drivers.push(`Bitcoin proxy is ${btc20 >= 0 ? 'participating' : 'fading'} at ${round(btc20, 2)}% over 20d, reinforcing the cross-asset risk read.`);
  }
  if (gold20 != null && Math.abs(gold20) >= 1.5) {
    drivers.push(`Gold proxy is ${gold20 >= 0 ? 'firm' : 'soft'} by ${round(Math.abs(gold20), 2)}% over 20d, which matters for the haven / inflation mix.`);
  }
  if (vixy20 != null && Math.abs(vixy20) >= 1.5) {
    drivers.push(`Volatility proxy moved ${vixy20 >= 0 ? 'up' : 'down'} ${round(Math.abs(vixy20), 2)}% over 20d, affecting regime quality.`);
  }
  drivers.push(`Liquidity ${round(scores.liquidityScore, 1)}, risk ${round(scores.riskScore, 1)}, volatility stability ${round(scores.volatilityScore, 1)}, and correlation ${round(scores.correlationScore, 1)} combine into ${stateLabel(classification)}.`);
  drivers.push(`Synthetic flow is ${syntheticFlow.label} intensity (${round(syntheticFlow.intensity, 1)}) in ${syntheticFlow.direction} mode.`);
  return drivers.slice(0, 6);
}

function buildWarnings(
  seriesMap: ProxySeriesMap,
  providerHealth: ProviderHealthMap,
  scores: FactorScoreSnapshot,
  classification: RegimeClassification,
  syntheticFlow: SyntheticFlowSnapshot,
  brokerVolume: BrokerVolumeEnhancement,
): string[] {
  const warnings: string[] = [];
  const missing = REGIME_PROXY_ORDER.filter((proxy) => !seriesMap[proxy]);
  if (missing.length) warnings.push(`Missing proxy inputs: ${missing.join(', ')}.`);
  if (providerHealth.alphavantage.state !== 'inactive' && providerHealth.alphavantage.state !== 'active') {
    warnings.push(`Alpha Vantage health is ${providerHealth.alphavantage.state}; the engine may be leaning on fallback data.`);
  }
  if (providerHealth.yahooRelay.state === 'stale' || providerHealth.finnhub.state === 'stale') {
    warnings.push('One or more proxy feeds were served from stale cache after an upstream miss.');
  }
  if (scores.confidenceScore < REGIME_CONFIG.classification.minimumConfidence) {
    warnings.push(`Confidence is only ${round(scores.confidenceScore, 1)}, so treat regime classification as a filter rather than a trigger.`);
  }
  if (classification === 'TRANSITION') {
    warnings.push('Cross-asset factors are mixed enough to classify the regime as transition rather than stable risk-on or risk-off.');
  }
  if (syntheticFlow.direction === 'reversal') {
    warnings.push('Derived flow is showing reversal pressure, so continuation setups need tighter confirmation.');
  }
  if (brokerVolume.warning) warnings.push(brokerVolume.warning);
  return warnings.slice(0, 6);
}

function proxyView(seriesMap: ProxySeriesMap): CrossAssetRegimeSnapshot['proxies'] {
  return Object.fromEntries(REGIME_PROXY_ORDER.map((proxy) => {
    const series = seriesMap[proxy];
    return [proxy, {
      label: series?.label ?? proxy,
      symbol: series?.sourceSymbol ?? null,
      source: series?.source ?? null,
      last: series?.last ?? null,
      changePct: series?.changePct ?? null,
      atr: series?.atr ?? null,
      rangePct: series?.rangePct ?? null,
      timestamp: series?.timestamp ?? null,
      returns: series?.returns ?? {},
    }];
  })) as CrossAssetRegimeSnapshot['proxies'];
}

export function buildCrossAssetRegimeSnapshot(input: {
  seriesMap: ProxySeriesMap;
  providerHealth: ProviderHealthMap;
  brokerVolume: BrokerVolumeEnhancement;
}): CrossAssetRegimeSnapshot {
  const usd20 = returnOf(input.seriesMap.usd, 20) ?? 0;
  const rates20 = returnOf(input.seriesMap.rates, 20) ?? 0;
  const spx20 = returnOf(input.seriesMap.spx, 20) ?? 0;
  const qqq20 = returnOf(input.seriesMap.nasdaq, 20) ?? 0;
  const btc20 = returnOf(input.seriesMap.btc, 20) ?? 0;
  const gold20 = returnOf(input.seriesMap.gold, 20) ?? 0;
  const oil20 = returnOf(input.seriesMap.oil, 20) ?? 0;
  const jpy20 = returnOf(input.seriesMap.jpy, 20) ?? 0;
  const vol5 = returnOf(input.seriesMap.volatility, 5) ?? 0;
  const vol20 = returnOf(input.seriesMap.volatility, 20) ?? 0;

  const liquidityRaw =
    (-usd20 * REGIME_CONFIG.factors.liquidity.usd)
    + (rates20 * REGIME_CONFIG.factors.liquidity.rates)
    + (spx20 * REGIME_CONFIG.factors.liquidity.spx)
    + (qqq20 * REGIME_CONFIG.factors.liquidity.nasdaq)
    + (-vol5 * REGIME_CONFIG.factors.liquidity.volatility);
  const liquidityScore = scoreCentered(liquidityRaw, REGIME_CONFIG.normalization.mediumMoveScale);

  const goldRiskContribution = (usd20 > 0 || vol20 > 0 ? -gold20 * 0.55 : gold20 * 0.35);
  const riskRaw =
    (spx20 * REGIME_CONFIG.factors.risk.spx)
    + (qqq20 * REGIME_CONFIG.factors.risk.nasdaq)
    + (btc20 * REGIME_CONFIG.factors.risk.btc)
    + (goldRiskContribution * REGIME_CONFIG.factors.risk.gold)
    + (-usd20 * REGIME_CONFIG.factors.risk.usd)
    + (-jpy20 * REGIME_CONFIG.factors.risk.jpy);
  const riskScore = scoreCentered(riskRaw, REGIME_CONFIG.normalization.longMoveScale);

  const atrExpansion = average(['spx', 'nasdaq', 'btc', 'gold', 'oil'].map((proxy) => (input.seriesMap[proxy as RegimeProxyId]?.derived.atrExpansion ?? 1) - 1));
  const rangeExpansion = average(['spx', 'nasdaq', 'btc', 'gold', 'oil'].map((proxy) => (input.seriesMap[proxy as RegimeProxyId]?.derived.rangeExpansion ?? 1) - 1));
  const abruptMove = average(['spx', 'nasdaq', 'btc', 'gold', 'usd', 'volatility'].map((proxy) => Math.abs(returnOf(input.seriesMap[proxy as RegimeProxyId], 1) ?? 0)));

  const volatilityStress = round(
    (scorePositive(atrExpansion, REGIME_CONFIG.normalization.volatilityScale) * REGIME_CONFIG.factors.volatility.atrExpansion)
    + (scorePositive(rangeExpansion, REGIME_CONFIG.normalization.volatilityScale) * REGIME_CONFIG.factors.volatility.rangeExpansion)
    + (scorePositive(abruptMove, REGIME_CONFIG.normalization.mediumMoveScale) * REGIME_CONFIG.factors.volatility.abruptMove),
    1,
  );
  const volatilityScore = round(clamp(100 - volatilityStress, 0, 100), 1);

  const equitiesAgreement = average([
    agreementScore([spx20, qqq20], true),
    agreementScore([spx20, qqq20, btc20], average([spx20, qqq20, btc20]) != null ? average([spx20, qqq20, btc20])! >= 0 : true),
  ]) ?? 50;
  const havenVsRisk =
    average([spx20, qqq20, btc20])! >= 0
      ? average([agreementScore([usd20, jpy20, vol20], false), agreementScore([gold20], true)]) ?? 50
      : average([agreementScore([usd20, jpy20, vol20], true), agreementScore([gold20], true)]) ?? 50;
  const usdVsRisk = average([agreementScore([usd20], average([spx20, qqq20, btc20])! < 0), agreementScore([vol20], average([spx20, qqq20, btc20])! < 0)]) ?? 50;
  const oilVsGrowth = agreementScore([oil20], average([spx20, qqq20])! >= 0);
  const correlationScore = round(
    (equitiesAgreement * REGIME_CONFIG.factors.correlation.equities)
    + (havenVsRisk * REGIME_CONFIG.factors.correlation.havenVsRisk)
    + (usdVsRisk * REGIME_CONFIG.factors.correlation.usdVsRisk)
    + (oilVsGrowth * REGIME_CONFIG.factors.correlation.oilVsGrowth),
    1,
  );

  const provisionalSynthetic = calculateSyntheticFlow(input.seriesMap, round(
    (centeredFromScore(liquidityScore) * 0.5) + (centeredFromScore(riskScore) * 0.5),
    1,
  ), input.brokerVolume);

  const provisionalClassification = classifyCrossAssetRegime({
    liquidityScore,
    riskScore,
    volatilityScore,
    correlationScore,
    syntheticFlow: provisionalSynthetic,
    confidenceScore: 100,
  }).classification;

  const confidenceScore = calculateConfidenceScore(
    { liquidityScore, riskScore, volatilityScore, correlationScore },
    input.seriesMap,
    input.providerHealth,
    provisionalClassification,
  );

  const { classification, compositeScore } = classifyCrossAssetRegime({
    liquidityScore,
    riskScore,
    volatilityScore,
    correlationScore,
    syntheticFlow: provisionalSynthetic,
    confidenceScore,
  });

  const componentScores: FactorScoreSnapshot = {
    liquidityScore,
    riskScore,
    volatilityScore,
    correlationScore,
    confidenceScore,
    compositeScore,
  };

  const drivers = buildDrivers(input.seriesMap, classification, componentScores, provisionalSynthetic);
  const warnings = buildWarnings(input.seriesMap, input.providerHealth, componentScores, classification, provisionalSynthetic, input.brokerVolume);

  return {
    classification,
    regime: classification,
    regimeLabel: stateLabel(classification),
    riskState: riskState(classification),
    componentScores,
    syntheticFlow: provisionalSynthetic,
    drivers,
    warnings,
    providerHealth: input.providerHealth,
    timestamp: freshestTimestamp(input.seriesMap),
    lookbacksUsed: {
      returns: [...REGIME_CONFIG.windows.returnWindows],
      atr: REGIME_CONFIG.windows.atrPeriod,
      correlation: REGIME_CONFIG.windows.correlationWindow,
      persistence: REGIME_CONFIG.windows.persistenceWindow,
    },
    proxies: proxyView(input.seriesMap),
    supporting: {
      dxy: input.seriesMap.usd?.changePct ?? null,
      gold: input.seriesMap.gold?.changePct ?? null,
      us10y: input.seriesMap.rates?.changePct != null ? round(-input.seriesMap.rates.changePct, 2) : null,
      spx: input.seriesMap.spx?.changePct ?? null,
      ndx: input.seriesMap.nasdaq?.changePct ?? null,
      vix: input.seriesMap.volatility?.changePct ?? null,
      btc: input.seriesMap.btc?.changePct ?? null,
      oil: input.seriesMap.oil?.changePct ?? null,
      jpy: input.seriesMap.jpy?.changePct ?? null,
    },
    optionalEnhancements: {
      brokerVolume: input.brokerVolume,
    },
  };
}
