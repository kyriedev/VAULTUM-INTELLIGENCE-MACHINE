export type QuantagentCandle = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type IndicatorStackProfile = {
  bias: 'bullish' | 'neutral' | 'bearish';
  confidence: number;
  score: number;
  rsi14: number;
  macdHist: number;
  macdSignalDelta: number;
  stochasticK: number;
  stochasticD: number;
  roc10: number;
  williamsR14: number;
  summary: string;
};

export type TrendStructureProfile = {
  bias: 'bullish' | 'neutral' | 'bearish';
  pattern:
    | 'ascending-channel'
    | 'descending-channel'
    | 'rising-wedge'
    | 'falling-wedge'
    | 'ascending-triangle'
    | 'descending-triangle'
    | 'rectangle'
    | 'mixed';
  breakoutPressure: 'bullish' | 'neutral' | 'bearish';
  compression: 'compressing' | 'stable' | 'expanding';
  location: 'lower-third' | 'mid-band' | 'upper-third';
  supportSlopePctPerBar: number;
  resistanceSlopePctPerBar: number;
  closeSlopePctPerBar: number;
  slopeSpreadPctPerBar: number;
  supportLevel: number;
  resistanceLevel: number;
  closeSupportLevel: number;
  closeResistanceLevel: number;
  channelWidthPct: number;
  widthChangePct: number;
  supportTouches: number;
  resistanceTouches: number;
  summary: string;
};

type TrendLine = {
  slope: number;
  intercept: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function ema(values: number[], window: number): number[] {
  if (!values.length) return [];
  const alpha = 2 / (window + 1);
  const result: number[] = [];
  values.forEach((value, index) => {
    if (index === 0) {
      result.push(value);
      return;
    }
    result.push((value * alpha) + (result[index - 1]! * (1 - alpha)));
  });
  return result;
}

function sma(values: number[], window: number): number[] {
  const result: number[] = [];
  values.forEach((_value, index) => {
    const start = Math.max(0, index - window + 1);
    result.push(average(values.slice(start, index + 1)));
  });
  return result;
}

function calculateRsi(values: number[], period = 14): number[] {
  if (!values.length) return [];
  const gains: number[] = [];
  const losses: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index]! - values[index - 1]!;
    gains.push(delta > 0 ? delta : 0);
    losses.push(delta < 0 ? Math.abs(delta) : 0);
  }

  const rsi: number[] = [50];
  for (let index = 0; index < gains.length; index += 1) {
    const start = Math.max(0, index - period + 1);
    const avgGain = average(gains.slice(start, index + 1));
    const avgLoss = average(losses.slice(start, index + 1));
    if (!avgLoss) {
      rsi.push(100);
      continue;
    }
    const rs = avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }
  return rsi;
}

function calculateMacd(values: number[]): { macd: number; signal: number; hist: number } {
  if (values.length < 35) return { macd: 0, signal: 0, hist: 0 };
  const ema12 = ema(values, 12);
  const ema26 = ema(values, 26);
  const macdSeries = values.map((_value, index) => (ema12[index] || 0) - (ema26[index] || 0));
  const signalSeries = ema(macdSeries, 9);
  const macd = macdSeries[macdSeries.length - 1] || 0;
  const signal = signalSeries[signalSeries.length - 1] || 0;
  return {
    macd,
    signal,
    hist: macd - signal,
  };
}

function calculateStochastic(candles: QuantagentCandle[], period = 14): { k: number; d: number } {
  if (candles.length < period + 3) return { k: 50, d: 50 };
  const rawK: number[] = [];
  candles.forEach((_candle, index) => {
    const start = Math.max(0, index - period + 1);
    const window = candles.slice(start, index + 1);
    const highestHigh = Math.max(...window.map((item) => item.high));
    const lowestLow = Math.min(...window.map((item) => item.low));
    const close = candles[index]!.close;
    const range = Math.max(highestHigh - lowestLow, 1e-9);
    rawK.push(((close - lowestLow) / range) * 100);
  });

  const smoothK = sma(rawK, 3);
  const smoothD = sma(smoothK, 3);
  return {
    k: smoothK[smoothK.length - 1] || 50,
    d: smoothD[smoothD.length - 1] || 50,
  };
}

