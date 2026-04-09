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

type LiquidityZone = {
  side: 'high' | 'low';
  top: number;
  bottom: number;
  midpoint: number;
  touches: number;
  totalVolume: number;
  barsAgo: number;
  label: string;
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

function intradaySpec(timeframe: string): { sourceTimeframe: string; count: number; range: string; interval: string } {
  const value = (timeframe || '1h').toLowerCase();
  if (value === '5m') return { sourceTimeframe: '5m', count: 320, range: '5d', interval: '5m' };
  if (value === '15m') return { sourceTimeframe: '15m', count: 220, range: '14d', interval: '15m' };
  if (value === '30m') return { sourceTimeframe: '30m', count: 180, range: '1mo', interval: '30m' };
  if (value === '4h') return { sourceTimeframe: '4h', count: 220, range: '3mo', interval: '1h' };
  return { sourceTimeframe: '1h', count: 140, range: '10d', interval: '1h' };
}

async function fetchPreferredCandles(
  market: string,
  symbol: string,
  timeframe: string,
  count: number,
  range: string,
  interval: string,
): Promise<{ candles: Candle[]; source: 'oanda' | 'yahoo' }> {
  if (oandaConfigured() && mapToOandaInstrument(market)) {
    const candles = await fetchOandaCandles(market, granularityForOanda(timeframe), count);
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

  const payload = await fetchYahooChart(symbol, range, interval);
  if (!payload?.candles.length) throw new Error(payload?.warnings?.[0] || 'No Yahoo pressure candles available');
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

function normalize(value: number, scale: number): number {
  if (!Number.isFinite(value) || !scale) return 0;
  return clamp((value / scale) * 100, -100, 100);
}

function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const multiplier = 2 / (period + 1);
  const result: number[] = [values[0]!];
  for (let index = 1; index < values.length; index += 1) {
    result.push((values[index]! * multiplier) + (result[index - 1]! * (1 - multiplier)));
  }
  return result;
}

function weightedAveragePrice(candles: Candle[]): number | null {
  if (!candles.length) return null;
  const totalWeight = candles.reduce((sum, candle) => sum + (candle.volume ?? 1), 0);
  if (!totalWeight) return average(candles.map((candle) => candle.close));
  return candles.reduce((sum, candle) => sum + (candle.close * (candle.volume ?? 1)), 0) / totalWeight;
}

function trueRange(current: Candle, previous: Candle | null): number {
  if (!previous) return current.high - current.low;
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close),
  );
}

