import { fetchOandaCandles, granularityForOanda, mapToOandaInstrument, oandaConfigured } from '../../_shared/oanda';
import { fetchYahooChart } from '../../_shared/yahoo';
import {
  buildIndicatorStackProfile,
  buildTrendStructureProfile,
  type IndicatorStackProfile,
  type QuantagentCandle,
  type TrendStructureProfile,
} from './_quantagent';
import { classifyThreeStateMarketRegime, type ThreeStateMarketRegimeSnapshot } from './_three-state-regime';

type Candle = QuantagentCandle & {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

type CommitteeSignalState = 'bullish' | 'neutral' | 'bearish';

export type TechnicalCommitteeVote = {
  key: 'trend' | 'indicator-stack' | 'mean-reversion' | 'momentum' | 'volatility' | 'stat-arb';
  label: string;
  signal: CommitteeSignalState;
  confidence: number;
  weight: number;
  score: number;
  explanation: string;
  metrics: Record<string, number | string | null>;
};

export type TechnicalCommitteeResponse = {
  market: string;
  timeframe: string;
  sourceSymbol: string;
  sourceLabel: string;
  feedQuality: 'strong' | 'usable' | 'weak';
  status: 'confirmed' | 'estimated';
  consensus: CommitteeSignalState;
  bias: string;
  ensembleScore: number;
  confidence: 'low' | 'medium' | 'high';
  voteBalance: {
    bullish: number;
    bearish: number;
    neutral: number;
  };
  volatilityPercentile: number;
  marketRegime: ThreeStateMarketRegimeSnapshot;
  indicatorStack: IndicatorStackProfile;
  trendStructure: TrendStructureProfile;
  votes: TechnicalCommitteeVote[];
  summary: string;
};

export type ExecutionRiskEnvelope = {
  actionMode: 'aggressive' | 'standard' | 'cautious' | 'suppressed';
  sizeBand: 'full' | 'standard' | 'reduced' | 'small' | 'stand-down';
  riskBudgetPct: number;
  riskScore: number;
  tradeSuppression: boolean;
  eventRiskScore: number;
  qualityScore: number;
  volatilityPercentile: number;
  reasons: string[];
  body: string;
};

function resolveSymbol(market: string): string {
  const value = String(market || 'XAUUSD').toUpperCase();
  const map: Record<string, string> = {
    XAUUSD: 'GC=F',
    GOLD: 'GC=F',
    WTI: 'CL=F',
    OIL: 'CL=F',
    EURUSD: 'EURUSD=X',
    GBPUSD: 'GBPUSD=X',
    USDJPY: 'USDJPY=X',
    GBPJPY: 'GBPJPY=X',
    EURJPY: 'EURJPY=X',
    DXY: 'DX-Y.NYB',
    SPX: '^GSPC',
    NDX: '^IXIC',
    US30: 'DIA',
    '^DJI': 'DIA',
    DJI: 'DIA',
    DIA: 'DIA',
    'YM=F': 'DIA',
    BTCUSD: 'BTC-USD',
  };
  return map[value] ?? value;
}

function intradaySpec(timeframe: string): { yahooRange: string; yahooInterval: string; count: number; sourceTimeframe: string } {
  switch (String(timeframe || '1h').toLowerCase()) {
    case '15m':
      return { yahooRange: '14d', yahooInterval: '15m', count: 280, sourceTimeframe: '15m' };
    case '30m':
      return { yahooRange: '1mo', yahooInterval: '30m', count: 260, sourceTimeframe: '30m' };
    case '4h':
      return { yahooRange: '3mo', yahooInterval: '1h', count: 260, sourceTimeframe: '4h' };
    case '1d':
      return { yahooRange: '1y', yahooInterval: '1d', count: 260, sourceTimeframe: '1d' };
    default:
      return { yahooRange: '1mo', yahooInterval: '1h', count: 260, sourceTimeframe: '1h' };
  }
}

function dailySpec(): { yahooRange: string; yahooInterval: string; count: number } {
  return { yahooRange: '1y', yahooInterval: '1d', count: 260 };
}

async function fetchPreferredCandles(
  market: string,
  symbol: string,
  timeframe: string,
  yahooRange: string,
  yahooInterval: string,
  count: number,
): Promise<{ candles: Candle[]; source: 'oanda' | 'yahoo' }> {
  if (oandaConfigured() && mapToOandaInstrument(market)) {
    const candles = await fetchOandaCandles(market, granularityForOanda(timeframe), count);
    if (candles.length) {
      return {
        candles: candles.map((candle) => ({
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        })),
        source: 'oanda',
      };
    }
  }

  const payload = await fetchYahooChart(symbol, yahooRange, yahooInterval);
  if (!payload?.candles.length) throw new Error(payload?.warnings?.[0] || 'No Yahoo execution committee candles available');
  return {
    candles: payload.candles.map((candle) => ({
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    })),
    source: 'yahoo',
  };
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safe(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function ema(values: number[], window: number): number[] {
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

function rollingStd(values: number[], window: number): number[] {
  const result: number[] = [];
  values.forEach((_value, index) => {
    const start = Math.max(0, index - window + 1);
    result.push(standardDeviation(values.slice(start, index + 1)));
  });
  return result;
}

function pctChanges(values: number[]): number[] {
  return values.slice(1).map((value, index) => {
    const previous = values[index];
    if (!previous) return 0;
    return (value / previous) - 1;
  });
}

function calculateRsi(values: number[], period: number): number[] {
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

function calculateAtr(candles: Candle[], period: number): number[] {
  const trValues: number[] = [];
  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index]!;
    const previousClose = index > 0 ? candles[index - 1]!.close : candle.close;
    const tr = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
    trValues.push(tr);
  }
  return sma(trValues, period);
}

function calculateAdx(candles: Candle[], period = 14): { adx: number; plusDi: number; minusDi: number } {
  if (candles.length < period + 2) return { adx: 18, plusDi: 0, minusDi: 0 };

  const tr: number[] = [];
  const plusDm: number[] = [];
  const minusDm: number[] = [];

  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index]!;
    const previous = candles[index - 1]!;
    const upMove = current.high - previous.high;
    const downMove = previous.low - current.low;
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    ));
  }

  const trSmoothed = sma(tr, period);
  const plusSmoothed = sma(plusDm, period);
  const minusSmoothed = sma(minusDm, period);
  const dx: number[] = [];

  for (let index = 0; index < trSmoothed.length; index += 1) {
    const divisor = trSmoothed[index] || 1e-9;
    const plusDi = 100 * ((plusSmoothed[index] || 0) / divisor);
    const minusDi = 100 * ((minusSmoothed[index] || 0) / divisor);
    const total = plusDi + minusDi;
    dx.push(total ? (100 * Math.abs(plusDi - minusDi)) / total : 0);
  }

  const adxSeries = ema(dx, period);
  return {
    adx: safe(adxSeries[adxSeries.length - 1], 18),
    plusDi: safe((100 * ((plusSmoothed[plusSmoothed.length - 1] || 0) / (trSmoothed[trSmoothed.length - 1] || 1e-9))), 0),
    minusDi: safe((100 * ((minusSmoothed[minusSmoothed.length - 1] || 0) / (trSmoothed[trSmoothed.length - 1] || 1e-9))), 0),
  };
}

