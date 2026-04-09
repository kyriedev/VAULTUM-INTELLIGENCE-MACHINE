import { fetchOandaCandles, granularityForOanda, mapToOandaInstrument, oandaConfigured } from '../../_shared/oanda';
import { fetchTradingViewVolumeCandles, resolveTradingViewVolumeHint, type TradingViewVolumeClass, type TradingViewVolumeMode, type TradingViewVolumeQuality } from '../../_shared/tradingview-volume';
import { fetchYahooChart } from '../../_shared/yahoo';

export type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type StructureRegimeSnapshot = {
  sourceLabel: string;
  emaAlignment: 'bullish' | 'bearish' | 'mixed';
  regimeLevel: 'narrow' | 'standard' | 'wide' | 'volatile' | 'trending';
  primaryCode: 'TREND_UP' | 'TREND_DOWN' | 'RANGE' | 'TRANSITION' | 'BREAKOUT';
  primaryLabel: string;
  secondaryCode:
    | 'TU_STRONG_LOW_VOL'
    | 'TU_STRONG_HIGH_VOL'
    | 'TU_WEAK_CHOPPY'
    | 'TU_PARABOLIC'
    | 'TU_EXHAUSTION'
    | 'TD_STRONG_LOW_VOL'
    | 'TD_STRONG_HIGH_VOL'
    | 'TD_WEAK_CHOPPY'
    | 'TD_CAPITULATION'
    | 'TD_EXHAUSTION'
    | 'RG_TIGHT_LOW_VOL'
    | 'RG_TIGHT_HIGH_VOL'
    | 'RG_WIDE_LOW_VOL'
    | 'RG_WIDE_HIGH_VOL'
    | 'TR_BOTTOM_FORMING'
    | 'TR_TOP_FORMING'
    | 'BK_UPWARD'
    | 'BK_DOWNWARD';
  secondaryLabel: string;
  adx: number;
  atr14: number;
  atrPct: number;
  bollWidthPct: number;
  rsi14: number;
  macdHistogram: number;
  volatilityState: 'extreme-low' | 'low' | 'normal' | 'high' | 'extreme-high';
  rangePosition: 'upper' | 'middle' | 'lower' | 'squeeze' | 'expand';
  breakout: {
    level: 'none' | 'short' | 'mid' | 'long';
    direction: 'up' | 'down' | 'none';
    state: 'inside' | 'watching' | 'confirmed';
    guidance: 'neutral' | 'long_bias' | 'short_bias' | 'long' | 'short';
  };
  boxes: {
    short: { upper: number; lower: number };
    mid: { upper: number; lower: number };
    long: { upper: number; lower: number };
  };
  summary: string;
};

export type StructureCandleSource = 'oanda' | 'tradingview' | 'yahoo';

export type PreferredCandleResult = {
  candles: Candle[];
  source: StructureCandleSource;
  sourceLabel: string;
  mode: TradingViewVolumeMode;
  volumeClass: TradingViewVolumeClass;
  quality: TradingViewVolumeQuality;
  matchedSymbolId: string | null;
  providerTrace: string[];
  warnings: string[];
};

export function resolveStructureSymbol(market: string): string {
  const value = market.toUpperCase();
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
    BTCUSD: 'BTC-USD',
    ETHUSD: 'ETH-USD',
    SPX: '^GSPC',
    NDX: '^IXIC',
    US30: 'DIA',
    '^DJI': 'DIA',
    DJI: 'DIA',
    DIA: 'DIA',
    'YM=F': 'DIA',
  };
  return map[value] ?? market;
}

function timeframeConfig(timeframe: string): { yahooRange: string; yahooInterval: string; count: number; sourceTimeframe: string } {
  const value = timeframe.toLowerCase();
  if (value === '5m') return { yahooRange: '5d', yahooInterval: '5m', count: 320, sourceTimeframe: '5m' };
  if (value === '15m') return { yahooRange: '1mo', yahooInterval: '15m', count: 260, sourceTimeframe: '15m' };
  if (value === '30m') return { yahooRange: '1mo', yahooInterval: '30m', count: 260, sourceTimeframe: '30m' };
  if (value === '4h') return { yahooRange: '3mo', yahooInterval: '60m', count: 320, sourceTimeframe: '1h' };
  if (value === '1h') return { yahooRange: '1mo', yahooInterval: '60m', count: 320, sourceTimeframe: '1h' };
  return { yahooRange: '1y', yahooInterval: '1d', count: 320, sourceTimeframe: '1d' };
}

