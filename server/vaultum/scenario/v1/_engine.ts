function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function quantile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = clamp(Math.round((sorted.length - 1) * ratio), 0, sorted.length - 1);
  return sorted[index]!;
}

const PRIME_BASES = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29,
  31, 37, 41, 43, 47, 53, 59, 61, 67, 71,
  73, 79, 83, 89, 97, 101, 103, 107, 109, 113,
  127, 131, 137, 139, 149, 151, 157, 163, 167, 173,
  179, 181, 191, 193, 197, 199, 211, 223, 227, 229,
  233, 239, 241, 251, 257, 263, 269, 271, 277, 281,
];

function radicalInverse(index: number, base: number): number {
  let value = 0;
  let denominator = 1 / base;
  let n = index;
  while (n > 0) {
    value += (n % base) * denominator;
    n = Math.floor(n / base);
    denominator /= base;
  }
  return value;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function shiftFor(seed: number, dimension: number): number {
  const raw = Math.sin((seed + 1) * (dimension + 1) * 12.9898) * 43758.5453123;
  return raw - Math.floor(raw);
}

function quasiUniform(index: number, dimension: number, seed: number): number {
  const base = PRIME_BASES[dimension % PRIME_BASES.length]!;
  const shifted = (radicalInverse(index, base) + shiftFor(seed, dimension)) % 1;
  return clamp(shifted, 1e-9, 1 - 1e-9);
}

function inverseNormal(probability: number): number {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.38357751867269e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const p = clamp(probability, 1e-12, 1 - 1e-12);
  const plow = 0.02425;
  const phigh = 1 - plow;

  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!)
      / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!)
      / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }

  const q = p - 0.5;
  const r = q * q;
  return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q
    / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

export type MonteCarloEngineInput = {
  market: string;
  timeframe: string;
  steps: number;
  simulations: number;
  currentPrice: number;
  supportLevel: number | null;
  targetLevel: number | null;
  invalidationLevel: number;
  atr: number;
  driftScore: number;
  volatilityScore: number;
  rangeExpansion: number;
  momentum20: number;
  tickMomentum: number;
  netGamma: number;
  divergenceBias?: string | null;
  macroBias?: string | null;
  calendarRisk: number;
};

export type MonteCarloEngineOutput = {
  pathMethod: string;
  scenarioQuality: 'high' | 'medium' | 'cautious';
  regimeMix: {
    trend: number;
    meanReversion: number;
    shock: number;
  };
  expectedClose: number;
  expectedMovePct: number;
  supportHoldProbability: number;
  targetHitProbability: number;
  invalidationProbability: number;
  upsideExtensionProbability: number;
  targetFirstProbability: number;
  invalidationFirstProbability: number;
  breakEvenProbability: number;
  medianMaxDrawdownPct: number;
  tailLossPct: number;
  scenarioBands: {
    p05: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
  };
};

