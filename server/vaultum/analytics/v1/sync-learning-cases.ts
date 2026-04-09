import type { LearningSyncBundle } from '../../../../src/lib/learning/engine.ts';
import { saveLearningBundle } from './_learning-store.ts';

export async function syncLearningCases(input: LearningSyncBundle): Promise<{ synced: true; operatorId: string; caseCount: number; proposalCount: number; overrideCount: number; syncedAt: string }> {
  const bundle = await saveLearningBundle({
    operatorId: String(input.operatorId || 'local-operator'),
    syncedAt: new Date().toISOString(),
    cases: input.cases ?? [],
    missedCandidates: input.missedCandidates ?? [],
    proposals: input.proposals ?? [],
    overrides: input.overrides ?? [],
  });

  return {
    synced: true,
    operatorId: bundle.operatorId,
    caseCount: bundle.cases.length,
    proposalCount: bundle.proposals.length,
    overrideCount: bundle.overrides.length,
    syncedAt: bundle.syncedAt,
  };
}
