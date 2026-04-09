import { clamp, minutesAgo } from './helpers';

export function computeEventScores(input: {
  sourceCredibilityScore: number;
  eventSeverityWeight: number;
  surpriseWeight: number;
  crossConfirmationWeight: number;
  liveReactionWeight: number;
  stalePenalty: number;
  contradictionPenalty: number;
  noisePenalty: number;
}): {
  overallImpactScore: number;
  tradabilityScore: number;
  macroRelevanceScore: number;
  confidenceScore: number;
} {
  const overallImpactScore = clamp(
    input.sourceCredibilityScore * 0.28
    + input.eventSeverityWeight * 0.22
    + input.surpriseWeight * 0.1
    + input.crossConfirmationWeight * 0.16
    + input.liveReactionWeight * 0.18
    - input.stalePenalty * 0.08
    - input.contradictionPenalty * 0.16
    - input.noisePenalty * 0.12,
    0,
    100,
  );

  const tradabilityScore = clamp(overallImpactScore + (input.liveReactionWeight * 0.25) - (input.noisePenalty * 0.15), 0, 100);
  const macroRelevanceScore = clamp((input.eventSeverityWeight * 0.55) + (input.crossConfirmationWeight * 0.25) + (input.surpriseWeight * 0.2), 0, 100);
  const confidenceScore = clamp((input.sourceCredibilityScore * 0.45) + (input.crossConfirmationWeight * 0.2) + (input.liveReactionWeight * 0.2) - (input.contradictionPenalty * 0.2), 0, 100);

  return {
    overallImpactScore: Number(overallImpactScore.toFixed(1)),
    tradabilityScore: Number(tradabilityScore.toFixed(1)),
    macroRelevanceScore: Number(macroRelevanceScore.toFixed(1)),
    confidenceScore: Number(confidenceScore.toFixed(1)),
  };
}

export function computeStalePenalty(timestamp: string | null): number {
  if (!timestamp) return 12;
  const age = minutesAgo(timestamp);
  if (age <= 15) return 0;
  if (age <= 60) return 6;
  if (age <= 240) return 12;
  return 20;
}
