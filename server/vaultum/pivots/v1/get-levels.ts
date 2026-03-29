import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { CHROME_UA } from '../../../_shared/constants';
import { fetchOandaCandles, granularityForOanda, mapToOandaInstrument, oandaConfigured } from '../../_shared/oanda';

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

type RawPivot = {
  price: number;
  index: number;
  kind: 'high' | 'low';
};

type InstitutionalLevel = {
  price: number;
  touches: number;
  role: 'support' | 'resistance';
  power: number;
  barsSinceLastHit: number;
  lastHitIndex: number;
  dynamicDistance: number | null;
};

const CFG_PIV_LEN = 3;
const CFG_PROXIMITY = 0.7;
const CFG_MAX_LEVELS = 10;
const CFG_LOOKBACK = 200;
const CFG_MIN_TOUCHES = 2;
const CFG_SIG_MIN_POWER = 2;
const CFG_DYN_LEN = 70;

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

function timeframeConfig(timeframe: string): { yahooRange: string; yahooInterval: string; count: number; sourceTimeframe: string } {
  const value = timeframe.toLowerCase();
  if (value === '15m') return { yahooRange: '1mo', yahooInterval: '15m', count: 260, sourceTimeframe: '15m' };
  if (value === '30m') return { yahooRange: '1mo', yahooInterval: '30m', count: 260, sourceTimeframe: '30m' };
  if (value === '4h') return { yahooRange: '3mo', yahooInterval: '60m', count: 320, sourceTimeframe: '1h' };
  if (value === '1h') return { yahooRange: '1mo', yahooInterval: '60m', count: 260, sourceTimeframe: '1h' };
  return { yahooRange: '9mo', yahooInterval: '1d', count: 260, sourceTimeframe: '1d' };
}

async function fetchYahooCandles(symbol: string, range: string, interval: string): Promise<Candle[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': CHROME_UA },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Pivot upstream ${response.status}`);
  const payload = await response.json() as any;
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp ?? [];
  const candles: Candle[] = [];

  for (let index = 0; index < timestamps.length; index += 1) {
    const open = quote?.open?.[index];
    const high = quote?.high?.[index];
    const low = quote?.low?.[index];
    const close = quote?.close?.[index];
    if ([open, high, low, close].some((value) => value == null || !Number.isFinite(value))) continue;
    candles.push({
      time: new Date(Number(timestamps[index]) * 1000).toISOString(),
      open,
      high,
      low,
      close,
      volume: quote?.volume?.[index] != null && Number.isFinite(quote.volume[index]) ? quote.volume[index] : null,
    });
  }

  return candles;
}

