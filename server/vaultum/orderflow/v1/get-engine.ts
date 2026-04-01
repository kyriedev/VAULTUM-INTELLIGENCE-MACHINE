import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { getFxVolumeAggregate } from '../../_shared/fx-volume-aggregate';
import { getFxMacroProxyPressure } from '../../_shared/fx-proxy-pressure';
import { fetchOandaCandles, granularityForOanda, mapToOandaInstrument, oandaConfigured } from '../../_shared/oanda';
import { fetchYahooChart } from '../../_shared/yahoo';

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

type SessionName = 'asia' | 'london' | 'new-york';

type SessionLevel = {
  session: SessionName;
  date: string;
  high: number;
  low: number;
  midpoint: number;
  range: number;
};

function resolveSymbol(market: string): string {
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
    SPX: '^GSPC',
    NDX: '^IXIC',
    US30: 'DIA',
    '^DJI': 'DIA',
    DJI: 'DIA',
    DIA: 'DIA',
    'YM=F': 'DIA',
    BTCUSD: 'BTC-USD',
  };
  return map[value] ?? market;
}

function intervalFrom(timeframe: string): { range: string; interval: string } {
  const value = (timeframe || '1h').toLowerCase();
  if (value === '5m') return { range: '5d', interval: '5m' };
  if (value === '15m') return { range: '5d', interval: '15m' };
  if (value === '30m') return { range: '10d', interval: '30m' };
  if (value === '4h') return { range: '3mo', interval: '1h' };
  return { range: '10d', interval: '1h' };
}

function candleCountFor(timeframe: string): number {
  const value = (timeframe || '1h').toLowerCase();
  if (value === '5m') return 320;
  if (value === '15m') return 220;
  if (value === '30m') return 180;
  if (value === '4h') return 180;
  return 160;
}

