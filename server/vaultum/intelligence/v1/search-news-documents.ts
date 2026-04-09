import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { fetchFinnhubGeneralNews, finnhubConfigured } from '../../_shared/finnhub';
import { searchYahooFinance } from '../../_shared/yahoo';
import { getXIntel } from './get-x-intel';

type NewsSearchResult = {
  title: string;
  type: 'news' | 'brief' | 'document';
  source: string | null;
  publishedAt: string | null;
  url: string | null;
  summary: string | null;
  relevanceScore: number;
};

function tokenize(query: string): string[] {
  return [...new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3),
  )];
}

function scoreMatch(text: string, tokens: string[]): number {
  if (!tokens.length) return 0;
  const haystack = text.toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function inferCategory(query: string): 'general' | 'forex' | 'crypto' {
  const lower = query.toLowerCase();
  if (/(forex|fx|eur|gbp|usd|jpy|yield|dxy|boj|ecb|fed|rates)/.test(lower)) return 'forex';
  if (/(btc|eth|crypto|sol|xrp|digital asset)/.test(lower)) return 'crypto';
  return 'general';
}

export async function searchNewsDocuments(input: {
  query: string;
  timespan?: string;
  maxRecords?: number;
  tone?: string;
}): Promise<{ results: NewsSearchResult[] }> {
  const query = String(input.query || '').trim();
  if (!query) return { results: [] };

  const limit = Math.max(1, Math.min(input.maxRecords ?? 5, 10));
  const key = cacheKey('intelligence', `news-search:${query.toLowerCase()}:${limit}:${String(input.timespan || 'auto').toLowerCase()}`);

  return getCachedOrCompute(key, async () => {
    const tokens = tokenize(query);
    const [yahoo, finnhub, xIntel] = await Promise.all([
      searchYahooFinance(query, { maxResults: 4, newsCount: Math.max(5, limit + 2) }).catch(() => ({ quotes: [], news: [] })),
      finnhubConfigured()
        ? fetchFinnhubGeneralNews(inferCategory(query)).catch(() => [])
        : Promise.resolve([]),
      getXIntel({ market: query, timeframe: '1h', limit: Math.max(6, limit + 2) }).catch(() => null),
    ]);

    const yahooResults: NewsSearchResult[] = (yahoo.news ?? []).map((item) => ({
      title: item.title,
      type: 'news',
      source: item.publisher,
      publishedAt: item.publishedAt,
      url: item.link,
      summary: null,
      relevanceScore: scoreMatch(`${item.title} ${item.publisher ?? ''}`, tokens) + 1,
    }));

    const finnhubResults: NewsSearchResult[] = finnhub.map((item) => ({
      title: item.title,
      type: (/(analysis|outlook|memo|brief)/i.test(item.title) ? 'brief' : 'news') as 'brief' | 'news',
      source: item.source,
      publishedAt: item.publishedAt,
      url: item.url,
      summary: item.summary,
      relevanceScore: scoreMatch(`${item.title} ${item.summary ?? ''} ${item.source ?? ''}`, tokens),
    }));

    const quoteResults: NewsSearchResult[] = (yahoo.quotes ?? [])
      .slice(0, 3)
      .map((item) => ({
        title: `${item.symbol} symbol context: ${item.name}`,
        type: 'document' as const,
        source: item.exchange,
        publishedAt: null,
        url: null,
        summary: `Yahoo symbol discovery matched ${item.symbol} (${item.quoteType ?? 'unknown'}) while searching for "${query}".`,
        relevanceScore: scoreMatch(`${item.symbol} ${item.name} ${item.exchange ?? ''}`, tokens),
      }))
      .filter((item) => item.relevanceScore > 0);

    const xResults: NewsSearchResult[] = (xIntel?.clusters?.length ? xIntel.clusters : xIntel?.posts ?? []).map((item: any) => ({
      title: item.headline ?? item.text,
      type: 'news',
      source: item.sourceHandles?.length ? `X ${item.sourceHandles.slice(0, 2).map((handle: string) => `@${handle}`).join(' / ')}` : (item.authorHandle ? `X @${item.authorHandle}` : 'X'),
      publishedAt: item.latestUpdateAt ?? item.createdAt,
      url: item.posts?.[0]?.url ?? item.url,
      summary: item.explanation?.whyItMatters ?? item.whyItMatters ?? item.cleanedSummary ?? null,
      relevanceScore: Math.max(scoreMatch(`${item.headline ?? item.text} ${item.cleanedSummary ?? ''}`, tokens), 0) + (item.overallImpactScore != null ? Math.min(Math.round(item.overallImpactScore / 20), 4) : (item.marketRelevance === 'direct' ? 2 : item.marketRelevance === 'context' ? 1 : 0)),
    }));

    const deduped = new Map<string, NewsSearchResult>();
    [...yahooResults, ...finnhubResults, ...quoteResults, ...xResults].forEach((item) => {
      const keyPart = item.title.trim().toLowerCase();
      const current = deduped.get(keyPart);
      if (!current || item.relevanceScore > current.relevanceScore) {
        deduped.set(keyPart, item);
      }
    });

    const results = [...deduped.values()]
      .filter((item) => item.relevanceScore > 0)
      .sort((left, right) => {
        if (right.relevanceScore !== left.relevanceScore) return right.relevanceScore - left.relevanceScore;
        return String(right.publishedAt || '').localeCompare(String(left.publishedAt || ''));
      })
      .slice(0, limit);

    return { results };
  }, 300);
}
