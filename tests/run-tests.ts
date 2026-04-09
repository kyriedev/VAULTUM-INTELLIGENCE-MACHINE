import { runRegimeEngineTests } from './regime-engine.test.ts';
import { runMarketProviderTests } from './market-provider.test.ts';
import { runDeskRecommendationTests } from './desk-recommendation.test.ts';
import { runRelayEngineTests } from './relay-engine.test.ts';
import { runRelayCacheTests } from './relay-cache.test.ts';
import { runFinvizParserTests } from './finviz-parser.test.ts';
import { runChartLogicTests } from './chart-logic.test.ts';
import { runLearningEngineTests } from './learning-engine.test.ts';
import { runAdaptiveLearningTests } from './adaptive-learning.test.ts';
import { runIntelligenceDecisionEngineTests } from './intelligence-decision-engine.test.ts';
import { runStrikePressureTests } from './strike-pressure.test.ts';
import { runXIntelHealthTests } from './x-intel-health.test.ts';

async function main(): Promise<void> {
  const suites: Array<{ name: string; run: () => void | Promise<void> }> = [
    { name: 'regime-engine', run: () => runRegimeEngineTests() },
    { name: 'market-provider', run: () => runMarketProviderTests() },
    { name: 'desk-recommendation', run: () => runDeskRecommendationTests() },
    { name: 'relay-engine', run: () => runRelayEngineTests() },
    { name: 'relay-cache', run: () => runRelayCacheTests() },
    { name: 'finviz-parser', run: () => runFinvizParserTests() },
    { name: 'chart-logic', run: () => runChartLogicTests() },
    { name: 'strike-pressure', run: () => runStrikePressureTests() },
    { name: 'x-intel-health', run: () => runXIntelHealthTests() },
    { name: 'intelligence-decision-engine', run: () => runIntelligenceDecisionEngineTests() },
    { name: 'learning-engine', run: () => runLearningEngineTests() },
    { name: 'adaptive-learning', run: () => runAdaptiveLearningTests() },
  ];

  for (const suite of suites) {
    await suite.run();
    console.log(`PASS ${suite.name}`);
  }

  console.log(`PASS ${suites.length} test suites`);
}

main().catch((error) => {
  console.error('FAIL test-runner');
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
