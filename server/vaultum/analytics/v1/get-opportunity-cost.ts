import { buildOpportunityCostStats } from '../../../../src/lib/learning/adaptive.ts';
import { getLearningBundle } from './_learning-store.ts';

export async function getOpportunityCost(input: {
  operatorId?: string;
  market?: string;
}): Promise<any[]> {
  const operatorId = String(input.operatorId || 'local-operator');
  const market = String(input.market || 'XAUUSD').toUpperCase();
  const bundle = await getLearningBundle(operatorId);
  return buildOpportunityCostStats(bundle?.cases ?? [], market);
}

