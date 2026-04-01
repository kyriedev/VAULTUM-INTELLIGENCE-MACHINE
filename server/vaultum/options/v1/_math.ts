export type OptionType = 'c' | 'p';

export type OptionPricingModel =
  | 'black-scholes'
  | 'merton'
  | 'black-76'
  | 'garman-kohlhagen';

export type PricingOutput = {
  premium: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  d1: number;
  d2: number;
};

export type NumericalGreekOutput = Pick<PricingOutput, 'delta' | 'gamma' | 'theta' | 'vega' | 'rho'>;

export type GreekAgreement = {
  score: number;
  label: 'tight' | 'good' | 'loose';
  maxDiffGreek: keyof NumericalGreekOutput;
  maxDiff: number;
  numerical: NumericalGreekOutput;
};

export type ImpliedVolatilityDiagnostics = {
  value: number;
  initialGuess: number;
  method: 'newton' | 'bisection';
  iterations: number;
  converged: boolean;
  residual: number;
  bounded: boolean;
  limitedValue: number;
  limitedConverged: boolean;
};

export type PricingSurfacePoint = {
  strike: number;
  tenorDays: number;
  impliedVol: number;
  call: PricingOutput;
  put: PricingOutput;
  interestWeight: number;
};

export type SurfaceTenorSummary = {
  tenor: string;
  tenorDays: number;
  atmVol: number;
  putWingVol: number;
  callWingVol: number;
  skew: number;
};

export type SurfaceFitDiagnostics = {
  method: 'quadratic-total-variance';
  rmse: number;
  quality: 'tight' | 'good' | 'loose';
  atmVol1m: number;
  riskReversal1m: number;
  butterfly1m: number;
  termSlope: number;
  strikeSlope: number;
  convexity: number;
  calibratedTenors: string[];
};

export type AmericanStyleDiagnostics = {
  model: OptionPricingModel;
  steps: number;
  europeanPremium: number;
  americanPremium: number;
  intrinsicValue: number;
  earlyExercisePremium: number;
  premiumRatioPct: number;
  exerciseStyle: 'hold-like-european' | 'exercise-sensitive' | 'exercise-active';
  likelyDriver: string;
};

export type StrategyShockPoint = {
  label: string;
  driver: 'spot' | 'volatility' | 'time' | 'rates';
  premium: number;
  pnl: number;
  tone: 'bullish' | 'bearish' | 'neutral';
};

export type OptionStrategySnapshot = {
  name: string;
  thesis: string;
  structure: 'debit';
  tenorDays: number;
  netPremium: number;
  maxGain: number | null;
  maxLoss: number;
  breakEvenLow: number | null;
  breakEvenHigh: number | null;
  netGreeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
  summary: string;
};

export type PriceOptionInput = {
  model: OptionPricingModel;
  optionType: OptionType;
  spot: number;
  strike: number;
  timeYears: number;
  rate: number;
  volatility: number;
  dividendYield?: number;
  foreignRate?: number;
};

const INV_SQRT_2PI = 0.3989422804014327;
const EPSILON = 1e-8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t) + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-(absX ** 2));
  return sign * y;
}

export function normPdf(x: number): number {
  return INV_SQRT_2PI * Math.exp(-0.5 * x * x);
}

export function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function sanitizeTime(t: number): number {
  return Math.max(t, 1 / 3650);
}

function sanitizeVol(v: number): number {
  return clamp(v, 0.005, 4);
}

function sanitizeSpot(value: number): number {
  return Math.max(value, 0.0001);
}

function sanitizeStrike(value: number): number {
  return Math.max(value, 0.0001);
}

export function generalizedBlackScholes(input: {
  optionType: OptionType;
  spot: number;
  strike: number;
  timeYears: number;
  rate: number;
  carry: number;
  volatility: number;
}): PricingOutput {
  const optionType = input.optionType;
  const spot = sanitizeSpot(input.spot);
  const strike = sanitizeStrike(input.strike);
  const timeYears = sanitizeTime(input.timeYears);
  const rate = input.rate;
  const carry = input.carry;
  const volatility = sanitizeVol(input.volatility);

  const sqrtT = Math.sqrt(timeYears);
  const volSqrtT = volatility * sqrtT;
  const d1 = (Math.log(spot / strike) + (carry + 0.5 * volatility * volatility) * timeYears) / volSqrtT;
  const d2 = d1 - volSqrtT;
  const carryDiscount = Math.exp((carry - rate) * timeYears);
  const rateDiscount = Math.exp(-rate * timeYears);
  const pdf = normPdf(d1);

  if (optionType === 'c') {
    return {
      premium: (spot * carryDiscount * normCdf(d1)) - (strike * rateDiscount * normCdf(d2)),
      delta: carryDiscount * normCdf(d1),
      gamma: (carryDiscount * pdf) / (spot * volSqrtT),
      theta:
        -((spot * carryDiscount * pdf * volatility) / (2 * sqrtT))
        - ((carry - rate) * spot * carryDiscount * normCdf(d1))
        - (rate * strike * rateDiscount * normCdf(d2)),
      vega: spot * carryDiscount * sqrtT * pdf,
      rho: strike * timeYears * rateDiscount * normCdf(d2),
      d1,
      d2,
    };
  }

  return {
    premium: (strike * rateDiscount * normCdf(-d2)) - (spot * carryDiscount * normCdf(-d1)),
    delta: -carryDiscount * normCdf(-d1),
    gamma: (carryDiscount * pdf) / (spot * volSqrtT),
    theta:
      -((spot * carryDiscount * pdf * volatility) / (2 * sqrtT))
      + ((carry - rate) * spot * carryDiscount * normCdf(-d1))
      + (rate * strike * rateDiscount * normCdf(-d2)),
    vega: spot * carryDiscount * sqrtT * pdf,
    rho: -strike * timeYears * rateDiscount * normCdf(-d2),
    d1,
    d2,
  };
}