function usableVolumeBars(candles: Candle[]): number {
  return candles.filter((candle) => Number.isFinite(candle.volume) && (candle.volume ?? 0) > 0).length;
}

function hasUsableVolume(candles: Candle[], targetBars: number): boolean {
  return usableVolumeBars(candles) >= Math.max(12, Math.floor(Math.min(targetBars, candles.length) * 0.25));
}

function yahooVolumeClass(symbol: string): TradingViewVolumeClass {
  return /=X$/i.test(symbol) ? 'estimated-volume' : 'exchange-volume';
}

function yahooMode(symbol: string): TradingViewVolumeMode {
  return /=X$/i.test(symbol) ? 'estimated' : 'volume-backed';
}

function yahooQuality(symbol: string): TradingViewVolumeQuality {
  return /=X$/i.test(symbol) ? 'weak' : 'strong';
}

export async function fetchPreferredStructureCandles(market: string, symbol: string, timeframe: string): Promise<PreferredCandleResult> {
  const config = timeframeConfig(timeframe);
  const tradingViewHint = resolveTradingViewVolumeHint(market);

  if (tradingViewHint?.preferTradingView) {
    const tradingView = await fetchTradingViewVolumeCandles({ market, timeframe: config.sourceTimeframe, count: config.count });
    if (tradingView?.candles.length) {
      return {
        candles: tradingView.candles.map((candle) => ({ ...candle })),
        source: 'tradingview',
        sourceLabel: tradingView.sourceLabel,
        mode: tradingView.mode,
        volumeClass: tradingView.volumeClass,
        quality: tradingView.quality,
        matchedSymbolId: tradingView.matchedSymbolId,
        providerTrace: tradingView.providerTrace,
        warnings: tradingView.warnings,
      };
    }
  }

  if (oandaConfigured() && mapToOandaInstrument(market)) {
    const candles = await fetchOandaCandles(market, granularityForOanda(config.sourceTimeframe), config.count);
    if (candles.length) {
      const normalized = candles.map((candle) => ({
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      }));
      if (hasUsableVolume(normalized, config.count) || !tradingViewHint) {
        return {
          source: 'oanda',
          candles: normalized,
          sourceLabel: 'Vaultum is using OANDA broker candles for structure and volume-aware workflow on this market. This is broker-volume context, not centralized exchange tape.',
          mode: 'proxy',
          volumeClass: 'broker-volume',
          quality: 'usable',
          matchedSymbolId: `OANDA:${market.toUpperCase()}`,
          providerTrace: [`OANDA:${market.toUpperCase()} accepted ${normalized.length} candles`],
          warnings: [],
        };
      }
    }
  }

  if (tradingViewHint && !tradingViewHint.preferTradingView) {
    const tradingView = await fetchTradingViewVolumeCandles({ market, timeframe: config.sourceTimeframe, count: config.count });
    if (tradingView?.candles.length) {
      return {
        candles: tradingView.candles.map((candle) => ({ ...candle })),
        source: 'tradingview',
        sourceLabel: tradingView.sourceLabel,
        mode: tradingView.mode,
        volumeClass: tradingView.volumeClass,
        quality: tradingView.quality,
        matchedSymbolId: tradingView.matchedSymbolId,
        providerTrace: tradingView.providerTrace,
        warnings: tradingView.warnings,
      };
    }
  }

  const payload = await fetchYahooChart(symbol, config.yahooRange, config.yahooInterval);
  if (!payload?.candles.length) throw new Error(payload?.warnings?.[0] || 'No structure candles available');
  const normalized = payload.candles.map((candle) => ({
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }));
  return {
    source: 'yahoo',
    candles: normalized,
    sourceLabel: /=X$/i.test(symbol)
      ? 'Vaultum fell back to Yahoo candles for structure only. This market does not expose reliable centralized volume on Yahoo here, so any volume-sensitive read remains estimated.'
      : 'Vaultum fell back to Yahoo candles. This still gives a usable traded-volume structure map for exchange-listed symbols, but TradingView/OANDA remain preferred when available.',
    mode: yahooMode(symbol),
    volumeClass: yahooVolumeClass(symbol),
    quality: yahooQuality(symbol),
    matchedSymbolId: symbol,
    providerTrace: [`Yahoo:${symbol} accepted ${normalized.length} candles`],
    warnings: payload.warnings ?? [],
  };
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ema(values: number[], period: number): number {
  if (values.length < period) return average(values);
  let current = average(values.slice(0, period));
  const multiplier = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    current = (values[index]! - current) * multiplier + current;
  }
  return current;
}

