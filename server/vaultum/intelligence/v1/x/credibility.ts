import { clamp, minutesAgo } from './helpers';
import { EVENT_OPPOSITES } from './rules';
import type { ParsedEvent, RawSocialPost, XIntelPost } from './types';

export function scoreSourceCredibility(post: RawSocialPost): number {
  const profile = post.profile;
  let score = profile.baseCredibilityScore;
  score += profile.speedBonus;
  score += Math.max((profile.historicalHitRate - 50) * 0.2, 0);
  score -= profile.falseAlarmPenalty;
  score += Math.min(post.engagementMetrics.reposts * 0.005, 4);
  score -= minutesAgo(post.timestamp) > 240 ? 8 : minutesAgo(post.timestamp) > 60 ? 4 : 0;
  if (post.rumorFlag) score -= 18;
  if (post.opinionOnly) score -= 16;
  if (post.contradictionFlag) score -= 20;
  return clamp(Number(score.toFixed(1)), 0, 100);
}

export function scoreCrossConfirmation(posts: XIntelPost[]): { crossConfirmationScore: number; contradictionScore: number; status: 'developing' | 'confirmed' | 'contradicted' | 'stale' } {
  const handles = new Set(posts.map((post) => post.authorHandle)).size;
  const highCred = posts.filter((post) => post.credibility >= 78).length;
  const lowCredNoise = posts.filter((post) => post.credibility < 55).length;
  const contradiction = posts.filter((post) => /(deny|denies|denied|false|not true|not accurate|refute)/i.test(post.text)).length;
  const crossConfirmationScore = clamp((handles * 8) + (highCred * 10) - (lowCredNoise * 4), 0, 100);
  const contradictionScore = clamp((contradiction * 25) + (lowCredNoise * 3), 0, 100);
  const status =
    contradictionScore >= 25 ? 'contradicted'
      : crossConfirmationScore >= 32 ? 'confirmed'
        : posts.every((post) => !post.createdAt || minutesAgo(post.createdAt) > 360) ? 'stale'
          : 'developing';

  return {
    crossConfirmationScore: Number(crossConfirmationScore.toFixed(1)),
    contradictionScore: Number(contradictionScore.toFixed(1)),
    status,
  };
}

export function scoreEventCredibility(input: {
  posts: XIntelPost[];
  parsedEvent: ParsedEvent;
  crossConfirmationScore: number;
  contradictionScore: number;
}): number {
  const lead = input.posts[0];
  const base = lead?.credibility ?? 50;
  let score = base + (input.crossConfirmationScore * 0.35) - (input.contradictionScore * 0.45);
  if (lead?.eventType === 'rumor_unconfirmed') score -= 18;
  if (lead?.eventType === 'narrative_noise') score -= 24;
  if (input.parsedEvent.surpriseLevel === 'shock' && base >= 75) score += 6;
  if (lead?.createdAt && minutesAgo(lead.createdAt) > 360) score -= 10;
  return clamp(Number(score.toFixed(1)), 0, 100);
}

export function postsContradict(primary: ParsedEvent, candidate: ParsedEvent): boolean {
  const opposites = EVENT_OPPOSITES[primary.eventType] ?? [];
  if (opposites.includes(candidate.eventType)) return true;
  return false;
}