export function blackScholes(input: {
  optionType: OptionType;
  spot: number;
  strike: number;
  timeYears: number;
  rate: number;
  volatility: number;
}): PricingOutput {
  return generalizedBlackScholes({
    ...input,
    carry: input.rate,
  });
}

export function merton(input: {
  optionType: OptionType;
  spot: number;
  strike: number;
  timeYears: number;
  rate: number;
  dividendYield: number;
  volatility: number;
}): PricingOutput {
  return generalizedBlackScholes({
    optionType: input.optionType,
    spot: input.spot,
    strike: input.strike,
    timeYears: input.timeYears,
    rate: input.rate,
    carry: input.rate - input.dividendYield,
    volatility: input.volatility,
  });
}

export function black76(input: {
  optionType: OptionType;
  forward: number;
  strike: number;
  timeYears: number;
  rate: number;
  volatility: number;
}): PricingOutput {
  return generalizedBlackScholes({
    optionType: input.optionType,
    spot: input.forward,
    strike: input.strike,
    timeYears: input.timeYears,
    rate: input.rate,
    carry: 0,
    volatility: input.volatility,
  });
}

export function garmanKohlhagen(input: {
  optionType: OptionType;
  spot: number;
  strike: number;
  timeYears: number;
  domesticRate: number;
  foreignRate: number;
  volatility: number;
}): PricingOutput {
  return generalizedBlackScholes({
    optionType: input.optionType,
    spot: input.spot,
    strike: input.strike,
    timeYears: input.timeYears,
    rate: input.domesticRate,
    carry: input.domesticRate - input.foreignRate,
    volatility: input.volatility,
  });
}

export function selectPricingModel(symbol: string): OptionPricingModel {
  const upper = symbol.toUpperCase();
  if (/(=X|EURUSD|GBPUSD|USDJPY|GBPJPY|EURJPY|AUDUSD|USDCAD|USDCHF|NZDUSD)/.test(upper)) return 'garman-kohlhagen';
  if (/(=F|XAUUSD|WTI|GOLD|OIL|GC=F|CL=F|BZ=F|SI=F|HG=F|NG=F)/.test(upper)) return 'black-76';
  if (/(\^GSPC|\^IXIC|\^DJI|SPX|NDX|US30|QQQ|SPY|DIA|GLD|USO|UUP|VIXY|FXE|FXB|FXY)/.test(upper)) return 'merton';
  return 'black-scholes';
}

export function priceOption(input: PriceOptionInput): PricingOutput {
  switch (input.model) {
    case 'black-scholes':
      return blackScholes({
        optionType: input.optionType,
        spot: input.spot,
        strike: input.strike,
        timeYears: input.timeYears,
        rate: input.rate,
        volatility: input.volatility,
      });
    case 'merton':
      return merton({
        optionType: input.optionType,
        spot: input.spot,
        strike: input.strike,
        timeYears: input.timeYears,
        rate: input.rate,
        dividendYield: input.dividendYield ?? 0,
        volatility: input.volatility,
      });
    case 'black-76':
      return black76({
        optionType: input.optionType,
        forward: input.spot,
        strike: input.strike,
        timeYears: input.timeYears,
        rate: input.rate,
        volatility: input.volatility,
      });
    case 'garman-kohlhagen':
      return garmanKohlhagen({
        optionType: input.optionType,
        spot: input.spot,
        strike: input.strike,
        timeYears: input.timeYears,
        domesticRate: input.rate,
        foreignRate: input.foreignRate ?? 0,
        volatility: input.volatility,
      });
  }
}

function optionPriceOnly(input: PriceOptionInput): number {
  return priceOption(input).premium;
}

export function numericalGreeks(input: PriceOptionInput): NumericalGreekOutput {
  const base = {
    ...input,
    spot: sanitizeSpot(input.spot),
    strike: sanitizeStrike(input.strike),
    timeYears: sanitizeTime(input.timeYears),
    volatility: sanitizeVol(input.volatility),
  };
  const spotBump = Math.max(base.spot * 0.01, 0.01);
  const volBump = Math.max(base.volatility * 0.05, 0.01);
  const rateBump = 0.0005;
  const timeBump = Math.max(base.timeYears * 0.03, 1 / 3650);

  const premium = optionPriceOnly(base);
  const upSpot = optionPriceOnly({ ...base, spot: base.spot + spotBump });
  const downSpot = optionPriceOnly({ ...base, spot: Math.max(base.spot - spotBump, 0.0001) });
  const upVol = optionPriceOnly({ ...base, volatility: clamp(base.volatility + volBump, 0.005, 4) });
  const downVol = optionPriceOnly({ ...base, volatility: clamp(base.volatility - volBump, 0.005, 4) });
  const upRate = optionPriceOnly({ ...base, rate: base.rate + rateBump });
  const downRate = optionPriceOnly({ ...base, rate: base.rate - rateBump });
  const shorterTime = optionPriceOnly({ ...base, timeYears: Math.max(base.timeYears - timeBump, 1 / 3650) });
  const longerTime = optionPriceOnly({ ...base, timeYears: base.timeYears + timeBump });

  return {
    delta: (upSpot - downSpot) / (2 * spotBump),
    gamma: (upSpot - (2 * premium) + downSpot) / (spotBump ** 2),
    theta: (shorterTime - longerTime) / (2 * timeBump),
    vega: (upVol - downVol) / (2 * volBump),
    rho: (upRate - downRate) / (2 * rateBump),
  };
}

