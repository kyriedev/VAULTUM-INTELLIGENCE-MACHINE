import { REGIME_CONFIG } from '../../config/regime.ts';
import type {
  NormalizedMarketCandle,
  NormalizedMarketSeries,
  RegimeProxyDefinition,
} from './types.ts';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function average(values: number[]): number | null {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function sortedCandles(input: NormalizedMarketCandle[]): NormalizedMarketCandle[] {
  return [...input]
    .filter((candle) => Number.isFinite(candle.open) && Number.isFinite(candle.high) && Number.isFinite(candle.low) && Number.isFinite(candle.close))
    .sort((left, right) => Date.parse(left.time) - Date.parse(right.time));
}

function percentChange(current: number, prior: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

function computeReturns(candles: NormalizedMarketCandle[], lookback: number): number | null {
  if (candles.length < lookback + 1) return null;
  const current = candles[candles.length - 1]!;
  const prior = candles[candles.length - 1 - lookback]!;
  return percentChange(current.close, prior.close);
}

function latestRangePct(candles: NormalizedMarketCandle[]): number | null {
  if (candles.length < 2) return null;
  const latest = candles[candles.length - 1]!;
  const priorClose = candles[candles.length - 2]!.close;
  if (!priorClose) return null;
  return ((latest.high - latest.low) / priorClose) * 100;
}

function trueRanges(candles: NormalizedMarketCandle[]): number[] {
  return candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1]!.close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });
}

function atrSeries(candles: NormalizedMarketCandle[], period: number): number[] {
  const ranges = trueRanges(candles);
  const values: number[] = [];
  for (let index = period - 1; index < ranges.length; index += 1) {
    const window = ranges.slice(index - period + 1, index + 1);
    const atr = average(window);
    const close = candles[index]!.close;
    if (atr == null || !close) continue;
    values.push((atr / close) * 100);
  }
  return values;
}

function rangeExpansion(candles: NormalizedMarketCandle[], window: number): number | null {
  if (candles.length < window + 1) return null;
  const current = latestRangePct(candles);
  if (current == null) return null;
  const history = candles.slice(-(window + 1), -1);
  const baseline = average(history.map((_, index) => {
    const currentCandle = candles[candles.length - window - 1 + index]!;
    const previousClose = candles[candles.length - window - 2 + index]?.close ?? currentCandle.close;
    if (!previousClose) return 0;
    return ((currentCandle.high - currentCandle.low) / previousClose) * 100;
  }).filter((value) => Number.isFinite(value)));
  if (baseline == null || baseline === 0) return null;
  return current / baseline;
}

function atrExpansion(candles: NormalizedMarketCandle[], atrPeriod: number, window: number): number | null {
  const series = atrSeries(candles, atrPeriod);
  if (series.length < window + 1) return null;
  const current = series[series.length - 1]!;
  const baseline = average(series.slice(-window - 1, -1));
  if (baseline == null || baseline === 0) return null;
  return current / baseline;
}

function velocity(candles: NormalizedMarketCandle[], window: number): number | null {
  if (candles.length < window + 1) return null;
  const returns = [];
  for (let index = candles.length - window; index < candles.length; index += 1) {
    const prior = candles[index - 1]!;
    const current = candles[index]!;
    const move = percentChange(current.close, prior.close);
    if (move != null) returns.push(move);
  }
  return average(returns);
}

function persistence(candles: NormalizedMarketCandle[], window: number, anchorReturn: number | null): number | null {
  if (candles.length < window + 1 || anchorReturn == null || anchorReturn === 0) return null;
  const direction = Math.sign(anchorReturn);
  const sample: number[] = [];
  for (let index = candles.length - window; index < candles.length; index += 1) {
    const prior = candles[index - 1]!;
    const current = candles[index]!;
    const move = percentChange(current.close, prior.close);
    if (move == null) continue;
    sample.push(Math.sign(move) === direction ? 1 : 0);
  }
  if (!sample.length) return null;
  return average(sample) != null ? (average(sample)! * 100) : null;
}

function reversalPressure(candles: NormalizedMarketCandle[], longReturn: number | null, scale: number): number | null {
  if (candles.length < 3 || longReturn == null || longReturn === 0) return null;
  const latestMove = percentChange(candles[candles.length - 1]!.close, candles[candles.length - 2]!.close);
  if (latestMove == null) return null;
  if (Math.sign(latestMove) === Math.sign(longReturn)) return 0;
  return clamp((Math.abs(latestMove) / scale) * 100, 0, 100);
}

export function buildNormalizedSeries(input: {
  proxy: RegimeProxyDefinition;
  source: 'finnhub' | 'alphavantage' | 'yahooRelay';
  timeframe?: '1d';
  sourceSymbol: string;
  candles: NormalizedMarketCandle[];
  warnings?: string[];
}): NormalizedMarketSeries | null {
  const candles = sortedCandles(input.candles);
  if (candles.length < REGIME_CONFIG.windows.minimumBars) return null;

  const timeframe = input.timeframe ?? REGIME_CONFIG.timeframe;
  const latest = candles[candles.length - 1]!;
  const previous = candles[candles.length - 2] ?? latest;
  const returns = Object.fromEntries(
    REGIME_CONFIG.windows.returnWindows.map((window) => [`${window}d`, computeReturns(candles, window)]),
  );
  const longReturn = returns['20d'] ?? returns['60d'] ?? null;
  const atr = atrSeries(candles, REGIME_CONFIG.windows.atrPeriod).at(-1) ?? null;

  return {
    proxyId: input.proxy.id,
    label: input.proxy.label,
    symbol: input.proxy.providerSymbols[input.source],
    sourceSymbol: input.sourceSymbol,
    assetClass: input.proxy.assetClass,
    timeframe,
    last: round(latest.close),
    changePct: percentChange(latest.close, previous.close),
    high: round(latest.high),
    low: round(latest.low),
    rangePct: latestRangePct(candles),
    atr,
    timestamp: latest.time,
    source: input.source,
    freshnessMs: Math.max(0, Date.now() - Date.parse(latest.time)),
    returns,
    derived: {
      atrExpansion: atrExpansion(candles, REGIME_CONFIG.windows.atrPeriod, REGIME_CONFIG.windows.expansionWindow),
      rangeExpansion: rangeExpansion(candles, REGIME_CONFIG.windows.expansionWindow),
      velocity: velocity(candles, 3),
      persistence: persistence(candles, REGIME_CONFIG.windows.persistenceWindow, longReturn),
      reversalPressure: reversalPressure(candles, longReturn, REGIME_CONFIG.normalization.reversalScale),
    },
    candles,
    warnings: input.warnings ?? [],
  };
}