function calculateHurst(values: number[], maxLag = 20): number {
  if (values.length < maxLag + 5) return 0.5;
  const lags = Array.from({ length: Math.max(0, maxLag - 2) }, (_, index) => index + 2);
  const tau = lags.map((lag) => {
    const diffs: number[] = [];
    for (let index = lag; index < values.length; index += 1) {
      diffs.push(values[index]! - values[index - lag]!);
    }
    return Math.max(Math.sqrt(standardDeviation(diffs)), 1e-8);
  });

  const xMean = average(lags.map((lag) => Math.log(lag)));
  const yMean = average(tau.map((value) => Math.log(value)));
  let numerator = 0;
  let denominator = 0;
  lags.forEach((lag, index) => {
    const x = Math.log(lag) - xMean;
    const y = Math.log(tau[index]!) - yMean;
    numerator += x * y;
    denominator += x * x;
  });

  if (!denominator) return 0.5;
  return clamp(numerator / denominator, 0.1, 0.9);
}

function signalScore(signal: CommitteeSignalState, confidence: number, weight: number): number {
  const signed = signal === 'bullish' ? 1 : signal === 'bearish' ? -1 : 0;
  return signed * confidence * weight;
}

function confidenceLabel(score: number): 'low' | 'medium' | 'high' {
  const absolute = Math.abs(score);
  if (absolute >= 42) return 'high';
  if (absolute >= 18) return 'medium';
  return 'low';
}

