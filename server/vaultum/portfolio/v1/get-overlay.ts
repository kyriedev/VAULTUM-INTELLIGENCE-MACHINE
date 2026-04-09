import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { fetchYahooChart } from '../../_shared/yahoo';
import { getCrossAssetRegime } from '../../liquidity/v1/get-cross-asset-regime';
import { getMacroSignals } from '../../macro/v1/get-macro-signals';
import { getMonteCarloScenario } from '../../scenario/v1/get-monte-carlo';

type OverlayAction = 'lean-long' | 'lean-short' | 'wait' | 'stand-down';
type OverlayConfidence = 'low' | 'medium' | 'high';

type BasketAsset = {
  symbol: string;
  label: string;
  role: 'primary' | 'hedge' | 'defensive' | 'diversifier';
};

type BasketConfig = {
  market: string;
  primarySymbol: string;
  assets: BasketAsset[];
};

type HistoricalAsset = BasketAsset & {
  prices: Array<{ date: string; close: number }>;
  lastPrice: number | null;
  warnings: string[];
};

type OverlayVectorItem = {
  symbol: string;
  label: string;
  role: BasketAsset['role'];
  side: 'long' | 'short' | 'flat';
  weightPct: number;
  annualReturnPct: number | null;
  annualVolatilityPct: number | null;
  correlationToPrimary: number | null;
};

type PortfolioSimulation = {
  expectedReturnPct: number;
  volatilityPct: number;
  sharpe: number;
  weights: number[];
};

type ScenarioSnapshot = {
  targetFirstProbability?: number | null;
  invalidationFirstProbability?: number | null;
  scenarioQuality?: 'high' | 'medium' | 'cautious';
};

type MacroSnapshot = {
  regime?: string;
  inferred?: {
    dollarRegime?: string;
    realYieldPressure?: string;
  };
  safeHavenPressure?: string;
  policy?: {
    fedRate?: number | null;
  };
  rates?: {
    nominal2y?: number | null;
  };
};

type CrossAssetSnapshot = {
  regime?: string;
  regimeLabel?: string;
  riskState?: string;
  componentScores?: {
    correlationScore?: number | null;
    confidenceScore?: number | null;
  };
};

export type PortfolioOverlayResponse = {
  market: string;
  timeframe: string;
  sourceLabel: string;
  summary: string;
  basket: Array<{
    symbol: string;
    label: string;
    role: BasketAsset['role'];
    annualReturnPct: number | null;
    annualVolatilityPct: number | null;
    correlationToPrimary: number | null;
    lastPrice: number | null;
  }>;
  optimization: {
    lookback: string;
    observations: number;
    riskFreeRatePct: number;
    maxSharpe: {
      expectedReturnPct: number;
      volatilityPct: number;
      sharpe: number;
      allocations: Array<{
        symbol: string;
        label: string;
        weightPct: number;
      }>;
    };
    minVolatility: {
      expectedReturnPct: number;
      volatilityPct: number;
      sharpe: number;
      allocations: Array<{
        symbol: string;
        label: string;
        weightPct: number;
      }>;
    };
  };
  recommended: {
    model: 'max-sharpe' | 'min-volatility' | 'balanced-blend' | 'defensive-hedge' | 'reserve-first';
    deployedPct: number;
    reservePct: number;
    hedgeSymbol: string | null;
    hedgeCorrelation: number | null;
    allocations: OverlayVectorItem[];
    rationale: string;
  };
  diversificationScore: number;
  concentrationRisk: 'low' | 'moderate' | 'high';
  strongestPositivePair: string | null;
  strongestNegativePair: string | null;
  warnings: string[];
};