export function compareGreekOutputs(
  analytical: PricingOutput,
  numerical: NumericalGreekOutput,
): GreekAgreement {
  const keys: Array<keyof NumericalGreekOutput> = ['delta', 'gamma', 'theta', 'vega', 'rho'];
  const scored = keys.map((key) => {
    const analytic = analytical[key];
    const numeric = numerical[key];
    const diff = Math.abs(analytic - numeric);
    const relative = diff / Math.max(1, Math.abs(analytic), Math.abs(numeric));
    return { key, diff, relative };
  });

  const averageRelative = scored.reduce((sum, entry) => sum + entry.relative, 0) / scored.length;
  const maxDiffEntry = [...scored].sort((left, right) => right.diff - left.diff)[0];
  const score = clamp(Math.round(100 - (averageRelative * 175)), 0, 100);
  const label = score >= 92 ? 'tight' : score >= 78 ? 'good' : 'loose';

  return {
    score,
    label,
    maxDiffGreek: maxDiffEntry.key,
    maxDiff: Number(maxDiffEntry.diff.toFixed(6)),
    numerical,
  };
}

export function approximateInitialVol(input: {
  optionType: OptionType;
  spot: number;
  strike: number;
  timeYears: number;
  rate: number;
  carry: number;
  optionPrice: number;
}): number {
  const optionPrice = Math.max(input.optionPrice, EPSILON);
  const spot = sanitizeSpot(input.spot);
  const strike = sanitizeStrike(input.strike);
  const timeYears = sanitizeTime(input.timeYears);
  const discountCarry = Math.exp((input.carry - input.rate) * timeYears);
  const discountRate = Math.exp(-input.rate * timeYears);

  const intrinsic = input.optionType === 'c'
    ? Math.max(spot * discountCarry - strike * discountRate, 0)
    : Math.max(strike * discountRate - spot * discountCarry, 0);
  const extrinsic = Math.max(optionPrice - intrinsic, EPSILON);
  const scale = (spot * discountCarry + strike * discountRate) * 0.5;
  return clamp(Math.sqrt(2 * Math.PI / timeYears) * (extrinsic / Math.max(scale, EPSILON)), 0.05, 2);
}

function carryForModel(input: {
  model: OptionPricingModel;
  rate: number;
  dividendYield?: number;
  foreignRate?: number;
}): number {
  if (input.model === 'merton') return input.rate - (input.dividendYield ?? 0);
  if (input.model === 'garman-kohlhagen') return input.rate - (input.foreignRate ?? 0);
  if (input.model === 'black-76') return 0;
  return input.rate;
}

function optionIntrinsicValue(optionType: OptionType, spot: number, strike: number): number {
  return optionType === 'c'
    ? Math.max(spot - strike, 0)
    : Math.max(strike - spot, 0);
}

function binomialAmericanPremium(input: PriceOptionInput & { steps?: number }): number {
  const spot = sanitizeSpot(input.spot);
  const strike = sanitizeStrike(input.strike);
  const timeYears = sanitizeTime(input.timeYears);
  const volatility = sanitizeVol(input.volatility);
  const steps = Math.max(25, Math.min(Math.round(input.steps ?? 151), 401));
  const rate = input.rate;
  const carry = carryForModel(input);
  const dt = timeYears / steps;
  const up = Math.exp(volatility * Math.sqrt(dt));
  const down = 1 / up;
  const growth = Math.exp(carry * dt);
  const denominator = up - down;
  if (!Number.isFinite(denominator) || Math.abs(denominator) < EPSILON) {
    return priceOption(input).premium;
  }

  const probability = clamp((growth - down) / denominator, 0, 1);
  const discount = Math.exp(-rate * dt);
  const optionValues = new Array<number>(steps + 1);

  for (let node = 0; node <= steps; node += 1) {
    const underlying = spot * (up ** node) * (down ** (steps - node));
    optionValues[node] = optionIntrinsicValue(input.optionType, underlying, strike);
  }

  for (let step = steps - 1; step >= 0; step -= 1) {
    for (let node = 0; node <= step; node += 1) {
      const underlying = spot * (up ** node) * (down ** (step - node));
      const continuation = discount * (
        (probability * optionValues[node + 1]!)
        + ((1 - probability) * optionValues[node]!)
      );
      const exercise = optionIntrinsicValue(input.optionType, underlying, strike);
      optionValues[node] = Math.max(continuation, exercise);
    }
  }

  return optionValues[0] ?? priceOption(input).premium;
}