function feedQuality(symbol: string, intradaySource: 'oanda' | 'yahoo', dailyVolumes: number[]): { quality: 'strong' | 'usable' | 'weak'; status: 'confirmed' | 'estimated'; sourceLabel: string } {
  if (intradaySource === 'oanda') {
    return {
      quality: 'usable',
      status: 'confirmed',
      sourceLabel: 'Execution committee uses OANDA broker candles for supported FX and spot symbols; this is live broker structure, not centralized exchange tape.',
    };
  }

  if (/=X$/.test(symbol)) {
    return {
      quality: 'weak',
      status: 'estimated',
      sourceLabel: 'Execution committee uses Yahoo OTC FX candles here, so the technical vote stack is live but estimated from broker-style candle structure rather than exchange tape.',
    };
  }

  const averageVolume = average(dailyVolumes.filter((value) => value > 0));
  return {
    quality: averageVolume > 0 ? 'strong' : 'usable',
    status: 'confirmed',
    sourceLabel: averageVolume > 0
      ? 'Execution committee uses live traded candles with volume-backed confirmation for this market.'
      : 'Execution committee uses live traded candles, but volume completeness is limited.',
  };
}

function deriveSignalFromScore(score: number): CommitteeSignalState {
  if (score >= 18) return 'bullish';
  if (score <= -18) return 'bearish';
  return 'neutral';
}