const BASKETS: Record<string, BasketConfig> = {
  XAUUSD: {
    market: 'XAUUSD',
    primarySymbol: 'GLD',
    assets: [
      { symbol: 'GLD', label: 'Gold', role: 'primary' },
      { symbol: 'UUP', label: 'DXY', role: 'hedge' },
      { symbol: 'TLT', label: 'Duration', role: 'defensive' },
      { symbol: 'SPY', label: 'SPX', role: 'diversifier' },
    ],
  },
  US30: {
    market: 'US30',
    primarySymbol: 'DIA',
    assets: [
      { symbol: 'DIA', label: 'US30', role: 'primary' },
      { symbol: 'GLD', label: 'Gold', role: 'hedge' },
      { symbol: 'UUP', label: 'DXY', role: 'hedge' },
      { symbol: 'TLT', label: 'Duration', role: 'defensive' },
    ],
  },
  SPX: {
    market: 'SPX',
    primarySymbol: 'SPY',
    assets: [
      { symbol: 'SPY', label: 'SPX', role: 'primary' },
      { symbol: 'GLD', label: 'Gold', role: 'hedge' },
      { symbol: 'UUP', label: 'DXY', role: 'hedge' },
      { symbol: 'TLT', label: 'Duration', role: 'defensive' },
    ],
  },
  NDX: {
    market: 'NDX',
    primarySymbol: 'QQQ',
    assets: [
      { symbol: 'QQQ', label: 'NDX', role: 'primary' },
      { symbol: 'GLD', label: 'Gold', role: 'hedge' },
      { symbol: 'UUP', label: 'DXY', role: 'hedge' },
      { symbol: 'TLT', label: 'Duration', role: 'defensive' },
    ],
  },
  WTI: {
    market: 'WTI',
    primarySymbol: 'USO',
    assets: [
      { symbol: 'USO', label: 'WTI', role: 'primary' },
      { symbol: 'UUP', label: 'DXY', role: 'hedge' },
      { symbol: 'GLD', label: 'Gold', role: 'diversifier' },
      { symbol: 'XLE', label: 'Energy Equities', role: 'diversifier' },
    ],
  },
  EURUSD: {
    market: 'EURUSD',
    primarySymbol: 'FXE',
    assets: [
      { symbol: 'FXE', label: 'EUR', role: 'primary' },
      { symbol: 'UUP', label: 'DXY', role: 'hedge' },
      { symbol: 'GLD', label: 'Gold', role: 'diversifier' },
      { symbol: 'TLT', label: 'Duration', role: 'defensive' },
    ],
  },
  GBPUSD: {
    market: 'GBPUSD',
    primarySymbol: 'FXB',
    assets: [
      { symbol: 'FXB', label: 'GBP', role: 'primary' },
      { symbol: 'UUP', label: 'DXY', role: 'hedge' },
      { symbol: 'GLD', label: 'Gold', role: 'diversifier' },
      { symbol: 'TLT', label: 'Duration', role: 'defensive' },
    ],
  },
  USDJPY: {
    market: 'USDJPY',
    primarySymbol: 'UUP',
    assets: [
      { symbol: 'UUP', label: 'USD', role: 'primary' },
      { symbol: 'FXY', label: 'JPY', role: 'hedge' },
      { symbol: 'GLD', label: 'Gold', role: 'diversifier' },
      { symbol: 'TLT', label: 'Duration', role: 'defensive' },
    ],
  },
  BTCUSD: {
    market: 'BTCUSD',
    primarySymbol: 'BTC-USD',
    assets: [
      { symbol: 'BTC-USD', label: 'BTC', role: 'primary' },
      { symbol: 'GLD', label: 'Gold', role: 'hedge' },
      { symbol: 'UUP', label: 'DXY', role: 'hedge' },
      { symbol: 'QQQ', label: 'NDX', role: 'diversifier' },
    ],
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function variance(values: number[], mean?: number): number {
  if (values.length <= 1) return 0;
  const localMean = mean ?? average(values);
  return values.reduce((sum, value) => sum + ((value - localMean) ** 2), 0) / (values.length - 1);
}

function covariance(left: number[], right: number[], leftMean?: number, rightMean?: number): number {
  if (left.length <= 1 || left.length !== right.length) return 0;
  const lm = leftMean ?? average(left);
  const rm = rightMean ?? average(right);
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += (left[index]! - lm) * (right[index]! - rm);
  }
  return total / (left.length - 1);
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) || 1;
}

function makeRng(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state + 1) / 4294967297;
  };
}