export function americanOptionDiagnostics(input: PriceOptionInput & { steps?: number }): AmericanStyleDiagnostics {
  const european = priceOption(input).premium;
  const american = binomialAmericanPremium(input);
  const intrinsicValue = optionIntrinsicValue(input.optionType, input.spot, input.strike);
  const earlyExercisePremium = Math.max(american - european, 0);
  const premiumRatioPct = (earlyExercisePremium / Math.max(Math.abs(european), EPSILON)) * 100;
  const exerciseStyle: AmericanStyleDiagnostics['exerciseStyle'] = premiumRatioPct <= 0.5
    ? 'hold-like-european'
    : premiumRatioPct <= 2.5
      ? 'exercise-sensitive'
      : 'exercise-active';
  const likelyDriver = input.optionType === 'c'
    ? input.model === 'merton'
      ? 'Dividend or carry drag leaves some early-exercise value in the call.'
      : 'Call behaves close to European unless carry and deep ITM conditions change.'
    : 'Put early-exercise value rises when rates stay firm and downside remains in the money.';

  return {
    model: input.model,
    steps: Math.max(25, Math.min(Math.round(input.steps ?? 151), 401)),
    europeanPremium: Number(european.toFixed(4)),
    americanPremium: Number(american.toFixed(4)),
    intrinsicValue: Number(intrinsicValue.toFixed(4)),
    earlyExercisePremium: Number(earlyExercisePremium.toFixed(4)),
    premiumRatioPct: Number(premiumRatioPct.toFixed(2)),
    exerciseStyle,
    likelyDriver,
  };
}

export function impliedVolatilityDetailed(input: {
  model: OptionPricingModel;
  optionType: OptionType;
  spot: number;
  strike: number;
  timeYears: number;
  rate: number;
  optionPrice: number;
  dividendYield?: number;
  foreignRate?: number;
  initialGuess?: number;
  precision?: number;
  maxSteps?: number;
  limitedSteps?: number;
}): ImpliedVolatilityDiagnostics {
  const target = Math.max(input.optionPrice, EPSILON);
  const precision = input.precision ?? 1e-5;
  const maxSteps = input.maxSteps ?? 100;
  const limitedSteps = input.limitedSteps ?? 3;
  const carry = carryForModel(input);
  const initialGuess = input.initialGuess ?? approximateInitialVol({
    optionType: input.optionType,
    spot: input.spot,
    strike: input.strike,
    timeYears: input.timeYears,
    rate: input.rate,
    carry,
    optionPrice: target,
  });

  let vol = initialGuess;
  let limitedValue = initialGuess;
  let limitedConverged = false;
  let iterations = 0;
  let residual = Infinity;
  let method: 'newton' | 'bisection' = 'newton';
  let converged = false;
  let bounded = false;

  for (let step = 0; step < maxSteps; step += 1) {
    const priced = priceOption({
      ...input,
      volatility: vol,
    });
    const diff = priced.premium - target;
    residual = diff;
    iterations = step + 1;
    if (step + 1 === limitedSteps) {
      limitedValue = vol;
      limitedConverged = Math.abs(diff) <= precision;
    }
    if (Math.abs(diff) <= precision) {
      converged = true;
      if (step + 1 < limitedSteps) {
        limitedValue = vol;
        limitedConverged = true;
      }
      break;
    }
    if (Math.abs(priced.vega) <= EPSILON) {
      bounded = true;
      break;
    }
    const next = clamp(vol - (diff / priced.vega), 0.005, 4);
    if (next === 0.005 || next === 4) bounded = true;
    vol = next;
  }

  if (!converged) {
    method = 'bisection';
    let low = 0.005;
    let high = 4;
    for (let step = 0; step < maxSteps; step += 1) {
      const mid = (low + high) / 2;
      const priced = priceOption({
        ...input,
        volatility: mid,
      });
      const diff = priced.premium - target;
      residual = diff;
      iterations = step + 1;
      vol = mid;
      if (Math.abs(diff) <= precision) {
        converged = true;
        break;
      }
      if (diff > 0) high = mid;
      else low = mid;
    }
    bounded = true;
  }

  return {
    value: clamp(vol, 0.005, 4),
    initialGuess: Number(initialGuess.toFixed(6)),
    method,
    iterations,
    converged,
    residual: Number(residual.toFixed(8)),
    bounded,
    limitedValue: Number(clamp(limitedValue, 0.005, 4).toFixed(6)),
    limitedConverged,
  };
}

export function impliedVolatility(input: {
  model: OptionPricingModel;
  optionType: OptionType;
  spot: number;
  strike: number;
  timeYears: number;
  rate: number;
  optionPrice: number;
  dividendYield?: number;
  foreignRate?: number;
  initialGuess?: number;
  precision?: number;
  maxSteps?: number;
}): number {
  return impliedVolatilityDetailed(input).value;
}

export function expectedMove(spot: number, impliedVolPercent: number, tenorDays: number): number {
  const timeYears = Math.max(tenorDays / 365, 1 / 365);
  return spot * (impliedVolPercent / 100) * Math.sqrt(timeYears);
}

function tenorLabel(tenorDays: number): string {
  if (tenorDays <= 7) return '1W';
  if (tenorDays <= 30) return '1M';
  if (tenorDays <= 90) return '3M';
  return `${tenorDays}D`;
}