export async function getTechnicalCommittee(input: { market?: string; timeframe?: string }): Promise<TechnicalCommitteeResponse> {
  const market = String(input.market || 'XAUUSD').toUpperCase();
  const timeframe = String(input.timeframe || '1h').toLowerCase();
  const sourceSymbol = resolveSymbol(market);
  const intraday = intradaySpec(timeframe);
  const daily = dailySpec();

  const [intradayFeed, dailyFeed] = await Promise.all([
    fetchPreferredCandles(market, sourceSymbol, intraday.sourceTimeframe, intraday.yahooRange, intraday.yahooInterval, intraday.count),
    fetchPreferredCandles(market, sourceSymbol, '1d', daily.yahooRange, daily.yahooInterval, daily.count),
  ]);

  const intradayCandles = intradayFeed.candles.filter((candle) => Number.isFinite(candle.close));
  const dailyCandles = dailyFeed.candles.filter((candle) => Number.isFinite(candle.close));
  if (intradayCandles.length < 90 || dailyCandles.length < 80) {
    throw new Error(`Technical committee could not build enough candle history for ${market}.`);
  }

  const intradayCloses = intradayCandles.map((candle) => candle.close);
  const dailyCloses = dailyCandles.map((candle) => candle.close);
  const intradayVolumes = intradayCandles.map((candle) => candle.volume ?? 0);
  const dailyVolumes = dailyCandles.map((candle) => candle.volume ?? 0);
  const marketRegime = classifyThreeStateMarketRegime(dailyCloses);
  const indicatorStack = buildIndicatorStackProfile(intradayCandles);
  const trendStructure = buildTrendStructureProfile(intradayCandles);

  const ema8 = ema(intradayCloses, 8);
  const ema21 = ema(intradayCloses, 21);
  const ema55 = ema(intradayCloses, 55);
  const adx = calculateAdx(intradayCandles, 14);
  const trendState =
    ema8[ema8.length - 1]! > ema21[ema21.length - 1]! && ema21[ema21.length - 1]! > ema55[ema55.length - 1]!
      ? 'bullish'
      : ema8[ema8.length - 1]! < ema21[ema21.length - 1]! && ema21[ema21.length - 1]! < ema55[ema55.length - 1]!
        ? 'bearish'
        : 'neutral';
  const trendConfidence = trendState === 'neutral'
    ? clamp(28 + (adx.adx * 0.3), 20, 55)
    : clamp((adx.adx * 1.45) + 18, 38, 94);
  const trendVote: TechnicalCommitteeVote = {
    key: 'trend',
    label: 'Trend',
    signal: trendState,
    confidence: Number(trendConfidence.toFixed(1)),
    weight: 0.25,
    score: Number(signalScore(trendState, trendConfidence, 0.25).toFixed(1)),
    explanation: trendState === 'bullish'
      ? `Fast and medium averages are stacked higher with trend strength confirmation inside a ${trendStructure.pattern} structure.`
      : trendState === 'bearish'
        ? `Fast and medium averages are stacked lower with trend strength confirmation inside a ${trendStructure.pattern} structure.`
        : `Moving averages are compressed, and the active ${trendStructure.pattern} channel is not decisive yet.`,
    metrics: {
      ema8: Number(ema8[ema8.length - 1]!.toFixed(2)),
      ema21: Number(ema21[ema21.length - 1]!.toFixed(2)),
      ema55: Number(ema55[ema55.length - 1]!.toFixed(2)),
      adx: Number(adx.adx.toFixed(1)),
      channelPattern: trendStructure.pattern,
      breakoutPressure: trendStructure.breakoutPressure,
      channelWidthPct: trendStructure.channelWidthPct,
      channelLocation: trendStructure.location,
    },
  };

  const indicatorVote: TechnicalCommitteeVote = {
    key: 'indicator-stack',
    label: 'Indicator Stack',
    signal: indicatorStack.bias,
    confidence: Number(indicatorStack.confidence.toFixed(1)),
    weight: 0.18,
    score: Number(signalScore(indicatorStack.bias, indicatorStack.confidence, 0.18).toFixed(1)),
    explanation: indicatorStack.summary,
    metrics: {
      rsi14: indicatorStack.rsi14,
      macdHist: indicatorStack.macdHist,
      stochasticK: indicatorStack.stochasticK,
      stochasticD: indicatorStack.stochasticD,
      roc10: indicatorStack.roc10,
      williamsR14: indicatorStack.williamsR14,
    },
  };

  const mean50 = sma(intradayCloses, 50);
  const std50 = rollingStd(intradayCloses, 50);
  const latestStd50 = std50[std50.length - 1] || 1e-9;
  const zScore = (intradayCloses[intradayCloses.length - 1]! - mean50[mean50.length - 1]!) / latestStd50;
  const bbUpper = mean50[mean50.length - 1]! + (latestStd50 * 2);
  const bbLower = mean50[mean50.length - 1]! - (latestStd50 * 2);
  const bbPosition = (intradayCloses[intradayCloses.length - 1]! - bbLower) / Math.max(bbUpper - bbLower, 1e-9);
  const rsi14 = calculateRsi(intradayCloses, 14);
  const rsi28 = calculateRsi(intradayCloses, 28);
  let meanReversionSignal: CommitteeSignalState = 'neutral';
  let meanReversionConfidence = 34;
  if (zScore <= -1.4 && bbPosition <= 0.26 && rsi14[rsi14.length - 1]! <= 42) {
    meanReversionSignal = 'bullish';
    meanReversionConfidence = clamp((Math.abs(zScore) * 28) + (42 - rsi14[rsi14.length - 1]!) * 1.2, 36, 91);
  } else if (zScore >= 1.4 && bbPosition >= 0.74 && rsi14[rsi14.length - 1]! >= 58) {
    meanReversionSignal = 'bearish';
    meanReversionConfidence = clamp((Math.abs(zScore) * 28) + (rsi14[rsi14.length - 1]! - 58) * 1.2, 36, 91);
  }
  const meanReversionVote: TechnicalCommitteeVote = {
    key: 'mean-reversion',
    label: 'Mean Reversion',
    signal: meanReversionSignal,
    confidence: Number(meanReversionConfidence.toFixed(1)),
    weight: 0.2,
    score: Number(signalScore(meanReversionSignal, meanReversionConfidence, 0.2).toFixed(1)),
    explanation: meanReversionSignal === 'bullish'
      ? 'Price is stretched below its mean and oversold enough for a reversion bid.'
      : meanReversionSignal === 'bearish'
        ? 'Price is stretched above its mean and overbought enough for a rejection risk.'
        : 'Price is not far enough from its mean to call a clean reversion setup.',
    metrics: {
      zScore: Number(zScore.toFixed(2)),
      bbPosition: Number(bbPosition.toFixed(2)),
      rsi14: Number(rsi14[rsi14.length - 1]!.toFixed(1)),
      rsi28: Number(rsi28[rsi28.length - 1]!.toFixed(1)),
    },
  };

  const dailyReturns = pctChanges(dailyCloses);
  const windowFast = Math.min(21, Math.max(5, dailyCloses.length - 2));
  const windowMedium = Math.min(63, Math.max(20, dailyCloses.length - 2));
  const windowSlow = Math.min(126, Math.max(40, dailyCloses.length - 2));
  const momentumFast = (dailyCloses[dailyCloses.length - 1]! / dailyCloses[dailyCloses.length - 1 - windowFast]!) - 1;
  const momentumMedium = (dailyCloses[dailyCloses.length - 1]! / dailyCloses[dailyCloses.length - 1 - windowMedium]!) - 1;
  const momentumSlow = (dailyCloses[dailyCloses.length - 1]! / dailyCloses[dailyCloses.length - 1 - windowSlow]!) - 1;
  const volumeMomentum = (() => {
    const recent = average(dailyVolumes.slice(-10).filter((value) => value > 0));
    const baseline = average(dailyVolumes.slice(-30, -10).filter((value) => value > 0));
    if (!baseline) return 1;
    return recent / baseline;
  })();
  const momentumComposite = (momentumFast * 0.45) + (momentumMedium * 0.35) + (momentumSlow * 0.2);
  let momentumSignal: CommitteeSignalState = 'neutral';
  let momentumConfidence = 32;
  if (momentumComposite >= 0.025 && volumeMomentum >= 0.9) {
    momentumSignal = 'bullish';
    momentumConfidence = clamp((momentumComposite * 900) + ((volumeMomentum - 1) * 18) + 28, 35, 92);
  } else if (momentumComposite <= -0.025 && volumeMomentum >= 0.9) {
    momentumSignal = 'bearish';
    momentumConfidence = clamp((Math.abs(momentumComposite) * 900) + ((volumeMomentum - 1) * 18) + 28, 35, 92);
  }
  const momentumVote: TechnicalCommitteeVote = {
    key: 'momentum',
    label: 'Momentum',
    signal: momentumSignal,
    confidence: Number(momentumConfidence.toFixed(1)),
    weight: 0.25,
    score: Number(signalScore(momentumSignal, momentumConfidence, 0.25).toFixed(1)),
    explanation: momentumSignal === 'bullish'
      ? 'Multi-horizon momentum is aligned and participation is not fading.'
      : momentumSignal === 'bearish'
        ? 'Multi-horizon momentum is negative and participation is not fading.'
        : 'Momentum is mixed across horizons, so follow-through is not clean enough.',
    metrics: {
      momentumFastPct: Number((momentumFast * 100).toFixed(2)),
      momentumMediumPct: Number((momentumMedium * 100).toFixed(2)),
      momentumSlowPct: Number((momentumSlow * 100).toFixed(2)),
      volumeMomentum: Number(volumeMomentum.toFixed(2)),
    },
  };

  const histVol = standardDeviation(dailyReturns.slice(-21)) * Math.sqrt(252) * 100;
  const rollingVol: number[] = [];
  for (let index = 21; index <= dailyReturns.length; index += 1) {
    rollingVol.push(standardDeviation(dailyReturns.slice(index - 21, index)) * Math.sqrt(252) * 100);
  }
  const volBase = average(rollingVol.slice(-63));
  const volStd = standardDeviation(rollingVol.slice(-63));
  const volRegime = volBase ? histVol / volBase : 1;
  const volZ = volStd ? (histVol - volBase) / volStd : 0;
  const atr14 = calculateAtr(dailyCandles, 14);
  const atrRatio = (atr14[atr14.length - 1] || 0) / dailyCloses[dailyCloses.length - 1]!;
  const dailyEma21 = ema(dailyCloses, 21);
  let volatilitySignal: CommitteeSignalState = 'neutral';
  let volatilityConfidence = 30;
  if (volRegime <= 0.92 && volZ <= -0.35 && dailyCloses[dailyCloses.length - 1]! >= dailyEma21[dailyEma21.length - 1]!) {
    volatilitySignal = 'bullish';
    volatilityConfidence = clamp((Math.abs(volZ) * 22) + ((1 - volRegime) * 70) + 24, 32, 85);
  } else if (volRegime >= 1.1 && volZ >= 0.55 && dailyCloses[dailyCloses.length - 1]! <= dailyEma21[dailyEma21.length - 1]!) {
    volatilitySignal = 'bearish';
    volatilityConfidence = clamp((volZ * 22) + ((volRegime - 1) * 70) + 24, 32, 88);
  }
  const volatilityPercentile = rollingVol.length
    ? Math.round((rollingVol.filter((value) => value <= histVol).length / rollingVol.length) * 100)
    : 50;
  const volatilityVote: TechnicalCommitteeVote = {
    key: 'volatility',
    label: 'Volatility',
    signal: volatilitySignal,
    confidence: Number(volatilityConfidence.toFixed(1)),
    weight: 0.15,
    score: Number(signalScore(volatilitySignal, volatilityConfidence, 0.15).toFixed(1)),
    explanation: volatilitySignal === 'bullish'
      ? 'Volatility is relatively contained, which supports cleaner continuation if pressure holds.'
      : volatilitySignal === 'bearish'
        ? 'Volatility is elevated enough to demand caution or fade-chasing behavior.'
        : 'Volatility is neither compressed nor blown out enough to lean strongly on it.',
    metrics: {
      historicalVolatility: Number(histVol.toFixed(1)),
      volatilityRegime: Number(volRegime.toFixed(2)),
      volatilityZScore: Number(volZ.toFixed(2)),
      atrRatio: Number((atrRatio * 100).toFixed(2)),
      volatilityPercentile,
    },
  };

  const skewSeries = dailyReturns.slice(-63);
  const skewMean = average(skewSeries);
  const skewStd = standardDeviation(skewSeries) || 1e-9;
  const skewness = skewSeries.length
    ? average(skewSeries.map((value) => ((value - skewMean) / skewStd) ** 3))
    : 0;
  const kurtosis = skewSeries.length
    ? average(skewSeries.map((value) => ((value - skewMean) / skewStd) ** 4)) - 3
    : 0;
  const hurst = calculateHurst(dailyCloses.slice(-140));
  const dailyTrend = dailyCloses[dailyCloses.length - 1]! >= dailyEma21[dailyEma21.length - 1]! ? 'bullish' : 'bearish';
  let statArbSignal: CommitteeSignalState = 'neutral';
  let statArbConfidence = 28;
  if (hurst < 0.45 && skewness > 0.45 && dailyTrend === 'bullish') {
    statArbSignal = 'bullish';
    statArbConfidence = clamp(((0.5 - hurst) * 120) + (Math.abs(skewness) * 12) + 24, 30, 82);
  } else if (hurst < 0.45 && skewness < -0.45 && dailyTrend === 'bearish') {
    statArbSignal = 'bearish';
    statArbConfidence = clamp(((0.5 - hurst) * 120) + (Math.abs(skewness) * 12) + 24, 30, 82);
  } else if (hurst > 0.58 && momentumComposite >= 0.02) {
    statArbSignal = 'bullish';
    statArbConfidence = clamp(((hurst - 0.5) * 120) + (momentumComposite * 500) + 20, 28, 78);
  } else if (hurst > 0.58 && momentumComposite <= -0.02) {
    statArbSignal = 'bearish';
    statArbConfidence = clamp(((hurst - 0.5) * 120) + (Math.abs(momentumComposite) * 500) + 20, 28, 78);
  }
  const statArbVote: TechnicalCommitteeVote = {
    key: 'stat-arb',
    label: 'Stat Arb',
    signal: statArbSignal,
    confidence: Number(statArbConfidence.toFixed(1)),
    weight: 0.15,
    score: Number(signalScore(statArbSignal, statArbConfidence, 0.15).toFixed(1)),
    explanation: statArbSignal === 'bullish'
      ? 'Distribution shape and persistence/mean-reversion stats slightly favor upside resolution.'
      : statArbSignal === 'bearish'
        ? 'Distribution shape and persistence/mean-reversion stats slightly favor downside resolution.'
        : 'The statistical profile is too mixed to lean on by itself.',
    metrics: {
      hurst: Number(hurst.toFixed(2)),
      skewness: Number(skewness.toFixed(2)),
      kurtosis: Number(kurtosis.toFixed(2)),
    },
  };

  const votes = [trendVote, indicatorVote, meanReversionVote, momentumVote, volatilityVote, statArbVote];
  const weightedSum = votes.reduce((sum, vote) => sum + vote.score, 0);
  const maxWeightedScore = votes.reduce((sum, vote) => sum + (vote.weight * 100), 0);
  const ensembleScore = maxWeightedScore ? Number(((weightedSum / maxWeightedScore) * 100).toFixed(1)) : 0;
  const consensus = deriveSignalFromScore(ensembleScore);
  const confidence = confidenceLabel(ensembleScore);
  const quality = feedQuality(sourceSymbol, intradayFeed.source, dailyVolumes);
  const balance = votes.reduce((acc, vote) => {
    acc[vote.signal] += 1;
    return acc;
  }, { bullish: 0, bearish: 0, neutral: 0 });
  const bias = consensus === 'bullish'
    ? 'technical committee favors upside continuation'
    : consensus === 'bearish'
      ? 'technical committee favors downside pressure'
      : 'technical committee is mixed / rotational';

  return {
    market,
    timeframe,
    sourceSymbol,
    sourceLabel: quality.sourceLabel,
    feedQuality: quality.quality,
    status: quality.status,
    consensus,
    bias,
    ensembleScore,
    confidence,
    voteBalance: balance,
    volatilityPercentile,
    marketRegime,
    indicatorStack,
    trendStructure,
    votes,
    summary: `${bias}; market regime ${marketRegime.label.toLowerCase()} (${marketRegime.confidence}), trend ${trendVote.signal}, indicator stack ${indicatorVote.signal}, mean reversion ${meanReversionVote.signal}, momentum ${momentumVote.signal}, volatility ${volatilityVote.signal}, stat arb ${statArbVote.signal}, ${trendStructure.pattern} with ${trendStructure.breakoutPressure} pressure, ensemble ${ensembleScore}.`,
  };
}

