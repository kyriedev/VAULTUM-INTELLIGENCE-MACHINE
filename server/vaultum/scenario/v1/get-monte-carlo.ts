import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { normalizeVaultumTimeframe, structuralTimeframeFor } from '../../_shared/timeframes';
import { getEconomicCalendar } from '../../calendar/v1/get-economic-calendar';
import { getMacroSignals } from '../../macro/v1/get-macro-signals';
import { blackScholes, normCdf } from '../../options/v1/_math';
import { getFlowProxy } from '../../options/v1/get-flow-proxy';
import { getOrderflowEngine } from '../../orderflow/v1/get-engine';
import { getLevels } from '../../pivots/v1/get-levels';
import { getBuyerSellerPressure } from '../../pressure/v1/get-buyer-seller-pressure';
import { getProfile } from '../../volume/v1/get-profile';
import { runMonteCarloEngine } from './_engine';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function timeframeConfig(timeframe: string): { steps: number; label: string } {
  switch ((timeframe || '1h').toLowerCase()) {
    case '15m':
      return { steps: 24, label: 'next 6 hours' };
    case '30m':
      return { steps: 24, label: 'next 12 hours' };
    case '4h':
      return { steps: 18, label: 'next 3 sessions' };
    case '1d':
      return { steps: 15, label: 'next 3 trading weeks' };
    default:
      return { steps: 24, label: 'next 24 hours' };
  }
}

function timeframeBenchmarkSpec(timeframe: string): { horizonDays: number; timeYears: number } {
  switch ((timeframe || '1h').toLowerCase()) {
    case '15m':
      return { horizonDays: 0.25, timeYears: Math.max(0.25 / 252, 1 / 3650) };
    case '30m':
      return { horizonDays: 0.5, timeYears: Math.max(0.5 / 252, 1 / 3650) };
    case '4h':
      return { horizonDays: 3, timeYears: 3 / 252 };
    case '1d':
      return { horizonDays: 15, timeYears: 15 / 252 };
    default:
      return { horizonDays: 1, timeYears: 1 / 252 };
  }
}

function resolveBenchmarkVolPct(input: {
  optionsVolPct?: number | null;
  currentPrice: number;
  atr: number;
  volatilityScore: number;
  rangeExpansion?: number | null;
}): number {
  const optionsVolPct = Number(input.optionsVolPct ?? 0);
  const realizedVolPct = (input.atr / Math.max(input.currentPrice, 0.0001)) * Math.sqrt(252) * 100;
  const blendedBase = optionsVolPct > 0 ? optionsVolPct : realizedVolPct;
  const scoreAdjustment = 1 + ((input.volatilityScore - 50) / 400);
  const expansionAdjustment = 1 + (Math.max((input.rangeExpansion ?? 1) - 1, 0) * 0.18);
  return clamp(blendedBase * scoreAdjustment * expansionAdjustment, 6, 180);
}

function terminalProbability(input: {
  spot: number;
  level: number | null;
  timeYears: number;
  rate: number;
  volatility: number;
  direction: 'above' | 'below';
}): number | null {
  if (input.level == null || !Number.isFinite(input.level) || input.level <= 0) return null;
  const spot = Math.max(input.spot, 0.0001);
  const sigma = Math.max(input.volatility, 0.01);
  const timeYears = Math.max(input.timeYears, 1 / 3650);
  const denominator = sigma * Math.sqrt(timeYears);
  const numerator = Math.log(input.level / spot) - ((input.rate - 0.5 * sigma * sigma) * timeYears);
  const zScore = numerator / Math.max(denominator, 1e-9);
  const probability = input.direction === 'above'
    ? 1 - normCdf(zScore)
    : normCdf(zScore);
  return Number((clamp(probability, 0, 1) * 100).toFixed(1));
}