function sma(values: number[], period: number): number {
  if (!values.length) return 0;
  const window = values.slice(-Math.min(period, values.length));
  return average(window);
}

function stdDev(values: number[], period: number): number {
  if (!values.length) return 0;
  const window = values.slice(-Math.min(period, values.length));
  const mean = average(window);
  return Math.sqrt(average(window.map((value) => (value - mean) ** 2)));
}

function atr(candles: Candle[], period: number): number {
  if (candles.length <= period) return 0;
  const trs: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index]!;
    const previous = candles[index - 1]!;
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    );
    trs.push(tr);
  }
  if (trs.length < period) return average(trs);
  let currentAtr = average(trs.slice(0, period));
  for (let index = period; index < trs.length; index += 1) {
    currentAtr = ((currentAtr * (period - 1)) + trs[index]!) / period;
  }
  return currentAtr;
}

function rsi(values: number[], period: number): number {
  if (values.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index]! - values[index - 1]!;
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index]! - values[index - 1]!;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function macdHistogram(values: number[]): number {
  if (values.length < 35) return 0;
  const ema12Series = values.map((_, index) => ema(values.slice(0, index + 1), 12));
  const ema26Series = values.map((_, index) => ema(values.slice(0, index + 1), 26));
  const macdSeries = ema12Series.map((value, index) => value - ema26Series[index]!);
  const signal = ema(macdSeries, 9);
  const macd = macdSeries[macdSeries.length - 1] ?? 0;
  return macd - signal;
}

function adx(candles: Candle[], period: number): number {
  if (candles.length <= period + 1) return 0;
  const trSeries: number[] = [];
  const plusDmSeries: number[] = [];
  const minusDmSeries: number[] = [];

  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index]!;
    const previous = candles[index - 1]!;
    const upMove = current.high - previous.high;
    const downMove = previous.low - current.low;

    plusDmSeries.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDmSeries.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trSeries.push(Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    ));
  }

  let trSmooth = average(trSeries.slice(0, period));
  let plusSmooth = average(plusDmSeries.slice(0, period));
  let minusSmooth = average(minusDmSeries.slice(0, period));
  const dxSeries: number[] = [];

  for (let index = period; index < trSeries.length; index += 1) {
    trSmooth = ((trSmooth * (period - 1)) + trSeries[index]!) / period;
    plusSmooth = ((plusSmooth * (period - 1)) + plusDmSeries[index]!) / period;
    minusSmooth = ((minusSmooth * (period - 1)) + minusDmSeries[index]!) / period;

    const plusDi = trSmooth > 0 ? (plusSmooth / trSmooth) * 100 : 0;
    const minusDi = trSmooth > 0 ? (minusSmooth / trSmooth) * 100 : 0;
    const denominator = plusDi + minusDi;
    const dx = denominator > 0 ? (Math.abs(plusDi - minusDi) / denominator) * 100 : 0;
    dxSeries.push(dx);
  }

  if (!dxSeries.length) return 0;
  if (dxSeries.length <= period) return average(dxSeries);
  let currentAdx = average(dxSeries.slice(0, period));
  for (let index = period; index < dxSeries.length; index += 1) {
    currentAdx = ((currentAdx * (period - 1)) + dxSeries[index]!) / period;
  }
  return currentAdx;
}

function donchian(candles: Candle[], period: number): { upper: number; lower: number } {
  if (!candles.length) return { upper: 0, lower: 0 };
  const window = candles.slice(-Math.min(period, candles.length));
  return {
    upper: Math.max(...window.map((candle) => candle.high)),
    lower: Math.min(...window.map((candle) => candle.low)),
  };
}

