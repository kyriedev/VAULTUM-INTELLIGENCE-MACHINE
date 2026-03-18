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

function sourceMode(symbol: string): 'proxy' | 'estimated' {
  return /=X$/.test(symbol) ? 'estimated' : 'proxy';
}

export async function getProfile(input: { market: string; timeframe?: string }): Promise<any> {
  const market = (input.market || 'XAUUSD').toUpperCase();
  const timeframe = input.timeframe || '1d';
  const symbol = resolveSymbol(market);

  return getCachedOrCompute(cacheKey('volume', `${market}:${timeframe}`), async () => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d`;
      const response = await fetch(url, {
        headers: { 'User-Agent': CHROME_UA },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`Profile upstream ${response.status}`);
      const payload = await response.json() as any;
      const result = payload?.chart?.result?.[0];
      const quote = result?.indicators?.quote?.[0];
      const closes: number[] = (quote?.close ?? []).filter((value: number | null) => value != null);
      const volumes: number[] = (quote?.volume ?? []).filter((value: number | null) => value != null);
      if (!closes.length) throw new Error('No closes available');

      const bins = new Map<number, number>();
      closes.forEach((close, index) => {
        const bucket = Math.round(close / 5) * 5;
        const volume = volumes[index] ?? 1;
        bins.set(bucket, (bins.get(bucket) ?? 0) + volume);
      });

      const sorted = [...bins.entries()].sort((a, b) => b[1] - a[1]);
      const totalVolume = sorted.reduce((sum, [, volume]) => sum + volume, 0);
      const poc = sorted[0]?.[0] ?? closes[closes.length - 1];
      let cumulative = 0;
      const valueArea: number[] = [];
      for (const [price, volume] of sorted) {
        cumulative += volume;
        valueArea.push(price);
        if (cumulative / totalVolume >= 0.7) break;
      }
      const vah = Math.max(...valueArea);
      const val = Math.min(...valueArea);
      const lastPrice = closes[closes.length - 1];

      return {
        market,
        symbol,
        timeframe,
        mode: sourceMode(symbol),
        sourceLabel: /=X$/.test(symbol) ? 'OTC FX volume proxy via Yahoo candles' : 'Exchange-traded proxy volume via Yahoo candles',
        poc,
        valueAreaHigh: vah,
        valueAreaLow: val,
        highVolumeNodes: sorted.slice(0, 3).map(([price]) => price),
        lowVolumeNodes: sorted.slice(-3).map(([price]) => price),
        pocDistance: Number((lastPrice - poc).toFixed(2)),
        valueAreaPosition: lastPrice > vah ? 'above-value' : lastPrice < val ? 'below-value' : 'inside-value',
      };
    } catch (error) {
      return {
        market,
        symbol,
        timeframe,
        mode: 'estimated',
        sourceLabel: 'Volume profile unavailable; using estimated structure fallback',
        poc: null,
        valueAreaHigh: null,
        valueAreaLow: null,
        highVolumeNodes: [],
        lowVolumeNodes: [],
        pocDistance: null,
        valueAreaPosition: 'unknown',
        unavailable: true,
        error: error instanceof Error ? error.message : 'Unknown volume profile error',
      };
    }
  }, 600);
}