export function runMonteCarloEngine(input: MonteCarloEngineInput): MonteCarloEngineOutput {
  const pairCount = Math.ceil(input.simulations / 2);
  const steps = Math.max(input.steps, 4);
  const anchor = input.supportLevel != null && input.targetLevel != null
    ? (input.supportLevel + input.targetLevel) * 0.5
    : input.supportLevel ?? input.targetLevel ?? input.currentPrice;
  const qmcSeed = hashSeed(`${input.market}:${input.timeframe}:${steps}:${input.currentPrice.toFixed(2)}`);

  const trendBase = clamp(
    0.32
    + (Math.abs(input.driftScore) / 280)
    + Math.min(Math.abs(input.momentum20), 6) * 0.01
    + Math.max(input.rangeExpansion - 1, 0) * 0.12
    + (input.netGamma < 0 ? 0.05 : -0.03)
    + (input.macroBias === 'bullish' || input.macroBias === 'bearish' ? 0.03 : 0),
    0.2,
    0.62,
  );
  const shockBase = clamp(
    0.08
    + Math.max(input.volatilityScore - 60, 0) / 190
    + Math.max(Math.abs(input.tickMomentum) - 0.8, 0) * 0.07
    + input.calendarRisk * 0.12
    + (input.divergenceBias && input.divergenceBias !== 'none' ? 0.03 : 0),
    0.06,
    0.3,
  );
  const meanReversionBase = clamp(1 - trendBase - shockBase, 0.16, 0.58);
  const weightSum = trendBase + meanReversionBase + shockBase;
  const regimeWeights = {
    trend: trendBase / weightSum,
    meanReversion: meanReversionBase / weightSum,
    shock: shockBase / weightSum,
  };

  const perStepDrift = (input.driftScore / 100) * 0.0018;
  const baseSigma = clamp(
    ((input.atr / input.currentPrice) * 0.75) + ((input.volatilityScore / 100) * 0.004),
    0.0025,
    0.03,
  );
  const corridorWidth = input.targetLevel != null && input.supportLevel != null
    ? Math.max(Math.abs(input.targetLevel - input.supportLevel), input.atr * 1.4)
    : input.atr * 2.2;

  const finalPrices: number[] = [];
  const maxDrawdowns: number[] = [];
  let supportHoldCount = 0;
  let targetHitCount = 0;
  let invalidationCount = 0;
  let upsideExtensionCount = 0;
  let targetFirstCount = 0;
  let invalidationFirstCount = 0;
  let breakEvenCount = 0;
  let trendSteps = 0;
  let meanReversionSteps = 0;
  let shockSteps = 0;

  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const sampleIndex = pairIndex + 1;
    const shocks = Array.from({ length: steps }, (_, step) => inverseNormal(quasiUniform(sampleIndex, step, qmcSeed)));
    const regimeUniforms = Array.from({ length: steps }, (_, step) => quasiUniform(sampleIndex, steps + step, qmcSeed));

    for (const direction of [1, -1] as const) {
      if (finalPrices.length >= input.simulations) break;

      let price = input.currentPrice;
      let peak = input.currentPrice;
      let maxDrawdown = 0;
      let supportHeld = true;
      let targetHit = false;
      let invalidated = false;
      let upsideExtension = false;
      let firstTouch: 'target' | 'invalidation' | null = null;

      for (let step = 0; step < steps; step += 1) {
        const shock = shocks[step]! * direction;
        const regimeU = direction === 1 ? regimeUniforms[step]! : 1 - regimeUniforms[step]!;
        const distanceFromAnchor = (anchor - price) / input.currentPrice;
        const outsideCorridor = Math.abs(price - anchor) > (corridorWidth * 0.55);
        const breakoutBias = input.netGamma < 0 && outsideCorridor
          ? clamp((price - anchor) / input.currentPrice, -0.0022, 0.0022) * 0.8
          : 0;
        const gammaMagnet = input.netGamma >= 0
          ? clamp((anchor - price) / input.currentPrice, -0.0026, 0.0026) * 0.55
          : 0;

        let regime: 'trend' | 'meanReversion' | 'shock';
        if (regimeU < regimeWeights.trend) {
          regime = 'trend';
          trendSteps += 1;
        } else if (regimeU < regimeWeights.trend + regimeWeights.meanReversion) {
          regime = 'meanReversion';
          meanReversionSteps += 1;
        } else {
          regime = 'shock';
          shockSteps += 1;
        }

        const sigmaMultiplier =
          regime === 'trend' ? 1.0 + Math.max(input.rangeExpansion - 1, 0) * 0.2
            : regime === 'meanReversion' ? 0.72
              : 1.65 + (input.calendarRisk * 0.2);
        const sigma = baseSigma * sigmaMultiplier * (input.netGamma < 0 && outsideCorridor ? 1.12 : 1);
        const drift =
          regime === 'trend' ? perStepDrift * 1.2
            : regime === 'meanReversion' ? perStepDrift * 0.45
              : perStepDrift * 0.85;
        const meanReversion = regime === 'meanReversion'
          ? clamp(distanceFromAnchor, -0.004, 0.004) * (input.netGamma >= 0 ? 1.1 : 0.65)
          : 0;
        const jump = regime === 'shock'
          ? Math.sign(shock || 1) * sigma * (0.35 + Math.min(Math.abs(shock), 2.5) * 0.35)
          : 0;
        const stepReturn = drift + gammaMagnet + breakoutBias + meanReversion + (sigma * shock * 0.58) + jump;
        price = Math.max(price * (1 + stepReturn), 0.0001);

        peak = Math.max(peak, price);
        maxDrawdown = Math.max(maxDrawdown, (peak - price) / Math.max(peak, 0.0001));

        if (input.supportLevel != null && price < input.supportLevel) supportHeld = false;
        if (input.targetLevel != null && price >= input.targetLevel) {
          targetHit = true;
          if (!firstTouch) firstTouch = 'target';
        }
        if (price <= input.invalidationLevel) {
          invalidated = true;
          if (!firstTouch) firstTouch = 'invalidation';
        }
        if (input.targetLevel != null && price >= input.targetLevel + input.atr * 0.55) upsideExtension = true;
      }

      finalPrices.push(Number(price.toFixed(4)));
      maxDrawdowns.push(maxDrawdown * 100);
      if (supportHeld) supportHoldCount += 1;
      if (targetHit) targetHitCount += 1;
      if (invalidated) invalidationCount += 1;
      if (upsideExtension) upsideExtensionCount += 1;
      if (firstTouch === 'target') targetFirstCount += 1;
      if (firstTouch === 'invalidation') invalidationFirstCount += 1;
      if (price >= input.currentPrice) breakEvenCount += 1;
    }
  }

  const totalSimulations = Math.max(finalPrices.length, 1);
  const totalRegimeSteps = Math.max(trendSteps + meanReversionSteps + shockSteps, 1);
  const expectedClose = Number(average(finalPrices).toFixed(2));
  const expectedMovePct = Number((((expectedClose - input.currentPrice) / input.currentPrice) * 100).toFixed(2));
  const scenarioQuality = input.calendarRisk >= 0.8 || input.volatilityScore >= 88
    ? 'cautious'
    : totalSimulations >= 350
      ? 'high'
      : 'medium';

  return {
    pathMethod: 'qmc-halton antithetic regime engine',
    scenarioQuality,
    regimeMix: {
      trend: Number((((trendSteps / totalRegimeSteps) * 100)).toFixed(1)),
      meanReversion: Number((((meanReversionSteps / totalRegimeSteps) * 100)).toFixed(1)),
      shock: Number((((shockSteps / totalRegimeSteps) * 100)).toFixed(1)),
    },
    expectedClose,
    expectedMovePct,
    supportHoldProbability: Number((((supportHoldCount / totalSimulations) * 100)).toFixed(1)),
    targetHitProbability: Number((((targetHitCount / totalSimulations) * 100)).toFixed(1)),
    invalidationProbability: Number((((invalidationCount / totalSimulations) * 100)).toFixed(1)),
    upsideExtensionProbability: Number((((upsideExtensionCount / totalSimulations) * 100)).toFixed(1)),
    targetFirstProbability: Number((((targetFirstCount / totalSimulations) * 100)).toFixed(1)),
    invalidationFirstProbability: Number((((invalidationFirstCount / totalSimulations) * 100)).toFixed(1)),
    breakEvenProbability: Number((((breakEvenCount / totalSimulations) * 100)).toFixed(1)),
    medianMaxDrawdownPct: Number((quantile(maxDrawdowns, 0.5)).toFixed(2)),
    tailLossPct: Number(((((quantile(finalPrices, 0.05) - input.currentPrice) / input.currentPrice) * 100)).toFixed(2)),
    scenarioBands: {
      p05: Number(quantile(finalPrices, 0.05).toFixed(2)),
      p10: Number(quantile(finalPrices, 0.1).toFixed(2)),
      p25: Number(quantile(finalPrices, 0.25).toFixed(2)),
      p50: Number(quantile(finalPrices, 0.5).toFixed(2)),
      p75: Number(quantile(finalPrices, 0.75).toFixed(2)),
      p90: Number(quantile(finalPrices, 0.9).toFixed(2)),
      p95: Number(quantile(finalPrices, 0.95).toFixed(2)),
    },
  };
}
