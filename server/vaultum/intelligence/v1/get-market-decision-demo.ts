import { buildDecisionDemoFixtures } from './engine/demo-fixtures.ts';

type MarketDecisionDemoInput = {
  scenario?: 'gold' | 'usd' | 'options-screenshot' | 'all';
};

export async function getMarketDecisionDemo(input: MarketDecisionDemoInput = {}): Promise<any> {
  const fixtures = await buildDecisionDemoFixtures();
  const scenario = String(input.scenario || 'all').toLowerCase();

  if (scenario === 'gold') return fixtures.gold;
  if (scenario === 'usd') return fixtures.usd;
  if (scenario === 'options-screenshot') return fixtures.optionsScreenshotExample;
  return fixtures;
}