function breakoutState(candles: Candle[], box: { short: { upper: number; lower: number }; mid: { upper: number; lower: number }; long: { upper: number; lower: number } }, price: number) {
  const closes = candles.slice(-3).map((candle) => candle.close);
  const detectLevel = (): { level: 'none' | 'short' | 'mid' | 'long'; direction: 'up' | 'down' | 'none' } => {
    if (price > box.long.upper) return { level: 'long', direction: 'up' };
    if (price < box.long.lower) return { level: 'long', direction: 'down' };
    if (price > box.mid.upper) return { level: 'mid', direction: 'up' };
    if (price < box.mid.lower) return { level: 'mid', direction: 'down' };
    if (price > box.short.upper) return { level: 'short', direction: 'up' };
    if (price < box.short.lower) return { level: 'short', direction: 'down' };
    return { level: 'none', direction: 'none' };
  };

  const current = detectLevel();
  if (current.level === 'none') {
    return { ...current, state: 'inside' as const, guidance: 'neutral' as const };
  }

  const isConfirmed =
    current.direction === 'up'
      ? closes.every((close) => current.level === 'long'
        ? close > box.long.upper
        : current.level === 'mid'
          ? close > box.mid.upper
          : close > box.short.upper)
      : closes.every((close) => current.level === 'long'
        ? close < box.long.lower
        : current.level === 'mid'
          ? close < box.mid.lower
          : close < box.short.lower);

  let guidance: 'neutral' | 'long_bias' | 'short_bias' | 'long' | 'short' = 'neutral';
  if (current.level === 'short') guidance = current.direction === 'up' ? 'long_bias' : 'short_bias';
  if (current.level === 'mid' || current.level === 'long') guidance = current.direction === 'up' ? 'long' : 'short';

  return {
    ...current,
    state: isConfirmed ? 'confirmed' as const : 'watching' as const,
    guidance,
  };
}

function momentumDivergence(candles: Candle[], closes: number[]): { bullish: boolean; bearish: boolean } {
  if (candles.length < 30) return { bullish: false, bearish: false };
  const window = candles.slice(-30);
  const first = window.slice(0, 15);
  const second = window.slice(15);
  const firstCloseSeries = closes.slice(-(30), -15);
  const secondCloseSeries = closes.slice(-15);
  const firstRsi = rsi(firstCloseSeries, 14);
  const secondRsi = rsi(secondCloseSeries, 14);
  const firstMacd = macdHistogram(firstCloseSeries);
  const secondMacd = macdHistogram(secondCloseSeries);

  const firstHigh = Math.max(...first.map((candle) => candle.high));
  const secondHigh = Math.max(...second.map((candle) => candle.high));
  const firstLow = Math.min(...first.map((candle) => candle.low));
  const secondLow = Math.min(...second.map((candle) => candle.low));

  return {
    bearish: secondHigh > firstHigh && secondRsi < firstRsi - 4 && secondMacd < firstMacd,
    bullish: secondLow < firstLow && secondRsi > firstRsi + 4 && secondMacd > firstMacd,
  };
}