function solveLinear3(system: number[][], rhs: number[]): [number, number, number] | null {
  const matrix = system.map((row, rowIndex) => [...row, rhs[rowIndex]!]);

  for (let pivot = 0; pivot < 3; pivot += 1) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(matrix[row]![pivot]!) > Math.abs(matrix[maxRow]![pivot]!)) maxRow = row;
    }
    if (Math.abs(matrix[maxRow]![pivot]!) < 1e-10) return null;
    if (maxRow !== pivot) [matrix[pivot], matrix[maxRow]] = [matrix[maxRow]!, matrix[pivot]!];

    const pivotValue = matrix[pivot]![pivot]!;
    for (let column = pivot; column < 4; column += 1) matrix[pivot]![column] = matrix[pivot]![column]! / pivotValue;

    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) continue;
      const factor = matrix[row]![pivot]!;
      for (let column = pivot; column < 4; column += 1) {
        matrix[row]![column] = matrix[row]![column]! - factor * matrix[pivot]![column]!;
      }
    }
  }

  return [matrix[0]![3]!, matrix[1]![3]!, matrix[2]![3]!];
}

function fitSurfaceDiagnostics(points: PricingSurfacePoint[], spot: number, tenorDays: number[]): SurfaceFitDiagnostics {
  const fitted = tenorDays.map((tenor) => {
    const tenorPoints = points.filter((point) => point.tenorDays === tenor);
    if (tenorPoints.length < 3) return null;

    const x = tenorPoints.map((point) => Math.log(point.strike / spot));
    const t = Math.max(tenor / 365, 1 / 365);
    const y = tenorPoints.map((point) => ((point.impliedVol / 100) ** 2) * t);

    const sums = x.reduce((acc, value, index) => {
      const yValue = y[index]!;
      acc.n += 1;
      acc.x += value;
      acc.x2 += value ** 2;
      acc.x3 += value ** 3;
      acc.x4 += value ** 4;
      acc.y += yValue;
      acc.xy += value * yValue;
      acc.x2y += (value ** 2) * yValue;
      return acc;
    }, { n: 0, x: 0, x2: 0, x3: 0, x4: 0, y: 0, xy: 0, x2y: 0 });

    const coeffs = solveLinear3(
      [
        [sums.n, sums.x, sums.x2],
        [sums.x, sums.x2, sums.x3],
        [sums.x2, sums.x3, sums.x4],
      ],
      [sums.y, sums.xy, sums.x2y],
    );
    if (!coeffs) return null;

    const [a, b, c] = coeffs;
    const fittedVol = (logMoneyness: number) => {
      const totalVariance = Math.max(a + (b * logMoneyness) + (c * logMoneyness * logMoneyness), 1e-8);
      return Math.sqrt(totalVariance / t) * 100;
    };
    const rmse = Math.sqrt(average(tenorPoints.map((point) => {
      const diff = fittedVol(Math.log(point.strike / spot)) - point.impliedVol;
      return diff * diff;
    })));

    return {
      tenor,
      label: tenorLabel(tenor),
      rmse,
      atmVol: fittedVol(0),
      riskReversal: fittedVol(Math.log(0.95)) - fittedVol(Math.log(1.05)),
      butterfly: ((fittedVol(Math.log(0.95)) + fittedVol(Math.log(1.05))) / 2) - fittedVol(0),
      slope: b,
      convexity: c,
    };
  }).filter((item): item is {
    tenor: number;
    label: string;
    rmse: number;
    atmVol: number;
    riskReversal: number;
    butterfly: number;
    slope: number;
    convexity: number;
  } => Boolean(item));

  const benchmark = fitted.find((item) => item.tenor === 30) ?? fitted[0];
  const front = fitted.find((item) => item.tenor === 7) ?? benchmark;
  const back = fitted.find((item) => item.tenor === 90) ?? fitted[fitted.length - 1] ?? benchmark;
  if (!benchmark) {
    return {
      method: 'quadratic-total-variance',
      rmse: 0,
      quality: 'loose',
      atmVol1m: 0,
      riskReversal1m: 0,
      butterfly1m: 0,
      termSlope: 0,
      strikeSlope: 0,
      convexity: 0,
      calibratedTenors: [],
    };
  }
  const rmse = average(fitted.map((item) => item.rmse));
  const quality: SurfaceFitDiagnostics['quality'] = rmse <= 0.22 ? 'tight' : rmse <= 0.5 ? 'good' : 'loose';

  return {
    method: 'quadratic-total-variance',
    rmse: Number(rmse.toFixed(3)),
    quality,
    atmVol1m: Number((benchmark?.atmVol ?? 0).toFixed(2)),
    riskReversal1m: Number((benchmark?.riskReversal ?? 0).toFixed(2)),
    butterfly1m: Number((benchmark?.butterfly ?? 0).toFixed(2)),
    termSlope: Number((((back?.atmVol ?? benchmark?.atmVol ?? 0) - (front?.atmVol ?? benchmark?.atmVol ?? 0))).toFixed(2)),
    strikeSlope: Number((benchmark?.slope ?? 0).toFixed(5)),
    convexity: Number((benchmark?.convexity ?? 0).toFixed(5)),
    calibratedTenors: fitted.map((item) => item.label),
  };
}

