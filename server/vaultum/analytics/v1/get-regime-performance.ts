import { buildRegimePerformanceStats } from '../../../../src/lib/learning/adaptive.ts';
import { getLearningBundle } from './_learning-store.ts';

export async function getRegimePerformance(input: {
  operatorId?: string;
  market?: string;
}): Promise<any[]> {
  const operatorId = String(input.operatorId || 'local-operator');
  const market = String(input.market || 'XAUUSD').toUpperCase();
  const bundle = await getLearningBundle(operatorId);
  return buildRegimePerformanceStats(bundle?.cases ?? [], market);
}

