import type {
  ActionabilityDecision,
  ImpactAssessment,
  MarketReactionValidation,
  ParsedEvent,
  TradingGuidance,
  XActionabilityState,
} from './types';

function stateFor(input: {
  credibility: number;
  overallImpactScore: number;
  tradabilityScore: number;
  macroRelevanceScore: number;
  validation: MarketReactionValidation;
  parsedEvent: ParsedEvent;
}): XActionabilityState {
  if (input.credibility < 45 || input.parsedEvent.eventType === 'narrative_noise') return 'IGNORE';
  if (input.parsedEvent.eventType === 'rumor_unconfirmed' && input.validation.reactionValidation !== 'confirmed') return 'LOG_ONLY';
  if (input.validation.reactionValidation === 'contradictory') return 'EXECUTION_CAUTION';
  if (input.tradabilityScore >= 72 && input.validation.reactionValidation === 'confirmed') return 'TRADEABLE_CATALYST';
  if (input.macroRelevanceScore >= 66 && input.credibility >= 68) return 'MACRO_BIAS_SHIFT';
  if (input.overallImpactScore >= 48) return 'MONITOR';
  return 'LOG_ONLY';
}

export function buildActionabilityDecision(input: {
  credibility: number;
  overallImpactScore: number;
  tradabilityScore: number;
  macroRelevanceScore: number;
  validation: MarketReactionValidation;
  parsedEvent: ParsedEvent;
}): ActionabilityDecision {
  const state = stateFor(input);
  const reason =
    state === 'TRADEABLE_CATALYST'
      ? 'Credibility, severity, and live market confirmation are strong enough to treat this as a tradeable catalyst context.'
      : state === 'MACRO_BIAS_SHIFT'
        ? 'The event is strong enough to shift macro assumptions, but execution should still wait for chart and participation confirmation.'
        : state === 'EXECUTION_CAUTION'
          ? 'Headline risk is elevated or conflicting enough that normal execution should be more defensive.'
          : state === 'MONITOR'
            ? 'The event matters, but confirmation or reaction quality is still incomplete.'
            : state === 'LOG_ONLY'
              ? 'This belongs in context memory, not in active execution logic.'
              : 'Noise or low-credibility commentary is not strong enough to affect execution workflow.';

  return {
    state,
    impactScore: input.overallImpactScore,
    credibility: input.credibility,
    validationStatus: input.validation.reactionValidation,
    actionabilityScore: Number(((input.tradabilityScore + input.macroRelevanceScore) / 2).toFixed(1)),
    reason,
  };
}

export function buildTradingGuidance(input: {
  parsedEvent: ParsedEvent;
  impactAssessment: ImpactAssessment;
  validation: MarketReactionValidation;
  actionability: ActionabilityDecision;
  decayWindow: string;
}): TradingGuidance {
  const top = input.impactAssessment.impactedAssets.slice(0, 4);
  const setupAdjustments = [
    input.actionability.state === 'TRADEABLE_CATALYST'
      ? 'Do not chase the first headline impulse; wait for price to confirm and then use pullbacks aligned with the event map.'
      : null,
    input.actionability.state === 'EXECUTION_CAUTION'
      ? 'Reduce normal aggression and avoid fading the first impulse while headline risk is still unresolved.'
      : null,
    top.some((item) => item.asset === 'XAUUSD' && item.directionBias === 'bullish')
      ? 'Gold longs are cleaner on pullbacks while haven pressure stays active.'
      : null,
    top.some((item) => item.asset === 'US30' && item.directionBias === 'bearish')
      ? 'Reduce conviction on risk-on equity scalps while the event still pressures indices.'
      : null,
    top.some((item) => item.asset === 'WTI' && item.directionBias === 'bullish')
      ? 'Avoid fading the first oil impulse when supply or chokepoint risk is the live transmission path.'
      : null,
  ].filter((item): item is string => Boolean(item));

  return {
    regimeEffect:
      input.actionability.state === 'MACRO_BIAS_SHIFT'
        ? `${input.parsedEvent.eventType.replaceAll('_', ' ')} is strong enough to shift macro bias.`
        : `${input.parsedEvent.eventType.replaceAll('_', ' ')} is mainly a fast catalyst layer until structure and reaction confirm it further.`,
    directionalBiasByAsset: top.map((item) => ({
      asset: item.asset,
      bias: item.directionBias,
      strength: item.impactMagnitude,
      reason: item.reason,
    })),
    setupAdjustments,
    riskFlags: [
      input.validation.reactionValidation !== 'confirmed' ? 'Cross-asset confirmation is incomplete.' : null,
      input.validation.reactionValidation === 'contradictory' ? 'Live market reaction is contradicting the inferred event map.' : null,
      input.parsedEvent.eventType === 'rumor_unconfirmed' ? 'This is a rumor-type event and should not override structure by itself.' : null,
    ].filter((item): item is string => Boolean(item)),
    expiryOrDecayWindow: input.decayWindow,
  };
}
