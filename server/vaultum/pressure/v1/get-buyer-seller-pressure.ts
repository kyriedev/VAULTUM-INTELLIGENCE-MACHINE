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
  };
  return map[value] ?? market;
}

async function fetchChart(symbol: string, range: string, interval: string): Promise<any> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': CHROME_UA },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Pressure upstream ${response.status}`);
  return response.json() as Promise<any>;
}

async function fetchPreferredCandles(market: string, symbol: string, timeframe: string, count: number, range: string, interval: string): Promise<{ candles: Candle[]; source: 'oanda' | 'yahoo' }> {
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

  const payload = await fetchChart(symbol, range, interval);
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

function candlePressure(candle: Candle, averageVolume: number): number {
  const range = Math.max(candle.high - candle.low, 0.0001);
  const body = candle.close - candle.open;
  const efficiency = body / range;
  const relativeVolume = candle.volume != null && averageVolume > 0 ? candle.volume / averageVolume : 1;
  const volumeWeight = clamp(relativeVolume, 0.55, 1.85);
  return efficiency * volumeWeight;
}

function weightedAveragePrice(candles: Candle[]): number | null {
  if (!candles.length) return null;
  const totalWeight = candles.reduce((sum, candle) => sum + (candle.volume ?? 1), 0);
  if (!totalWeight) return average(candles.map((candle) => candle.close));
  return candles.reduce((sum, candle) => sum + (candle.close * (candle.volume ?? 1)), 0) / totalWeight;
}

export async function getBuyerSellerPressure(input: { market: string; mode?: 'auto' | 'direct' | 'proxy' }): Promise<any> {
  const market = (input.market || 'XAUUSD').toUpperCase();
  const symbol = resolveSymbol(market);
  const requestedMode = input.mode || 'auto';

  return getCachedOrCompute(cacheKey('pressure', `${market}:${requestedMode}`), async () => {
    try {
      const [intradayFeed, dailyFeed] = await Promise.all([
        fetchPreferredCandles(market, symbol, '1h', 120, '5d', '1h'),
        fetchPreferredCandles(market, symbol, '1d', 30, '1mo', '1d'),
      ]);
      const intradayCandles = intradayFeed.candles;
      const dailyCandles = dailyFeed.candles;
      if (!intradayCandles.length || !dailyCandles.length) throw new Error('No candles available');

      const latestIntraday = intradayCandles[intradayCandles.length - 1];
      const latestDaily = dailyCandles[dailyCandles.length - 1];
      const intradayAverageVolume = average(intradayCandles.map((candle) => candle.volume ?? 0).filter((value) => value > 0));
      const dailyAverageVolume = average(dailyCandles.map((candle) => candle.volume ?? 0).filter((value) => value > 0));
      const recentIntraday = intradayCandles.slice(-8);
      const priorIntraday = intradayCandles.slice(-20, -8);
      const recentPressure = recentIntraday.map((candle) => candlePressure(candle, intradayAverageVolume || 1));
      const cumulativePressure = recentPressure.reduce((sum, value) => sum + value, 0);
      const intradayImpulse = recentPressure[recentPressure.length - 1] ?? 0;

      const hourlyRange = average(recentIntraday.map((candle) => candle.high - candle.low));
      const baselineRange = average((priorIntraday.length ? priorIntraday : intradayCandles.slice(-20, -8)).map((candle) => candle.high - candle.low));
      const rangeExpansion = baselineRange > 0 ? hourlyRange / baselineRange : 1;

      const sessionVwap = weightedAveragePrice(intradayCandles.slice(-20));
      const price = latestIntraday.close;
      const vwapDeviation = sessionVwap ? ((price - sessionVwap) / sessionVwap) * 100 : 0;
      const priceChange = ((latestDaily.close - latestDaily.open) / latestDaily.open) * 100;
      const dailyAnchor = dailyCandles.length > 5 ? dailyCandles[dailyCandles.length - 6].close : dailyCandles[0].close;
      const dailyTrend5d = dailyAnchor ? ((latestDaily.close - dailyAnchor) / dailyAnchor) * 100 : priceChange;

      const range = Math.max(latestIntraday.high - latestIntraday.low, 0.0001);
      const rangeEfficiency = (latestIntraday.close - latestIntraday.open) / range;
      const latestRelativeVolume = latestIntraday.volume != null && intradayAverageVolume > 0
        ? latestIntraday.volume / intradayAverageVolume
        : latestDaily.volume != null && dailyAverageVolume > 0
          ? latestDaily.volume / dailyAverageVolume
          : 1;

      const score = clamp(Math.round(
        (intradayImpulse * 26)
        + (cumulativePressure * 8)
        + (rangeEfficiency * 20)
        + (vwapDeviation * 8)
        + (dailyTrend5d * 3)
        + ((rangeExpansion - 1) * 18)
        + ((latestRelativeVolume - 1) * 16),
      ), -100, 100);

      const mode = requestedMode === 'direct'
        ? 'unavailable'
        : intradayFeed.source === 'oanda'
          ? 'proxy'
          : /=X$/.test(symbol)
          ? 'estimated'
          : 'proxy';
      const dominance = score > 25 ? 'buyers dominant' : score < -25 ? 'sellers dominant' : 'balanced / rotational';
      const structureState =
        vwapDeviation > 0.2 && score > 10 ? 'trading above session value' :
          vwapDeviation < -0.2 && score < -10 ? 'trading below session value' :
            'near session balance';

      return {
        market,
        symbol,
        mode,
        sourceLabel: intradayFeed.source === 'oanda'
          ? 'OANDA broker candles drive this pressure model for supported FX/spot symbols; this is broker-flow proxy, not centralized tape.'
          : /=X$/.test(symbol)
          ? 'Estimated pressure from OTC FX candle structure, hourly momentum, and range expansion; no true exchange volume exists.'
          : 'Proxy pressure from hourly traded candles, relative volume, VWAP deviation, and range expansion; not true aggressor tape.',
        score,
        dominance,
        directSupported: false,
        proxySupported: true,
        price,
        priceChange: Number(priceChange.toFixed(2)),
        dailyTrend5d: Number(dailyTrend5d.toFixed(2)),
        rangeEfficiency: Number(rangeEfficiency.toFixed(2)),
        relativeVolume: Number(latestRelativeVolume.toFixed(2)),
        intradayImpulse: Number(intradayImpulse.toFixed(2)),
        cumulativePressure: Number(cumulativePressure.toFixed(2)),
        vwapDeviation: Number(vwapDeviation.toFixed(2)),
        rangeExpansion: Number(rangeExpansion.toFixed(2)),
        structureState,
      };
    } catch (error) {
      return {
        market,
        symbol,
        mode: 'unavailable',
        sourceLabel: 'Buyer/seller pressure unavailable from current source mix',
        score: null,
        dominance: 'unknown',
        directSupported: false,
        proxySupported: false,
        unavailable: true,
        error: error instanceof Error ? error.message : 'Unknown pressure error',
      };
    }
  }, 180);
}