function calculateRoc(values: number[], period = 10): number {
  if (values.length <= period) return 0;
  const current = values[values.length - 1]!;
  const previous = values[values.length - 1 - period]!;
  if (!previous) return 0;
  return ((current / previous) - 1) * 100;
}

function calculateWilliamsR(candles: QuantagentCandle[], period = 14): number {
  if (candles.length < period) return -50;
  const window = candles.slice(-period);
  const highestHigh = Math.max(...window.map((item) => item.high));
  const lowestLow = Math.min(...window.map((item) => item.low));
  const latestClose = candles[candles.length - 1]!.close;
  const range = Math.max(highestHigh - lowestLow, 1e-9);
  return ((highestHigh - latestClose) / range) * -100;
}

function lineValues(line: TrendLine, length: number): number[] {
  return Array.from({ length }, (_item, index) => (line.slope * index) + line.intercept);
}

function checkTrendLine(support: boolean, pivot: number, slope: number, series: number[]): number {
  const intercept = (-slope * pivot) + series[pivot]!;
  const values = lineValues({ slope, intercept }, series.length);
  const diffs = values.map((value, index) => value - series[index]!);

  const maxDiff = Math.max(...diffs);
  const minDiff = Math.min(...diffs);
  if (support && maxDiff > 1e-5) return -1;
  if (!support && minDiff < -1e-5) return -1;
  return diffs.reduce((sum, value) => sum + (value ** 2), 0);
}

function optimizeSlope(support: boolean, pivot: number, initialSlope: number, series: number[]): TrendLine {
  const slopeUnit = (Math.max(...series) - Math.min(...series)) / Math.max(series.length, 1);
  let bestSlope = initialSlope;
  let bestError = checkTrendLine(support, pivot, initialSlope, series);
  if (bestError < 0) {
    bestSlope = 0;
    bestError = checkTrendLine(support, pivot, 0, series);
  }
  if (bestError < 0) {
    return { slope: initialSlope, intercept: (-initialSlope * pivot) + series[pivot]! };
  }

  let currentStep = 1;
  const minStep = 0.0001;
  let derivative: number | null = null;
  let recomputeDerivative = true;

  while (currentStep > minStep) {
    if (recomputeDerivative) {
      let probeSlope = bestSlope + (slopeUnit * minStep);
      let testError = checkTrendLine(support, pivot, probeSlope, series);
      derivative = testError - bestError;

      if (testError < 0) {
        probeSlope = bestSlope - (slopeUnit * minStep);
        testError = checkTrendLine(support, pivot, probeSlope, series);
        derivative = bestError - testError;
      }

      if (testError < 0 || derivative == null || Number.isNaN(derivative)) {
        break;
      }
      recomputeDerivative = false;
    }

    const currentDerivative = derivative ?? 0;
    const testSlope = currentDerivative > 0
      ? bestSlope - (slopeUnit * currentStep)
      : bestSlope + (slopeUnit * currentStep);
    const testError = checkTrendLine(support, pivot, testSlope, series);
    if (testError < 0 || testError >= bestError) {
      currentStep *= 0.5;
    } else {
      bestSlope = testSlope;
      bestError = testError;
      recomputeDerivative = true;
    }
  }

  return {
    slope: bestSlope,
    intercept: (-bestSlope * pivot) + series[pivot]!,
  };
}