export function buildExecutionRiskEnvelope(input: {
  technical: TechnicalCommitteeResponse;
  scenario: {
    scenarioQuality?: 'high' | 'medium' | 'cautious';
    targetFirstProbability?: number | null;
    invalidationFirstProbability?: number | null;
  };
  pressure: {
    score?: number | null;
    mode?: string | null;
  };
  orderflow: {
    feedQuality?: 'strong' | 'usable' | 'weak' | null;
    priceDeltaDivergence?: string | null;
  };
  flowProxy: {
    squeezeRisk?: string | null;
    volPercentile?: number | null;
  };
  calendar: {
    highImpactCount?: number | null;
  };
  fearGreed: {
    compositeScore?: number | null;
  };
}): ExecutionRiskEnvelope {
  const technicalScore = Math.abs(input.technical.ensembleScore);
  const volatilityPercentile = Math.round(
    average([
      input.technical.volatilityPercentile,
      Number.isFinite(input.flowProxy.volPercentile) ? Number(input.flowProxy.volPercentile) : input.technical.volatilityPercentile,
    ]),
  );
  const eventRiskScore = clamp((Number(input.calendar.highImpactCount ?? 0) * 18), 0, 36);
  let riskScore = 42;
  const reasons: string[] = [];

  if (volatilityPercentile >= 80) {
    riskScore += 18;
    reasons.push(`volatility is elevated at the ${volatilityPercentile}th percentile`);
  } else if (volatilityPercentile >= 60) {
    riskScore += 8;
    reasons.push(`volatility is above median at the ${volatilityPercentile}th percentile`);
  } else if (volatilityPercentile <= 35) {
    riskScore -= 6;
    reasons.push(`volatility is relatively contained at the ${volatilityPercentile}th percentile`);
  }

  if ((input.flowProxy.squeezeRisk || '').toLowerCase() === 'high') {
    riskScore += 14;
    reasons.push('dealer/gamma squeeze risk is high');
  } else if ((input.flowProxy.squeezeRisk || '').toLowerCase() === 'moderate') {
    riskScore += 7;
    reasons.push('dealer/gamma squeeze risk is moderate');
  }

  if ((input.orderflow.feedQuality || '').toLowerCase() === 'weak') {
    riskScore += 12;
    reasons.push('orderflow feed quality is weak');
  } else if ((input.orderflow.feedQuality || '').toLowerCase() === 'usable') {
    riskScore += 4;
    reasons.push('orderflow feed quality is usable but not tape-strong');
  }

  if ((input.pressure.mode || '').toLowerCase() === 'estimated') {
    riskScore += 8;
    reasons.push('pressure model is estimated rather than direct');
  } else if ((input.pressure.mode || '').toLowerCase() === 'proxy') {
    riskScore += 4;
  }

  if ((input.orderflow.priceDeltaDivergence || '').toLowerCase() !== 'none' && input.orderflow.priceDeltaDivergence) {
    riskScore += 8;
    reasons.push(`price/delta shows ${input.orderflow.priceDeltaDivergence}`);
  }

  if (input.scenario.scenarioQuality === 'cautious') {
    riskScore += 10;
    reasons.push('scenario engine quality is cautious');
  } else if (input.scenario.scenarioQuality === 'high') {
    riskScore -= 4;
  }

  const targetFirst = Number(input.scenario.targetFirstProbability ?? 50);
  const invalidationFirst = Number(input.scenario.invalidationFirstProbability ?? 50);
  if (invalidationFirst - targetFirst >= 12) {
    riskScore += 14;
    reasons.push(`scenario map still favors invalidation first (${invalidationFirst}% vs ${targetFirst}%)`);
  } else if (targetFirst - invalidationFirst >= 12) {
    riskScore -= 8;
    reasons.push(`scenario map favors target first (${targetFirst}% vs ${invalidationFirst}%)`);
  }

  if (technicalScore >= 40) {
    riskScore -= 6;
    reasons.push(`technical committee is aligned with score ${input.technical.ensembleScore}`);
  } else if (technicalScore <= 12) {
    riskScore += 8;
    reasons.push('technical committee alignment is weak');
  }

  if (Math.abs(Number(input.pressure.score ?? 0)) <= 10) {
    riskScore += 4;
    reasons.push('pressure is still rotational rather than decisive');
  }

  const fearGreed = Number(input.fearGreed.compositeScore ?? 50);
  if (fearGreed <= 28 || fearGreed >= 74) {
    riskScore += 5;
    reasons.push(`sentiment is stretched at ${fearGreed.toFixed(0)}`);
  }

  riskScore += eventRiskScore;
  if (eventRiskScore > 0) reasons.push(`calendar event load adds ${eventRiskScore} risk points`);
  riskScore = clamp(riskScore, 8, 96);

  const tradeSuppression =
    riskScore >= 82
    || ((input.orderflow.feedQuality || '').toLowerCase() === 'weak' && Number(input.calendar.highImpactCount ?? 0) >= 2)
    || (invalidationFirst - targetFirst >= 18);

  const riskBudgetPct = tradeSuppression
    ? 0.2
    : riskScore <= 25
      ? 1
      : riskScore <= 45
        ? 0.75
        : riskScore <= 65
          ? 0.5
          : 0.35;
  const sizeBand = tradeSuppression
    ? 'stand-down'
    : riskBudgetPct >= 0.95
      ? 'full'
      : riskBudgetPct >= 0.7
        ? 'standard'
        : riskBudgetPct >= 0.5
          ? 'reduced'
          : 'small';
  const actionMode = tradeSuppression
    ? 'suppressed'
    : riskScore <= 25
      ? 'aggressive'
      : riskScore <= 45
        ? 'standard'
        : 'cautious';
  const qualityScore = clamp(Math.round(
    (Math.abs(input.technical.ensembleScore) * 0.42)
    + (Math.max(targetFirst - invalidationFirst, 0) * 0.38)
    + (Math.abs(Number(input.pressure.score ?? 0)) * 0.2),
  ), 0, 100);

  return {
    actionMode,
    sizeBand,
    riskBudgetPct: Number(riskBudgetPct.toFixed(2)),
    riskScore,
    tradeSuppression,
    eventRiskScore,
    qualityScore,
    volatilityPercentile,
    reasons: [...new Set(reasons)].slice(0, 6),
    body: tradeSuppression
      ? `Risk gate is suppressing aggressive execution. Use stand-down or very small size only while risk score sits at ${riskScore}/100.`
      : `Risk envelope is ${actionMode}; use ${sizeBand} size at roughly ${(riskBudgetPct * 100).toFixed(0)}% of your normal risk unit while risk score sits at ${riskScore}/100.`,
  };
}
