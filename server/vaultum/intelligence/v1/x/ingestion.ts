import { fetchJson } from '../../../../_shared/fetch-json';
import { cleanText, detectEntities, duplicateKey, extractUrls, simpleHash } from './helpers';
import type { MockPostSeed, RawSocialPost, SourceProfile } from './types';

type XApiTweet = {
  id?: string;
  text?: string;
  author_id?: string;
  created_at?: string;
  lang?: string;
  public_metrics?: {
    retweet_count?: number;
    reply_count?: number;
    like_count?: number;
    quote_count?: number;
    impression_count?: number;
    bookmark_count?: number;
  };
  entities?: {
    urls?: Array<{ expanded_url?: string; url?: string }>;
  };
  referenced_tweets?: Array<{ type?: string; id?: string }>;
};

type XApiUser = {
  id?: string;
  name?: string;
  username?: string;
  verified?: boolean;
};

type XRecentSearchPayload = {
  data?: XApiTweet[];
  includes?: {
    users?: XApiUser[];
    tweets?: XApiTweet[];
  };
};

export async function fetchTrackedPosts(input: {
  token: string;
  profiles: SourceProfile[];
  limit: number;
  baseUrl: string;
}): Promise<RawSocialPost[]> {
  const query = input.profiles.slice(0, 12).map((profile) => `from:${profile.handle}`).join(' OR ');
  if (!query) return [];

  const url = new URL(`${input.baseUrl.replace(/\/$/, '')}/tweets/search/recent`);
  url.searchParams.set('query', `(${query}) -is:reply lang:en`);
  url.searchParams.set('max_results', String(Math.max(Math.min(input.limit, 50), 10)));
  url.searchParams.set('tweet.fields', 'created_at,lang,public_metrics,entities,referenced_tweets');
  url.searchParams.set('expansions', 'author_id,referenced_tweets.id');
  url.searchParams.set('user.fields', 'name,username,verified');

  const payload = await fetchJson<XRecentSearchPayload>(url.toString(), {
    timeoutMs: 12_000,
    headers: {
      Authorization: `Bearer ${input.token}`,
    },
  });
  if (!payload?.data?.length) return [];

  const userMap = new Map<string, XApiUser>(
    (payload.includes?.users ?? [])
      .filter((user): user is XApiUser & { id: string } => Boolean(user?.id))
      .map((user) => [user.id!, user]),
  );
  const refMap = new Map<string, XApiTweet>(
    (payload.includes?.tweets ?? [])
      .filter((tweet): tweet is XApiTweet & { id: string } => Boolean(tweet?.id))
      .map((tweet) => [tweet.id!, tweet]),
  );
  const profileMap = new Map(input.profiles.map((profile) => [profile.handle.toLowerCase(), profile]));

  const items: Array<RawSocialPost | null> = payload.data
    .map((tweet) => {
      const user = tweet.author_id ? userMap.get(tweet.author_id) : null;
      const handle = String(user?.username || '').trim().toLowerCase();
      const profile = profileMap.get(handle);
      const rawText = String(tweet.text || '').trim();
      if (!profile || !rawText) return null;

      const refs = tweet.referenced_tweets ?? [];
      const quoteRef = refs.find((item) => item.type === 'quoted')?.id ?? null;
      const repostRef = refs.find((item) => item.type === 'retweeted')?.id ?? null;
      const cleaned = cleanText(rawText);
      const urls = [
        ...extractUrls(rawText),
        ...((tweet.entities?.urls ?? []).map((item) => item.expanded_url || item.url || '').filter(Boolean)),
      ];

      return {
        id: String(tweet.id || `${handle}:${tweet.created_at || Date.now()}`),
        sourceHandle: handle,
        sourceDisplayName: String(user?.name || profile.displayName || handle),
        timestamp: String(tweet.created_at || new Date().toISOString()),
        rawText,
        cleanedText: cleaned,
        urls: [...new Set(urls)],
        quotedPost: quoteRef ? { id: quoteRef, text: refMap.get(quoteRef)?.text } : null,
        repostedPost: repostRef ? { id: repostRef, text: refMap.get(repostRef)?.text } : null,
        mediaFlags: [],
        hasMedia: false,
        language: tweet.lang ?? null,
        engagementMetrics: {
          likes: Number(tweet.public_metrics?.like_count ?? 0),
          reposts: Number(tweet.public_metrics?.retweet_count ?? 0),
          replies: Number(tweet.public_metrics?.reply_count ?? 0),
          quotes: Number(tweet.public_metrics?.quote_count ?? 0),
          impressions: Number(tweet.public_metrics?.impression_count ?? 0),
          bookmarks: Number(tweet.public_metrics?.bookmark_count ?? 0),
        },
        detectedEntities: detectEntities(rawText),
        profile,
        duplicateKey: duplicateKey(rawText),
        normalizedHash: simpleHash(cleaned),
        opinionOnly: /\bmy view\b|\bi think\b|\bopinion\b|\bthread\b|\bchart idea\b/i.test(rawText),
        rumorFlag: /\brumou?r\b|\bunconfirmed\b|\bhearing\b|\breportedly\b/i.test(rawText),
        contradictionFlag: /\bdeny\b|\bdenies\b|\bfalse\b|\bnot true\b|\brefute\b/i.test(rawText),
      } satisfies RawSocialPost;
    });

  return items.filter((item): item is RawSocialPost => Boolean(item));
}

export function normalizeMockPosts(input: {
  seeds: MockPostSeed[];
  profiles: SourceProfile[];
}): RawSocialPost[] {
  const profileMap = new Map(input.profiles.map((profile) => [profile.handle.toLowerCase(), profile]));
  const items: Array<RawSocialPost | null> = input.seeds
    .map((seed) => {
      const profile = profileMap.get(seed.handle.toLowerCase());
      if (!profile) return null;
      const cleaned = cleanText(seed.text);
      return {
        id: seed.id,
        sourceHandle: seed.handle.toLowerCase(),
        sourceDisplayName: seed.displayName,
        timestamp: seed.timestamp,
        rawText: seed.text,
        cleanedText: cleaned,
        urls: extractUrls(seed.text),
        quotedPost: null,
        repostedPost: null,
        mediaFlags: [],
        hasMedia: false,
        language: 'en',
        engagementMetrics: {
          likes: seed.likes ?? 0,
          reposts: seed.reposts ?? 0,
          replies: seed.replies ?? 0,
          quotes: seed.quotes ?? 0,
          impressions: 0,
          bookmarks: 0,
        },
        detectedEntities: detectEntities(seed.text),
        profile,
        duplicateKey: duplicateKey(seed.text),
        normalizedHash: simpleHash(cleaned),
        opinionOnly: /\bopinion\b|\bthread\b/i.test(seed.text),
        rumorFlag: /\brumou?r\b|\bunconfirmed\b|\bhearing\b/i.test(seed.text),
        contradictionFlag: /\bdeny\b|\bfalse\b|\brefute\b/i.test(seed.text),
      } satisfies RawSocialPost;
    });
  return items.filter((item): item is RawSocialPost => Boolean(item));
}
