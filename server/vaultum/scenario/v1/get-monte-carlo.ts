import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { normalizeVaultumTimeframe, structuralTimeframeFor } from '../../_shared/timeframes';
import { getEconomicCalendar } from '../../calendar/v1/get-economic-calendar';
import { getMacroSignals } from '../../macro/v1/get-macro-signals';
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
      getMacroSignals(),
      getFlowProxy({ symbol: market }),
      getOrderflowEngine({ market, timeframe }),
      getLevels({ market, timeframe: structuralTimeframe }),
      getBuyerSellerPressure({ market, timeframe, mode: 'auto' }),
      getProfile({ market, timeframe: structuralTimeframe }),
      getEconomicCalendar({ market }),
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

    const driftScore = clamp(
      ((pressure?.score ?? 0) * 0.28)
      + ((orderflow?.buySellPressure ?? 0) * 0.22)
      + ((flow?.netFlowScore ?? 0) * 0.24)
      + (orderflow?.divergenceBias === 'bullish' ? 10 : orderflow?.divergenceBias === 'bearish' ? -10 : 0)
      + (pivots?.signalMap?.buySignal ? 8 : pivots?.signalMap?.sellSignal ? -8 : 0)
      + (macro?.goldBias === 'bullish' ? 6 : macro?.goldBias === 'bearish' ? -6 : 0),
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
      macroBias: macro?.goldBias ?? null,
      calendarRisk,
    });

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
    ];

    const drivers = [
      `pressure ${pressure?.dominance ?? 'unknown'} (${pressure?.score ?? 'n/a'})`,
      `orderflow ${orderflow?.dominance ?? 'unknown'} (${orderflow?.buySellPressure ?? 'n/a'})`,
      `delta ${orderflow?.priceDeltaDivergence ?? 'none'}`,
      `flow ${flow?.flowBias ?? 'unknown'} / ${flow?.dealerPositioning ?? 'unknown'}`,
      `macro ${macro?.regime ?? 'unknown'} / ${macro?.goldBias ?? 'unknown'}`,
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
      drivers,
      sourceLabel: 'Monte Carlo scenario engine runs on live Vaultum structure, pressure, orderflow, macro, calendar, and options-proxy features using quasi-random Halton sampling with antithetic paths. It is a scenario model, not a predictive certainty engine.',
      summary: `${pathBias} over ${label}; target-first ${engine.targetFirstProbability}%, invalidation-first ${engine.invalidationFirstProbability}%, support hold ${engine.supportHoldProbability}%, median max drawdown ${engine.medianMaxDrawdownPct}%.`,
    };
  }, 300);
}
