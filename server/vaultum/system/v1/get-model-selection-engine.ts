import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import {
  buildModelSelectionDecision,
  normalizeTradingDoctrineMarket,
  retrieveKnowledge,
} from './_knowledge-base';

export async function getModelSelectionEngine(input: {
  market?: string;
  question?: string;
  phase?: string;
  readiness?: string;
  confidence?: number;
  macroReflexivity?: string;
  eventRisk?: 'live' | 'soon' | 'clear';
}): Promise<any> {
  const market = normalizeTradingDoctrineMarket(input.market);
  const question = String(input.question || '').trim();

  return getCachedOrCompute(cacheKey('system', `model-selection:${market}:${question || 'default'}:${input.phase || 'auto'}:${input.readiness || 'auto'}:${input.eventRisk || 'clear'}`), async () => {
    const decision = buildModelSelectionDecision({
      market,
      phase: input.phase,
      readiness: input.readiness,
      confidence: input.confidence,
      macroReflexivity: input.macroReflexivity,
      eventRisk: input.eventRisk,
    });

    return {
      generatedAt: new Date().toISOString(),
      market,
      question,
      summary: `Model routing reads ${decision.regimeClass}. ${decision.reason}`,
      decision,
      retrieval: retrieveKnowledge({ market, question, topN: 5 }),
    };
  }, 300);
}
