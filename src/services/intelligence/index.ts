import { invokeVaultumRpc } from '@/services/rpc';
import type { PanelSnapshot } from '@/types';

export type NewsIntelResponse = {
  generatedAt: string;
  market: string;
  timeframe: string;
  summary: string;
  sentiment?: { label?: string; score?: number; summary?: string; xNewsScore?: number | null } | null;
  patternModel?: { bias?: string; confidence?: string; summary?: string } | null;
  smartAnalysis?: { summary?: string; notes?: string[] } | null;
  predictionChecklist?: Array<{ label: string; status: string; detail: string }> | null;
  catalysts?: Array<{ title: string; bias: string; impact: string; source?: string | null }> | null;
  xIntel?: {
    state?: string;
    summary?: string;
    monitor?: {
      activelyMonitoring?: boolean;
      pollingMs?: number;
      watchCount?: number;
      lastUpdatedAt?: string;
      nextPollDueAt?: string;
    } | null;
    sentiment?: { label?: string; score?: number; summary?: string } | null;
    accounts?: Array<{ handle: string; weight?: number; category?: string }> | null;
    sourceProfiles?: Array<{
      handle: string;
      displayName?: string;
      category?: string;
      sourceTier?: string;
      baseCredibilityScore?: number;
    }> | null;
    posts?: Array<{
      text: string;
      authorHandle: string;
      authorName?: string;
      eventType?: string;
      credibility?: number;
      impact: string;
      marketRelevance: string;
      category?: string;
      url?: string | null;
      whyItMatters?: string | null;
      createdAt?: string | null;
      cleanedText?: string;
    }> | null;
    clusters?: Array<{
      id: string;
      headline: string;
      cleanedSummary?: string;
      eventType: string;
      status?: string;
      tone?: string;
      intensity?: string;
      surpriseLevel?: string;
      latestUpdateAt?: string | null;
      sourceCredibilityScore?: number;
      eventCredibilityScore?: number;
      overallImpactScore?: number;
      tradabilityScore?: number;
      macroRelevanceScore?: number;
      confidenceScore?: number;
      sourceHandles?: string[];
      validation?: {
        reactionValidation?: string;
        crossAssetAlignmentScore?: number;
        explanation?: string;
        observedMoves?: Array<{
          asset: string;
          expectedDirection: string;
          oneMinuteMovePct?: number | null;
          fiveMinuteMovePct?: number | null;
          fifteenMinuteMovePct?: number | null;
          sixtyMinuteMovePct?: number | null;
        }>;
      } | null;
      actionability?: {
        state?: string;
        reason?: string;
      } | null;
      impactAssessment?: {
        impactedAssets?: Array<{
          asset: string;
          directionBias: string;
          impactMagnitude: number;
          horizon: string;
          reason: string;
          role: string;
        }>;
      } | null;
      explanation?: {
        whyItMatters?: string;
        transmissionPath?: string;
        missingConfirmation?: string;
        whyActionable?: string;
      } | null;
      decay?: {
        impactHalfLifeMinutes?: number;
        persistenceClass?: string;
        staleAfter?: string;
      } | null;
      tradingGuidance?: {
        regimeEffect?: string;
        setupAdjustments?: string[];
        riskFlags?: string[];
      } | null;
      posts?: Array<{
        authorHandle?: string;
        url?: string | null;
        text?: string;
      }>;
    }> | null;
    sampleClusters?: Array<{
      id: string;
      headline: string;
      eventType: string;
      actionability?: { state?: string } | null;
      validation?: { reactionValidation?: string } | null;
    }> | null;
    blindspots?: string[] | null;
  } | null;
  releasedEventPatterns?: Array<{ currency: string; pattern: string; bias: string; event: string }> | null;
  nextEvent?: { currency?: string; event?: string; minutesUntil?: number | null } | null;
  blindspots?: string[] | null;
  sourceLabel?: string;
};