export function buildSyntheticSurface(input: {
  symbol: string;
  spot: number;
  baseVolPercent: number;
  volPercentile: number;
  rate: number;
  foreignRate?: number;
  dividendYield?: number;
  strikeIncrement: number;
  tenorDays?: number[];
}): {
  model: OptionPricingModel;
  points: PricingSurfacePoint[];
  atmImpliedVol: number;
  downsideSkew: number;
  expectedMove1w: number;
  expectedMove1m: number;
  atmGreeks: PricingOutput;
  greekAgreement: GreekAgreement;
  ivDiagnostics: ImpliedVolatilityDiagnostics;
  ivSurface: SurfaceTenorSummary[];
  surfaceFit: SurfaceFitDiagnostics;
} {
  const model = selectPricingModel(input.symbol);
  const tenorDays = input.tenorDays ?? [7, 30, 90];
  const strikeOffsets = [-0.15, -0.1, -0.075, -0.05, -0.025, 0, 0.025, 0.05, 0.075, 0.1, 0.15];
  const points: PricingSurfacePoint[] = [];
  const baseVol = clamp(input.baseVolPercent / 100, 0.05, 2.5);
  const skewBase = ((input.volPercentile - 50) / 100) * 0.18;

  for (const tenor of tenorDays) {
    const tenorYears = tenor / 365;
    const tenorCarry = tenor <= 7 ? 1.08 : tenor <= 30 ? 1.02 : 0.98;
    for (const offset of strikeOffsets) {
      const rawStrike = input.spot * (1 + offset);
      const strike = Number((Math.round(rawStrike / input.strikeIncrement) * input.strikeIncrement).toFixed(input.strikeIncrement < 1 ? 4 : 2));
      const skewAdjustment = offset < 0 ? Math.abs(offset) * (0.16 + Math.max(skewBase, 0)) : offset * (0.09 - Math.min(skewBase, 0));
      const impliedVol = clamp(baseVol * tenorCarry * (1 + skewAdjustment), 0.05, 2.5);
      const call = priceOption({
        model,
        optionType: 'c',
        spot: input.spot,
        strike,
        timeYears: tenorYears,
        rate: input.rate,
        foreignRate: input.foreignRate,
        dividendYield: input.dividendYield,
        volatility: impliedVol,
      });
      const put = priceOption({
        model,
        optionType: 'p',
        spot: input.spot,
        strike,
        timeYears: tenorYears,
        rate: input.rate,
        foreignRate: input.foreignRate,
        dividendYield: input.dividendYield,
        volatility: impliedVol,
      });
      const proximityWeight = Math.exp(-Math.abs(Math.log(strike / input.spot)) * 10);
      const termWeight = tenor <= 7 ? 1.4 : tenor <= 30 ? 1 : 0.75;
      points.push({
        strike,
        tenorDays: tenor,
        impliedVol: impliedVol * 100,
        call,
        put,
        interestWeight: proximityWeight * termWeight,
      });
    }
  }

  const pointsForTenor = (tenor: number) => points.filter((point) => point.tenorDays === tenor);
  const nearestPoint = (tenor: number, ratio: number) =>
    pointsForTenor(tenor).sort((left, right) => Math.abs((left.strike / input.spot) - ratio) - Math.abs((right.strike / input.spot) - ratio))[0];

  const atmPoint = nearestPoint(30, 1) ?? points[0];
  const downsidePoint = nearestPoint(30, 0.95) ?? atmPoint;
  const upsidePoint = nearestPoint(30, 1.05) ?? atmPoint;

  const atmGreeks = atmPoint?.call ?? priceOption({
    model,
    optionType: 'c',
    spot: input.spot,
    strike: input.spot,
    timeYears: 30 / 365,
    rate: input.rate,
    foreignRate: input.foreignRate,
    dividendYield: input.dividendYield,
    volatility: baseVol,
  });
  const numerical = numericalGreeks({
    model,
    optionType: 'c',
    spot: input.spot,
    strike: atmPoint?.strike ?? input.spot,
    timeYears: (atmPoint?.tenorDays ?? 30) / 365,
    rate: input.rate,
    foreignRate: input.foreignRate,
    dividendYield: input.dividendYield,
    volatility: (atmPoint?.impliedVol ?? (baseVol * 100)) / 100,
  });
  const greekAgreement = compareGreekOutputs(atmGreeks, numerical);
  const ivDiagnostics = impliedVolatilityDetailed({
    model,
    optionType: 'c',
    spot: input.spot,
    strike: atmPoint?.strike ?? input.spot,
    timeYears: (atmPoint?.tenorDays ?? 30) / 365,
    rate: input.rate,
    optionPrice: atmGreeks.premium,
    foreignRate: input.foreignRate,
    dividendYield: input.dividendYield,
    initialGuess: baseVol,
    maxSteps: 64,
    limitedSteps: 3,
  });

  const ivSurface = tenorDays.map((tenor) => {
    const tenorAtm = nearestPoint(tenor, 1) ?? atmPoint;
    const tenorPut = nearestPoint(tenor, 0.95) ?? tenorAtm;
    const tenorCall = nearestPoint(tenor, 1.05) ?? tenorAtm;
    return {
      tenor: tenorLabel(tenor),
      tenorDays: tenor,
      atmVol: Number((tenorAtm?.impliedVol ?? baseVol * 100).toFixed(1)),
      putWingVol: Number((tenorPut?.impliedVol ?? tenorAtm?.impliedVol ?? baseVol * 100).toFixed(1)),
      callWingVol: Number((tenorCall?.impliedVol ?? tenorAtm?.impliedVol ?? baseVol * 100).toFixed(1)),
      skew: Number(((tenorPut?.impliedVol ?? tenorAtm?.impliedVol ?? baseVol * 100) - (tenorCall?.impliedVol ?? tenorAtm?.impliedVol ?? baseVol * 100)).toFixed(2)),
    } satisfies SurfaceTenorSummary;
  });
  const surfaceFit = fitSurfaceDiagnostics(points, input.spot, tenorDays);
  const atmVol1m = surfaceFit.atmVol1m > 0 ? surfaceFit.atmVol1m : (atmPoint?.impliedVol ?? (baseVol * 100));
  const downsideSkew = surfaceFit.riskReversal1m !== 0
    ? surfaceFit.riskReversal1m
    : Number((((downsidePoint?.impliedVol ?? atmPoint?.impliedVol ?? baseVol * 100) - (upsidePoint?.impliedVol ?? atmPoint?.impliedVol ?? baseVol * 100))).toFixed(2));

  return {
    model,
    points,
    atmImpliedVol: atmVol1m,
    downsideSkew,
    expectedMove1w: expectedMove(input.spot, atmVol1m, 7),
    expectedMove1m: expectedMove(input.spot, atmVol1m, 30),
    atmGreeks,
    greekAgreement,
    ivDiagnostics,
    ivSurface,
    surfaceFit,
  };
}

