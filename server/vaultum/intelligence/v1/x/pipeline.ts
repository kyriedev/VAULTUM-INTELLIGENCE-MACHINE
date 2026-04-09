import { classifyPost, scoreTextForMarket } from './classification';
import { postsContradict, scoreCrossConfirmation, scoreEventCredibility, scoreSourceCredibility } from './credibility';
import { buildDecay } from './decay';
import { clamp, jaccardSimilarity } from './helpers';
import { buildImpactAssessment } from './impact';
import { computeEventScores, computeStalePenalty } from './scoring';
import { validateEventImpact } from './validation';
import { buildActionabilityDecision, buildTradingGuidance } from './actionability';
import type {
  EventCluster,
  MarketReactionValidation,
  RawSocialPost,
  XIntelPost,
} from './types';

type ClusterDraft = {
  key: string;
  posts: XIntelPost[];
  parsed: ReturnType<typeof classifyPost>;
};

function marketKeywords(market: string): string[] {
  if (market === 'XAUUSD') return ['gold', 'xau', 'bullion', 'fed', 'yields', 'dollar', 'dxy', 'war', 'tariff', 'geopolitics'];
  if (market === 'US30') return ['dow', 'us30', 'equities', 'stocks', 'risk', 'tariff', 'fed', 'yields'];
  if (market === 'EURUSD') return ['eurusd', 'euro', 'ecb', 'fed', 'dollar'];
  if (market === 'GBPUSD') return ['gbpusd', 'pound', 'sterling', 'boe', 'fed', 'dollar'];
  if (market === 'USDJPY') return ['usdjpy', 'yen', 'boj', 'fed', 'yields', 'carry'];
  if (market === 'GBPJPY') return ['gbpjpy', 'pound', 'yen', 'boj', 'boe', 'carry'];
  return [market.toLowerCase(), 'macro', 'risk', 'market'];
}

function scoreMatch(text: string, tokens: string[]): number {
  const lower = text.toLowerCase();
  return tokens.reduce((sum, token) => sum + (lower.includes(token) ? 1 : 0), 0);
}

function recencyBoost(timestamp: string | null): number {
  if (!timestamp) return 0;
  const ageHours = Math.max((Date.now() - new Date(timestamp).getTime()) / 3_600_000, 0);
  if (ageHours <= 1) return 10;
  if (ageHours <= 4) return 7;
  if (ageHours <= 12) return 4;
  if (ageHours <= 24) return 2;
  return 0;
}

function engagementScore(post: RawSocialPost): number {
  const raw = post.engagementMetrics.likes
    + (post.engagementMetrics.reposts * 2.2)
    + (post.engagementMetrics.quotes * 2.3)
    + (post.engagementMetrics.replies * 1.4);
  return Number((Math.log10(raw + 1) * 8).toFixed(1));
}

function postImpact(relevanceScore: number, intensity: string): 'high' | 'medium' | 'low' {
  if (relevanceScore >= 22 || (relevanceScore >= 14 && intensity === 'high')) return 'high';
  if (relevanceScore >= 11) return 'medium';
  return 'low';
}

function findCluster(drafts: ClusterDraft[], post: XIntelPost, parsed: ReturnType<typeof classifyPost>): ClusterDraft | null {
  const postTokens = post.cleanedText.split(/\s+/).filter(Boolean);
  const postEntities = post.detectedEntities.keywords;
  for (const draft of drafts) {
    const lead = draft.posts[0];
    if (!lead) continue;
    const leadTokens = lead.cleanedText.split(/\s+/).filter(Boolean);
    const tokenSimilarity = jaccardSimilarity(postTokens, leadTokens);
    const entitySimilarity = jaccardSimilarity(postEntities, lead.detectedEntities.keywords);
    const sameEvent = draft.parsed.eventType === parsed.eventType || postsContradict(draft.parsed, parsed);
    const sameFocus = draft.parsed.entities.some((item) => parsed.entities.includes(item));
    if ((sameEvent && (tokenSimilarity >= 0.32 || entitySimilarity >= 0.28)) || (sameFocus && tokenSimilarity >= 0.42)) {
      return draft;
    }
  }
  return null;
}

function clusterKey(post: XIntelPost, parsed: ReturnType<typeof classifyPost>): string {
  return [
    parsed.eventType,
    ...parsed.geography.slice(0, 2),
    ...parsed.entities.slice(0, 2),
    ...post.detectedEntities.keywords.slice(0, 3),
  ].filter(Boolean).join(':').toLowerCase();
}

function severityWeight(cluster: ClusterDraft): number {
  if (cluster.parsed.intensity === 'high') return 88;
  if (cluster.parsed.intensity === 'medium') return 60;
  return 28;
}