export function buildStructureRegime(
  candles: Candle[],
  sourceMeta: Pick<PreferredCandleResult, 'source' | 'sourceLabel' | 'volumeClass'>,
  symbol: string,
): StructureRegimeSnapshot {
  const closes = candles.map((candle) => candle.close);
  const price = closes[closes.length - 1] ?? 0;
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const atr14 = atr(candles, 14);
  const atrPct = price > 0 ? (atr14 / price) * 100 : 0;
  const middle = sma(closes, 20);
  const std = stdDev(closes, 20);
  const upper = middle + std * 2;
  const lower = middle - std * 2;
  const bollWidthPct = middle !== 0 ? ((upper - lower) / middle) * 100 : 0;
  const adx14 = adx(candles, 14);
  const rsi14 = rsi(closes, 14);
  const macdHist = macdHistogram(closes);
  const volumeWindow = candles.slice(-20).map((candle) => candle.volume ?? 0).filter((value) => value > 0);
  const relativeVolume = volumeWindow.length ? ((candles[candles.length - 1]?.volume ?? 0) / Math.max(average(volumeWindow), 1)) : 1;
  const distanceFromEma20Pct = ema20 !== 0 ? Math.abs((price - ema20) / ema20) * 100 : 0;
  const box = {
    short: donchian(candles, 72),
    mid: donchian(candles, 240),
    long: donchian(candles, 500),
  };
  const breakout = breakoutState(candles, box, price);
  const divergence = momentumDivergence(candles, closes);

  const bullishAlignment = ema20 > ema50 && ema50 > ema200;
  const bearishAlignment = ema20 < ema50 && ema50 < ema200;
  const emaAlignment: StructureRegimeSnapshot['emaAlignment'] = bullishAlignment ? 'bullish' : bearishAlignment ? 'bearish' : 'mixed';

  const regimeLevel: StructureRegimeSnapshot['regimeLevel'] =
    adx14 >= 25 && emaAlignment !== 'mixed'
      ? 'trending'
      : bollWidthPct < 2 && atrPct < 1
        ? 'narrow'
        : bollWidthPct <= 3 && atrPct <= 2
          ? 'standard'
          : bollWidthPct <= 4 && atrPct <= 3
            ? 'wide'
            : 'volatile';

  const volatilityState: StructureRegimeSnapshot['volatilityState'] =
    atrPct < 1 ? 'extreme-low'
      : atrPct < 2 ? 'low'
        : atrPct < 3 ? 'normal'
          : atrPct < 5 ? 'high'
            : 'extreme-high';

  const shortRange = Math.max(box.short.upper - box.short.lower, 0.0001);
  const shortPosition = (price - box.short.lower) / shortRange;
  const rangePosition: StructureRegimeSnapshot['rangePosition'] =
    bollWidthPct < 1.5 ? 'squeeze'
      : shortPosition >= 0.75 ? 'upper'
        : shortPosition <= 0.25 ? 'lower'
          : bollWidthPct > 6 ? 'expand'
            : 'middle';

  let primaryCode: StructureRegimeSnapshot['primaryCode'];
  if (breakout.level !== 'none' && breakout.state === 'confirmed') primaryCode = 'BREAKOUT';
  else if (adx14 >= 25 && bullishAlignment) primaryCode = 'TREND_UP';
  else if (adx14 >= 25 && bearishAlignment) primaryCode = 'TREND_DOWN';
  else if (adx14 < 20 || regimeLevel === 'narrow' || rangePosition === 'squeeze') primaryCode = 'RANGE';
  else primaryCode = 'TRANSITION';

  let secondaryCode: StructureRegimeSnapshot['secondaryCode'];
  if (primaryCode === 'TREND_UP') {
    if (divergence.bearish) secondaryCode = 'TU_EXHAUSTION';
    else if (rsi14 > 80 && distanceFromEma20Pct > Math.max(atrPct * 1.25, 3) && relativeVolume > 1.2) secondaryCode = 'TU_PARABOLIC';
    else if (adx14 > 40 && atrPct < 2) secondaryCode = 'TU_STRONG_LOW_VOL';
    else if (adx14 > 40 && atrPct >= 4) secondaryCode = 'TU_STRONG_HIGH_VOL';
    else secondaryCode = 'TU_WEAK_CHOPPY';
  } else if (primaryCode === 'TREND_DOWN') {
    if (divergence.bullish) secondaryCode = 'TD_EXHAUSTION';
    else if (rsi14 < 20 && relativeVolume > 1.5 && atrPct > 4) secondaryCode = 'TD_CAPITULATION';
    else if (adx14 > 40 && atrPct < 2) secondaryCode = 'TD_STRONG_LOW_VOL';
    else if (adx14 > 40 && atrPct >= 5) secondaryCode = 'TD_STRONG_HIGH_VOL';
    else secondaryCode = 'TD_WEAK_CHOPPY';
  } else if (primaryCode === 'BREAKOUT') {
    secondaryCode = breakout.direction === 'up' ? 'BK_UPWARD' : 'BK_DOWNWARD';
  } else if (primaryCode === 'RANGE') {
    if (bollWidthPct < 3 && atrPct < 2) secondaryCode = 'RG_TIGHT_LOW_VOL';
    else if (bollWidthPct < 3) secondaryCode = 'RG_TIGHT_HIGH_VOL';
    else if (atrPct < 2) secondaryCode = 'RG_WIDE_LOW_VOL';
    else secondaryCode = 'RG_WIDE_HIGH_VOL';
  } else {
    secondaryCode = divergence.bullish || shortPosition <= 0.35 ? 'TR_BOTTOM_FORMING' : 'TR_TOP_FORMING';
  }

  const primaryLabelMap: Record<StructureRegimeSnapshot['primaryCode'], string> = {
    TREND_UP: 'Uptrend',
    TREND_DOWN: 'Downtrend',
    RANGE: 'Range-bound',
    TRANSITION: 'Transition',
    BREAKOUT: 'Breakout',
  };
  const secondaryLabelMap: Record<StructureRegimeSnapshot['secondaryCode'], string> = {
    TU_STRONG_LOW_VOL: 'Strong Uptrend · Low Vol',
    TU_STRONG_HIGH_VOL: 'Strong Uptrend · High Vol',
    TU_WEAK_CHOPPY: 'Weak Uptrend · Choppy',
    TU_PARABOLIC: 'Parabolic Uptrend',
    TU_EXHAUSTION: 'Uptrend Exhaustion',
    TD_STRONG_LOW_VOL: 'Strong Downtrend · Low Vol',
    TD_STRONG_HIGH_VOL: 'Strong Downtrend · High Vol',
    TD_WEAK_CHOPPY: 'Weak Downtrend · Choppy',
    TD_CAPITULATION: 'Capitulation',
    TD_EXHAUSTION: 'Downtrend Exhaustion',
    RG_TIGHT_LOW_VOL: 'Tight Range · Low Vol',
    RG_TIGHT_HIGH_VOL: 'Tight Range · High Vol',
    RG_WIDE_LOW_VOL: 'Wide Range · Low Vol',
    RG_WIDE_HIGH_VOL: 'Wide Range · High Vol',
    TR_BOTTOM_FORMING: 'Bottom Forming',
    TR_TOP_FORMING: 'Top Forming',
    BK_UPWARD: 'Upward Breakout',
    BK_DOWNWARD: 'Downward Breakout',
  };

  const sourceLabel = sourceMeta.source === 'tradingview'
    ? `${sourceMeta.sourceLabel} Structure regime and box logic are using the same TradingView candle stack so volume-aware execution context stays consistent across Vaultum.`
    : sourceMeta.source === 'oanda'
      ? 'Structure regime and box logic are built from OANDA broker candles for supported markets; useful broker context, not centralized tape.'
      : /=X$/.test(symbol)
        ? 'Structure regime and box logic are estimated from Yahoo OTC FX candles; no centralized exchange volume exists.'
        : 'Structure regime and box logic are built from live Yahoo candles and nofx-style Donchian / volatility rules.';

  return {
    sourceLabel,
    emaAlignment,
    regimeLevel,
    primaryCode,
    primaryLabel: primaryLabelMap[primaryCode],
    secondaryCode,
    secondaryLabel: secondaryLabelMap[secondaryCode],
    adx: Number(adx14.toFixed(1)),
    atr14: Number(atr14.toFixed(2)),
    atrPct: Number(atrPct.toFixed(2)),
    bollWidthPct: Number(bollWidthPct.toFixed(2)),
    rsi14: Number(rsi14.toFixed(1)),
    macdHistogram: Number(macdHist.toFixed(4)),
    volatilityState,
    rangePosition,
    breakout,
    boxes: {
      short: { upper: Number(box.short.upper.toFixed(2)), lower: Number(box.short.lower.toFixed(2)) },
      mid: { upper: Number(box.mid.upper.toFixed(2)), lower: Number(box.mid.lower.toFixed(2)) },
      long: { upper: Number(box.long.upper.toFixed(2)), lower: Number(box.long.lower.toFixed(2)) },
    },
    summary: `${primaryLabelMap[primaryCode]} / ${secondaryLabelMap[secondaryCode]} with ${regimeLevel} volatility, ${emaAlignment} EMA alignment, ADX ${adx14.toFixed(1)}, ATR ${atrPct.toFixed(2)}%, BB width ${bollWidthPct.toFixed(2)}%, ${breakout.state} ${breakout.level} breakout ${breakout.direction === 'none' ? 'inside box' : breakout.direction}.`,
  };
}
