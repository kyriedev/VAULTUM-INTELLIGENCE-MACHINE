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

export async function getLevels(input: { market: string; timeframe?: string }): Promise<any> {
  const market = (input.market || 'XAUUSD').toUpperCase();
  const timeframe = input.timeframe || '1d';
  const symbol = resolveSymbol(market);

  return getCachedOrCompute(cacheKey('pivots', `${market}:${timeframe}`), async () => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
      const response = await fetch(url, {
        headers: { 'User-Agent': CHROME_UA },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`Pivot upstream ${response.status}`);
      const payload = await response.json() as any;
      const result = payload?.chart?.result?.[0];
      const quote = result?.indicators?.quote?.[0];
      const highs: number[] = (quote?.high ?? []).filter((value: number | null) => value != null);
      const lows: number[] = (quote?.low ?? []).filter((value: number | null) => value != null);
      const closes: number[] = (quote?.close ?? []).filter((value: number | null) => value != null);
      if (!highs.length || !lows.length || !closes.length) throw new Error('No OHLC available');

      const high = highs[highs.length - 2] ?? highs[highs.length - 1];
      const low = lows[lows.length - 2] ?? lows[lows.length - 1];
      const close = closes[closes.length - 2] ?? closes[closes.length - 1];
      const price = closes[closes.length - 1];
      const pivot = Number(((high + low + close) / 3).toFixed(2));
      const r1 = Number((2 * pivot - low).toFixed(2));
      const s1 = Number((2 * pivot - high).toFixed(2));
      const r2 = Number((pivot + (high - low)).toFixed(2));
      const s2 = Number((pivot - (high - low)).toFixed(2));

      return {
        market,
        symbol,
        timeframe,
        pivot,
        supports: [s1, s2],
        resistances: [r1, r2],
        price,
        pivotDistance: Number((price - pivot).toFixed(2)),
        structure: price > pivot ? 'above-pivot' : price < pivot ? 'below-pivot' : 'at-pivot',
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
        unavailable: true,
        error: error instanceof Error ? error.message : 'Unknown pivot error',
      };
    }
  }, 600);
}