function fitTrendlinesSingle(values: number[]): { support: TrendLine; resistance: TrendLine } {
  const x = values.map((_value, index) => index);
  const xMean = average(x);
  const yMean = average(values);
  const numerator = values.reduce((sum, value, index) => sum + ((index - xMean) * (value - yMean)), 0);
  const denominator = values.reduce((sum, _value, index) => sum + ((index - xMean) ** 2), 0) || 1e-9;
  const initialSlope = numerator / denominator;
  const initialIntercept = yMean - (initialSlope * xMean);
  const baseline = x.map((index) => (initialSlope * index) + initialIntercept);
  const upperPivot = values.reduce((bestIndex, value, index) => ((value - baseline[index]!) > (values[bestIndex]! - baseline[bestIndex]!) ? index : bestIndex), 0);
  const lowerPivot = values.reduce((bestIndex, value, index) => ((value - baseline[index]!) < (values[bestIndex]! - baseline[bestIndex]!) ? index : bestIndex), 0);

  return {
    support: optimizeSlope(true, lowerPivot, initialSlope, values),
    resistance: optimizeSlope(false, upperPivot, initialSlope, values),
  };
}

function fitTrendlinesHighLow(highs: number[], lows: number[], closes: number[]): { support: TrendLine; resistance: TrendLine } {
  const x = closes.map((_value, index) => index);
  const xMean = average(x);
  const yMean = average(closes);
  const numerator = closes.reduce((sum, value, index) => sum + ((index - xMean) * (value - yMean)), 0);
  const denominator = closes.reduce((sum, _value, index) => sum + ((index - xMean) ** 2), 0) || 1e-9;
  const initialSlope = numerator / denominator;
  const initialIntercept = yMean - (initialSlope * xMean);
  const baseline = x.map((index) => (initialSlope * index) + initialIntercept);
  const upperPivot = highs.reduce((bestIndex, value, index) => ((value - baseline[index]!) > (highs[bestIndex]! - baseline[bestIndex]!) ? index : bestIndex), 0);
  const lowerPivot = lows.reduce((bestIndex, value, index) => ((value - baseline[index]!) < (lows[bestIndex]! - baseline[bestIndex]!) ? index : bestIndex), 0);

  return {
    support: optimizeSlope(true, lowerPivot, initialSlope, lows),
    resistance: optimizeSlope(false, upperPivot, initialSlope, highs),
  };
}

function classifyPattern(
  supportSlope: number,
  resistanceSlope: number,
  startWidth: number,
  endWidth: number,
  latestClose: number,
): TrendStructureProfile['pattern'] {
  const slopeFlatThreshold = latestClose * 0.00035;
  const parallelTolerance = latestClose * 0.0003;

  const bothPositive = supportSlope > slopeFlatThreshold && resistanceSlope > slopeFlatThreshold;
  const bothNegative = supportSlope < -slopeFlatThreshold && resistanceSlope < -slopeFlatThreshold;
  const widthCompressing = endWidth < (startWidth * 0.94);

  if (Math.abs(supportSlope) <= slopeFlatThreshold && Math.abs(resistanceSlope) <= slopeFlatThreshold) return 'rectangle';
  if (supportSlope > slopeFlatThreshold && Math.abs(resistanceSlope) <= slopeFlatThreshold * 1.35) return 'ascending-triangle';
  if (resistanceSlope < -slopeFlatThreshold && Math.abs(supportSlope) <= slopeFlatThreshold * 1.35) return 'descending-triangle';

  if (bothPositive) {
    if (Math.abs(supportSlope - resistanceSlope) <= parallelTolerance) return 'ascending-channel';
    if (supportSlope > resistanceSlope && widthCompressing) return 'rising-wedge';
    return 'ascending-channel';
  }

  if (bothNegative) {
    if (Math.abs(supportSlope - resistanceSlope) <= parallelTolerance) return 'descending-channel';
    if (supportSlope > resistanceSlope && widthCompressing) return 'falling-wedge';
    return 'descending-channel';
  }

  return 'mixed';
}