function randomWeights(count: number, rng: () => number): number[] {
  const raw = Array.from({ length: count }, () => -Math.log(Math.max(rng(), 1e-9)));
  const sum = raw.reduce((total, value) => total + value, 0) || 1;
  return raw.map((value) => value / sum);
}

function dot(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + (value * (right[index] ?? 0)), 0);
}

function matrixQuadratic(weights: number[], covarianceMatrix: number[][]): number {
  let total = 0;
  for (let row = 0; row < weights.length; row += 1) {
    for (let column = 0; column < weights.length; column += 1) {
      total += weights[row]! * weights[column]! * (covarianceMatrix[row]?.[column] ?? 0);
    }
  }
  return total;
}

function resolveMarket(input?: string): string {
  const normalized = String(input || 'XAUUSD').trim().toUpperCase();
  const aliases: Record<string, string> = {
    GOLD: 'XAUUSD',
    'GC=F': 'XAUUSD',
    OIL: 'WTI',
    'CL=F': 'WTI',
    '^GSPC': 'SPX',
    SPY: 'SPX',
    '^IXIC': 'NDX',
    QQQ: 'NDX',
    '^DJI': 'US30',
    DJI: 'US30',
    DIA: 'US30',
    'YM=F': 'US30',
    BTC: 'BTCUSD',
    'BTC-USD': 'BTCUSD',
  };
  return BASKETS[aliases[normalized] ?? normalized] ? (aliases[normalized] ?? normalized) : 'XAUUSD';
}

function settlementAction(input: {
  action?: OverlayAction;
  scenario: ScenarioSnapshot | null;
  crossAsset: CrossAssetSnapshot | null;
}): OverlayAction {
  if (input.action) return input.action;
  const edge = Number(input.scenario?.targetFirstProbability ?? 50) - Number(input.scenario?.invalidationFirstProbability ?? 50);
  if (edge >= 10) return 'lean-long';
  if (edge <= -10) return 'lean-short';
  if ((input.crossAsset?.riskState || '').toLowerCase() === 'transition') return 'wait';
  return 'wait';
}

function settlementConfidence(input: { confidence?: OverlayConfidence; scenario: ScenarioSnapshot | null }): OverlayConfidence {
  if (input.confidence) return input.confidence;
  if (input.scenario?.scenarioQuality === 'high') return 'high';
  if (input.scenario?.scenarioQuality === 'medium') return 'medium';
  return 'low';
}

function settlementRiskBudget(input: { riskBudgetPct?: number; scenario: ScenarioSnapshot | null; action: OverlayAction }): number {
  if (typeof input.riskBudgetPct === 'number' && Number.isFinite(input.riskBudgetPct)) {
    return clamp(input.riskBudgetPct, 0.1, 1);
  }
  const edge = Number(input.scenario?.targetFirstProbability ?? 50) - Number(input.scenario?.invalidationFirstProbability ?? 50);
  if (input.action === 'stand-down') return 0.2;
  if (Math.abs(edge) >= 18) return 0.75;
  if (Math.abs(edge) >= 10) return 0.5;
  return 0.35;
}

async function loadHistoricalAsset(asset: BasketAsset): Promise<HistoricalAsset | null> {
  const payload = await fetchYahooChart(asset.symbol, '6mo', '1d');
  if (!payload?.candles.length) return null;
  const prices = payload.candles
    .filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
    .map((candle) => ({
      date: candle.time.slice(0, 10),
      close: candle.close,
    }));
  if (prices.length < 40) return null;
  return {
    ...asset,
    prices,
    lastPrice: prices[prices.length - 1]?.close ?? null,
    warnings: payload.warnings ?? [],
  };
}

function buildReturns(prices: Array<{ date: string; close: number }>): Array<{ date: string; value: number }> {
  const series: Array<{ date: string; value: number }> = [];
  for (let index = 1; index < prices.length; index += 1) {
    const previous = prices[index - 1]!;
    const current = prices[index]!;
    if (previous.close <= 0 || current.close <= 0) continue;
    series.push({
      date: current.date,
      value: (current.close / previous.close) - 1,
    });
  }
  return series;
}