function surpriseWeight(cluster: ClusterDraft): number {
  if (cluster.parsed.surpriseLevel === 'shock') return 86;
  if (cluster.parsed.surpriseLevel === 'semi-surprise') return 58;
  return 28;
}

export async function buildXEventClusters(input: {
  market: string;
  rawPosts: RawSocialPost[];
  validationOverrides?: Record<string, MarketReactionValidation | undefined>;
}): Promise<{
  posts: XIntelPost[];
  clusters: EventCluster[];
  sentiment: { label: 'bullish' | 'bearish' | 'mixed' | 'neutral'; score: number; summary: string };
}> {
  const tokens = marketKeywords(input.market);
  const posts = input.rawPosts
    .map((post) => {
      const parsed = classifyPost(post);
      const bias = scoreTextForMarket(input.market, post.cleanedText || post.rawText);
      const credibility = scoreSourceCredibility(post);
      const score = scoreMatch(`${post.cleanedText} ${post.profile.category}`, tokens)
        + recencyBoost(post.timestamp)
        + engagementScore(post)
        + (post.profile.marketMovingRelevanceScore * 0.08)
        + (post.detectedEntities.symbols.includes(input.market) ? 6 : 0);
      const relevanceScore = Number(score.toFixed(1));
      return {
        id: post.id,
        authorHandle: post.sourceHandle,
        authorName: post.sourceDisplayName,
        verified: post.profile.sourceTier === 'tier1' || post.profile.sourceTier === 'tier2',
        category: post.profile.category,
        createdAt: post.timestamp,
        text: post.rawText,
        cleanedText: post.cleanedText,
        url: `https://x.com/${post.sourceHandle}/status/${post.id}`,
        eventType: parsed.eventType,
        credibility,
        bias: bias.bias,
        biasScore: bias.biasScore,
        impact: postImpact(relevanceScore, parsed.intensity),
        relevanceScore,
        marketRelevance: relevanceScore >= 20 ? 'direct' : relevanceScore >= 11 ? 'context' : 'weak',
        engagementScore: engagementScore(post),
        whyItMatters: `${parsed.eventType.replaceAll('_', ' ')} maps into ${input.market} context through ${parsed.geography.join(', ')} and ${parsed.keywords.slice(0, 3).join(', ')}.`,
        detectedEntities: post.detectedEntities,
      } satisfies XIntelPost;
    })
    .sort((left, right) => {
      if (right.relevanceScore !== left.relevanceScore) return right.relevanceScore - left.relevanceScore;
      return String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
    });

  const drafts: ClusterDraft[] = [];
  posts.forEach((post) => {
    const raw = input.rawPosts.find((item) => item.id === post.id);
    if (!raw) return;
    const parsed = classifyPost(raw);
    const existing = findCluster(drafts, post, parsed);
    if (existing) {
      existing.posts.push(post);
    } else {
      drafts.push({
        key: clusterKey(post, parsed),
        posts: [post],
        parsed,
      });
    }
  });

  const clusters = await Promise.all(drafts.map(async (draft) => {
    const orderedPosts = [...draft.posts].sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
    const lead = orderedPosts[0]!;
    const sourceCredibilityScore = Number((orderedPosts.reduce((sum, post) => sum + post.credibility, 0) / Math.max(orderedPosts.length, 1)).toFixed(1));
    const confirmation = scoreCrossConfirmation(orderedPosts);
    const eventCredibilityScore = scoreEventCredibility({
      posts: orderedPosts,
      parsedEvent: draft.parsed,
      crossConfirmationScore: confirmation.crossConfirmationScore,
      contradictionScore: confirmation.contradictionScore,
    });
    const impactAssessment = buildImpactAssessment(draft.parsed, lead.text);
    const validation = await validateEventImpact({
      eventTimestamp: lead.createdAt || new Date().toISOString(),
      impactAssessment,
      override: input.validationOverrides?.[lead.id],
    });
    const stalePenalty = computeStalePenalty(lead.createdAt);
    const noisePenalty = clamp(
      (orderedPosts.filter((post) => post.eventType === 'narrative_noise').length * 18)
      + (orderedPosts.filter((post) => post.eventType === 'rumor_unconfirmed').length * 12),
      0,
      100,
    );
    const scores = computeEventScores({
      sourceCredibilityScore,
      eventSeverityWeight: severityWeight(draft),
      surpriseWeight: surpriseWeight(draft),
      crossConfirmationWeight: confirmation.crossConfirmationScore,
      liveReactionWeight: validation.crossAssetAlignmentScore,
      stalePenalty,
      contradictionPenalty: confirmation.contradictionScore,
      noisePenalty,
    });
    const actionability = buildActionabilityDecision({
      credibility: eventCredibilityScore,
      overallImpactScore: scores.overallImpactScore,
      tradabilityScore: scores.tradabilityScore,
      macroRelevanceScore: scores.macroRelevanceScore,
      validation,
      parsedEvent: draft.parsed,
    });
    const decay = buildDecay(draft.parsed, orderedPosts);
    const tradingGuidance = buildTradingGuidance({
      parsedEvent: draft.parsed,
      impactAssessment,
      validation,
      actionability,
      decayWindow: `${decay.persistenceClass} / half-life ${decay.impactHalfLifeMinutes}m`,
    });

    return {
      id: draft.key,
      key: draft.key,
      headline: lead.text,
      cleanedSummary: `${draft.parsed.eventType.replaceAll('_', ' ')} | ${impactAssessment.summary}`,
      status: confirmation.status,
      tone:
        actionability.state === 'TRADEABLE_CATALYST' || actionability.state === 'EXECUTION_CAUTION'
          ? 'red'
          : actionability.state === 'MACRO_BIAS_SHIFT'
            ? 'green'
            : actionability.state === 'MONITOR'
              ? 'amber'
              : 'gray',
      firstDetectedAt: orderedPosts[orderedPosts.length - 1]?.createdAt ?? lead.createdAt ?? new Date().toISOString(),
      latestUpdateAt: lead.createdAt ?? new Date().toISOString(),
      eventType: draft.parsed.eventType,
      subtypes: draft.parsed.subtypes,
      geography: draft.parsed.geography,
      intensity: draft.parsed.intensity,
      surpriseLevel: draft.parsed.surpriseLevel,
      sourceHandles: [...new Set(orderedPosts.map((post) => post.authorHandle))],
      sourceTiers: [...new Set(input.rawPosts.filter((post) => orderedPosts.some((item) => item.id === post.id)).map((post) => post.profile.sourceTier))],
      sourceCredibilityScore,
      eventCredibilityScore,
      crossConfirmationScore: confirmation.crossConfirmationScore,
      contradictionScore: confirmation.contradictionScore,
      stalePenalty,
      noisePenalty,
      overallImpactScore: scores.overallImpactScore,
      tradabilityScore: scores.tradabilityScore,
      macroRelevanceScore: scores.macroRelevanceScore,
      confidenceScore: scores.confidenceScore,
      parsedEvent: draft.parsed,
      impactAssessment,
      validation,
      actionability,
      tradingGuidance,
      decay,
      explanation: {
        whyItMatters: impactAssessment.summary,
        transmissionPath: impactAssessment.impactedAssets.slice(0, 3).map((item) => `${item.asset} ${item.directionBias} because ${item.reason}`).join(' | ') || 'Transmission path is still unclear.',
        exposedAssets: impactAssessment.impactedAssets.slice(0, 5).map((item) => `${item.asset} ${item.directionBias}`),
        missingConfirmation:
          validation.reactionValidation === 'confirmed'
            ? 'No major confirmation gap remains in the first pass.'
            : validation.explanation,
        whyActionable: actionability.reason,
      },
      posts: orderedPosts,
      timeline: orderedPosts
        .slice()
        .reverse()
        .map((post) => ({
          timestamp: post.createdAt || new Date().toISOString(),
          handle: post.authorHandle,
          label: `${post.authorHandle} ${post.eventType.replaceAll('_', ' ')}`,
          note: `${post.marketRelevance} relevance / credibility ${post.credibility}`,
        })),
    } satisfies EventCluster;
  }));

  const weightedBias = posts.reduce((sum, post) => sum + (post.biasScore * Math.max(post.relevanceScore, 1)), 0);
  const weightedRelevance = posts.reduce((sum, post) => sum + Math.max(post.relevanceScore, 1), 0) || 1;
  const sentimentScore = clamp(weightedBias / weightedRelevance, -100, 100);
  const sentiment =
    sentimentScore >= 14 ? 'bullish'
      : sentimentScore <= -14 ? 'bearish'
        : Math.abs(sentimentScore) >= 6 ? 'mixed'
          : 'neutral';

  return {
    posts,
    clusters: clusters.sort((left, right) => {
      if (right.overallImpactScore !== left.overallImpactScore) return right.overallImpactScore - left.overallImpactScore;
      return String(right.latestUpdateAt).localeCompare(String(left.latestUpdateAt));
    }),
    sentiment: {
      label: sentiment,
      score: Number(sentimentScore.toFixed(1)),
      summary: posts[0]
        ? `Tracked X flow leans ${sentiment} for ${input.market}; lead event is ${posts[0].eventType.replaceAll('_', ' ')} from @${posts[0].authorHandle}.`
        : 'Tracked X flow has no scored posts yet.',
    },
  };
}
