import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { CHROME_UA } from '../../../_shared/constants';
import { fetchOandaCandles, granularityForOanda, mapToOandaInstrument, oandaConfigured } from '../../_shared/oanda';

type Candle = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
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
    BTCUSD: 'BTC-USD',
  };
  return map[value] ?? market;
}

function intervalFrom(timeframe: string): { range: string; interval: string } {
  const value = (timeframe || '1h').toLowerCase();
  if (value === '15m') return { range: '5d', interval: '15m' };
  if (value === '30m') return { range: '10d', interval: '30m' };
  if (value === '4h') return { range: '3mo', interval: '1h' };
  return { range: '10d', interval: '1h' };
}

async function fetchChart(symbol: string, range: string, interval: string): Promise<any> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': CHROME_UA },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Orderflow upstream ${response.status}`);
  return response.json() as Promise<any>;
}

async function fetchPreferredCandles(market: string, sourceSymbol: string, timeframe: string, range: string, interval: string): Promise<{ candles: Candle[]; source: 'oanda' | 'yahoo' }> {
  if (oandaConfigured() && mapToOandaInstrument(market)) {
    const candles = await fetchOandaCandles(market, granularityForOanda(timeframe), timeframe === '4h' ? 180 : 160);
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

  const payload = await fetchChart(sourceSymbol, range, interval);
  return { candles: extractCandles(payload), source: 'yahoo' };
}

function extractCandles(payload: any): Candle[] {
  const quote = payload?.chart?.result?.[0]?.indicators?.quote?.[0];
  const opens = quote?.open ?? [];
  const highs = quote?.high ?? [];
  const lows = quote?.low ?? [];
  const closes = quote?.close ?? [];
  const volumes = quote?.volume ?? [];
  const candles: Candle[] = [];

  for (let index = 0; index < closes.length; index++) {
    const open = opens[index];
    const high = highs[index];
    const low = lows[index];
    const close = closes[index];
    if ([open, high, low, close].some((value) => value == null || !Number.isFinite(value))) continue;
    candles.push({
      open,
      high,
      low,
      close,
      volume: volumes[index] != null && Number.isFinite(volumes[index]) ? volumes[index] : null,
    });
  }

  return candles;
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
  buySellPressure: number;
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
  imbalanceLadder: Array<{ price: number; delta: number; intensity: number }>;
  recentBars: Array<{ close: number; delta: number; volume: number | null }>;
  summary: string;
}> {
  const market = (input.market || 'XAUUSD').toUpperCase();
  const timeframe = input.timeframe || '1h';
  const sourceSymbol = resolveSymbol(market);

  return getCachedOrCompute(cacheKey('orderflow', `${market}:${timeframe}`), async () => {
    const chartSpec = intervalFrom(timeframe);
    const preferred = await fetchPreferredCandles(market, sourceSymbol, timeframe, chartSpec.range, chartSpec.interval);
    const candles = preferred.candles;
    if (candles.length < 20) throw new Error('Insufficient candles for orderflow engine');

    const recent = candles.slice(-24);
    const avgVolume = average(recent.map((candle) => candle.volume ?? 0).filter((value) => value > 0));
    const source = preferred.source === 'oanda'
      ? {
        quality: 'usable' as const,
        mode: 'proxy' as const,
        sourceLabel: 'OANDA broker candles drive this footprint proxy for supported symbols; useful broker-flow context, but not centralized exchange tape.',
      }
      : feedQuality(sourceSymbol, avgVolume);
    const deltas = recent.map((candle) => candlePressure(candle, avgVolume || 1));
    const cumulativeDeltaProxy = deltas.reduce((sum, value) => sum + value, 0);
    const divergence = computePriceDeltaDivergence(recent, deltas);
    const latest = recent[recent.length - 1];
    const latestDelta = deltas[deltas.length - 1] ?? 0;
    const price = latest.close;
    const buyScore = deltas.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
    const sellScore = Math.abs(deltas.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
    const bidAskPressureRatio = Number(((buyScore + 0.01) / (sellScore + 0.01)).toFixed(2));
    const buySellPressure = clamp(Math.round(cumulativeDeltaProxy * 24), -100, 100);
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

    const ladder = recent.slice(-12).map((candle, index) => ({
      price: Number(candle.close.toFixed(2)),
      delta: Number((deltas[deltas.length - 12 + index] ?? 0).toFixed(2)),
      intensity: Math.round(clamp(Math.abs((deltas[deltas.length - 12 + index] ?? 0) * 55), 5, 100)),
    })).reverse();

    return {
      market,
      sourceSymbol,
      timeframe,
      feedQuality: source.quality,
      mode: source.mode,
      sourceLabel: source.sourceLabel,
      dominance,
      buySellPressure,
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
      imbalanceLadder: ladder,
      recentBars: recent.slice(-10).map((candle, index) => ({
        close: Number(candle.close.toFixed(2)),
        delta: Number((deltas[deltas.length - 10 + index] ?? 0).toFixed(2)),
        volume: candle.volume,
      })),
      summary: `${dominance} with ${source.quality} feed quality, bid/ask pressure ratio ${bidAskPressureRatio}, quote imbalance ${quoteImbalance}, divergence ${divergence.priceDeltaDivergence}, absorption ${absorptionSignal}, exhaustion ${exhaustionSignal}.`,
    };
  }, 180);
}
