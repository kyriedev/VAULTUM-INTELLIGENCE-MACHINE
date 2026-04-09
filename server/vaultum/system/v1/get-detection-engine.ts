import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import {
  checklistEngineTemplate,
  knowledgeConcepts,
  normalizeTradingDoctrineMarket,
  retrieveKnowledge,
} from './_knowledge-base';

export async function getDetectionEngine(input: {
  market?: string;
  question?: string;
  topN?: number;
}): Promise<any> {
  const market = normalizeTradingDoctrineMarket(input.market);
  const question = String(input.question || '').trim();
  const topN = Number(input.topN || 8);

  return getCachedOrCompute(cacheKey('system', `detection-engine:${market}:${question || 'default'}:${topN}`), async () => {
    const retrieval = retrieveKnowledge({ market, question, topN });
    const conceptIndex = new Set(retrieval.concepts.map((item) => item.key));
    const concepts = knowledgeConcepts.filter((concept) => !question || conceptIndex.has(concept.key));

    return {
      generatedAt: new Date().toISOString(),
      market,
      question,
      summary: 'Detection engine binds each concept to required inputs, operational heuristic, confidence logic, and failure cases so Vaultum can explain what it is actually seeing.',
      concepts: concepts.map((concept) => ({
        key: concept.key,
        label: concept.label,
        group: concept.group,
        requiredInputs: concept.requiredInputs,
        detectionLogic: concept.detectionLogic,
        confidenceLogic: concept.confidenceLogic,
        failureCases: concept.failureCases,
        markets: concept.markets,
        evidenceLevel: concept.evidenceLevel,
      })),
      checklistTemplate: checklistEngineTemplate,
      retrieval,
    };
  }, 300);
}