function alignReturns(assets: HistoricalAsset[]): { dates: string[]; values: number[][] } | null {
  const series = assets.map((asset) => buildReturns(asset.prices));
  if (series.some((asset) => asset.length < 30)) return null;

  const commonDates = new Set(series[0]!.map((item) => item.date));
  for (const assetSeries of series.slice(1)) {
    const assetDates = new Set(assetSeries.map((item) => item.date));
    for (const date of [...commonDates]) {
      if (!assetDates.has(date)) commonDates.delete(date);
    }
  }

  const dates = [...commonDates].sort();
  if (dates.length < 30) return null;

  const values = series.map((assetSeries) => {
    const map = new Map(assetSeries.map((item) => [item.date, item.value]));
    return dates.map((date) => map.get(date) ?? 0);
  });

  return { dates, values };
}

function describePair(left: string, right: string, correlation: number): string {
  return `${left}/${right} ${round(correlation, 2)}`;
}

function normalizeWeights(weights: number[]): number[] {
  const sanitized = weights.map((value) => Math.max(value, 0));
  const sum = sanitized.reduce((total, value) => total + value, 0) || 1;
  return sanitized.map((value) => value / sum);
}

function blendWeights(left: number[], right: number[], alpha: number): number[] {
  return normalizeWeights(left.map((value, index) => (value * alpha) + ((right[index] ?? 0) * (1 - alpha))));
}

function capAndRebalance(weights: number[], index: number, target: number): number[] {
  const next = [...weights];
  const capped = clamp(target, 0, 1);
  const previous = next[index] ?? 0;
  next[index] = capped;
  const remainder = Math.max(1 - capped, 0);
  const otherTotal = Math.max(1 - previous, 1e-9);
  for (let position = 0; position < next.length; position += 1) {
    if (position === index) continue;
    next[position] = (next[position]! / otherTotal) * remainder;
  }
  return normalizeWeights(next);
}

function findLowestCorrelation(correlations: Array<number | null>, primaryIndex: number): number {
  let selected = -1;
  let selectedValue = Infinity;
  correlations.forEach((value, index) => {
    if (index === primaryIndex || value == null || !Number.isFinite(value)) return;
    if (value < selectedValue) {
      selectedValue = value;
      selected = index;
    }
  });
  return selected;
}

function findLowestVol(assetVols: Array<number | null>, excluded: Set<number>): number {
  let selected = -1;
  let value = Infinity;
  assetVols.forEach((assetVol, index) => {
    if (excluded.has(index) || assetVol == null || !Number.isFinite(assetVol)) return;
    if (assetVol < value) {
      value = assetVol;
      selected = index;
    }
  });
  return selected;
}