async function fetchPreferredCandles(market: string, sourceSymbol: string, timeframe: string, range: string, interval: string): Promise<{ candles: Candle[]; source: 'oanda' | 'yahoo' }> {
  if (oandaConfigured() && mapToOandaInstrument(market)) {
    const candles = await fetchOandaCandles(market, granularityForOanda(timeframe), candleCountFor(timeframe));
    if (candles.length) {
      return {
        candles: candles.map((candle) => ({
          time: candle.time,
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

  const payload = await fetchYahooChart(sourceSymbol, range, interval);
  if (!payload?.candles.length) throw new Error(payload?.warnings?.[0] || 'No Yahoo orderflow candles available');
  return {
    candles: payload.candles.map((candle) => ({
      time: candle.time,
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function trendLabel(start: number, end: number, threshold: number): 'rising' | 'falling' | 'flat' {
  if ((end - start) > threshold) return 'rising';
  if ((start - end) > threshold) return 'falling';
  return 'flat';
}

function candlePressure(candle: Candle, averageVolume: number): number {
  const range = Math.max(candle.high - candle.low, 0.0001);
  const body = candle.close - candle.open;
  const closeLocation = ((candle.close - candle.low) / range) * 2 - 1;
  const relativeVolume = candle.volume != null && averageVolume > 0 ? candle.volume / averageVolume : 1;
  return ((body / range) * 0.65 + closeLocation * 0.35) * clamp(relativeVolume, 0.5, 1.9);
}

function feedQuality(symbol: string, averageVolume: number): { quality: 'strong' | 'usable' | 'weak'; mode: 'proxy' | 'estimated'; sourceLabel: string } {
  if (/=X$/.test(symbol)) {
    return {
      quality: 'weak',
      mode: 'estimated',
      sourceLabel: 'OTC FX does not provide true centralized tape volume here, so orderflow readings are estimated from candle behavior only.',
    };
  }
  if (averageVolume > 0) {
    return {
      quality: 'strong',
      mode: 'proxy',
      sourceLabel: 'Exchange-traded candles include usable volume, so orderflow is a live proxy rather than true bid/ask tape.',
    };
  }
  return {
    quality: 'usable',
    mode: 'proxy',
    sourceLabel: 'Orderflow uses live candle structure, but volume completeness is limited.',
  };
}

function sessionFromTime(time: string): SessionName | null {
  const hour = new Date(time).getUTCHours();
  if (hour >= 0 && hour < 7) return 'asia';
  if (hour >= 7 && hour < 13) return 'london';
  if (hour >= 13 && hour < 21) return 'new-york';
  return null;
}

function buildSessionLevels(candles: Candle[]): SessionLevel[] {
  const buckets = new Map<string, Candle[]>();

  candles.forEach((candle) => {
    const session = sessionFromTime(candle.time);
    if (!session) return;
    const date = candle.time.slice(0, 10);
    const key = `${date}:${session}`;
    const list = buckets.get(key) ?? [];
    list.push(candle);
    buckets.set(key, list);
  });

  const latestBySession = new Map<SessionName, { level: SessionLevel; latestTimestamp: number }>();
  buckets.forEach((group, key) => {
    if (!group.length) return;
    const [date, sessionValue] = key.split(':');
    const session = sessionValue as SessionName;
    const high = Math.max(...group.map((candle) => candle.high));
    const low = Math.min(...group.map((candle) => candle.low));
    const latestTimestamp = Math.max(...group.map((candle) => new Date(candle.time).getTime()));
    const level: SessionLevel = {
      session,
      date,
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      midpoint: Number((((high + low) / 2)).toFixed(2)),
      range: Number((high - low).toFixed(2)),
    };
    const current = latestBySession.get(session);
    if (!current || latestTimestamp > current.latestTimestamp) {
      latestBySession.set(session, { level, latestTimestamp });
    }
  });

  return (['asia', 'london', 'new-york'] as SessionName[])
    .map((session) => latestBySession.get(session)?.level ?? null)
    .filter((item): item is SessionLevel => Boolean(item));
}

function buildLiquidityMap(input: {
  price: number;
  recent: Candle[];
  sessionLevels: SessionLevel[];
  dominance: string;
  rangeExpansion: number;
}): {
  sessionLevels: SessionLevel[];
  stopClusterAbove: number | null;
  stopClusterBelow: number | null;
  stopClusterBias: string;
  liquiditySweepRisk: 'elevated' | 'contained';
  summary: string;
} {
  const recentHigh = Math.max(...input.recent.map((candle) => candle.high));
  const recentLow = Math.min(...input.recent.map((candle) => candle.low));
  const aboveCandidates = [
    ...input.sessionLevels.map((level) => ({ label: `${level.session} high`, price: level.high })),
    { label: 'recent swing high', price: Number(recentHigh.toFixed(2)) },
  ].filter((level) => level.price > input.price);
  const belowCandidates = [
    ...input.sessionLevels.map((level) => ({ label: `${level.session} low`, price: level.low })),
    { label: 'recent swing low', price: Number(recentLow.toFixed(2)) },
  ].filter((level) => level.price < input.price);

  const nearestAbove = aboveCandidates.sort((left, right) => left.price - right.price)[0] ?? null;
  const nearestBelow = belowCandidates.sort((left, right) => right.price - left.price)[0] ?? null;
  const stopClusterBias =
    input.dominance === 'buyers dominant' && nearestAbove
      ? `buyers are pressing toward buy-side liquidity above ${nearestAbove.label}`
      : input.dominance === 'sellers dominant' && nearestBelow
        ? `sellers are pressing toward sell-side liquidity below ${nearestBelow.label}`
        : nearestAbove && nearestBelow
          ? `price is rotating between ${nearestBelow.label} and ${nearestAbove.label}`
          : 'liquidity map is incomplete';
  const liquiditySweepRisk: 'elevated' | 'contained' =
    input.rangeExpansion > 1.18 && input.dominance !== 'balanced / rotational'
      ? 'elevated'
      : 'contained';

  return {
    sessionLevels: input.sessionLevels,
    stopClusterAbove: nearestAbove ? Number(nearestAbove.price.toFixed(2)) : null,
    stopClusterBelow: nearestBelow ? Number(nearestBelow.price.toFixed(2)) : null,
    stopClusterBias,
    liquiditySweepRisk,
    summary: nearestAbove || nearestBelow
      ? `Nearest buy-side liquidity sits near ${nearestAbove?.label ?? 'n/a'} ${nearestAbove?.price?.toFixed?.(2) ?? 'n/a'}, sell-side liquidity near ${nearestBelow?.label ?? 'n/a'} ${nearestBelow?.price?.toFixed?.(2) ?? 'n/a'}, with ${liquiditySweepRisk} sweep risk.`
      : 'Session highs/lows did not leave a clear liquidity map in the current window.',
  };
}

function computePriceDeltaDivergence(recent: Candle[], deltas: number[]): {
  priceDeltaDivergence: string;
  divergenceBias: 'bullish' | 'bearish' | 'neutral';
  divergenceDetail: string;
  priceTrend: 'rising' | 'falling' | 'flat';
  deltaTrend: 'rising' | 'falling' | 'flat';
} {
  const windowSize = Math.min(8, recent.length, deltas.length);
  if (windowSize < 6) {
    return {
      priceDeltaDivergence: 'none',
      divergenceBias: 'neutral',
      divergenceDetail: 'not enough recent bars to assess price-vs-delta divergence',
      priceTrend: 'flat',
      deltaTrend: 'flat',
    };
  }

  const candleWindow = recent.slice(-windowSize);
  const deltaWindow = deltas.slice(-windowSize);
  const splitIndex = Math.floor(windowSize / 2);
  const firstCandles = candleWindow.slice(0, splitIndex);
  const secondCandles = candleWindow.slice(splitIndex);
  const cumulativeWindow = deltaWindow.reduce<number[]>((series, value, index) => {
    const prior = index > 0 ? series[index - 1] : 0;
    series.push(Number((prior + value).toFixed(4)));
    return series;
  }, []);
  const firstDeltaWindow = cumulativeWindow.slice(0, splitIndex);
  const secondDeltaWindow = cumulativeWindow.slice(splitIndex);
  const priceRange = Math.max(...candleWindow.map((candle) => candle.high)) - Math.min(...candleWindow.map((candle) => candle.low));
  const priceThreshold = Math.max(priceRange * 0.1, candleWindow[candleWindow.length - 1]!.close * 0.0012, 0.15);
  const averageAbsDelta = average(deltaWindow.map((value) => Math.abs(value)));
  const deltaThreshold = Math.max(averageAbsDelta * 0.85, 0.18);
  const priceTrend = trendLabel(firstCandles[0]!.close, secondCandles[secondCandles.length - 1]!.close, priceThreshold * 0.5);
  const deltaTrend = trendLabel(firstDeltaWindow[0]!, secondDeltaWindow[secondDeltaWindow.length - 1]!, deltaThreshold * 0.5);

  const firstPriceHigh = Math.max(...firstCandles.map((candle) => candle.high));
  const secondPriceHigh = Math.max(...secondCandles.map((candle) => candle.high));
  const firstPriceLow = Math.min(...firstCandles.map((candle) => candle.low));
  const secondPriceLow = Math.min(...secondCandles.map((candle) => candle.low));
  const firstDeltaHigh = Math.max(...firstDeltaWindow);
  const secondDeltaHigh = Math.max(...secondDeltaWindow);
  const firstDeltaLow = Math.min(...firstDeltaWindow);
  const secondDeltaLow = Math.min(...secondDeltaWindow);

  if (secondPriceHigh > firstPriceHigh + priceThreshold && secondDeltaHigh < firstDeltaHigh - deltaThreshold) {
    return {
      priceDeltaDivergence: 'bearish divergence',
      divergenceBias: 'bearish',
      divergenceDetail: 'price pushed to a higher high while delta failed to confirm the move',
      priceTrend,
      deltaTrend,
    };
  }

  if (secondPriceLow < firstPriceLow - priceThreshold && secondDeltaLow > firstDeltaLow + deltaThreshold) {
    return {
      priceDeltaDivergence: 'bullish divergence',
      divergenceBias: 'bullish',
      divergenceDetail: 'price pressed to a lower low while delta improved instead of confirming weakness',
      priceTrend,
      deltaTrend,
    };
  }

  return {
    priceDeltaDivergence: 'none',
    divergenceBias: 'neutral',
    divergenceDetail: 'price and delta are broadly aligned across the recent orderflow window',
    priceTrend,
    deltaTrend,
  };
}

export async function getOrderflowEngine(input: { market: string; timeframe?: string }): Promise<{
  market: string;
  sourceSymbol: string;
  timeframe: string;
  feedQuality: 'strong' | 'usable' | 'weak';
  mode: 'proxy' | 'estimated';
  sourceLabel: string;
  dominance: string;
  candlePressureScore: number;
  buySellPressure: number;
  aggregateVolumePressure: number;
  aggregateVolumeRelative: number | null;
  aggregateVolumeDominance: string;
  aggregateVolumeLatest: number | null;
  aggregateVolumeRolling: number | null;
  aggregateVolumeLastBarTime: string | null;
  aggregateVolumeSources: Array<{ provider: string; state: string; bars: number; latestVolume: number | null; rollingVolume: number | null; note: string }>;
  secondSourceActive: boolean;
  macroProxyPressure: number;
  macroProxyBias: string;
  bidAskPressureRatio: number;
  quoteImbalance: number;
  exhaustionSignal: string;
  absorptionSignal: string;
  structureState: string;
  price: number;
  sessionVwap: number;
  vwapDeviation: number;
  rangeExpansion: number;
  cumulativeDeltaProxy: number;
  priceDeltaDivergence: string;
  divergenceBias: 'bullish' | 'bearish' | 'neutral';
  divergenceDetail: string;
  priceTrend: 'rising' | 'falling' | 'flat';
  deltaTrend: 'rising' | 'falling' | 'flat';
  sessionLevels: SessionLevel[];
  stopClusterAbove: number | null;
  stopClusterBelow: number | null;
  stopClusterBias: string;
  liquiditySweepRisk: 'elevated' | 'contained';
  liquidityMapSummary: string;
  imbalanceLadder: Array<{ price: number; delta: number; intensity: number }>;
  recentBars: Array<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    delta: number;
    volume: number | null;
    relativeVolume: number;
    intensity: number;
    direction: 'buy' | 'sell' | 'neutral';
  }>;
  footprintBars: Array<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    delta: number;
    volume: number | null;
    relativeVolume: number;
    intensity: number;
    direction: 'buy' | 'sell' | 'neutral';
  }>;
  summary: string;
}> {
  const market = (input.market || 'XAUUSD').toUpperCase();
  const timeframe = input.timeframe || '1h';
  const sourceSymbol = resolveSymbol(market);

  return getCachedOrCompute(cacheKey('orderflow', `${market}:${timeframe}`), async () => {
    const chartSpec = intervalFrom(timeframe);
    const [preferred, macroProxy, fxVolume] = await Promise.all([
      fetchPreferredCandles(market, sourceSymbol, timeframe, chartSpec.range, chartSpec.interval),
      getFxMacroProxyPressure(market),
      getFxVolumeAggregate({ market }),
    ]);
    const candles = preferred.candles;
    if (candles.length < 20) throw new Error('Insufficient candles for orderflow engine');

    const recent = candles.slice(-24);
    const avgVolume = average(recent.map((candle) => candle.volume ?? 0).filter((value) => value > 0));
    const baseQuality = feedQuality(sourceSymbol, avgVolume);
    const secondSourceActive = fxVolume.sourceMode === 'multi-broker';
    const source = preferred.source === 'oanda'
      ? {
        quality: secondSourceActive ? 'strong' as const : 'usable' as const,
        mode: 'proxy' as const,
        sourceLabel: secondSourceActive
          ? 'OANDA broker candles and the normalized OANDA + FXCM broker-volume composite are driving this footprint proxy together; this is a stronger OTC FX broker composite, but still not centralized exchange tape.'
          : 'OANDA broker candles drive this footprint proxy for supported symbols; useful broker-flow context, but not centralized exchange tape. FX orderflow also blends DXY, US10Y, and JPY-risk proxies where relevant.',
      }
      : {
        ...baseQuality,
        sourceLabel: macroProxy.applicable && /=X$/.test(sourceSymbol)
          ? `${baseQuality.sourceLabel} Vaultum also blends DXY, US10Y, and JPY-risk proxies into the live FX read, and ${fxVolume.latestVolume != null ? 'the normalized broker-volume sidecar is supplementing it as a second source.' : 'the broker-volume sidecar is waiting on active broker data.'}`
          : baseQuality.sourceLabel,
      };
    const deltas = recent.map((candle) => candlePressure(candle, avgVolume || 1));
    const cumulativeDeltaProxy = deltas.reduce((sum, value) => sum + value, 0);
    const divergence = computePriceDeltaDivergence(recent, deltas);
    const latest = recent[recent.length - 1];
    const latestDelta = deltas[deltas.length - 1] ?? 0;
    const price = latest.close;
    const buyScore = deltas.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
    const sellScore = Math.abs(deltas.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
    const bidAskPressureRatio = Number(((buyScore + 0.01) / (sellScore + 0.01)).toFixed(2));
    const candlePressureScore = clamp(Math.round(cumulativeDeltaProxy * 24), -100, 100);
    const aggregateVolumePressure = fxVolume.volumeScore ?? 0;
    const buySellPressure = clamp(Math.round(
      candlePressureScore
      + (macroProxy.macroProxyPressure * 0.6)
      + (aggregateVolumePressure * 0.35),
    ), -100, 100);
    const quoteImbalance = clamp(Math.round((((bidAskPressureRatio - 1) * 40) + (latestDelta * 20))), -100, 100);

    const sessionVwapDenominator = recent.reduce((sum, candle) => sum + (candle.volume ?? 1), 0);
    const sessionVwap = recent.reduce((sum, candle) => sum + (candle.close * (candle.volume ?? 1)), 0) / Math.max(sessionVwapDenominator, 1);
    const vwapDeviation = Number((((price - sessionVwap) / sessionVwap) * 100).toFixed(2));

    const recentRanges = recent.map((candle) => candle.high - candle.low);
    const rangeExpansion = average(recentRanges.slice(-6)) / Math.max(average(recentRanges.slice(0, 12)), 0.0001);
    const wickTop = latest.high - Math.max(latest.open, latest.close);
    const wickBottom = Math.min(latest.open, latest.close) - latest.low;
    const body = Math.abs(latest.close - latest.open);
    const absorptionSignal =
      (latest.volume ?? 0) > avgVolume * 1.25 && body < (latest.high - latest.low) * 0.35 && (wickTop > body || wickBottom > body)
        ? latest.close >= latest.open
          ? 'sell-side absorption'
          : 'buy-side absorption'
        : 'none';
    const exhaustionSignal =
      Math.abs(latestDelta) < 0.18 && (latest.volume ?? 0) > avgVolume * 1.2 && rangeExpansion > 1.08
        ? 'possible exhaustion'
        : 'none';
    const structureState =
      vwapDeviation > 0.2 && buySellPressure > 10 ? 'holding above value' :
        vwapDeviation < -0.2 && buySellPressure < -10 ? 'holding below value' :
          'inside balance';
    const dominance = buySellPressure > 18 ? 'buyers dominant' : buySellPressure < -18 ? 'sellers dominant' : 'balanced / rotational';
    const sessionLevels = buildSessionLevels(candles.slice(-72));
    const liquidityMap = buildLiquidityMap({
      price,
      recent,
      sessionLevels,
      dominance,
      rangeExpansion,
    });

    const ladder = recent.slice(-12).map((candle, index) => ({
      price: Number(candle.close.toFixed(2)),
      delta: Number((deltas[deltas.length - 12 + index] ?? 0).toFixed(2)),
      intensity: Math.round(clamp(Math.abs((deltas[deltas.length - 12 + index] ?? 0) * 55), 5, 100)),
    })).reverse();
    const richRecentBars = recent.slice(-12).map((candle, index) => {
      const delta = Number((deltas[deltas.length - 12 + index] ?? 0).toFixed(2));
      const relativeVolume = candle.volume != null && avgVolume > 0 ? candle.volume / avgVolume : 1;
      return {
        time: candle.time,
        open: Number(candle.open.toFixed(2)),
        high: Number(candle.high.toFixed(2)),
        low: Number(candle.low.toFixed(2)),
        close: Number(candle.close.toFixed(2)),
        delta,
        volume: candle.volume,
        relativeVolume: Number(relativeVolume.toFixed(2)),
        intensity: Math.round(clamp((Math.abs(delta) * 55) + (Math.max(relativeVolume - 1, 0) * 25), 8, 100)),
        direction: delta > 0.12 ? 'buy' as const : delta < -0.12 ? 'sell' as const : 'neutral' as const,
      };
    });

    return {
      market,
      sourceSymbol,
      timeframe,
      feedQuality: source.quality,
      mode: source.mode,
      sourceLabel: source.sourceLabel,
      dominance,
      candlePressureScore,
      buySellPressure,
      aggregateVolumePressure: Number(aggregateVolumePressure.toFixed(1)),
      aggregateVolumeRelative: fxVolume.relativeVolume,
      aggregateVolumeDominance: fxVolume.dominance,
      aggregateVolumeLatest: fxVolume.latestVolume,
      aggregateVolumeRolling: fxVolume.rollingVolume,
      aggregateVolumeLastBarTime: fxVolume.lastBarTime,
      aggregateVolumeSources: fxVolume.sources,
      secondSourceActive,
      macroProxyPressure: macroProxy.macroProxyPressure,
      macroProxyBias: macroProxy.macroProxyBias,
      bidAskPressureRatio,
      quoteImbalance,
      exhaustionSignal,
      absorptionSignal,
      structureState,
      price: Number(price.toFixed(2)),
      sessionVwap: Number(sessionVwap.toFixed(2)),
      vwapDeviation,
      rangeExpansion: Number(rangeExpansion.toFixed(2)),
      cumulativeDeltaProxy: Number(cumulativeDeltaProxy.toFixed(2)),
      priceDeltaDivergence: divergence.priceDeltaDivergence,
      divergenceBias: divergence.divergenceBias,
      divergenceDetail: divergence.divergenceDetail,
      priceTrend: divergence.priceTrend,
      deltaTrend: divergence.deltaTrend,
      sessionLevels: liquidityMap.sessionLevels,
      stopClusterAbove: liquidityMap.stopClusterAbove,
      stopClusterBelow: liquidityMap.stopClusterBelow,
      stopClusterBias: liquidityMap.stopClusterBias,
      liquiditySweepRisk: liquidityMap.liquiditySweepRisk,
      liquidityMapSummary: liquidityMap.summary,
      imbalanceLadder: ladder,
      recentBars: richRecentBars.slice(-10),
      footprintBars: richRecentBars.slice(-8),
      summary: `${dominance} with ${source.quality} feed quality, bid/ask pressure ratio ${bidAskPressureRatio}, quote imbalance ${quoteImbalance}, normalized broker volume ${fxVolume.dominance} (${fxVolume.volumeScore ?? 'n/a'}), macro proxy ${macroProxy.macroProxyBias} (${macroProxy.macroProxyPressure}), divergence ${divergence.priceDeltaDivergence}, absorption ${absorptionSignal}, exhaustion ${exhaustionSignal}, and ${liquidityMap.summary}`,
    };
  }, 5);
}