export function buildIndicatorStackProfile(candles: QuantagentCandle[]): IndicatorStackProfile {
  const closes = candles.map((candle) => candle.close);
  const rsi14 = calculateRsi(closes, 14);
  const macd = calculateMacd(closes);
  const macdHistorySeries = closes.length >= 36
    ? ema(closes, 12).map((value, index) => value - (ema(closes, 26)[index] || 0)).map((value, index, values) => value - (ema(values, 9)[index] || 0))
    : [0];
  const previousMacdHist = macdHistorySeries[macdHistorySeries.length - 2] || 0;
  const stochastic = calculateStochastic(candles, 14);
  const roc10 = calculateRoc(closes, 10);
  const williamsR14 = calculateWilliamsR(candles, 14);

  let score = 0;
  if ((rsi14[rsi14.length - 1] || 50) >= 55) score += 18;
  if ((rsi14[rsi14.length - 1] || 50) <= 45) score -= 18;
  if (macd.hist > 0) score += 16;
  if (macd.hist < 0) score -= 16;
  if (macd.hist > previousMacdHist) score += 8;
  if (macd.hist < previousMacdHist) score -= 8;
  if (stochastic.k > stochastic.d && stochastic.k >= 55) score += 14;
  if (stochastic.k < stochastic.d && stochastic.k <= 45) score -= 14;
  if (roc10 > 0) score += 16;
  if (roc10 < 0) score -= 16;
  if (williamsR14 > -45) score += 10;
  if (williamsR14 < -55) score -= 10;

  const bias = score >= 18 ? 'bullish' : score <= -18 ? 'bearish' : 'neutral';
  const confidence = clamp(Math.round(Math.abs(score) * 1.15), 28, 90);
  const latestRsi = rsi14[rsi14.length - 1] || 50;

  const summary = bias === 'bullish'
    ? `Indicator stack is constructive: RSI ${latestRsi.toFixed(1)}, MACD histogram ${macd.hist.toFixed(3)} and ROC ${roc10.toFixed(2)} all lean positive.`
    : bias === 'bearish'
      ? `Indicator stack is defensive: RSI ${latestRsi.toFixed(1)}, MACD histogram ${macd.hist.toFixed(3)} and ROC ${roc10.toFixed(2)} all lean negative.`
      : `Indicator stack is mixed: RSI ${latestRsi.toFixed(1)}, MACD histogram ${macd.hist.toFixed(3)}, and ROC ${roc10.toFixed(2)} are not aligned enough for a clean read.`;

  return {
    bias,
    confidence,
    score,
    rsi14: Number(latestRsi.toFixed(1)),
    macdHist: Number(macd.hist.toFixed(3)),
    macdSignalDelta: Number((macd.macd - macd.signal).toFixed(3)),
    stochasticK: Number(stochastic.k.toFixed(1)),
    stochasticD: Number(stochastic.d.toFixed(1)),
    roc10: Number(roc10.toFixed(2)),
    williamsR14: Number(williamsR14.toFixed(1)),
    summary,
  };
}