function atr(candles: Candle[], period: number): number {
  if (!candles.length) return 0;
  const values = candles.map((candle, index) => trueRange(candle, index > 0 ? candles[index - 1]! : null));
  return average(values.slice(-period));
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

function findPivotHigh(candles: Candle[], index: number, lookback: number): boolean {
  const current = candles[index];
  if (!current) return false;
  for (let cursor = index - lookback; cursor <= index + lookback; cursor += 1) {
    if (cursor === index || cursor < 0 || cursor >= candles.length) continue;
    if ((candles[cursor]?.high ?? -Infinity) >= current.high) return false;
  }
  return true;
}

function findPivotLow(candles: Candle[], index: number, lookback: number): boolean {
  const current = candles[index];
  if (!current) return false;
  for (let cursor = index - lookback; cursor <= index + lookback; cursor += 1) {
    if (cursor === index || cursor < 0 || cursor >= candles.length) continue;
    if ((candles[cursor]?.low ?? Infinity) <= current.low) return false;
  }
  return true;
}

function buildLiquidityZones(candles: Candle[], lookback = 6): LiquidityZone[] {
  const zones: LiquidityZone[] = [];

  for (let index = lookback; index < candles.length - lookback; index += 1) {
    const candle = candles[index]!;

    if (findPivotHigh(candles, index, lookback)) {
      let touches = 0;
      let totalVolume = 0;
      const top = candle.high;
      const bottom = Math.max(candle.open, candle.close);
      for (let cursor = index + 1; cursor < candles.length; cursor += 1) {
        const future = candles[cursor]!;
        if (future.low < top && future.high > bottom) {
          touches += 1;
          totalVolume += future.volume ?? 0;
        }
      }
      zones.push({
        side: 'high',
        top: Number(top.toFixed(2)),
        bottom: Number(bottom.toFixed(2)),
        midpoint: Number((((top + bottom) / 2)).toFixed(2)),
        touches,
        totalVolume: Number(totalVolume.toFixed(0)),
        barsAgo: candles.length - 1 - index,
        label: `swing high ${top.toFixed(2)}`,
      });
    }

    if (findPivotLow(candles, index, lookback)) {
      let touches = 0;
      let totalVolume = 0;
      const top = Math.min(candle.open, candle.close);
      const bottom = candle.low;
      for (let cursor = index + 1; cursor < candles.length; cursor += 1) {
        const future = candles[cursor]!;
        if (future.low < top && future.high > bottom) {
          touches += 1;
          totalVolume += future.volume ?? 0;
        }
      }
      zones.push({
        side: 'low',
        top: Number(top.toFixed(2)),
        bottom: Number(bottom.toFixed(2)),
        midpoint: Number((((top + bottom) / 2)).toFixed(2)),
        touches,
        totalVolume: Number(totalVolume.toFixed(0)),
        barsAgo: candles.length - 1 - index,
        label: `swing low ${bottom.toFixed(2)}`,
      });
    }
  }

  return zones
    .sort((left, right) => {
      if (left.barsAgo !== right.barsAgo) return left.barsAgo - right.barsAgo;
      return right.touches - left.touches;
    })
    .slice(0, 16);
}

function previousDayLevels(candles: Candle[]): { high: number | null; low: number | null } {
  const reference = candles.length > 1 ? candles[candles.length - 2]! : candles[candles.length - 1] ?? null;
  if (!reference) return { high: null, low: null };
  return { high: Number(reference.high.toFixed(2)), low: Number(reference.low.toFixed(2)) };
}

function confidenceLabel(score: number): 'low' | 'medium' | 'high' {
  if (score >= 72) return 'high';
  if (score >= 48) return 'medium';
  return 'low';
}

export async function getBuyerSellerPressure(input: { market: string; timeframe?: string; mode?: 'auto' | 'direct' | 'proxy' }): Promise<any> {
  const market = (input.market || 'XAUUSD').toUpperCase();
  const symbol = resolveSymbol(market);
  const timeframe = (input.timeframe || '1h').toLowerCase();
  const requestedMode = input.mode || 'auto';
  const spec = intradaySpec(timeframe);

  return getCachedOrCompute(cacheKey('pressure', `${market}:${timeframe}:${requestedMode}`), async () => {
    try {
      const [intradayFeed, dailyFeed, macroProxy, fxVolume] = await Promise.all([
        fetchPreferredCandles(market, symbol, spec.sourceTimeframe, spec.count, spec.range, spec.interval),
        fetchPreferredCandles(market, symbol, '1d', 40, '3mo', '1d'),
        getFxMacroProxyPressure(market),
        getFxVolumeAggregate({ market }),
      ]);
      const intradayCandles = intradayFeed.candles;
      const dailyCandles = dailyFeed.candles;
      if (intradayCandles.length < 30 || dailyCandles.length < 5) throw new Error('Not enough candles for pressure engine');

      const recent = intradayCandles.slice(-40);
      const latest = recent[recent.length - 1]!;
      const closes = recent.map((candle) => candle.close);
      const ema20Series = ema(closes, 20);
      const ema50Series = ema(closes, 50);
      const ema20 = ema20Series[ema20Series.length - 1] ?? latest.close;
      const ema50 = ema50Series[ema50Series.length - 1] ?? latest.close;
      const price = latest.close;
      const ret5 = recent.length > 5 ? ((price - recent[recent.length - 6]!.close) / recent[recent.length - 6]!.close) : 0;
      const ret10 = recent.length > 10 ? ((price - recent[recent.length - 11]!.close) / recent[recent.length - 11]!.close) : 0;

      const currentRange = Math.max(latest.high - latest.low, 0.000001);
      const sessionVwap = weightedAveragePrice(recent.slice(-20)) ?? price;
      const intradayVolumes = recent.map((candle) => candle.volume ?? 0).filter((value) => value > 0);
      const avgVolume20 = average(intradayVolumes.slice(-20));
      const relativeVolume = latest.volume != null && avgVolume20 > 0 ? latest.volume / avgVolume20 : 1;
      const body = Math.abs(latest.close - latest.open);
      const bodyEfficiency = body / currentRange;
      const closeNearHigh = (latest.close - latest.low) / currentRange;
      const closeNearLow = (latest.high - latest.close) / currentRange;

      const atr14 = atr(recent.slice(-20), 14);
      const atrRatio = atr14 > 0 ? currentRange / atr14 : 1;
      const intradayImpulse = body === 0 ? 0 : ((latest.close - latest.open) / currentRange) * clamp(relativeVolume, 0.6, 1.8);
      const cumulativePressure = recent.slice(-8).reduce((sum, candle) => {
        const range = Math.max(candle.high - candle.low, 0.000001);
        const volumeReference = (candle.volume ?? avgVolume20 ?? 1);
        const averageReference = Math.max(avgVolume20 || 1, 1);
        const impulse = ((candle.close - candle.open) / range) * clamp(volumeReference / averageReference, 0.6, 1.8);
        return sum + impulse;
      }, 0);
      const rangeExpansion = atr14 > 0 ? average(recent.slice(-6).map((candle) => candle.high - candle.low)) / atr14 : 1;
      const vwapDeviation = ((price - sessionVwap) / sessionVwap) * 100;

      const priceMomentumPressure = Number((
        (0.35 * normalize(ret5, 0.003))
        + (0.25 * normalize(ret10, 0.005))
        + (0.20 * normalize((price - ema20) / Math.max(ema20, 0.000001), 0.002))
        + (0.20 * normalize((price - sessionVwap) / Math.max(sessionVwap, 0.000001), 0.002))
      ).toFixed(1));

      const tickVolumePressure = Number(clamp((relativeVolume - 1) * 35, -35, 35).toFixed(1));
      const volumePressureScore = Number(clamp(
        latest.close > latest.open
          ? relativeVolume * bodyEfficiency * closeNearHigh * 100
          : latest.close < latest.open
            ? -relativeVolume * bodyEfficiency * closeNearLow * 100
            : 0,
        -100,
        100,
      ).toFixed(1));

      const previousDay = previousDayLevels(dailyCandles);
      const sessionLevels = buildSessionLevels(intradayCandles.slice(-72));
      const liquidityZones = buildLiquidityZones(recent.slice(-60), 6);
      const liquidityAbove = liquidityZones
        .filter((zone) => zone.midpoint >= price)
        .sort((left, right) => Math.abs(left.midpoint - price) - Math.abs(right.midpoint - price))[0] ?? null;
      const liquidityBelow = liquidityZones
        .filter((zone) => zone.midpoint <= price)
        .sort((left, right) => Math.abs(left.midpoint - price) - Math.abs(right.midpoint - price))[0] ?? null;

      let structurePressureScore = 0;
      const drivers: string[] = [];
      const risks: string[] = [];

      if (previousDay.high != null && price > previousDay.high && latest.close > previousDay.high) {
        structurePressureScore += 25;
        drivers.push(`Price is holding above previous day high ${previousDay.high.toFixed(2)}.`);
      } else if (previousDay.low != null && price < previousDay.low && latest.close < previousDay.low) {
        structurePressureScore -= 25;
        drivers.push(`Price is holding below previous day low ${previousDay.low.toFixed(2)}.`);
      }

      if (previousDay.high != null && latest.high > previousDay.high && latest.close < previousDay.high) {
        structurePressureScore -= 20;
        risks.push(`Price swept previous day high ${previousDay.high.toFixed(2)} and rejected back below it.`);
      }
      if (previousDay.low != null && latest.low < previousDay.low && latest.close > previousDay.low) {
        structurePressureScore += 20;
        drivers.push(`Price swept previous day low ${previousDay.low.toFixed(2)} and reclaimed it.`);
      }

      if (price > sessionVwap) {
        structurePressureScore += 10;
        drivers.push(`Price is above session VWAP ${sessionVwap.toFixed(2)}.`);
      } else if (price < sessionVwap) {
        structurePressureScore -= 10;
        risks.push(`Price is below session VWAP ${sessionVwap.toFixed(2)}.`);
      }

      const asia = sessionLevels.find((level) => level.session === 'asia') ?? null;
      const london = sessionLevels.find((level) => level.session === 'london') ?? null;
      if (asia && price > asia.high && latest.close > asia.high) {
        structurePressureScore += 8;
        drivers.push(`Price accepted above Asia high ${asia.high.toFixed(2)}.`);
      } else if (asia && latest.high > asia.high && latest.close < asia.high) {
        structurePressureScore -= 8;
        risks.push(`Price failed above Asia high ${asia.high.toFixed(2)}.`);
      }

      if (london && price > london.high && latest.close > london.high) {
        structurePressureScore += 8;
        drivers.push(`Price accepted above London high ${london.high.toFixed(2)}.`);
      } else if (london && latest.high > london.high && latest.close < london.high) {
        structurePressureScore -= 8;
        risks.push(`Price failed above London high ${london.high.toFixed(2)}.`);
      }

      if (liquidityAbove && latest.high > liquidityAbove.top && latest.close < liquidityAbove.bottom) {
        structurePressureScore -= 12;
        risks.push(`High-side liquidity near ${liquidityAbove.top.toFixed(2)} rejected price.`);
      }
      if (liquidityBelow && latest.low < liquidityBelow.bottom && latest.close > liquidityBelow.top) {
        structurePressureScore += 12;
        drivers.push(`Low-side liquidity near ${liquidityBelow.bottom.toFixed(2)} was swept and reclaimed.`);
      }

      structurePressureScore = Number(clamp(structurePressureScore, -100, 100).toFixed(1));

      const aggregateVolumePressure = fxVolume.supported && fxVolume.volumeScore != null ? fxVolume.volumeScore : 0;
      const volumeCompositeScore = Number(clamp(
        (volumePressureScore * 0.82) + (aggregateVolumePressure * 0.18),
        -100,
        100,
      ).toFixed(1));
      const macroProxyScore = Number(clamp((macroProxy.macroProxyPressure ?? 0) * 2.2, -100, 100).toFixed(1));
      if (macroProxy.applicable && Math.abs(macroProxyScore) >= 12) {
        const macroLine = `${macroProxy.macroProxyBias} macro proxy from DXY ${macroProxy.dxyMovement != null ? `${macroProxy.dxyMovement >= 0 ? '+' : ''}${macroProxy.dxyMovement}%` : 'n/a'} and US10Y ${macroProxy.yieldMovement != null ? `${macroProxy.yieldMovement >= 0 ? '+' : ''}${macroProxy.yieldMovement}%` : 'n/a'}.`;
        if (macroProxyScore > 0) drivers.push(macroLine);
        if (macroProxyScore < 0) risks.push(macroLine);
      }

      const momentumDirection = Math.sign(priceMomentumPressure || (latest.close - latest.open));
      let volatilityAdjustment = 0;
      if (Math.abs(momentumDirection) > 0) {
        if (atrRatio > 1.05) {
          volatilityAdjustment = clamp((atrRatio - 1) * 25, 0, 25) * momentumDirection;
        } else if (atrRatio < 0.75) {
          volatilityAdjustment = -5 * momentumDirection;
        }
      }
      if (atrRatio > 1.8 && bodyEfficiency < 0.35) {
        volatilityAdjustment = volatilityAdjustment * 0.5;
        risks.push(`Volatility is spiking (${atrRatio.toFixed(2)}x ATR) while body efficiency is fading.`);
      }
      volatilityAdjustment = Number(clamp(volatilityAdjustment, -25, 25).toFixed(1));

      const score = Number(clamp(
        (0.30 * priceMomentumPressure)
        + (0.25 * volumeCompositeScore)
        + (0.20 * structurePressureScore)
        + (0.20 * macroProxyScore)
        + (0.05 * volatilityAdjustment),
        -100,
        100,
      ).toFixed(1));

      const positiveAgreement = [priceMomentumPressure, volumePressureScore, structurePressureScore, macroProxyScore].filter((value) => value > 10).length;
      const negativeAgreement = [priceMomentumPressure, volumePressureScore, structurePressureScore, macroProxyScore].filter((value) => value < -10).length;
      const alignmentBonus = Math.max(positiveAgreement, negativeAgreement) >= 3 ? 15 : 0;
      const volumeBonus = relativeVolume > 1.3 ? 10 : relativeVolume > 1.1 ? 5 : 0;
      const breakoutBonus = Math.abs(structurePressureScore) >= 25 ? 8 : 0;
      const macroConflict = (priceMomentumPressure > 15 && macroProxyScore < -15) || (priceMomentumPressure < -15 && macroProxyScore > 15);
      const conflictPenalty = macroConflict ? 15 : 0;
      const lowVolPenalty = atrRatio < 0.75 ? 10 : 0;
      const sourcePenalty = intradayFeed.source === 'oanda' ? 4 : /=X$/.test(symbol) ? 12 : 6;
      const sidecarBonus = fxVolume.supported && Math.sign(aggregateVolumePressure) === Math.sign(score) && Math.abs(aggregateVolumePressure) >= 8 ? 6 : 0;
      const confidence = clamp(
        Math.abs(score) * 1.2 + alignmentBonus + volumeBonus + breakoutBonus + sidecarBonus - conflictPenalty - lowVolPenalty - sourcePenalty,
        0,
        100,
      );

      if (Math.abs(priceMomentumPressure) >= 15) {
        const line = `Momentum ${priceMomentumPressure >= 0 ? 'supports buyers' : 'supports sellers'} with 5-bar ${((ret5) * 100).toFixed(2)}% and 10-bar ${((ret10) * 100).toFixed(2)}% returns.`;
        if (priceMomentumPressure > 0) drivers.push(line);
        else risks.push(line);
      }
      if (Math.abs(volumePressureScore) >= 15) {
        const line = `Relative tick volume is ${relativeVolume.toFixed(2)}x with ${bodyEfficiency.toFixed(2)} body efficiency and a ${latest.close > latest.open ? 'high-close' : latest.close < latest.open ? 'low-close' : 'neutral-close'} candle.`;
        if (volumePressureScore > 0) drivers.push(line);
        else risks.push(line);
      }
      if (Math.abs(aggregateVolumePressure) >= 10) {
        const line = `${fxVolume.sourceMode === 'synthetic-relay' ? 'Synthetic relay flow sidecar' : 'Broker-volume sidecar'} is ${fxVolume.dominance} at ${aggregateVolumePressure.toFixed(1)}.`;
        if (aggregateVolumePressure > 0) drivers.push(line);
        else risks.push(line);
      }
      if (liquidityAbove) {
        risks.push(`Nearest overhead liquidity sits near ${liquidityAbove.midpoint.toFixed(2)} with ${liquidityAbove.touches} retests.`);
      }
      if (liquidityBelow) {
        drivers.push(`Nearest downside liquidity shelf sits near ${liquidityBelow.midpoint.toFixed(2)} with ${liquidityBelow.touches} retests.`);
      }

      const mode = requestedMode === 'direct'
        ? 'unavailable'
        : intradayFeed.source === 'oanda'
          ? 'proxy'
          : /=X$/.test(symbol)
            ? 'estimated'
            : 'proxy';
      const secondSourceActive = fxVolume.sourceMode === 'multi-broker' || fxVolume.sourceMode === 'synthetic-relay';
      const dominance =
        score >= 50 ? 'strong buyers' :
          score >= 25 ? 'buyers dominant' :
            score <= -50 ? 'strong sellers' :
              score <= -25 ? 'sellers dominant' :
                'neutral / mixed';
      const structureState =
        structurePressureScore >= 18 ? 'operating above key structure and liquidity support' :
          structurePressureScore <= -18 ? 'operating below key structure and liquidity resistance' :
            'rotating inside the active structure';
      const pressureFormula = '0.30 momentum + 0.25 volume pressure + 0.20 structure + 0.20 macro proxy + 0.05 volatility adjustment';
      const sourceLabel = intradayFeed.source === 'oanda'
        ? `${secondSourceActive ? fxVolume.sourceMode === 'synthetic-relay' ? 'OANDA broker candles and the synthetic relay composite are reinforcing this pressure composite; stronger broker-independent context, but still not centralized tape.' : 'OANDA broker candles and the normalized OANDA + FXCM broker-volume composite are reinforcing this pressure composite; stronger OTC FX broker context, but still not centralized tape.' : 'OANDA broker candles are driving this pressure composite; useful broker-flow context, but still not centralized tape.'} The engine blends momentum, tick-volume behavior, structure, macro proxies, and volatility state.`
        : /=X$/.test(symbol)
          ? `Estimated FX pressure from candle structure, tick-volume behavior, structure position, DXY/US10Y/JPY proxies, and volatility state; ${fxVolume.sourceMode === 'synthetic-relay' ? 'the synthetic relay is supplementing the read as a second source.' : fxVolume.supported && fxVolume.latestVolume != null ? 'the normalized broker-volume sidecar is supplementing the read as a second source.' : 'no true centralized FX tape exists here.'}`
          : 'Proxy pressure from traded candles, tick-volume behavior, structure, macro proxies, and volatility state; not true aggressor tape.';

      return {
        market,
        symbol,
        timeframe,
        mode,
        sourceLabel,
        score,
        dominance,
        regime: dominance,
        confidence: Number(confidence.toFixed(0)),
        confidenceLabel: confidenceLabel(confidence),
        directSupported: false,
        proxySupported: true,
        pressureFormula,
        price: Number(price.toFixed(2)),
        priceChange: Number((((latest.close - latest.open) / latest.open) * 100).toFixed(2)),
        dailyTrend5d: Number((((dailyCandles[dailyCandles.length - 1]!.close - dailyCandles[Math.max(dailyCandles.length - 6, 0)]!.close) / dailyCandles[Math.max(dailyCandles.length - 6, 0)]!.close) * 100).toFixed(2)),
        rangeEfficiency: Number(((latest.close - latest.open) / currentRange).toFixed(2)),
        relativeVolume: Number(relativeVolume.toFixed(2)),
        secondSourceActive,
        intradayImpulse: Number(intradayImpulse.toFixed(2)),
        cumulativePressure: Number(cumulativePressure.toFixed(2)),
        sessionVwap: Number(sessionVwap.toFixed(2)),
        vwapDeviation: Number(vwapDeviation.toFixed(2)),
        rangeExpansion: Number(rangeExpansion.toFixed(2)),
        atr14: Number(atr14.toFixed(2)),
        atrRatio: Number(atrRatio.toFixed(2)),
        ema20: Number(ema20.toFixed(2)),
        ema50: Number(ema50.toFixed(2)),
        ret5: Number((ret5 * 100).toFixed(2)),
        ret10: Number((ret10 * 100).toFixed(2)),
        bodyEfficiency: Number(bodyEfficiency.toFixed(2)),
        closeLocation: Number((closeNearHigh * 100).toFixed(1)),
        priceMomentumPressure,
        tickVolumePressure,
        volumePressureScore: volumeCompositeScore,
        rawVolumePressureScore: volumePressureScore,
        structurePressureScore,
        aggregateVolumePressure: Number(aggregateVolumePressure.toFixed(1)),
        aggregateVolumeRelative: fxVolume.relativeVolume,
        aggregateVolumeDominance: fxVolume.dominance,
        aggregateVolumeLatest: fxVolume.latestVolume,
        aggregateVolumeRolling: fxVolume.rollingVolume,
        aggregateVolumeSources: fxVolume.sources,
        aggregateVolumeLastBarTime: fxVolume.lastBarTime,
        aggregateVolumeLabel: fxVolume.sourceLabel,
        macroProxyPressure: macroProxy.macroProxyPressure,
        macroProxyScore,
        macroProxyBias: macroProxy.macroProxyBias,
        macroProxyDetail: macroProxy.detail,
        marketRationale: macroProxy.marketRationale,
        dxyMovement: macroProxy.dxyMovement,
        yieldMovement: macroProxy.yieldMovement,
        jpyRiskMovement: macroProxy.jpyRiskMovement,
        dxyPressure: macroProxy.dxyPressure,
        yieldPressure: macroProxy.yieldPressure,
        jpyRiskPressure: macroProxy.jpyRiskPressure,
        volatilityAdjustment,
        structureState,
        previousDayHigh: previousDay.high,
        previousDayLow: previousDay.low,
        sessionLevels,
        liquidityAbove,
        liquidityBelow,
        liquiditySummary: `${liquidityAbove ? `Overhead liquidity ${liquidityAbove.midpoint.toFixed(2)}` : 'No overhead liquidity shelf'} / ${liquidityBelow ? `downside liquidity ${liquidityBelow.midpoint.toFixed(2)}` : 'no downside liquidity shelf'}.`,
        components: {
          momentum: priceMomentumPressure,
          volumePressure: volumeCompositeScore,
          structure: structurePressureScore,
          macro: macroProxyScore,
          volatility: volatilityAdjustment,
        },
        drivers: [...new Set(drivers)].slice(0, 6),
        risks: [...new Set(risks)].slice(0, 6),
      };
    } catch (error) {
      return {
        market,
        symbol,
        timeframe,
        mode: 'unavailable',
        sourceLabel: 'Buyer/seller pressure unavailable from current source mix',
        score: null,
        dominance: 'unknown',
        regime: 'unknown',
        confidence: 0,
        confidenceLabel: 'low',
        directSupported: false,
        proxySupported: false,
        pressureFormula: '0.30 momentum + 0.25 volume pressure + 0.20 structure + 0.20 macro proxy + 0.05 volatility adjustment',
        secondSourceActive: false,
        unavailable: true,
        error: error instanceof Error ? error.message : 'Unknown pressure error',
      };
    }
  }, 5);
}
