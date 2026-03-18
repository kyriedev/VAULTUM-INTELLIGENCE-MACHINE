import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { CHROME_UA } from '../../../_shared/constants';

const GAMMA_BASE = 'https://gamma-api.polymarket.com';

export async function listPredictionMarkets(input: { category?: string; query?: string; mode?: 'markets' | 'events' }): Promise<{ markets: Array<{ title: string; probability: number; volume: number; url: string }>; unavailable?: boolean }> {
  const mode = input.mode ?? (input.category ? 'events' : 'markets');
  const key = cacheKey('prediction', `${mode}:${input.category ?? 'all'}:${input.query ?? ''}`);

  return getCachedOrCompute(key, async () => {
    try {
      const endpoint = mode === 'events' ? 'events' : 'markets';
      const params = new URLSearchParams({
        closed: 'false',
        active: 'true',
        archived: 'false',
        end_date_min: new Date().toISOString(),
        order: 'volume',
        ascending: 'false',
        limit: '20',
      });
      if (input.category) params.set('tag_slug', input.category);

      const resp = await fetch(`${GAMMA_BASE}/${endpoint}?${params}`, {
        headers: { Accept: 'application/json', 'User-Agent': CHROME_UA },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return { markets: [], unavailable: true };

      const data = await resp.json() as any[];
      const markets = (data ?? []).map((item: any) => {
        const title = item.question || item.title || item.markets?.[0]?.question || 'Unknown market';
        const slug = item.slug || item.markets?.[0]?.slug || '';
        const rawPrice = item.outcomePrices ? JSON.parse(item.outcomePrices)?.[0] : item.markets?.[0]?.outcomePrices ? JSON.parse(item.markets[0].outcomePrices)?.[0] : 0.5;
        const volume = Number(item.volume ?? item.volumeNum ?? item.markets?.[0]?.volumeNum ?? 0);
        return {
          title,
          probability: Number(rawPrice),
          volume,
          url: slug ? `https://polymarket.com/event/${slug}` : 'https://polymarket.com',
        };
      }).filter((item) => !input.query || item.title.toLowerCase().includes(input.query.toLowerCase()));

      return { markets };
    } catch {
      return { markets: [], unavailable: true };
    }
  }, 600);
}