export function buildTrendStructureProfile(candles: QuantagentCandle[]): TrendStructureProfile {
  const recent = candles.slice(-Math.min(50, candles.length));
  const highs = recent.map((candle) => candle.high);
  const lows = recent.map((candle) => candle.low);
  const closes = recent.map((candle) => candle.close);
  const latestClose = closes[closes.length - 1] || 0;
  const closeLines = fitTrendlinesSingle(closes);
  const rangeLines = fitTrendlinesHighLow(highs, lows, closes);
  const supportValues = lineValues(rangeLines.support, recent.length);
  const resistanceValues = lineValues(rangeLines.resistance, recent.length);
  const closeSupportValues = lineValues(closeLines.support, recent.length);
  const closeResistanceValues = lineValues(closeLines.resistance, recent.length);

  const supportLevel = supportValues[supportValues.length - 1] || latestClose;
  const resistanceLevel = resistanceValues[resistanceValues.length - 1] || latestClose;
  const closeSupportLevel = closeSupportValues[closeSupportValues.length - 1] || latestClose;
  const closeResistanceLevel = closeResistanceValues[closeResistanceValues.length - 1] || latestClose;
  const startWidth = Math.max((resistanceValues[0] || latestClose) - (supportValues[0] || latestClose), 1e-9);
  const endWidth = Math.max(resistanceLevel - supportLevel, 1e-9);
  const channelWidthPct = (endWidth / Math.max(latestClose, 1e-9)) * 100;
  const widthChangePct = ((endWidth - startWidth) / Math.max(Math.abs(startWidth), 1e-9)) * 100;
  const locationRatio = clamp((latestClose - supportLevel) / Math.max(endWidth, 1e-9), 0, 1);
  const compression = widthChangePct <= -12 ? 'compressing' : widthChangePct >= 12 ? 'expanding' : 'stable';
  const location = locationRatio <= 0.33 ? 'lower-third' : locationRatio >= 0.67 ? 'upper-third' : 'mid-band';
  const supportSlopePctPerBar = (rangeLines.support.slope / Math.max(latestClose, 1e-9)) * 100;
  const resistanceSlopePctPerBar = (rangeLines.resistance.slope / Math.max(latestClose, 1e-9)) * 100;
  const closeSlopePctPerBar = (((closeLines.support.slope + closeLines.resistance.slope) * 0.5) / Math.max(latestClose, 1e-9)) * 100;
  const slopeSpreadPctPerBar = resistanceSlopePctPerBar - supportSlopePctPerBar;
  const pattern = classifyPattern(rangeLines.support.slope, rangeLines.resistance.slope, startWidth, endWidth, latestClose);
  const tolerance = Math.max(latestClose * 0.0015, standardDeviation(closes.slice(-10)) * 0.35, 0.1);
  const supportTouches = recent.filter((candle, index) => Math.abs(candle.low - supportValues[index]!) <= tolerance).length;
  const resistanceTouches = recent.filter((candle, index) => Math.abs(candle.high - resistanceValues[index]!) <= tolerance).length;

  let breakoutPressure: TrendStructureProfile['breakoutPressure'] = 'neutral';
  if (latestClose >= (resistanceLevel - tolerance) || (location === 'upper-third' && resistanceSlopePctPerBar > -0.015)) {
    breakoutPressure = pattern === 'rising-wedge' ? 'bearish' : 'bullish';
  } else if (latestClose <= (supportLevel + tolerance) || (location === 'lower-third' && supportSlopePctPerBar < 0.015)) {
    breakoutPressure = pattern === 'falling-wedge' ? 'bullish' : 'bearish';
  }

  let bias: TrendStructureProfile['bias'] = 'neutral';
  if (pattern === 'ascending-channel' || pattern === 'ascending-triangle' || pattern === 'falling-wedge') bias = 'bullish';
  if (pattern === 'descending-channel' || pattern === 'descending-triangle' || pattern === 'rising-wedge') bias = 'bearish';
  if (breakoutPressure !== 'neutral') bias = breakoutPressure;

  const summary = bias === 'bullish'
    ? `Trend structure is ${pattern} with ${compression} width, ${location} price placement, and ${breakoutPressure} breakout pressure into ${resistanceLevel.toFixed(2)}.`
    : bias === 'bearish'
      ? `Trend structure is ${pattern} with ${compression} width, ${location} price placement, and ${breakoutPressure} breakdown pressure toward ${supportLevel.toFixed(2)}.`
      : `Trend structure is ${pattern} with ${compression} width and ${location} placement, but the channel does not yet force a directional break.`;

  return {
    bias,
    pattern,
    breakoutPressure,
    compression,
    location,
    supportSlopePctPerBar: Number(supportSlopePctPerBar.toFixed(3)),
    resistanceSlopePctPerBar: Number(resistanceSlopePctPerBar.toFixed(3)),
    closeSlopePctPerBar: Number(closeSlopePctPerBar.toFixed(3)),
    slopeSpreadPctPerBar: Number(slopeSpreadPctPerBar.toFixed(3)),
    supportLevel: Number(supportLevel.toFixed(2)),
    resistanceLevel: Number(resistanceLevel.toFixed(2)),
    closeSupportLevel: Number(closeSupportLevel.toFixed(2)),
    closeResistanceLevel: Number(closeResistanceLevel.toFixed(2)),
    channelWidthPct: Number(channelWidthPct.toFixed(2)),
    widthChangePct: Number(widthChangePct.toFixed(2)),
    supportTouches,
    resistanceTouches,
    summary,
  };
}
