import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import {
  agentRulebooks,
  buildKnowledgeCoverageReport,
  knowledgeDocuments,
  knowledgeGraphMap,
  retrieveKnowledge,
  findTradingDoctrineFocusMarket,
  normalizeTradingDoctrineMarket,
} from './_knowledge-base';

export async function getKnowledgeGraph(input: {
  market?: string;
  question?: string;
  topN?: number;
}): Promise<any> {
  const market = normalizeTradingDoctrineMarket(input.market);
  const question = String(input.question || '').trim();
  const topN = Number(input.topN || 5);

  return getCachedOrCompute(cacheKey('system', `knowledge-graph:${market}:${question || 'default'}:${topN}`), async () => {
    const retrieval = retrieveKnowledge({ market, question, topN });
    const coverage = buildKnowledgeCoverageReport();
    const focusMarket = findTradingDoctrineFocusMarket(market);

    return {
      generatedAt: new Date().toISOString(),
      market,
      question,
      summary: 'Vaultum knowledge graph unifies market structure, macro pressure/context, forex mechanics, model selection, document evidence quality, and agent rulebooks into a retrieval-ready map.',
      focusMarket,
      ontologyMap: coverage.ontologyMap,
      checklistTemplate: knowledgeGraphMap.checklistTemplate,
      concepts: knowledgeGraphMap.concepts,
      models: knowledgeGraphMap.models,
      documents: knowledgeDocuments,
      agents: agentRulebooks,
      retrieval,
      overallCoverageScore: coverage.overallScore,
    };
  }, 300);
}