function pickSurfacePoint(
  points: PricingSurfacePoint[],
  tenorDays: number,
  spot: number,
  ratio: number,
  side: 'above' | 'below' | 'nearest' = 'nearest',
): PricingSurfacePoint | null {
  const tenorPoints = points.filter((point) => point.tenorDays === tenorDays);
  const filtered = side === 'above'
    ? tenorPoints.filter((point) => point.strike >= spot)
    : side === 'below'
      ? tenorPoints.filter((point) => point.strike <= spot)
      : tenorPoints;
  const candidates = filtered.length ? filtered : tenorPoints;
  if (!candidates.length) return null;
  return [...candidates].sort((left, right) => {
    const leftDistance = Math.abs((left.strike / spot) - ratio);
    const rightDistance = Math.abs((right.strike / spot) - ratio);
    return leftDistance - rightDistance;
  })[0] ?? null;
}

function sumStrategyGreeks(legs: Array<{ side: 1 | -1; greeks: PricingOutput }>): OptionStrategySnapshot['netGreeks'] {
  const totals = legs.reduce((acc, leg) => {
    acc.delta += leg.side * leg.greeks.delta;
    acc.gamma += leg.side * leg.greeks.gamma;
    acc.theta += leg.side * leg.greeks.theta;
    acc.vega += leg.side * leg.greeks.vega;
    acc.rho += leg.side * leg.greeks.rho;
    return acc;
  }, { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 });

  return {
    delta: Number(totals.delta.toFixed(4)),
    gamma: Number(totals.gamma.toFixed(6)),
    theta: Number(totals.theta.toFixed(4)),
    vega: Number(totals.vega.toFixed(4)),
    rho: Number(totals.rho.toFixed(4)),
  };
}

export function buildStrategySnapshots(input: {
  points: PricingSurfacePoint[];
  spot: number;
  tenorDays?: number;
}): OptionStrategySnapshot[] {
  const tenorDays = input.tenorDays ?? 30;
  const atmPoint = pickSurfacePoint(input.points, tenorDays, input.spot, 1, 'nearest');
  const callWingPoint = pickSurfacePoint(input.points, tenorDays, input.spot, 1.05, 'above') ?? atmPoint;
  const putWingPoint = pickSurfacePoint(input.points, tenorDays, input.spot, 0.95, 'below') ?? atmPoint;
  if (!atmPoint || !callWingPoint || !putWingPoint) return [];

  const bullCallDebit = Math.max(atmPoint.call.premium - callWingPoint.call.premium, 0);
  const bullCallWidth = Math.max(callWingPoint.strike - atmPoint.strike, 0);
  const bearPutDebit = Math.max(atmPoint.put.premium - putWingPoint.put.premium, 0);
  const bearPutWidth = Math.max(atmPoint.strike - putWingPoint.strike, 0);
  const straddleDebit = atmPoint.call.premium + atmPoint.put.premium;
  const strangleDebit = callWingPoint.call.premium + putWingPoint.put.premium;

  return [
    {
      name: 'Bull Call Spread',
      thesis: 'Directional upside with capped cost',
      structure: 'debit',
      tenorDays,
      netPremium: Number(bullCallDebit.toFixed(2)),
      maxGain: Number(Math.max(bullCallWidth - bullCallDebit, 0).toFixed(2)),
      maxLoss: Number(bullCallDebit.toFixed(2)),
      breakEvenLow: Number((atmPoint.strike + bullCallDebit).toFixed(2)),
      breakEvenHigh: null,
      netGreeks: sumStrategyGreeks([
        { side: 1, greeks: atmPoint.call },
        { side: -1, greeks: callWingPoint.call },
      ]),
      summary: `Uses ATM call ownership with upside capped near ${callWingPoint.strike.toFixed(2)}, which fits directional continuation without paying for fully open-ended convexity.`,
    },
    {
      name: 'Bear Put Spread',
      thesis: 'Directional downside with defined risk',
      structure: 'debit',
      tenorDays,
      netPremium: Number(bearPutDebit.toFixed(2)),
      maxGain: Number(Math.max(bearPutWidth - bearPutDebit, 0).toFixed(2)),
      maxLoss: Number(bearPutDebit.toFixed(2)),
      breakEvenLow: Number((atmPoint.strike - bearPutDebit).toFixed(2)),
      breakEvenHigh: null,
      netGreeks: sumStrategyGreeks([
        { side: 1, greeks: atmPoint.put },
        { side: -1, greeks: putWingPoint.put },
      ]),
      summary: `Owns downside convexity from ATM put risk while financing part of the cost by capping the move near ${putWingPoint.strike.toFixed(2)}.`,
    },
    {
      name: 'Long Straddle',
      thesis: 'Pure expansion / event-volatility expression',
      structure: 'debit',
      tenorDays,
      netPremium: Number(straddleDebit.toFixed(2)),
      maxGain: null,
      maxLoss: Number(straddleDebit.toFixed(2)),
      breakEvenLow: Number((atmPoint.strike - straddleDebit).toFixed(2)),
      breakEvenHigh: Number((atmPoint.strike + straddleDebit).toFixed(2)),
      netGreeks: sumStrategyGreeks([
        { side: 1, greeks: atmPoint.call },
        { side: 1, greeks: atmPoint.put },
      ]),
      summary: `Owns both sides of the move around ${atmPoint.strike.toFixed(2)} and benefits most when price escapes the expected-move corridor quickly.`,
    },
    {
      name: 'Long Strangle',
      thesis: 'Cheaper convexity outside the corridor',
      structure: 'debit',
      tenorDays,
      netPremium: Number(strangleDebit.toFixed(2)),
      maxGain: null,
      maxLoss: Number(strangleDebit.toFixed(2)),
      breakEvenLow: Number((putWingPoint.strike - strangleDebit).toFixed(2)),
      breakEvenHigh: Number((callWingPoint.strike + strangleDebit).toFixed(2)),
      netGreeks: sumStrategyGreeks([
        { side: 1, greeks: putWingPoint.put },
        { side: 1, greeks: callWingPoint.call },
      ]),
      summary: `Buys wings around ${putWingPoint.strike.toFixed(2)} and ${callWingPoint.strike.toFixed(2)} to express a larger move with lower upfront decay than the straddle.`,
    },
  ];
}

