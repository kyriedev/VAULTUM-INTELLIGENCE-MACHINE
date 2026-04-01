import { fetchJson } from '../../../_shared/fetch-json';
import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { fetchYahooQuoteSnapshot } from '../../_shared/yahoo';

type CoinankResponse<T> = {
  success?: boolean;
  data?: T;
};

type OpenInterestPoint = {
  begin: number;
  open: number;
  close: number;
  low: number;
  high: number;
};

type LiquidationPoint = {
  all?: {
    longTurnover?: number;
    shortTurnover?: number;
    longAmount?: number;
    shortAmount?: number;
  };
  ts: number;
};

type NetPositionsPoint = {
  begin: number;
  netLongsClose: number;
  netShortsClose: number;
  netLongsHigh: number;
  netShortsHigh: number;
  netLongsLow: number;
  netShortsLow: number;
};

function resolveCryptoBase(market: string): string | null {
  const normalized = String(market || '').toUpperCase().replaceAll('-', '').replaceAll('_', '');
  const supported = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'ADA', 'AVAX', 'LINK', 'LTC'];
  for (const base of supported) {
    if (normalized === base || normalized === `${base}USD` || normalized === `${base}USDT`) return base;
  }
  return null;
}

function pctChange(current: number, prior: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) return 0;
  return ((current - prior) / prior) * 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function flowLabel(oiChangePct: number, priceChangePct: number): string {
  if (oiChangePct >= 2 && priceChangePct >= 1) return 'fresh bullish build';
  if (oiChangePct >= 2 && priceChangePct <= -1) return 'fresh bearish build';
  if (oiChangePct <= -2 && priceChangePct >= 1) return 'short covering';
  if (oiChangePct <= -2 && priceChangePct <= -1) return 'long liquidation';
  return 'mixed derivatives flow';
}

function liquidationBias(longTurnover: number, shortTurnover: number): 'bullish' | 'bearish' | 'neutral' {
  if (shortTurnover > longTurnover * 1.2) return 'bullish';
  if (longTurnover > shortTurnover * 1.2) return 'bearish';
  return 'neutral';
}

