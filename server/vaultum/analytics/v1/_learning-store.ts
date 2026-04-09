import { getCachedJson, setCachedJson } from '../../../_shared/redis';
import type {
  LearningOverrideProfile,
  LearningProposal,
  LearningProposalState,
  LearningSyncBundle,
} from '../../../../src/lib/learning/engine.ts';
import { defaultLearningOverrideProfile } from '../../../../src/lib/learning/engine.ts';

const memoryBundles = new Map<string, LearningSyncBundle>();
const BUNDLE_TTL_SECONDS = 60 * 60 * 24 * 30;

function bundleKey(operatorId: string): string {
  return `vaultum:learning:${operatorId}`;
}

export async function getLearningBundle(operatorId = 'local-operator'): Promise<LearningSyncBundle | null> {
  const memory = memoryBundles.get(operatorId);
  if (memory) return memory;
  const shared = await getCachedJson<LearningSyncBundle>(bundleKey(operatorId), true);
  if (shared) memoryBundles.set(operatorId, shared);
  return shared ?? null;
}

export async function saveLearningBundle(bundle: LearningSyncBundle): Promise<LearningSyncBundle> {
  const normalized: LearningSyncBundle = {
    ...bundle,
    operatorId: String(bundle.operatorId || 'local-operator'),
    syncedAt: new Date().toISOString(),
    cases: bundle.cases ?? [],
    missedCandidates: bundle.missedCandidates ?? [],
    proposals: bundle.proposals ?? [],
    overrides: bundle.overrides ?? [],
  };
  memoryBundles.set(normalized.operatorId, normalized);
  await setCachedJson(bundleKey(normalized.operatorId), normalized, BUNDLE_TTL_SECONDS, true);
  return normalized;
}

function applyProposalToOverride(override: LearningOverrideProfile, proposal: LearningProposal): LearningOverrideProfile {
  const next = { ...override, updatedAt: new Date().toISOString() };
  if (!next.approvedProposalIds.includes(proposal.id)) next.approvedProposalIds = [...next.approvedProposalIds, proposal.id];
  if (proposal.category === 'precision-threshold' && typeof proposal.suggestedChange.to === 'number') next.precisionThreshold = proposal.suggestedChange.to;
  if (proposal.category === 'participation-threshold' && typeof proposal.suggestedChange.to === 'number') next.participationThreshold = proposal.suggestedChange.to;
  if (proposal.category === 'allowed-sessions' && Array.isArray(proposal.suggestedChange.to)) next.allowedSessions = proposal.suggestedChange.to.map((item) => String(item));
  if (proposal.category === 'allowed-regimes' && Array.isArray(proposal.suggestedChange.to)) next.allowedRegimes = proposal.suggestedChange.to.map((item) => String(item));
  if (proposal.category === 'tp-aggressiveness' && typeof proposal.suggestedChange.to === 'string') next.tpAggressiveness = proposal.suggestedChange.to as LearningOverrideProfile['tpAggressiveness'];
  if (proposal.category === 'stop-buffer' && typeof proposal.suggestedChange.to === 'number') next.stopBufferPct = proposal.suggestedChange.to;
  if (proposal.category === 'minimum-structure-quality' && typeof proposal.suggestedChange.to === 'number') next.minimumStructureQuality = proposal.suggestedChange.to;
  next.auditTrail = [
    ...(next.auditTrail ?? []).filter((item) => item.proposalId !== proposal.id),
    {
      proposalId: proposal.id,
      category: proposal.category,
      state: proposal.state,
      updatedAt: new Date().toISOString(),
    },
  ];
  return next;
}

export async function updateLearningProposalState(input: {
  operatorId?: string;
  market?: string;
  proposalId: string;
  state: LearningProposalState;
}): Promise<{ updated: boolean; proposal: LearningProposal | null; override: LearningOverrideProfile | null }> {
  const operatorId = String(input.operatorId || 'local-operator');
  const bundle = await getLearningBundle(operatorId);
  if (!bundle) return { updated: false, proposal: null, override: null };

  let updatedProposalId: string | null = null;
  let updatedOverride: LearningOverrideProfile | null = null;
  const market = String(input.market || '').toUpperCase();

  bundle.proposals = bundle.proposals.map((proposal) => {
    if (proposal.id !== input.proposalId) return proposal;
    updatedProposalId = proposal.id;
    return { ...proposal, state: input.state, updatedAt: new Date().toISOString() };
  });

  const updatedProposal = updatedProposalId
    ? bundle.proposals.find((proposal) => proposal.id === updatedProposalId) ?? null
    : null;

  if (updatedProposal && input.state === 'approved') {
    const proposalMarket = market || updatedProposal.market;
    const override = bundle.overrides.find((item) => item.market === proposalMarket)
      ?? defaultLearningOverrideProfile(proposalMarket);
    updatedOverride = applyProposalToOverride(override, updatedProposal);
    bundle.overrides = [
      updatedOverride,
      ...bundle.overrides.filter((item) => item.market !== updatedOverride!.market),
    ];
  }
  if (updatedProposal && input.state !== 'approved') {
    const proposalMarket = market || updatedProposal.market;
    const override = bundle.overrides.find((item) => item.market === proposalMarket)
      ?? defaultLearningOverrideProfile(proposalMarket);
    updatedOverride = {
      ...override,
      updatedAt: new Date().toISOString(),
      auditTrail: [
        ...(override.auditTrail ?? []).filter((item) => item.proposalId !== updatedProposal.id),
        {
          proposalId: updatedProposal.id,
          category: updatedProposal.category,
          state: input.state,
          updatedAt: new Date().toISOString(),
        },
      ],
    };
    bundle.overrides = [
      updatedOverride,
      ...bundle.overrides.filter((item) => item.market !== updatedOverride!.market),
    ];
  }

  await saveLearningBundle(bundle);
  return { updated: Boolean(updatedProposal), proposal: updatedProposal, override: updatedOverride };
}
