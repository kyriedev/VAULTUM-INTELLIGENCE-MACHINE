declare const process: { env: Record<string, string | undefined> };

import { cacheKey } from '../../../_shared/cache-keys';
import { buildFeedSnapshotMeta } from '../../_shared/feed-health';
import { getCachedOrCompute } from '../../../_shared/redis';
import { parseAccounts, env, normalizeMarket } from './x/helpers';
import { resolveSourceProfiles } from './x/watched-sources';
import { fetchTrackedPosts, normalizeMockPosts } from './x/ingestion';
import { X_EVENT_MOCK_POSTS } from './x/mock-data';
import { buildXEventClusters } from './x/pipeline';
import type { MarketReactionValidation, SourceProfile, XAccountConfig, XIntelResponse } from './x/types';

function buildSourceLabel(state: XIntelResponse['state'], accounts: XAccountConfig[]): string {
  if (!accounts.length) return 'X/Twitter intelligence engine is available, but no tracked accounts are configured yet.';
  if (state === 'configured-no-token') return 'X/Twitter intelligence engine is account-configured but inactive because no official bearer token is set.';
  if (state === 'error') return 'X/Twitter intelligence engine is configured but the latest fetch failed, so Vaultum is falling back to the structured calendar/news stack.';
  if (state === 'active') return 'X/Twitter intelligence is now an event-intelligence layer: tracked posts are parsed, clustered, scored, validated against live markets, and translated into trading guidance rather than shown as a raw feed.';
  return 'X/Twitter intelligence is inactive.';
}

function resolvePollingMs(): number {
  const parsed = Number(env('X_INTEL_POLLING_MS') || 60_000);
  if (!Number.isFinite(parsed)) return 60_000;
  return Math.max(15_000, Math.min(Math.round(parsed), 300_000));
}

function buildMonitor(nowIso: string, active: boolean, watchCount: number) {
  const pollingMs = resolvePollingMs();
  return {
    activelyMonitoring: active,
    pollingMs,
    watchCount,
    lastUpdatedAt: nowIso,
    nextPollDueAt: new Date(new Date(nowIso).getTime() + pollingMs).toISOString(),
  };
}

function buildSnapshotMeta(input: {
  generatedAt: string;
  state: XIntelResponse['state'];
  detail: string;
  activelyMonitoring: boolean;
}): ReturnType<typeof buildFeedSnapshotMeta> {
  const staleAfterMinutes = Math.max(Math.round((resolvePollingMs() * 3) / 60_000), 15);
  return buildFeedSnapshotMeta({
    label: 'X Event Intelligence',
    generatedAt: input.generatedAt,
    lastUpdatedAt: input.generatedAt,
    staleAfterMinutes,
    sourceMode: input.state === 'active' ? 'headline' : input.state === 'error' ? 'headline' : 'inactive',
    available: input.state === 'active' || input.state === 'error',
    activeMonitoring: input.activelyMonitoring,
    fallbackState: input.state === 'active' ? 'primary' : input.state === 'error' ? 'fallback' : 'inactive',
    detail: input.detail,
    extraHaircut: input.state === 'error' ? 0.08 : input.state === 'configured-no-token' ? 0.06 : 0,
  });
}

function mockProfiles(): SourceProfile[] {
  return resolveSourceProfiles(
    X_EVENT_MOCK_POSTS.map((seed) => ({
      handle: seed.handle,
      weight: 5,
      category: seed.category,
    })),
  );
}

function mockValidationMap(): Record<string, MarketReactionValidation | undefined> {
  return Object.fromEntries(X_EVENT_MOCK_POSTS.map((seed) => [seed.id, seed.mockReaction]));
}