export function buildStraddleShockLadder(input: {
  model: OptionPricingModel;
  spot: number;
  strike: number;
  timeYears: number;
  rate: number;
  volatility: number;
  atr: number;
  dividendYield?: number;
  foreignRate?: number;
}): StrategyShockPoint[] {
  const baseCall = priceOption({
    model: input.model,
    optionType: 'c',
    spot: input.spot,
    strike: input.strike,
    timeYears: input.timeYears,
    rate: input.rate,
    volatility: input.volatility,
    dividendYield: input.dividendYield,
    foreignRate: input.foreignRate,
  });
  const basePut = priceOption({
    model: input.model,
    optionType: 'p',
    spot: input.spot,
    strike: input.strike,
    timeYears: input.timeYears,
    rate: input.rate,
    volatility: input.volatility,
    dividendYield: input.dividendYield,
    foreignRate: input.foreignRate,
  });
  const basePremium = baseCall.premium + basePut.premium;

  const scenarios = [
    {
      label: '+1 ATR spot',
      driver: 'spot' as const,
      mutate: () => ({
        spot: input.spot + input.atr,
        volatility: input.volatility,
        timeYears: input.timeYears,
        rate: input.rate,
      }),
    },
    {
      label: '-1 ATR spot',
      driver: 'spot' as const,
      mutate: () => ({
        spot: Math.max(input.spot - input.atr, 0.0001),
        volatility: input.volatility,
        timeYears: input.timeYears,
        rate: input.rate,
      }),
    },
    {
      label: '+2 vol pts',
      driver: 'volatility' as const,
      mutate: () => ({
        spot: input.spot,
        volatility: clamp(input.volatility + 0.02, 0.005, 4),
        timeYears: input.timeYears,
        rate: input.rate,
      }),
    },
    {
      label: '-2 vol pts',
      driver: 'volatility' as const,
      mutate: () => ({
        spot: input.spot,
        volatility: clamp(input.volatility - 0.02, 0.005, 4),
        timeYears: input.timeYears,
        rate: input.rate,
      }),
    },
    {
      label: '-3d decay',
      driver: 'time' as const,
      mutate: () => ({
        spot: input.spot,
        volatility: input.volatility,
        timeYears: Math.max(input.timeYears - (3 / 365), 1 / 3650),
        rate: input.rate,
      }),
    },
    {
      label: '+25bp rates',
      driver: 'rates' as const,
      mutate: () => ({
        spot: input.spot,
        volatility: input.volatility,
        timeYears: input.timeYears,
        rate: input.rate + 0.0025,
      }),
    },
  ];

  return scenarios.map((scenario) => {
    const mutated = scenario.mutate();
    const call = priceOption({
      model: input.model,
      optionType: 'c',
      spot: mutated.spot,
      strike: input.strike,
      timeYears: mutated.timeYears,
      rate: mutated.rate,
      volatility: mutated.volatility,
      dividendYield: input.dividendYield,
      foreignRate: input.foreignRate,
    });
    const put = priceOption({
      model: input.model,
      optionType: 'p',
      spot: mutated.spot,
      strike: input.strike,
      timeYears: mutated.timeYears,
      rate: mutated.rate,
      volatility: mutated.volatility,
      dividendYield: input.dividendYield,
      foreignRate: input.foreignRate,
    });
    const premium = call.premium + put.premium;
    const pnl = premium - basePremium;
    return {
      label: scenario.label,
      driver: scenario.driver,
      premium: Number(premium.toFixed(2)),
      pnl: Number(pnl.toFixed(2)),
      tone: pnl >= 0.3 ? 'bullish' : pnl <= -0.3 ? 'bearish' : 'neutral',
    } satisfies StrategyShockPoint;
  });
}
