import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import {
  agentRulebooks,
  normalizeTradingDoctrineMarket,
  retrieveKnowledge,
} from './_knowledge-base';

export async function getAgentRulebooks(input: {
  market?: string;
  question?: string;
}): Promise<any> {
  const market = normalizeTradingDoctrineMarket(input.market);
  const question = String(input.question || '').trim();

  return getCachedOrCompute(cacheKey('system', `agent-rulebooks:${market}:${question || 'default'}`), async () => ({
    generatedAt: new Date().toISOString(),
    market,
    question,
    summary: 'Vaultum agent rulebooks tell each agent what to focus on, which inputs it needs, how to hand off its work, and what mistakes to avoid.',
    agents: agentRulebooks,
    retrieval: retrieveKnowledge({ market, question, topN: 4 }),
  }), 300);
}