export async function getCryptoDerivativesContext(input: { market: string }): Promise<{
  market: string;
  baseCoin: string | null;
  sourceLabel: string;
  unavailable?: boolean;
  unsupported?: boolean;
  oiChangePct: number | null;
  oiTrend: 'rising' | 'falling' | 'flat' | 'unknown';
  priceChangePct: number | null;
  flowLabel: string;
  netBias: 'bullish' | 'bearish' | 'neutral';
  crowding: string;
  longLiquidationSharePct: number | null;
  shortLiquidationSharePct: number | null;
  liquidationBias: 'bullish' | 'bearish' | 'neutral';
  summary: string;
}> {
  const market = String(input.market || 'BTCUSD').toUpperCase();
  const baseCoin = resolveCryptoBase(market);

  if (!baseCoin) {
    return {
      market,
      baseCoin: null,
      unsupported: true,
      unavailable: true,
      sourceLabel: 'CoinAnk derivatives context only applies to supported crypto markets.',
      oiChangePct: null,
      oiTrend: 'unknown',
      priceChangePct: null,
      flowLabel: 'not applicable',
      netBias: 'neutral',
      crowding: 'not applicable',
      longLiquidationSharePct: null,
      shortLiquidationSharePct: null,
      liquidationBias: 'neutral',
      summary: 'Crypto derivatives context is not applicable to this market.',
    };
  }

  return getCachedOrCompute(cacheKey('positioning', `crypto-derivatives:${baseCoin}`), async () => {
    const endTime = Date.now();
    const symbol = `${baseCoin}USDT`;
    const baseUrl = 'https://api.coinank.com';
    const [oiPayload, liquidationPayload, netPositionsPayload, quoteSnapshot] = await Promise.all([
      fetchJson<CoinankResponse<OpenInterestPoint[]>>(
        `${baseUrl}/api/openInterest/aggKline?baseCoin=${encodeURIComponent(baseCoin)}&interval=1h&endTime=${endTime}&size=24`,
        { timeoutMs: 10_000 },
      ),
      fetchJson<CoinankResponse<LiquidationPoint[]>>(
        `${baseUrl}/api/liquidation/aggregated-history?baseCoin=${encodeURIComponent(baseCoin)}&interval=1h&endTime=${endTime}&size=24`,
        { timeoutMs: 10_000 },
      ),
      fetchJson<CoinankResponse<NetPositionsPoint[]>>(
        `${baseUrl}/api/netPositions/getNetPositions?exchange=Binance&symbol=${encodeURIComponent(symbol)}&interval=1h&endTime=${endTime}&size=12`,
        { timeoutMs: 10_000 },
      ),
      fetchYahooQuoteSnapshot(`${baseCoin}-USD`),
    ]);

    const oiSeries = Array.isArray(oiPayload?.data) ? oiPayload.data : [];
    const liquidationSeries = Array.isArray(liquidationPayload?.data) ? liquidationPayload.data : [];
    const netSeries = Array.isArray(netPositionsPayload?.data) ? netPositionsPayload.data : [];

    if (!oiSeries.length && !liquidationSeries.length && !netSeries.length) {
      return {
        market,
        baseCoin,
        unavailable: true,
        sourceLabel: 'CoinAnk public derivatives context is currently unavailable.',
        oiChangePct: null,
        oiTrend: 'unknown' as const,
        priceChangePct: null,
        flowLabel: 'unavailable',
        netBias: 'neutral' as const,
        crowding: 'unknown',
        longLiquidationSharePct: null,
        shortLiquidationSharePct: null,
        liquidationBias: 'neutral' as const,
        summary: 'CoinAnk derivatives context is unavailable for this crypto market right now.',
      };
    }

    const latestOi = oiSeries[oiSeries.length - 1];
    const priorOi = oiSeries[Math.max(0, oiSeries.length - 7)];
    const oiChangePct = latestOi && priorOi ? pctChange(latestOi.close, priorOi.close) : 0;
    const priceChangePct = quoteSnapshot?.change ?? 0;
    const oiTrend = oiChangePct > 1 ? 'rising' : oiChangePct < -1 ? 'falling' : 'flat';

    const liquidationWindow = liquidationSeries.slice(-6);
    const longTurnover = liquidationWindow.reduce((sum, point) => sum + Number(point.all?.longTurnover ?? 0), 0);
    const shortTurnover = liquidationWindow.reduce((sum, point) => sum + Number(point.all?.shortTurnover ?? 0), 0);
    const totalTurnover = longTurnover + shortTurnover;
    const longLiquidationSharePct = totalTurnover > 0 ? (longTurnover / totalTurnover) * 100 : null;
    const shortLiquidationSharePct = totalTurnover > 0 ? (shortTurnover / totalTurnover) * 100 : null;
    const liquidationSide = liquidationBias(longTurnover, shortTurnover);

    const latestNet = netSeries[netSeries.length - 1];
    const netLong = Number(latestNet?.netLongsClose ?? 0);
    const netShort = Number(latestNet?.netShortsClose ?? 0);
    const netBias: 'bullish' | 'bearish' | 'neutral' =
      netLong > netShort * 1.12 ? 'bullish'
        : netShort > netLong * 1.12 ? 'bearish'
          : 'neutral';

    const crowding =
      netBias === 'bullish' && oiChangePct >= 3 ? 'bulls are getting crowded'
        : netBias === 'bearish' && oiChangePct >= 3 ? 'bears are getting crowded'
          : oiChangePct <= -2 ? 'crowding is clearing out'
            : 'crowding is balanced';

    const summary = `${baseCoin} derivatives read ${flowLabel(oiChangePct, priceChangePct)} with OI ${oiTrend} ${oiChangePct >= 0 ? '+' : ''}${oiChangePct.toFixed(1)}%, net ${netBias}, ${crowding}, and liquidation bias ${liquidationSide}.`;

    return {
      market,
      baseCoin,
      sourceLabel: 'CoinAnk public derivatives context blends aggregated open interest, Binance net positions, liquidation history, and live spot move context for supported crypto markets.',
      oiChangePct: Number(oiChangePct.toFixed(2)),
      oiTrend: oiTrend as 'rising' | 'falling' | 'flat',
      priceChangePct: Number(priceChangePct.toFixed(2)),
      flowLabel: flowLabel(oiChangePct, priceChangePct),
      netBias,
      crowding,
      longLiquidationSharePct: longLiquidationSharePct != null ? Number(clamp(longLiquidationSharePct, 0, 100).toFixed(1)) : null,
      shortLiquidationSharePct: shortLiquidationSharePct != null ? Number(clamp(shortLiquidationSharePct, 0, 100).toFixed(1)) : null,
      liquidationBias: liquidationSide,
      summary,
    };
  }, 180);
}
