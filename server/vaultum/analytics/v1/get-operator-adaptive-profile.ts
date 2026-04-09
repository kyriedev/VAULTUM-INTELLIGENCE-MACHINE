import { buildOperatorAdaptiveProfile } from '../../../../src/lib/learning/adaptive.ts';
import { getLearningBundle } from './_learning-store.ts';

export async function getOperatorAdaptiveProfile(input: {
  operatorId?: string;
  market?: string;
}): Promise<any> {
  const operatorId = String(input.operatorId || 'local-operator');
  const market = String(input.market || 'XAUUSD').toUpperCase();
  const bundle = await getLearningBundle(operatorId);

  return buildOperatorAdaptiveProfile({
    market,
    cases: bundle?.cases ?? [],
    proposals: bundle?.proposals?.filter((item) => item.market === market) ?? [],
    override: bundle?.overrides?.find((item) => item.market === market) ?? null,
  });
}