export async function getXIntel(input: {
  market?: string;
  timeframe?: string;
  handles?: string[];
  limit?: number;
} = {}): Promise<XIntelResponse> {
  const market = normalizeMarket(input.market);
  const timeframe = String(input.timeframe || '1h').toLowerCase();
  const accounts = parseAccounts(input.handles);
  const token = env('X_API_BEARER_TOKEN');
  const baseUrl = env('X_API_BASE_URL') || 'https://api.twitter.com/2';
  const limitSource = input.limit ?? env('X_INTEL_POST_LIMIT') ?? 18;
  const limit = Math.max(Math.min(Number(limitSource), 40), 6);
  const cacheSuffix = `${market}:${timeframe}:${accounts.map((item) => `${item.handle}:${item.weight}:${item.category}`).join('|')}:${limit}`;

  return getCachedOrCompute(cacheKey('intelligence', `x-intel:${cacheSuffix}`), async () => {
    const generatedAt = new Date().toISOString();
    const state: XIntelResponse['state'] = !accounts.length
      ? (env('X_INTEL_ACCOUNTS') ? 'configured-no-accounts' : 'inactive')
      : !token
        ? 'configured-no-token'
        : 'active';

    const sourceProfiles = resolveSourceProfiles(accounts);
    const sampleProfiles = mockProfiles();
    const samplePosts = normalizeMockPosts({ seeds: X_EVENT_MOCK_POSTS, profiles: sampleProfiles });
    const sampleIntel = await buildXEventClusters({
      market,
      rawPosts: samplePosts,
      validationOverrides: mockValidationMap(),
    });

    if (!accounts.length || !token) {
      const summary = !accounts.length
        ? `X/Twitter event engine is idle for ${market} because no tracked accounts are configured yet.`
        : `X/Twitter event engine is ready for ${market}, but it needs X_API_BEARER_TOKEN before active monitoring can begin.`;

      return {
        generatedAt,
        market,
        timeframe,
        state,
        summary,
        accounts,
        sourceProfiles,
        posts: [],
        clusters: [],
        sampleClusters: sampleIntel.clusters,
        sentiment: {
          label: 'neutral',
          score: 0,
          summary: 'No live X/Twitter sentiment could be formed from tracked accounts.',
        },
        snapshotMeta: buildSnapshotMeta({
          generatedAt,
          state,
          detail: summary,
          activelyMonitoring: false,
        }),
        sourceLabel: buildSourceLabel(state, accounts),
        blindspots: [
          'X/Twitter is a fast headline layer and can carry rumor, sarcasm, or incomplete context.',
          !accounts.length
            ? 'Tracked finance/news accounts still need to be configured.'
            : 'An official X bearer token is required before the tracked-account layer can go live.',
        ],
        monitor: buildMonitor(generatedAt, false, 0),
      } satisfies XIntelResponse;
    }

    const rawPosts = await fetchTrackedPosts({
      token,
      profiles: sourceProfiles,
      limit,
      baseUrl,
    }).catch(() => []);

    if (!rawPosts.length) {
      return {
        generatedAt,
        market,
        timeframe,
        state: 'error',
        summary: `Tracked X/Twitter accounts for ${market} are configured, but the latest pull did not return usable posts.`,
        accounts,
        sourceProfiles,
        posts: [],
        clusters: [],
        sampleClusters: sampleIntel.clusters,
        sentiment: {
          label: 'neutral',
          score: 0,
          summary: 'No usable X/Twitter event flow was returned on the latest request.',
        },
        snapshotMeta: buildSnapshotMeta({
          generatedAt,
          state: 'error',
          detail: 'Latest tracked-account pull failed or returned no usable posts, so Vaultum is falling back to the structured news/calendar layer.',
          activelyMonitoring: false,
        }),
        sourceLabel: buildSourceLabel('error', accounts),
        blindspots: [
          'Recent-search access can fail because of token scope, endpoint limits, or upstream availability.',
          'Vaultum keeps the structured calendar/news stack live even when X/Twitter is temporarily unavailable.',
        ],
        monitor: buildMonitor(generatedAt, false, 0),
      } satisfies XIntelResponse;
    }

    const eventIntel = await buildXEventClusters({ market, rawPosts });
    const leadCluster = eventIntel.clusters[0];

    return {
      generatedAt,
      market,
      timeframe,
      state: 'active',
      summary: leadCluster
        ? `Active X/Twitter monitoring found ${eventIntel.clusters.length} event cluster${eventIntel.clusters.length === 1 ? '' : 's'} for ${market}. Lead event is ${leadCluster.eventType.replaceAll('_', ' ')} with ${leadCluster.actionability.state} status, credibility ${leadCluster.eventCredibilityScore}, and validation ${leadCluster.validation.reactionValidation}.`
        : `Tracked X/Twitter monitoring for ${market} is active, but no scored event clusters matter yet.`,
      accounts,
      sourceProfiles,
      posts: eventIntel.posts,
      clusters: eventIntel.clusters,
      sampleClusters: sampleIntel.clusters,
      sentiment: eventIntel.sentiment,
      snapshotMeta: buildSnapshotMeta({
        generatedAt,
        state: 'active',
        detail: leadCluster
          ? `${leadCluster.eventType} / ${leadCluster.actionability.state} / ${leadCluster.validation.reactionValidation}`
          : 'Tracked-account layer is live but waiting for a scored cluster.',
        activelyMonitoring: true,
      }),
      sourceLabel: buildSourceLabel('active', accounts),
      blindspots: [
        'X/Twitter is fastest on policy and headline risk, but speed does not equal confirmation.',
        'Do not translate a post directly into buy/sell logic; always route through actionability and market validation.',
        'Missing posts do not mean the market is safe; they only mean the tracked-account layer did not surface a strong signal.',
      ],
      monitor: buildMonitor(generatedAt, true, eventIntel.clusters.length),
    } satisfies XIntelResponse;
  }, 45);
}

export async function getXIntelMock(input: {
  market?: string;
  timeframe?: string;
} = {}): Promise<XIntelResponse> {
  const market = normalizeMarket(input.market);
  const timeframe = String(input.timeframe || '1h').toLowerCase();
  const profiles = mockProfiles();
  const rawPosts = normalizeMockPosts({ seeds: X_EVENT_MOCK_POSTS, profiles });
  const intel = await buildXEventClusters({
    market,
    rawPosts,
    validationOverrides: mockValidationMap(),
  });
  const generatedAt = new Date().toISOString();
  return {
    generatedAt,
    market,
    timeframe,
    state: 'active',
    summary: 'Mock X/Twitter event feed returning sample enriched clusters for ceasefire, tariff threat, oil supply risk, and rumor scenarios.',
    accounts: profiles.map((profile) => ({ handle: profile.handle, weight: 5, category: profile.category })),
    sourceProfiles: profiles,
    posts: intel.posts,
    clusters: intel.clusters,
    sampleClusters: intel.clusters,
    sentiment: intel.sentiment,
    snapshotMeta: buildSnapshotMeta({
      generatedAt,
      state: 'active',
      detail: 'Mock tracked-account event feed is running for UI and workflow validation.',
      activelyMonitoring: true,
    }),
    sourceLabel: 'Mock X/Twitter event feed for UI/testing. Uses the same scoring and clustering pipeline with demo posts.',
    blindspots: ['Mock feed is for testing and panel demos only.'],
    monitor: buildMonitor(generatedAt, true, intel.clusters.length),
  };
}