async function settleOrFallback<T>(task: () => Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
  try {
    return await Promise.race([
      task(),
      new Promise<T>((resolve) => {
        setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } catch {
    return fallback;
  }
}

export async function getMonteCarloScenario(input: { market?: string; timeframe?: string; simulations?: number }): Promise<{
  market: string;
  timeframe: string;
  simulations: number;
  horizonLabel: string;
  pathMethod: string;
  scenarioQuality: 'high' | 'medium' | 'cautious';
  currentPrice: number;
  pathBias: string;
  driftScore: number;
  volatilityScore: number;
  targetLevel: number | null;
  invalidationLevel: number | null;
  supportLevel: number | null;
  supportHoldProbability: number;
  targetHitProbability: number;
  invalidationProbability: number;
  upsideExtensionProbability: number;
  targetFirstProbability: number;
  invalidationFirstProbability: number;
  breakEvenProbability: number;
  medianMaxDrawdownPct: number;
  tailLossPct: number;
  expectedMovePct: number;
  expectedClose: number;
  confidenceBand: string;
  regimeMix: {
    trend: number;
    meanReversion: number;
    shock: number;
  };
  scenarioBands: {
    p05: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
  };
  scenarioMap: Array<{
    name: string;
    probability: number;
    detail: string;
  }>;
  benchmark: {
    model: string;
    horizonDays: number;
    driftRatePct: number;
    annualizedVolPct: number;
    expectedMove: number;
    expectedMovePct: number;
    terminalAboveTargetProbability: number | null;
    terminalBelowInvalidationProbability: number | null;
    atmCallPremium: number;
    atmPutPremium: number;
    targetHitVsNeutralTerminalDiff: number | null;
    invalidationVsNeutralTerminalDiff: number | null;
    summary: string;
  };
  drivers: string[];
  sourceLabel: string;
  summary: string;
}> {
  const market = String(input.market || 'XAUUSD').toUpperCase();
  const timeframe = normalizeVaultumTimeframe(input.timeframe);
  const simulations = clamp(Number(input.simulations || 350), 200, 900);

  return getCachedOrCompute(cacheKey('scenario', `monte-carlo:${market}:${timeframe}:${simulations}`), async () => {
    const structuralTimeframe = structuralTimeframeFor(timeframe);
    const [{ steps, label }, macro, flow, orderflow, pivots, pressure, profile, calendar] = await Promise.all([
      Promise.resolve(timeframeConfig(timeframe)),
      settleOrFallback(() => getMacroSignals({ market }), null, 18_000),
      settleOrFallback(() => getFlowProxy({ symbol: market }), null, 25_000),
      settleOrFallback(() => getOrderflowEngine({ market, timeframe }), null, 25_000),
      settleOrFallback(() => getLevels({ market, timeframe: structuralTimeframe }), null, 22_000),
      settleOrFallback(() => getBuyerSellerPressure({ market, timeframe, mode: 'auto' }), null, 22_000),
      settleOrFallback(() => getProfile({ market, timeframe: structuralTimeframe }), null, 22_000),
      settleOrFallback(() => getEconomicCalendar({ market }), null, 12_000),
    ]);

    const currentPrice = Number((flow?.price ?? orderflow?.price ?? pivots?.price ?? 0).toFixed(2));
    if (!currentPrice || !Number.isFinite(currentPrice)) {
      throw new Error(`Monte Carlo scenario engine could not resolve a live price for ${market}.`);
    }

    const supportLevel = pivots?.mappedSupport?.price ?? pivots?.supports?.[0] ?? profile?.valueAreaLow ?? null;
    const targetLevel = pivots?.mappedResistance?.price ?? pivots?.resistances?.[0] ?? profile?.valueAreaHigh ?? null;
    const atr = Math.max(flow?.atr14 ?? (currentPrice * 0.006), currentPrice * 0.0015, 0.25);
    const invalidationLevel = supportLevel != null
      ? Number((supportLevel - (atr * 0.55)).toFixed(2))
      : Number((currentPrice - (atr * 1.1)).toFixed(2));

    const macroFocus = macro?.focus ?? null;
    const ratesFocus = macro?.ratesDifferentials?.focus ?? null;
    const macroBias = macroFocus?.bias ?? macro?.goldBias ?? null;
    const driftScore = clamp(
      ((pressure?.score ?? 0) * 0.28)
      + ((orderflow?.buySellPressure ?? 0) * 0.22)
      + ((flow?.netFlowScore ?? 0) * 0.24)
      + (orderflow?.divergenceBias === 'bullish' ? 10 : orderflow?.divergenceBias === 'bearish' ? -10 : 0)
      + (pivots?.signalMap?.buySignal ? 8 : pivots?.signalMap?.sellSignal ? -8 : 0)
      + (macroBias === 'bullish' ? 6 : macroBias === 'bearish' ? -6 : 0)
      + (macroFocus?.reflexivityState === 'self-reinforcing bullish' ? 4 : macroFocus?.reflexivityState === 'self-reinforcing bearish' ? -4 : 0),
      -100,
      100,
    );
    const volatilityScore = clamp(
      (flow?.volPercentile ?? 50)
      + ((flow?.rangeExpansion ?? 1) - 1) * 30
      + Math.abs(orderflow?.quoteImbalance ?? 0) * 0.18
      + (pressure?.relativeVolume != null ? Math.max((pressure.relativeVolume - 1) * 20, 0) : 0),
      20,
      100,
    );

    const calendarRisk = clamp(((calendar?.highImpactCount ?? 0) / 3), 0, 1);
    const benchmarkSpec = timeframeBenchmarkSpec(timeframe);
    const benchmarkVolPct = resolveBenchmarkVolPct({
      optionsVolPct: flow?.theoreticalAtmVol,
      currentPrice,
      atr,
      volatilityScore,
      rangeExpansion: flow?.rangeExpansion ?? 1,
    });
    const benchmarkRatePct = clamp(
      Number(macro?.policy?.fedRate ?? macro?.rates?.nominal2y ?? 4.25),
      0,
      15,
    );
    const benchmarkRate = benchmarkRatePct / 100;
    const engine = runMonteCarloEngine({
      market,
      timeframe,
      steps,
      simulations,
      currentPrice,
      supportLevel,
      targetLevel,
      invalidationLevel,
      atr,
      driftScore,
      volatilityScore,
      rangeExpansion: flow?.rangeExpansion ?? 1,
      momentum20: flow?.momentum20 ?? 0,
      tickMomentum: orderflow?.cumulativeDeltaProxy ?? flow?.tickMomentum ?? 0,
      netGamma: flow?.netGamma ?? 0,
      divergenceBias: orderflow?.priceDeltaDivergence ?? 'none',
      macroBias,
      calendarRisk,
    });
    const benchmarkVol = benchmarkVolPct / 100;
    const benchmarkExpectedMove = Number((currentPrice * benchmarkVol * Math.sqrt(benchmarkSpec.timeYears)).toFixed(2));
    const benchmarkExpectedMovePct = Number(((benchmarkExpectedMove / currentPrice) * 100).toFixed(2));
    const terminalAboveTargetProbability = terminalProbability({
      spot: currentPrice,
      level: targetLevel,
      timeYears: benchmarkSpec.timeYears,
      rate: benchmarkRate,
      volatility: benchmarkVol,
      direction: 'above',
    });
    const terminalBelowInvalidationProbability = terminalProbability({
      spot: currentPrice,
      level: invalidationLevel,
      timeYears: benchmarkSpec.timeYears,
      rate: benchmarkRate,
      volatility: benchmarkVol,
      direction: 'below',
    });
    const benchmarkCall = blackScholes({
      optionType: 'c',
      spot: currentPrice,
      strike: currentPrice,
      timeYears: benchmarkSpec.timeYears,
      rate: benchmarkRate,
      volatility: benchmarkVol,
    });
    const benchmarkPut = blackScholes({
      optionType: 'p',
      spot: currentPrice,
      strike: currentPrice,
      timeYears: benchmarkSpec.timeYears,
      rate: benchmarkRate,
      volatility: benchmarkVol,
    });
    const targetHitVsNeutralTerminalDiff = terminalAboveTargetProbability != null
      ? Number((engine.targetHitProbability - terminalAboveTargetProbability).toFixed(1))
      : null;
    const invalidationVsNeutralTerminalDiff = terminalBelowInvalidationProbability != null
      ? Number((terminalBelowInvalidationProbability - engine.invalidationProbability).toFixed(1))
      : null;
    const benchmarkSummary = [
      `Neutral GBM plus Black-Scholes benchmark uses ${benchmarkVolPct.toFixed(1)}% annualized vol and ${benchmarkRatePct.toFixed(2)}% USD drift over ${label}.`,
      `One-sigma move is ${benchmarkExpectedMove.toFixed(2)} (${benchmarkExpectedMovePct.toFixed(2)}%).`,
      targetLevel != null && terminalAboveTargetProbability != null
        ? `Terminal above-target probability is ${terminalAboveTargetProbability.toFixed(1)}% at ${targetLevel.toFixed(2)}.`
        : 'Terminal above-target probability is unavailable because a clean target level was not resolved.',
      terminalBelowInvalidationProbability != null
        ? `Terminal below-invalidation probability is ${terminalBelowInvalidationProbability.toFixed(1)}% at ${invalidationLevel.toFixed(2)}.`
        : 'Terminal below-invalidation probability could not be resolved cleanly.',
      `ATM call and put benchmark premiums are ${benchmarkCall.premium.toFixed(2)} / ${benchmarkPut.premium.toFixed(2)}.`,
    ].join(' ');

    const pathBias = engine.targetFirstProbability - engine.invalidationFirstProbability >= 10
      ? 'upside drift favored'
      : engine.invalidationFirstProbability - engine.targetFirstProbability >= 10
        ? 'downside drift favored'
        : engine.breakEvenProbability >= 52
          ? 'balanced with upside lean'
          : 'balanced two-way drift';
    const confidenceBand = engine.scenarioQuality === 'high'
      ? (Math.abs(engine.targetFirstProbability - engine.invalidationFirstProbability) >= 10 ? 'high' : 'medium')
      : engine.scenarioQuality === 'medium'
        ? 'medium'
        : 'cautious';

    const scenarioMap = [
      {
        name: 'Target First',
        probability: engine.targetFirstProbability,
        detail: targetLevel != null
          ? `Probability of tagging ${targetLevel.toFixed(2)} before invalidation inside ${label}.`
          : 'No clear target cluster was available for this market state.',
      },
      {
        name: 'Support Holds',
        probability: engine.supportHoldProbability,
        detail: supportLevel != null
          ? `Probability that price stays above ${supportLevel.toFixed(2)} across the simulated window.`
          : 'Support shelf unavailable; support-hold probability is approximate.',
      },
      {
        name: 'Invalidation First',
        probability: engine.invalidationFirstProbability,
        detail: `Probability of trading through invalidation ${invalidationLevel.toFixed(2)} before the first successful target touch.`,
      },
      {
        name: 'Break Even',
        probability: engine.breakEvenProbability,
        detail: 'Probability that the simulated horizon still closes at or above the current price.',
      },
      {
        name: 'Upside Extension',
        probability: engine.upsideExtensionProbability,
        detail: targetLevel != null
          ? `Probability of extending beyond the first target after a successful break.`
          : 'Upside extension cannot be framed cleanly without a first target cluster.',
      },
      {
        name: 'Neutral Benchmark',
        probability: terminalAboveTargetProbability ?? engine.breakEvenProbability,
        detail: benchmarkSummary,
      },
    ];

    const drivers = [
      `pressure ${pressure?.dominance ?? 'unknown'} (${pressure?.score ?? 'n/a'})`,
      `orderflow ${orderflow?.dominance ?? 'unknown'} (${orderflow?.buySellPressure ?? 'n/a'})`,
      `delta ${orderflow?.priceDeltaDivergence ?? 'none'}`,
      `flow ${flow?.flowBias ?? 'unknown'} / ${flow?.dealerPositioning ?? 'unknown'}`,
      `macro ${macro?.regime ?? 'unknown'} / ${macroBias ?? 'unknown'} / ${macroFocus?.reflexivityState ?? 'neutral'}`,
      ratesFocus?.summary ? `rates ${ratesFocus.summary}` : null,
      `calendar ${calendar?.highImpactCount ?? 0} high-impact`,
      `regime mix T${engine.regimeMix.trend}% MR${engine.regimeMix.meanReversion}% S${engine.regimeMix.shock}%`,
      pivots?.signalMap?.bias ?? 'pivot map unavailable',
    ].filter((value): value is string => Boolean(value));

    return {
      market,
      timeframe,
      simulations,
      horizonLabel: label,
      pathMethod: engine.pathMethod,
      scenarioQuality: engine.scenarioQuality,
      currentPrice,
      pathBias,
      driftScore: Number(driftScore.toFixed(1)),
      volatilityScore: Number(volatilityScore.toFixed(1)),
      targetLevel: targetLevel != null ? Number(targetLevel.toFixed(2)) : null,
      invalidationLevel,
      supportLevel: supportLevel != null ? Number(supportLevel.toFixed(2)) : null,
      supportHoldProbability: engine.supportHoldProbability,
      targetHitProbability: engine.targetHitProbability,
      invalidationProbability: engine.invalidationProbability,
      upsideExtensionProbability: engine.upsideExtensionProbability,
      targetFirstProbability: engine.targetFirstProbability,
      invalidationFirstProbability: engine.invalidationFirstProbability,
      breakEvenProbability: engine.breakEvenProbability,
      medianMaxDrawdownPct: engine.medianMaxDrawdownPct,
      tailLossPct: engine.tailLossPct,
      expectedMovePct: engine.expectedMovePct,
      expectedClose: engine.expectedClose,
      confidenceBand,
      regimeMix: engine.regimeMix,
      scenarioBands: engine.scenarioBands,
      scenarioMap,
      benchmark: {
        model: 'neutral-gbm black-scholes sidecar',
        horizonDays: Number(benchmarkSpec.horizonDays.toFixed(2)),
        driftRatePct: Number(benchmarkRatePct.toFixed(2)),
        annualizedVolPct: Number(benchmarkVolPct.toFixed(2)),
        expectedMove: benchmarkExpectedMove,
        expectedMovePct: benchmarkExpectedMovePct,
        terminalAboveTargetProbability,
        terminalBelowInvalidationProbability,
        atmCallPremium: Number(benchmarkCall.premium.toFixed(2)),
        atmPutPremium: Number(benchmarkPut.premium.toFixed(2)),
        targetHitVsNeutralTerminalDiff,
        invalidationVsNeutralTerminalDiff,
        summary: benchmarkSummary,
      },
      drivers,
      sourceLabel: 'Monte Carlo scenario engine runs on live Vaultum structure, pressure, orderflow, macro, calendar, and options-proxy features using quasi-random Halton sampling with antithetic paths, plus a neutral GBM and Black-Scholes benchmark sidecar. It is a scenario model, not a predictive certainty engine.',
      summary: `${pathBias} over ${label}; target-first ${engine.targetFirstProbability}%, invalidation-first ${engine.invalidationFirstProbability}%, support hold ${engine.supportHoldProbability}%, median max drawdown ${engine.medianMaxDrawdownPct}%.`,
    };
  }, 300);
}