export async function getPortfolioOverlay(input: {
  market?: string;
  timeframe?: string;
  action?: OverlayAction;
  confidence?: OverlayConfidence;
  riskBudgetPct?: number;
  scenario?: ScenarioSnapshot | null;
  macroSignals?: MacroSnapshot | null;
  crossAsset?: CrossAssetSnapshot | null;
}): Promise<PortfolioOverlayResponse> {
  const market = resolveMarket(input.market);
  const timeframe = String(input.timeframe || '1h').toLowerCase();
  const seedParts = [
    market,
    timeframe,
    input.action ?? 'auto',
    input.confidence ?? 'auto',
    input.riskBudgetPct != null ? String(round(input.riskBudgetPct, 2)) : 'auto',
  ].join(':');

  return getCachedOrCompute(cacheKey('portfolio', `overlay:${seedParts}`), async () => {
    const basket = BASKETS[market] ?? BASKETS.XAUUSD;
    const [macroSignals, crossAsset, scenario] = await Promise.all([
      input.macroSignals ?? getMacroSignals().catch(() => null),
      input.crossAsset ?? getCrossAssetRegime({ market }).catch(() => null),
      input.scenario ?? getMonteCarloScenario({ market, timeframe }).catch(() => null),
    ]);

    const action = settlementAction({ action: input.action, scenario, crossAsset });
    const confidence = settlementConfidence({ confidence: input.confidence, scenario });
    const riskBudgetPct = settlementRiskBudget({ riskBudgetPct: input.riskBudgetPct, scenario, action });
    const riskFreeRatePct = clamp(
      Number(macroSignals?.policy?.fedRate ?? macroSignals?.rates?.nominal2y ?? 4.25),
      0,
      15,
    );
    const loadedAssets = (await Promise.all(basket.assets.map((asset) => loadHistoricalAsset(asset))))
      .filter((asset): asset is HistoricalAsset => Boolean(asset));

    if (loadedAssets.length < 2) {
      return {
        market,
        timeframe,
        sourceLabel: 'Portfolio overlay could not load enough tradable proxy history from Yahoo to build a covariance map, so Vaultum is leaving this sidecar inactive instead of inventing allocations.',
        summary: 'Portfolio overlay unavailable because the tradable proxy basket did not load enough history.',
        basket: basket.assets.map((asset) => ({
          symbol: asset.symbol,
          label: asset.label,
          role: asset.role,
          annualReturnPct: null,
          annualVolatilityPct: null,
          correlationToPrimary: null,
          lastPrice: null,
        })),
        optimization: {
          lookback: '6mo',
          observations: 0,
          riskFreeRatePct,
          maxSharpe: { expectedReturnPct: 0, volatilityPct: 0, sharpe: 0, allocations: [] },
          minVolatility: { expectedReturnPct: 0, volatilityPct: 0, sharpe: 0, allocations: [] },
        },
        recommended: {
          model: 'reserve-first',
          deployedPct: round(riskBudgetPct * 100),
          reservePct: round((1 - riskBudgetPct) * 100),
          hedgeSymbol: null,
          hedgeCorrelation: null,
          allocations: [],
          rationale: 'Proxy basket history was insufficient, so reserve remains the honest default.',
        },
        diversificationScore: 0,
        concentrationRisk: 'high',
        strongestPositivePair: null,
        strongestNegativePair: null,
        warnings: ['Portfolio overlay is unavailable because fewer than two tradable proxy assets returned enough history.'],
      };
    }

    const alignment = alignReturns(loadedAssets);
    if (!alignment) {
      return {
        market,
        timeframe,
        sourceLabel: 'Portfolio overlay could not align enough shared return history across the proxy basket, so Vaultum is keeping allocation guidance offline rather than faking diversification math.',
        summary: 'Portfolio overlay unavailable because shared return history across the basket was too sparse.',
        basket: loadedAssets.map((asset) => ({
          symbol: asset.symbol,
          label: asset.label,
          role: asset.role,
          annualReturnPct: null,
          annualVolatilityPct: null,
          correlationToPrimary: null,
          lastPrice: asset.lastPrice,
        })),
        optimization: {
          lookback: '6mo',
          observations: 0,
          riskFreeRatePct,
          maxSharpe: { expectedReturnPct: 0, volatilityPct: 0, sharpe: 0, allocations: [] },
          minVolatility: { expectedReturnPct: 0, volatilityPct: 0, sharpe: 0, allocations: [] },
        },
        recommended: {
          model: 'reserve-first',
          deployedPct: round(riskBudgetPct * 100),
          reservePct: round((1 - riskBudgetPct) * 100),
          hedgeSymbol: null,
          hedgeCorrelation: null,
          allocations: [],
          rationale: 'Return alignment across the proxy basket was too sparse for clean covariance math.',
        },
        diversificationScore: 0,
        concentrationRisk: 'high',
        strongestPositivePair: null,
        strongestNegativePair: null,
        warnings: ['Portfolio overlay is unavailable because common return observations across the basket were too sparse.'],
      };
    }

    const primaryIndex = Math.max(loadedAssets.findIndex((asset) => asset.symbol === basket.primarySymbol), 0);
    const means = alignment.values.map((values) => average(values));
    const annualReturns = means.map((value) => value * 252);
    const annualVols = alignment.values.map((values, index) => Math.sqrt(Math.max(variance(values, means[index]), 0)) * Math.sqrt(252));
    const annualCovariance = alignment.values.map((left, rowIndex) => alignment.values.map((right, columnIndex) => covariance(left, right, means[rowIndex], means[columnIndex]) * 252));
    const correlations = alignment.values.map((values, index) => {
      if (index === primaryIndex) return 1;
      const cov = covariance(alignment.values[primaryIndex]!, values, means[primaryIndex], means[index]);
      const denom = Math.sqrt(Math.max(variance(alignment.values[primaryIndex]!, means[primaryIndex]), 0) * Math.max(variance(values, means[index]), 0));
      return denom > 0 ? cov / denom : null;
    });

    const rng = makeRng(seedParts);
    let maxSharpe: PortfolioSimulation | null = null;
    let minVolatility: PortfolioSimulation | null = null;
    for (let simulation = 0; simulation < 3500; simulation += 1) {
      const weights = randomWeights(loadedAssets.length, rng);
      if (Math.max(...weights) > 0.72) continue;
      const expectedReturn = dot(weights, annualReturns);
      const volatility = Math.sqrt(Math.max(matrixQuadratic(weights, annualCovariance), 0));
      if (!Number.isFinite(volatility) || volatility <= 1e-9) continue;
      const sharpe = (expectedReturn - (riskFreeRatePct / 100)) / volatility;
      const snapshot = {
        expectedReturnPct: round(expectedReturn * 100),
        volatilityPct: round(volatility * 100),
        sharpe: round(sharpe, 2),
        weights,
      };
      if (!maxSharpe || snapshot.sharpe > maxSharpe.sharpe) maxSharpe = snapshot;
      if (!minVolatility || snapshot.volatilityPct < minVolatility.volatilityPct) minVolatility = snapshot;
    }

    const fallbackWeights = normalizeWeights(Array.from({ length: loadedAssets.length }, () => 1));
    maxSharpe ??= {
      expectedReturnPct: round(dot(fallbackWeights, annualReturns) * 100),
      volatilityPct: round(Math.sqrt(Math.max(matrixQuadratic(fallbackWeights, annualCovariance), 0)) * 100),
      sharpe: 0,
      weights: fallbackWeights,
    };
    minVolatility ??= {
      expectedReturnPct: round(dot(fallbackWeights, annualReturns) * 100),
      volatilityPct: round(Math.sqrt(Math.max(matrixQuadratic(fallbackWeights, annualCovariance), 0)) * 100),
      sharpe: 0,
      weights: fallbackWeights,
    };

    const strongestPositive = { pair: null as string | null, value: -Infinity };
    const strongestNegative = { pair: null as string | null, value: Infinity };
    for (let row = 0; row < loadedAssets.length; row += 1) {
      for (let column = row + 1; column < loadedAssets.length; column += 1) {
        const cov = covariance(alignment.values[row]!, alignment.values[column]!, means[row], means[column]);
        const denom = Math.sqrt(Math.max(variance(alignment.values[row]!, means[row]), 0) * Math.max(variance(alignment.values[column]!, means[column]), 0));
        if (!denom) continue;
        const corr = cov / denom;
        if (corr > strongestPositive.value) {
          strongestPositive.value = corr;
          strongestPositive.pair = describePair(loadedAssets[row]!.label, loadedAssets[column]!.label, corr);
        }
        if (corr < strongestNegative.value) {
          strongestNegative.value = corr;
          strongestNegative.pair = describePair(loadedAssets[row]!.label, loadedAssets[column]!.label, corr);
        }
      }
    }

    const hedgeIndex = findLowestCorrelation(correlations, primaryIndex);
    const safetyIndex = findLowestVol(annualVols.map((value) => value * 100), new Set([primaryIndex, hedgeIndex].filter((value) => value >= 0)));
    const reservePct = action === 'stand-down'
      ? Math.max(80, round((1 - riskBudgetPct) * 100))
      : action === 'wait'
        ? Math.max(45, round((1 - riskBudgetPct) * 100))
        : action === 'lean-short'
          ? Math.max(35, round((1 - riskBudgetPct) * 100))
          : round((1 - riskBudgetPct) * 100);
    const deployedPct = round(100 - reservePct);

    let recommendedModel: PortfolioOverlayResponse['recommended']['model'] = 'balanced-blend';
    let recommendedWeights = blendWeights(maxSharpe.weights, minVolatility.weights, confidence === 'high' ? 0.65 : confidence === 'medium' ? 0.55 : 0.45);

    if (action === 'lean-long') {
      recommendedModel = confidence === 'high' ? 'max-sharpe' : 'balanced-blend';
      recommendedWeights = capAndRebalance(recommendedWeights, primaryIndex, Math.max(recommendedWeights[primaryIndex] ?? 0, confidence === 'high' ? 0.36 : 0.28));
    } else if (action === 'lean-short') {
      recommendedModel = 'defensive-hedge';
      const defensive = [...minVolatility.weights];
      if (hedgeIndex >= 0) {
        defensive[hedgeIndex] = Math.max(defensive[hedgeIndex] ?? 0, 0.4);
      }
      const targetShortAbs = confidence === 'high' ? 0.32 : 0.24;
      recommendedWeights = capAndRebalance(defensive, primaryIndex, targetShortAbs);
      if (hedgeIndex >= 0) recommendedWeights = capAndRebalance(recommendedWeights, hedgeIndex, Math.max(recommendedWeights[hedgeIndex] ?? 0, 0.38));
    } else if (action === 'stand-down') {
      recommendedModel = 'reserve-first';
      recommendedWeights = loadedAssets.map((_, index) => (index === hedgeIndex ? 0.65 : index === safetyIndex ? 0.35 : 0));
      recommendedWeights = normalizeWeights(recommendedWeights);
    } else {
      recommendedModel = 'min-volatility';
      recommendedWeights = [...minVolatility.weights];
      recommendedWeights = capAndRebalance(recommendedWeights, primaryIndex, Math.min(recommendedWeights[primaryIndex] ?? 0, 0.16));
    }

    const hhi = recommendedWeights.reduce((sum, value) => sum + (value * value), 0);
    const effectiveCount = hhi > 0 ? 1 / hhi : 1;
    const diversificationScore = round(clamp(((effectiveCount - 1) / Math.max(loadedAssets.length - 1, 1)) * 100, 0, 100), 1);
    const concentrationRisk: PortfolioOverlayResponse['concentrationRisk'] =
      diversificationScore >= 66 && (strongestPositive.value || 0) < 0.75
        ? 'low'
        : diversificationScore >= 42 && (strongestPositive.value || 0) < 0.87
          ? 'moderate'
          : 'high';

    const recommendedAllocations: OverlayVectorItem[] = loadedAssets.map((asset, index) => {
      const side: OverlayVectorItem['side'] = action === 'lean-short' && index === primaryIndex
        ? 'short'
        : action === 'wait' && index === primaryIndex
          ? 'flat'
          : action === 'stand-down' && index === primaryIndex
            ? 'flat'
            : 'long';
      return {
        symbol: asset.symbol,
        label: asset.label,
        role: asset.role,
        side,
        weightPct: round(((recommendedWeights[index] ?? 0) * deployedPct), 1),
        annualReturnPct: round((annualReturns[index] ?? 0) * 100),
        annualVolatilityPct: round((annualVols[index] ?? 0) * 100),
        correlationToPrimary: correlations[index] != null ? round(correlations[index]!, 2) : null,
      };
    }).filter((item) => item.weightPct > 0 || item.side === 'short' || item.role === 'primary');

    if ((action === 'wait' || action === 'stand-down') && primaryIndex >= 0) {
      const primary = recommendedAllocations.find((item) => item.symbol === loadedAssets[primaryIndex]!.symbol);
      if (primary) primary.weightPct = 0;
    }

    const basketView = loadedAssets.map((asset, index) => ({
      symbol: asset.symbol,
      label: asset.label,
      role: asset.role,
      annualReturnPct: round((annualReturns[index] ?? 0) * 100),
      annualVolatilityPct: round((annualVols[index] ?? 0) * 100),
      correlationToPrimary: correlations[index] != null ? round(correlations[index]!, 2) : null,
      lastPrice: asset.lastPrice,
    }));

    const warnings = [
      strongestPositive.value >= 0.85 && strongestPositive.pair
        ? `Portfolio concentration warning: ${strongestPositive.pair} are effectively the same trade.`
        : null,
      strongestNegative.value > -0.15
        ? 'No strong negative-correlation hedge surfaced in the active proxy basket, so hedge quality is limited.'
        : null,
      concentrationRisk === 'high'
        ? `Diversification score is only ${diversificationScore}, so stacked exposure can create hidden concentration.`
        : null,
      action === 'lean-short' && hedgeIndex < 0
        ? 'Short posture is active, but the overlay did not find a clean hedge sleeve beyond reserve.'
        : null,
      action === 'stand-down'
        ? 'Risk gate is effectively reserve-first here; use the overlay as a capital-preservation map, not a deployment map.'
        : null,
      ...(loadedAssets.flatMap((asset) => asset.warnings.map((warning) => `${asset.label}: ${warning}`))).slice(0, 3),
    ].filter((value): value is string => Boolean(value));

    const hedgeSymbol = hedgeIndex >= 0 ? loadedAssets[hedgeIndex]!.label : null;
    const hedgeCorrelation = hedgeIndex >= 0 && correlations[hedgeIndex] != null ? round(correlations[hedgeIndex]!, 2) : null;
    const primaryLabel = loadedAssets[primaryIndex]?.label ?? basket.assets[0]?.label ?? market;
    const directionalLabel =
      action === 'lean-short'
        ? `${primaryLabel} short`
        : action === 'lean-long'
          ? `${primaryLabel} long`
          : `${primaryLabel} flat`;
    const rationale = [
      `${directionalLabel} is being managed through a ${recommendedModel} overlay with ${deployedPct}% deployed and ${reservePct}% reserve.`,
      hedgeSymbol ? `Best hedge sleeve is ${hedgeSymbol}${hedgeCorrelation != null ? ` at correlation ${hedgeCorrelation}` : ''}.` : 'No clean hedge sleeve surfaced from the current basket.',
      `Diversification score is ${diversificationScore} with ${concentrationRisk} concentration risk.`,
      crossAsset?.regimeLabel ? `Cross-asset regime reads ${crossAsset.regimeLabel}.` : null,
      crossAsset?.componentScores?.correlationScore != null ? `Cross-asset correlation score is ${crossAsset.componentScores.correlationScore}.` : null,
    ].filter((value): value is string => Boolean(value)).join(' ');

    return {
      market,
      timeframe,
      sourceLabel: 'Portfolio overlay adapts Smart-Portfolio-Optimizer style mean/variance and Sharpe frontier math to a live trading book using tradable proxy history, correlation warnings, and Vaultum risk-budget gating. It is an allocation sidecar, not a replacement for phase or execution logic.',
      summary: `${recommendedModel} overlay keeps ${reservePct}% in reserve and ${deployedPct}% deployed; primary stance is ${directionalLabel}, ${hedgeSymbol ? `best hedge is ${hedgeSymbol}` : 'no clean hedge surfaced'}, and diversification scores ${diversificationScore}/100.`,
      basket: basketView,
      optimization: {
        lookback: '6mo',
        observations: alignment.dates.length,
        riskFreeRatePct: round(riskFreeRatePct, 2),
        maxSharpe: {
          expectedReturnPct: maxSharpe.expectedReturnPct,
          volatilityPct: maxSharpe.volatilityPct,
          sharpe: maxSharpe.sharpe,
          allocations: loadedAssets.map((asset, index) => ({
            symbol: asset.symbol,
            label: asset.label,
            weightPct: round((maxSharpe!.weights[index] ?? 0) * 100, 1),
          })),
        },
        minVolatility: {
          expectedReturnPct: minVolatility.volatilityPct === Infinity ? 0 : minVolatility.expectedReturnPct,
          volatilityPct: minVolatility.volatilityPct,
          sharpe: minVolatility.sharpe,
          allocations: loadedAssets.map((asset, index) => ({
            symbol: asset.symbol,
            label: asset.label,
            weightPct: round((minVolatility!.weights[index] ?? 0) * 100, 1),
          })),
        },
      },
      recommended: {
        model: recommendedModel,
        deployedPct,
        reservePct,
        hedgeSymbol,
        hedgeCorrelation,
        allocations: recommendedAllocations,
        rationale,
      },
      diversificationScore,
      concentrationRisk,
      strongestPositivePair: strongestPositive.pair,
      strongestNegativePair: strongestNegative.pair,
      warnings,
    };
  }, 600);
}