async function fetchPreferredCandles(market: string, symbol: string, timeframe: string): Promise<{ candles: Candle[]; source: 'oanda' | 'yahoo' }> {
  const config = timeframeConfig(timeframe);
  if (oandaConfigured() && mapToOandaInstrument(market)) {
    const candles = await fetchOandaCandles(market, granularityForOanda(config.sourceTimeframe), config.count);
    if (candles.length) {
      return {
        source: 'oanda',
        candles: candles.map((candle) => ({
          time: candle.time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        })),
      };
    }
  }

  return {
    source: 'yahoo',
    candles: await fetchYahooCandles(symbol, config.yahooRange, config.yahooInterval),
  };
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeClassicPivot(candles: Candle[]): { pivot: number; supports: number[]; resistances: number[]; price: number; pivotDistance: number; structure: string } {
  const reference = candles[candles.length - 2] ?? candles[candles.length - 1];
  const price = candles[candles.length - 1]?.close ?? reference.close;
  const pivot = Number((((reference.high + reference.low + reference.close) / 3)).toFixed(2));
  const r1 = Number((2 * pivot - reference.low).toFixed(2));
  const s1 = Number((2 * pivot - reference.high).toFixed(2));
  const r2 = Number((pivot + (reference.high - reference.low)).toFixed(2));
  const s2 = Number((pivot - (reference.high - reference.low)).toFixed(2));
  return {
    pivot,
    supports: [s1, s2],
    resistances: [r1, r2],
    price,
    pivotDistance: Number((price - pivot).toFixed(2)),
    structure: price > pivot ? 'above-pivot' : price < pivot ? 'below-pivot' : 'at-pivot',
  };
}

function detectRawPivots(candles: Candle[]): RawPivot[] {
  const raw: RawPivot[] = [];
  for (let index = CFG_PIV_LEN; index < candles.length - CFG_PIV_LEN; index += 1) {
    const current = candles[index];
    let isPivotHigh = true;
    let isPivotLow = true;

    for (let offset = 1; offset <= CFG_PIV_LEN; offset += 1) {
      const left = candles[index - offset];
      const right = candles[index + offset];
      if (!left || !right) continue;
      if (current.high <= left.high || current.high <= right.high) isPivotHigh = false;
      if (current.low >= left.low || current.low >= right.low) isPivotLow = false;
      if (!isPivotHigh && !isPivotLow) break;
    }

    if (isPivotHigh) raw.push({ price: current.high, index, kind: 'high' });
    if (isPivotLow) raw.push({ price: current.low, index, kind: 'low' });
  }
  return raw.filter((pivot) => (candles.length - 1) - pivot.index <= CFG_LOOKBACK);
}

function computeDynamicLevel(candles: Candle[]): number | null {
  const window = candles.slice(-CFG_DYN_LEN);
  if (!window.length) return null;
  let weighted = 0;
  let totalWeight = 0;
  window.forEach((candle) => {
    const typical = (candle.high + candle.low + candle.close) / 3;
    const weight = candle.volume != null && candle.volume > 0 ? candle.volume : 1;
    weighted += typical * weight;
    totalWeight += weight;
  });
  if (!totalWeight) return null;
  return Number((weighted / totalWeight).toFixed(2));
}

function clusterInstitutionalLevels(rawPivots: RawPivot[], latestIndex: number, currentPrice: number, dynamicLevel: number | null): InstitutionalLevel[] {
  const levels: InstitutionalLevel[] = [];
  const used = new Array(rawPivots.length).fill(false);

  for (let index = 0; index < rawPivots.length; index += 1) {
    if (used[index]) continue;
    const seed = rawPivots[index];
    const mergeRange = seed.price * CFG_PROXIMITY / 100;
    let sumPrice = seed.price;
    let touches = 1;
    let latestHit = seed.index;
    let supportCount = seed.kind === 'low' ? 1 : 0;
    let resistanceCount = seed.kind === 'high' ? 1 : 0;
    used[index] = true;

    for (let otherIndex = index + 1; otherIndex < rawPivots.length; otherIndex += 1) {
      if (used[otherIndex]) continue;
      const other = rawPivots[otherIndex];
      if (Math.abs(other.price - seed.price) <= mergeRange) {
        sumPrice += other.price;
        touches += 1;
        latestHit = Math.max(latestHit, other.index);
        supportCount += other.kind === 'low' ? 1 : 0;
        resistanceCount += other.kind === 'high' ? 1 : 0;
        used[otherIndex] = true;
      }
    }

    const price = Number((sumPrice / touches).toFixed(2));
    const barsSinceLastHit = latestIndex - latestHit;
    const recencyBoost = clamp((CFG_LOOKBACK - barsSinceLastHit) / CFG_LOOKBACK, 0, 1);
    const power = Number((touches + recencyBoost).toFixed(2));
    const role: 'support' | 'resistance' = supportCount > resistanceCount
      ? 'support'
      : resistanceCount > supportCount
        ? 'resistance'
        : price > currentPrice
          ? 'resistance'
          : 'support';

    levels.push({
      price,
      touches,
      role,
      power,
      barsSinceLastHit,
      lastHitIndex: latestHit,
      dynamicDistance: dynamicLevel != null ? Number((price - dynamicLevel).toFixed(2)) : null,
    });
  }

  return levels
    .filter((level) => level.touches >= CFG_MIN_TOUCHES)
    .sort((left, right) => (right.power - left.power) || (right.lastHitIndex - left.lastHitIndex))
    .slice(0, CFG_MAX_LEVELS);
}

function computeSignals(candles: Candle[], levels: InstitutionalLevel[], currentPrice: number): {
  buySignal: boolean;
  sellSignal: boolean;
  bullSweep: boolean;
  bearSweep: boolean;
  bias: string;
  referenceLevel: number | null;
  referenceRole: 'support' | 'resistance' | null;
} {
  const latest = candles[candles.length - 1];
  if (!latest) {
    return { buySignal: false, sellSignal: false, bullSweep: false, bearSweep: false, bias: 'no signal', referenceLevel: null, referenceRole: null };
  }

  const range = Math.max(latest.high - latest.low, 0.0001);
  const upperWick = latest.high - Math.max(latest.close, latest.open);
  const lowerWick = Math.min(latest.close, latest.open) - latest.low;
  const isBullReject = lowerWick / range >= 0.5 && latest.close > latest.open && latest.close > (latest.low + range * 0.6);
  const isBearReject = upperWick / range >= 0.5 && latest.close < latest.open && latest.close < (latest.high - range * 0.6);
  const levelProximity = currentPrice * CFG_PROXIMITY / 100 * 2;

  let bestBuy: InstitutionalLevel | null = null;
  let bestSell: InstitutionalLevel | null = null;
  let bullSweep = false;
  let bearSweep = false;

  for (const level of levels) {
    if (level.touches < CFG_SIG_MIN_POWER) continue;
    if (level.role === 'support' && Math.abs(latest.low - level.price) <= levelProximity && isBullReject) {
      if (!bestBuy || level.power > bestBuy.power) bestBuy = level;
    }
    if (level.role === 'resistance' && Math.abs(latest.high - level.price) <= levelProximity && isBearReject) {
      if (!bestSell || level.power > bestSell.power) bestSell = level;
    }
    if (level.role === 'support' && latest.low < level.price - levelProximity * 0.5 && latest.close > level.price && latest.close > latest.open) {
      bullSweep = true;
    }
    if (level.role === 'resistance' && latest.high > level.price + levelProximity * 0.5 && latest.close < level.price && latest.close < latest.open) {
      bearSweep = true;
    }
  }

  if (bestBuy) {
    const selectedBuy = bestBuy;
    return {
      buySignal: true,
      sellSignal: false,
      bullSweep,
      bearSweep: false,
      bias: 'bullish rejection at institutional support',
      referenceLevel: selectedBuy.price,
      referenceRole: selectedBuy.role,
    };
  }
  if (bestSell) {
    const selectedSell = bestSell;
    return {
      buySignal: false,
      sellSignal: true,
      bullSweep: false,
      bearSweep,
      bias: 'bearish rejection at institutional resistance',
      referenceLevel: selectedSell.price,
      referenceRole: selectedSell.role,
    };
  }
  if (bullSweep) {
    return {
      buySignal: false,
      sellSignal: false,
      bullSweep: true,
      bearSweep: false,
      bias: 'bullish liquidity sweep near mapped support',
      referenceLevel: levels.find((level) => level.role === 'support')?.price ?? null,
      referenceRole: 'support',
    };
  }
  if (bearSweep) {
    return {
      buySignal: false,
      sellSignal: false,
      bullSweep: false,
      bearSweep: true,
      bias: 'bearish liquidity sweep near mapped resistance',
      referenceLevel: levels.find((level) => level.role === 'resistance')?.price ?? null,
      referenceRole: 'resistance',
    };
  }
  return {
    buySignal: false,
    sellSignal: false,
    bullSweep: false,
    bearSweep: false,
    bias: 'no active institutional signal',
    referenceLevel: null,
    referenceRole: null,
  };
}

export async function getLevels(input: { market: string; timeframe?: string }): Promise<any> {
  const market = (input.market || 'XAUUSD').toUpperCase();
  const timeframe = input.timeframe || '1d';
  const symbol = resolveSymbol(market);

  return getCachedOrCompute(cacheKey('pivots', `${market}:${timeframe}`), async () => {
    try {
      const preferred = await fetchPreferredCandles(market, symbol, timeframe);
      const candles = preferred.candles.filter((candle) => Number.isFinite(candle.open) && Number.isFinite(candle.high) && Number.isFinite(candle.low) && Number.isFinite(candle.close));
      if (candles.length < 10) throw new Error('No OHLC available');

      const classic = computeClassicPivot(candles);
      const dynamicLevel = computeDynamicLevel(candles);
      const rawPivots = detectRawPivots(candles);
      const institutionalLevels = clusterInstitutionalLevels(rawPivots, candles.length - 1, classic.price, dynamicLevel);
      const mappedSupport = [...institutionalLevels]
        .filter((level) => level.role === 'support' && level.price <= classic.price)
        .sort((left, right) => right.price - left.price)[0]
        ?? institutionalLevels.find((level) => level.role === 'support')
        ?? null;
      const mappedResistance = [...institutionalLevels]
        .filter((level) => level.role === 'resistance' && level.price >= classic.price)
        .sort((left, right) => left.price - right.price)[0]
        ?? institutionalLevels.find((level) => level.role === 'resistance')
        ?? null;
      const signalMap = computeSignals(candles, institutionalLevels, classic.price);
      const averageTouchPower = average(institutionalLevels.map((level) => level.power));
      const confluenceSummary = mappedSupport && mappedResistance
        ? `Institutional map frames ${mappedSupport.price.toFixed(2)} support against ${mappedResistance.price.toFixed(2)} resistance with ${averageTouchPower.toFixed(2)} average power.`
        : institutionalLevels.length
          ? `Institutional map found ${institutionalLevels.length} defended/rejected levels with ${averageTouchPower.toFixed(2)} average power.`
          : 'Institutional level map did not find enough repeated pivots yet.';

      return {
        market,
        symbol,
        timeframe,
        pivot: classic.pivot,
        supports: classic.supports,
        resistances: classic.resistances,
        price: classic.price,
        pivotDistance: classic.pivotDistance,
        structure: classic.structure,
        sourceLabel: preferred.source === 'oanda'
          ? 'Classic pivots and institutional level mapping are built from OANDA broker candles for supported symbols.'
          : /=X$/.test(symbol)
            ? 'Classic pivots and institutional level mapping are estimated from Yahoo OTC FX candles; no centralized exchange volume exists.'
            : 'Classic pivots and institutional level mapping are built from Yahoo traded candles and pivot clustering.',
        dynamicLevel,
        dynamicState: dynamicLevel == null
          ? 'dynamic level unavailable'
          : classic.price > dynamicLevel
            ? 'above dynamic level'
            : classic.price < dynamicLevel
              ? 'below dynamic level'
              : 'at dynamic level',
        institutionalLevels,
        mappedSupport,
        mappedResistance,
        confluenceSummary,
        signalMap,
      };
    } catch (error) {
      return {
        market,
        symbol,
        timeframe,
        pivot: null,
        supports: [],
        resistances: [],
        price: null,
        pivotDistance: null,
        structure: 'unknown',
        dynamicLevel: null,
        dynamicState: 'unknown',
        institutionalLevels: [],
        mappedSupport: null,
        mappedResistance: null,
        signalMap: {
          buySignal: false,
          sellSignal: false,
          bullSweep: false,
          bearSweep: false,
          bias: 'pivot signal unavailable',
          referenceLevel: null,
          referenceRole: null,
        },
        confluenceSummary: 'Institutional level map unavailable.',
        unavailable: true,
        error: error instanceof Error ? error.message : 'Unknown pivot error',
      };
    }
  }, 600);
}
