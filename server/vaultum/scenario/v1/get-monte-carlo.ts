import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { getMacroSignals } from '../../macro/v1/get-macro-signals';
import { getFlowProxy } from '../../options/v1/get-flow-proxy';
import { getOrderflowEngine } from '../../orderflow/v1/get-engine';
import { getLevels } from '../../pivots/v1/get-levels';
import { getBuyerSellerPressure } from '../../pressure/v1/get-buyer-seller-pressure';
import { getProfile } from '../../volume/v1/get-profile';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values: number[], target: number): number {
  if (!values.length) return 0;
  const below = values.filter((value) => value <= target).length;
  return (below / values.length) * 100;
}

function gaussianRandom(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
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

function band(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = clamp(Math.round((sorted.length - 1) * ratio), 0, sorted.length - 1);
  return Number(sorted[index]!.toFixed(2));
}

export async function getMonteCarloScenario(input: { market?: string; timeframe?: string; simulations?: number }): Promise<{
  market: string;
  timeframe: string;
  simulations: number;
  horizonLabel: string;
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
  expectedMovePct: number;
  expectedClose: number;
  confidenceBand: string;
  scenarioBands: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
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
  const timeframe = String(input.timeframe || '1h').toLowerCase();
  const simulations = clamp(Number(input.simulations || 350), 200, 900);

  return getCachedOrCompute(cacheKey('scenario', `monte-carlo:${market}:${timeframe}:${simulations}`), async () => {
    const structuralTimeframe = timeframe === '1d' ? '1d' : '1h';
    const [{ steps, label }, macro, flow, orderflow, pivots, pressure, profile] = await Promise.all([
      Promise.resolve(timeframeConfig(timeframe)),
      getMacroSignals(),
      getFlowProxy({ symbol: market }),
      getOrderflowEngine({ market, timeframe }),
      getLevels({ market, timeframe: structuralTimeframe }),
      getBuyerSellerPressure({ market, mode: 'auto' }),
      getProfile({ market, timeframe: structuralTimeframe }),
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

    const perStepDrift = (driftScore / 100) * 0.0018;
    const perStepSigma = clamp(
      ((atr / currentPrice) * 0.75) + ((volatilityScore / 100) * 0.004),
      0.0025,
      0.028,
    );

    const finalPrices: number[] = [];
    let supportHoldCount = 0;
    let targetHitCount = 0;
    let invalidationCount = 0;
    let upsideExtensionCount = 0;

    for (let simulation = 0; simulation < simulations; simulation += 1) {
      let price = currentPrice;
      let supportHeld = true;
      let targetHit = false;
      let invalidated = false;
      let upsideExtension = false;

      for (let step = 0; step < steps; step += 1) {
        const structureMagnet =
          targetLevel != null && supportLevel != null
            ? clamp(((targetLevel + supportLevel) * 0.5 - price) / currentPrice, -0.003, 0.003)
            : 0;
        const shock = gaussianRandom();
        const stepReturn = perStepDrift + structureMagnet + (perStepSigma * shock);
        price = Math.max(price * (1 + stepReturn), 0.0001);

        if (supportLevel != null && price < supportLevel) supportHeld = false;
        if (targetLevel != null && price >= targetLevel) targetHit = true;
        if (price <= invalidationLevel) invalidated = true;
        if (targetLevel != null && price >= targetLevel + atr * 0.55) upsideExtension = true;
      }

      finalPrices.push(Number(price.toFixed(4)));
      if (supportHeld) supportHoldCount += 1;
      if (targetHit) targetHitCount += 1;
      if (invalidated) invalidationCount += 1;
      if (upsideExtension) upsideExtensionCount += 1;
    }

    const p10 = band(finalPrices, 0.1);
    const p25 = band(finalPrices, 0.25);
    const p50 = band(finalPrices, 0.5);
    const p75 = band(finalPrices, 0.75);
    const p90 = band(finalPrices, 0.9);
    const expectedClose = Number(average(finalPrices).toFixed(2));
    const expectedMovePct = Number((((expectedClose - currentPrice) / currentPrice) * 100).toFixed(2));
    const supportHoldProbability = Number(((supportHoldCount / simulations) * 100).toFixed(1));
    const targetHitProbability = Number(((targetHitCount / simulations) * 100).toFixed(1));
    const invalidationProbability = Number(((invalidationCount / simulations) * 100).toFixed(1));
    const upsideExtensionProbability = Number(((upsideExtensionCount / simulations) * 100).toFixed(1));
    const pathBias = driftScore >= 12
      ? 'upside drift favored'
      : driftScore <= -12
        ? 'downside drift favored'
        : 'balanced two-way drift';
    const confidenceBand = targetHitProbability >= 58 || invalidationProbability >= 58 ? 'high' : volatilityScore >= 72 ? 'medium' : 'medium';

    const scenarioMap = [
      {
        name: 'Target First',
        probability: targetHitProbability,
        detail: targetLevel != null
          ? `Probability of tagging ${targetLevel.toFixed(2)} inside ${label}.`
          : 'No clear target cluster was available for this market state.',
      },
      {
        name: 'Support Holds',
        probability: supportHoldProbability,
        detail: supportLevel != null
          ? `Probability that price stays above ${supportLevel.toFixed(2)} across the simulated window.`
          : 'Support shelf unavailable; support-hold probability is approximate.',
      },
      {
        name: 'Invalidation Trip',
        probability: invalidationProbability,
        detail: `Probability of trading through invalidation ${invalidationLevel.toFixed(2)} before the horizon closes.`,
      },
      {
        name: 'Upside Extension',
        probability: upsideExtensionProbability,
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
      pivots?.signalMap?.bias ?? 'pivot map unavailable',
    ].filter((value): value is string => Boolean(value));

    return {
      market,
      timeframe,
      simulations,
      horizonLabel: label,
      currentPrice,
      pathBias,
      driftScore: Number(driftScore.toFixed(1)),
      volatilityScore: Number(volatilityScore.toFixed(1)),
      targetLevel: targetLevel != null ? Number(targetLevel.toFixed(2)) : null,
      invalidationLevel,
      supportLevel: supportLevel != null ? Number(supportLevel.toFixed(2)) : null,
      supportHoldProbability,
      targetHitProbability,
      invalidationProbability,
      upsideExtensionProbability,
      expectedMovePct,
      expectedClose,
      confidenceBand,
      scenarioBands: { p10, p25, p50, p75, p90 },
      scenarioMap,
      drivers,
      sourceLabel: 'Monte Carlo scenario engine runs on live Vaultum structure, pressure, orderflow, macro, and options-proxy features. It is a scenario model, not a predictive certainty engine.',
      summary: `${pathBias} over ${label}; target hit ${targetHitProbability}%, invalidation ${invalidationProbability}%, support hold ${supportHoldProbability}%.`,
    };
  }, 300);
}
