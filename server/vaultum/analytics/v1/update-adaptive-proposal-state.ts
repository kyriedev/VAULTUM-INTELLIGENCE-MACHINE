import { updateLearningProposalState as updateStoredLearningProposalState } from './_learning-store.ts';

export async function updateAdaptiveProposalState(input: {
  operatorId?: string;
  market?: string;
  proposalId: string;
  state: 'pending' | 'approved' | 'rejected';
}): Promise<any> {
  return updateStoredLearningProposalState(input);
}
