declare const process: { env: Record<string, string | undefined> };

import { cacheKey } from '../../../_shared/cache-keys.ts';
import { getCachedOrCompute } from '../../../_shared/redis.ts';
import { CHROME_UA } from '../../../_shared/constants.ts';

export async function getFredSeries(input: { seriesId: string; limit?: number }): Promise<{ observations: Array<{ date: string; value: number | null }>; source: string }> {
  const seriesId = input.seriesId;
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
  const apiKey = process.env.FRED_API_KEY;

  return getCachedOrCompute(cacheKey('macro', `fred:${seriesId}:${limit}`), async () => {
    if (!apiKey) return { observations: [], source: 'FRED_API_KEY missing' };

    const url = new URL('https://api.stlouisfed.org/fred/series/observations');
    url.searchParams.set('series_id', seriesId);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('file_type', 'json');
    url.searchParams.set('sort_order', 'desc');
    url.searchParams.set('limit', String(limit));

    try {
      const resp = await fetch(url.toString(), {
        headers: { Accept: 'application/json', 'User-Agent': CHROME_UA },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) return { observations: [], source: `FRED HTTP ${resp.status}` };
      const data = await resp.json() as any;
      const observations = (data?.observations ?? []).map((item: any) => ({
        date: item.date,
        value: item.value === '.' ? null : Number(item.value),
      }));
      return { observations, source: 'FRED' };
    } catch {
      return { observations: [], source: 'FRED unavailable' };
    }
  }, 1800);
}