export async function fetchNewsIntel(market: string, timeframe: string): Promise<NewsIntelResponse | null> {
  return invokeVaultumRpc<NewsIntelResponse>('intelligence', 'get-news-intel', {
    market,
    timeframe,
  });
}

function metricToneForBias(label: string | null | undefined): 'neutral' | 'bullish' | 'bearish' | 'alert' {
  const lower = String(label || '').toLowerCase();
  if (/(bull|pass|positive)/.test(lower)) return 'bullish';
  if (/(bear|fail|negative)/.test(lower)) return 'bearish';
  if (/(watch|mixed|risk)/.test(lower)) return 'alert';
  return 'neutral';
}

export function buildIntelligencePanels(input: {
  riskScores?: { scores?: Record<string, number> } | null;
  proxyTension?: { conclusion?: string; regions?: Array<{ region: string; status: string }> } | null;
  countryBrief?: { brief?: string } | null;
  newsIntel?: NewsIntelResponse | null;
  searchResults?: { results?: Array<{ title: string; type: string }> } | null;
}): Record<string, PanelSnapshot> {
  const scores = input.riskScores?.scores ?? {};
  const topRisk = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const checklist = input.newsIntel?.predictionChecklist ?? [];
  const checklistWarnings = checklist.filter((item) => item.status !== 'pass');
  const catalysts = input.newsIntel?.catalysts ?? [];
  const xPosts = input.newsIntel?.xIntel?.posts ?? [];
  const xClusters = input.newsIntel?.xIntel?.clusters ?? [];
  const releasedPatterns = input.newsIntel?.releasedEventPatterns ?? [];
  const newsStatus: PanelSnapshot['status'] =
    !input.newsIntel?.summary && !(input.searchResults?.results ?? []).length && !input.countryBrief?.brief
      ? 'stale'
      : checklist.some((item) => item.status === 'fail')
        ? 'mixed'
        : input.newsIntel?.patternModel?.confidence === 'high'
          ? 'confirmed'
          : 'inferred';

  return {
    'geopolitical-risk': {
      conclusion: input.proxyTension?.conclusion ?? 'Geopolitical market-impact context unavailable.',
      metrics: [
        { label: 'Top Risk', value: topRisk ? `${topRisk[0]} ${topRisk[1]}` : 'unavailable', tone: topRisk && topRisk[1] >= 70 ? 'alert' : 'neutral' },
        { label: 'Regions', value: String((input.proxyTension?.regions ?? []).length || 0), tone: 'neutral' },
        { label: 'Gold Support', value: input.proxyTension?.conclusion?.toLowerCase().includes('gold') ? 'active' : 'mixed', tone: input.proxyTension?.conclusion?.toLowerCase().includes('gold') ? 'bullish' : 'neutral' },
      ],
      bullets: [
        `Top risk bucket: ${topRisk ? `${topRisk[0]} ${topRisk[1]}` : 'unavailable'}.`,
        `Regional stress: ${(input.proxyTension?.regions ?? []).map((item) => `${item.region} ${item.status}`).join(' | ') || 'unavailable'}.`,
        'Market impact should be judged through oil, gold, shipping, sanctions, and carry channels.',
      ],
      table: {
        columns: ['Region', 'Status'],
        rows: (input.proxyTension?.regions ?? []).slice(0, 5).map((item) => [item.region, item.status]),
      },
      alerts: (input.proxyTension?.regions ?? []).some((item) => /elevated|high|critical/i.test(item.status))
        ? ['Escalation-sensitive regions are active enough to matter for oil, gold, and FX carry pricing.']
        : [],
      status: 'mixed',
    },
    'news-intel': {
      conclusion: input.newsIntel?.summary ?? input.countryBrief?.brief ?? 'Country brief unavailable; fallback to classified news/search context.',
      metrics: [
        {
          label: 'Sentiment',
          value: input.newsIntel?.sentiment
            ? `${input.newsIntel.sentiment.label ?? 'neutral'} ${input.newsIntel.sentiment.score ?? 'n/a'}`
            : `${(input.searchResults?.results ?? []).length || 0} docs`,
          tone: metricToneForBias(input.newsIntel?.sentiment?.label),
        },
        {
          label: 'Pattern',
          value: input.newsIntel?.patternModel
            ? `${input.newsIntel.patternModel.bias ?? 'neutral'} ${input.newsIntel.patternModel.confidence ?? 'low'}`
            : (input.countryBrief?.brief ? 'fallback brief' : 'degraded'),
          tone: metricToneForBias(input.newsIntel?.patternModel?.bias ?? input.newsIntel?.patternModel?.confidence),
        },
        {
          label: 'Catalysts',
          value: String(catalysts.length || (input.searchResults?.results ?? []).length || 0),
          tone: catalysts.length >= 3 ? 'bullish' : 'neutral',
        },
        {
          label: 'X Feed',
          value: input.newsIntel?.xIntel?.state === 'active'
            ? `${xClusters.length || xPosts.length} live`
            : (input.newsIntel?.xIntel?.state ?? 'inactive'),
          tone: input.newsIntel?.xIntel?.state === 'active'
            ? (xClusters.some((item) => item.actionability?.state === 'TRADEABLE_CATALYST') ? 'bullish' : 'alert')
            : 'neutral',
        },
        {
          label: 'Next Event',
          value: input.newsIntel?.nextEvent?.event
            ? `${input.newsIntel.nextEvent.currency ?? ''} ${input.newsIntel.nextEvent.event}`.trim()
            : 'none scheduled',
          tone: input.newsIntel?.nextEvent?.minutesUntil != null && input.newsIntel.nextEvent.minutesUntil <= 45 ? 'alert' : 'neutral',
        },
      ],
      bullets: [
        input.newsIntel?.smartAnalysis?.summary ?? null,
        input.newsIntel?.patternModel?.summary ?? null,
        input.newsIntel?.xIntel?.summary ?? null,
        ...xClusters.slice(0, 2).map((item) => `X ${item.eventType} ${item.actionability?.state ?? 'MONITOR'} / ${item.validation?.reactionValidation ?? 'unvalidated'}: ${item.headline}`),
        ...catalysts.slice(0, 2).map((item) => `${item.bias} ${item.impact}: ${item.title}`),
        ...xPosts.slice(0, 1).map((item) => `X ${item.marketRelevance} ${item.impact}: @${item.authorHandle} ${item.text}`),
        ...releasedPatterns.slice(0, 1).map((item) => `${item.currency} ${item.event}: ${item.pattern} (${item.bias})`),
        ...checklistWarnings.slice(0, 2).map((item) => `${item.label}: ${item.detail}`),
        ...(catalysts.length ? [] : (input.searchResults?.results ?? []).slice(0, 2).map((item) => `${item.type}: ${item.title}`)),
        'Confirmed signal must be separated from inferred implication and missing-data risk.',
      ].filter((item): item is string => Boolean(item)).slice(0, 6),
      table: {
        columns: catalysts.length ? ['Catalyst', 'Bias', 'Impact'] : ['Type', 'Headline'],
        rows: catalysts.length
          ? catalysts.slice(0, 5).map((item) => [item.title, item.bias, item.impact])
          : (input.searchResults?.results ?? []).slice(0, 5).map((item) => [item.type, item.title]),
      },
      alerts: [
        ...checklist.filter((item) => item.status === 'fail').map((item) => item.detail),
        ...(input.newsIntel?.xIntel?.blindspots ?? []).slice(0, 1),
        ...(input.newsIntel?.blindspots ?? []).slice(0, 2),
        ...(input.newsIntel?.sourceLabel ? [input.newsIntel.sourceLabel] : []),
      ].filter((item): item is string => Boolean(item)).slice(0, 4),
      status: newsStatus,
    },
  };
}
