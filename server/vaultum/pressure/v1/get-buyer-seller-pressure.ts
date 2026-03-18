import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { CHROME_UA } from '../../../_shared/constants';

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

export async function getBuyerSellerPressure(input: { market: string; mode?: 'auto' | 'direct' | 'proxy' }): Promise<any> {
  const market = (input.market || 'XAUUSD').toUpperCase();
  const symbol = resolveSymbol(market);
  const requestedMode = input.mode || 'auto';

  return getCachedOrCompute(cacheKey('pressure', `${market}:${requestedMode}`), async () => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
      const response = await fetch(url, {
        headers: { 'User-Agent': CHROME_UA },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`Pressure upstream ${response.status}`);
      const payload = await response.json() as any;
      const result = payload?.chart?.result?.[0];
      const quote = result?.indicators?.quote?.[0];
      const highs: number[] = (quote?.high ?? []).filter((value: number | null) => value != null);
      const lows: number[] = (quote?.low ?? []).filter((value: number | null) => value != null);
      const opens: number[] = (quote?.open ?? []).filter((value: number | null) => value != null);
      const closes: number[] = (quote?.close ?? []).filter((value: number | null) => value != null);
      const volumes: number[] = (quote?.volume ?? []).filter((value: number | null) => value != null);
      if (!closes.length) throw new Error('No candles available');

      const price = closes[closes.length - 1];
      const open = opens[opens.length - 1] ?? price;
      const high = highs[highs.length - 1] ?? price;
      const low = lows[lows.length - 1] ?? price;
      const range = Math.max(high - low, 0.0001);
      const body = price - open;
      const efficiency = body / range;
      const avgVolume = volumes.length ? volumes.reduce((sum, value) => sum + value, 0) / volumes.length : 0;
      const relativeVolume = avgVolume > 0 ? (volumes[volumes.length - 1] ?? avgVolume) / avgVolume : 1;
      const score = Math.max(-100, Math.min(100, Math.round((efficiency * 60) + ((relativeVolume - 1) * 40))));
      const mode = requestedMode === 'direct' ? 'unavailable' : 'proxy';

      return {
        market,
        symbol,
        mode,
        sourceLabel: /=X$/.test(symbol)
          ? 'Proxy pressure from OTC FX candle structure and derived volume context'
          : 'Proxy pressure from traded candle/volume response; not true aggressor flow',
        score,
        dominance: score > 15 ? 'buyers dominant' : score < -15 ? 'sellers dominant' : 'balanced',
        directSupported: false,
        proxySupported: true,
        priceChange: Number((((price - open) / open) * 100).toFixed(2)),
        rangeEfficiency: Number(efficiency.toFixed(2)),
        relativeVolume: Number(relativeVolume.toFixed(2)),
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
  }, 300);
}
