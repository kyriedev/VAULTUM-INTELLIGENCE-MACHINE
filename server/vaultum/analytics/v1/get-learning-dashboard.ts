import { buildAdaptiveLearningDashboard } from '../../../../src/lib/learning/adaptive.ts';
import { getLearningBundle } from './_learning-store.ts';

export async function getLearningDashboard(input: {
  operatorId?: string;
  market?: string;
}): Promise<any> {
  const operatorId = String(input.operatorId || 'local-operator');
  const market = String(input.market || 'XAUUSD').toUpperCase();
  const bundle = await getLearningBundle(operatorId);

  return buildAdaptiveLearningDashboard({
    market,
    cases: bundle?.cases ?? [],
    missedCandidates: bundle?.missedCandidates ?? [],
    proposals: bundle?.proposals ?? [],
    overrides: bundle?.overrides?.find((item) => item.market === market) ?? null,
  });
}
