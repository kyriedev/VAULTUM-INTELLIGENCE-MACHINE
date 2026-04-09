import {
  LEARNING_PRIMARY_MARKETS,
  buildLearningDashboard,
  buildLearningProposals,
  buildLearningRecommendationResponse,
  classifySession,
  defaultLearningOverrideProfile,
  finalizeLearningCase,
  type LearningCase,
  type LearningDashboardResponse,
  type LearningOverrideProfile,
  type LearningProposal,
  type LearningRecommendationResponse,
  type LearningSyncBundle,
  type MissedSetupCandidate,
  type SetupType,
} from '@/lib/learning/engine';
import {
  buildAdaptiveLearningDashboard,
  buildAdaptiveProposals,
  buildAdaptiveRecommendationResponse,
  buildDecisionConflictCases,
  buildDoctrineTensionFlags,
  buildEdgePressureStats,
  buildExecutionLeakStats,
  buildOpportunityCostStats,
  buildOperatorAdaptiveProfile,
  buildRegimePerformanceStats,
  finalizeAdaptiveLearningCase,
} from '@/lib/learning/adaptive';
import type { VaultumChartReviewResponse } from '@/services/ai';
import type { EntryMapResponse } from '@/services/entry-map';
import type { SetupPatrolResponse } from '@/services/patrol';
import { invokeVaultumRpc } from '@/services/rpc';
import { loadTradeJournal } from '@/services/trade-journal';
import {
  getLearningSyncMeta,
  listLearningCases,
  listLearningOverrides,
  listLearningProposals,
  listMissedSetupCandidates,
  saveLearningCase,
  saveLearningCases,
  saveLearningOverride,
  saveLearningOverrides,
  saveLearningProposal,
  saveLearningProposals,
  saveLearningSyncMeta,
  saveMissedSetupCandidate,
  type StoredTradeJournalEntry,
} from '@/services/vault-store';

const DEFAULT_OPERATOR_ID = 'local-operator';

function normalizeMarket(value: string): string {
  const market = String(value || 'XAUUSD').trim().toUpperCase();
  if (market === 'GOLD' || market === 'XAU') return 'XAUUSD';
  return market || 'XAUUSD';
}

function safeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseNumericRange(value: string | null | undefined): { low: number | null; high: number | null } {
  const matches = String(value || '').match(/-?\d+(?:\.\d+)?/g) ?? [];
  if (matches.length >= 2) {
    const low = Number(matches[0]);
    const high = Number(matches[1]);
    return Number.isFinite(low) && Number.isFinite(high)
      ? { low: Math.min(low, high), high: Math.max(low, high) }
      : { low: null, high: null };
  }
  const single = matches[0] ? Number(matches[0]) : NaN;
  return Number.isFinite(single) ? { low: single, high: single } : { low: null, high: null };
}

function inferSetupType(entry: StoredTradeJournalEntry, entryMap?: EntryMapResponse | null): SetupType {
  const haystack = [
    entry.marketPhase,
    entry.vaultumPhase,
    entry.thesis,
    entry.notes,
    entry.actualAction,
    entryMap?.chartDirective,
    entryMap?.tradeThesisSummary,
  ].join(' ').toLowerCase();
  if (/reversal/.test(haystack)) return 'reversal';
  if (/continuation|impulse|correction/.test(haystack)) return 'continuation';
  return 'other';
}

function inferCaseType(entry: StoredTradeJournalEntry): LearningCase['caseType'] {
  const haystack = [entry.actualAction, entry.notes, entry.thesis, entry.planAlignment, entry.reviewVerdict].join(' ').toLowerCase();
  if (entry.planAlignment === 'no-trade' || /\bskip|skipped|stood aside|no trade\b/.test(haystack)) return 'skipped';
  return 'trade';
}

function scoreFromGrade(grade: StoredTradeJournalEntry['executionGrade']): number {
  if (grade === 'clean') return 76;
  if (grade === 'poor') return 38;
  return 58;
}

function inferPrecisionScore(entry: StoredTradeJournalEntry, entryMap?: EntryMapResponse | null): number | null {
  const base = scoreFromGrade(entry.executionGrade);
  const preferred = Number(entryMap?.preferredEntryLevel ?? '');
  if (Number.isFinite(preferred) && entry.entry != null) {
    const reference = Math.max(Math.abs(preferred), 1);
    const distancePct = Math.abs(entry.entry - preferred) / reference;
    if (distancePct <= 0.0004) return 86;
    if (distancePct <= 0.001) return 74;
    if (distancePct <= 0.002) return 62;
    return 44;
  }
  if (entry.reviewVerdict === 'confirmed') return Math.min(base + 8, 90);
  if (entry.reviewVerdict === 'invalidated') return Math.max(base - 12, 25);
  return base;
}

function inferParticipationScore(entry: StoredTradeJournalEntry, entryMap?: EntryMapResponse | null): number | null {
  const haystack = [entry.confirmationNotes, entry.actualAction, entry.notes, entry.mistakes.join(' ')].join(' ').toLowerCase();
  if (/no confirmation|entered early|first touch|no reaction/.test(haystack)) return 34;
  if (/confirmed|sweep|reclaim|rejection|displacement/.test(haystack)) return 76;
  if (entry.reviewVerdict === 'confirmed') return 70;
  if (entry.reviewVerdict === 'invalidated') return 42;
  if (entryMap?.executionChecklist?.length) return entryMap.executionChecklist.length >= 4 ? 68 : 56;
  return 55;
}

function inferOutcome(entry: StoredTradeJournalEntry): LearningCase['review']['outcome'] {
  if (inferCaseType(entry) === 'skipped') return 'skipped';
  return entry.outcome;
}

function inferQualityScores(entry: StoredTradeJournalEntry, entryMap?: EntryMapResponse | null): LearningCase['review'] {
  const precisionScore = inferPrecisionScore(entry, entryMap);
  const participationScore = inferParticipationScore(entry, entryMap);
  const outcome = inferOutcome(entry);
  const setupQualityScore = Math.max(25, Math.min(92, Math.round(((entryMap?.modelTwoConfluenceScore ?? 60) * 0.45) + ((precisionScore ?? 55) * 0.2) + ((participationScore ?? 55) * 0.2) + (entry.reviewVerdict === 'confirmed' ? 10 : entry.reviewVerdict === 'invalidated' ? -8 : 0))));
  const entryQualityScore = precisionScore;
  const managementQualityScore = entry.status === 'closed'
    ? entry.planAlignment === 'followed'
      ? 74
      : entry.planAlignment === 'ignored'
        ? 38
        : 56
    : 55;
  const exitQualityScore = entry.status !== 'closed'
    ? null
    : outcome === 'win'
      ? 72
      : outcome === 'flat'
        ? 58
        : 42;

  return {
    setupQualityScore,
    entryQualityScore,
    managementQualityScore,
    exitQualityScore,
    outcome,
    analysisQualityScore: entry.reviewVerdict === 'confirmed' ? Math.min(setupQualityScore + 4, 95) : entry.reviewVerdict === 'invalidated' ? Math.max(setupQualityScore - 12, 20) : setupQualityScore,
    primaryFailureMode: 'none',
    notes: [entry.notes, entry.confirmationNotes, entry.invalidationNotes, entry.actualAction].filter(Boolean).join(' | '),
  };
}

function inferExitType(entry: StoredTradeJournalEntry): LearningCase['exit']['exitType'] {
  if (entry.status !== 'closed') return 'open';
  if (entry.outcome === 'win') return 'tp_hit';
  if (entry.outcome === 'loss') return 'sl_hit';
  if (entry.outcome === 'flat') return 'manual_exit';
  return 'n/a';
}

function buildTradeLearningCase(entry: StoredTradeJournalEntry, entryMap?: EntryMapResponse | null): LearningCase {
  const createdAt = entry.createdAt || new Date().toISOString();
  const market = normalizeMarket(entry.market);
  const zone = parseNumericRange(entryMap?.institutionalReferenceZone ?? entryMap?.entryZone ?? '');
  const stop = entry.stop ?? safeNumber(Number(entryMap?.invalidationLevel ?? ''));
  const target = entry.target ?? safeNumber(zone.high);
  const review = inferQualityScores(entry, entryMap);
  const caseType = inferCaseType(entry);
  const setupType = inferSetupType(entry, entryMap);
  const rMultiple = safeNumber(entry.rMultiple);
  const exitEfficiency = entry.status === 'closed'
    ? entry.outcome === 'win'
      ? 72
      : entry.outcome === 'flat'
        ? 54
        : 38
    : null;

  return finalizeAdaptiveLearningCase(finalizeLearningCase({
    id: `learning:${entry.id}`,
    sourceId: entry.id,
    caseType,
    source: 'journal',
    createdAt,
    updatedAt: createdAt,
    market,
    primaryFocus: LEARNING_PRIMARY_MARKETS.includes(market as (typeof LEARNING_PRIMARY_MARKETS)[number]),
    setupFamily: 'other',
    tags: entry.mistakes,
    preTrade: {
      market,
      session: classifySession(createdAt),
      tradeDate: createdAt,
      timeframeStack: [
        entryMap?.timeframes.major ?? '4h',
        entryMap?.timeframes.minor ?? entry.timeframe,
        entryMap?.timeframes.trigger ?? '5m',
      ],
      majorStructure: entryMap?.majorStructure ?? entry.vaultumThesisSnapshot.lines[0] ?? `Major structure pending for ${market}.`,
      minorStructure: entryMap?.minorStructure ?? (entry.vaultumPhaseSummary || `Minor structure pending for ${market}.`),
      setupType,
      zone: {
        low: zone.low,
        high: zone.high,
        label: entryMap?.institutionalReference ?? entryMap?.executionLayer?.broadZone ?? entryMap?.premiumDiscountState ?? 'structure-zone',
      },
      chosenEntryLevel: entry.entry,
      precisionScore: inferPrecisionScore(entry, entryMap),
      participationScore: inferParticipationScore(entry, entryMap),
      macroContext: entryMap?.macroContext ?? entry.monitorSummary ?? 'Macro context unavailable.',
      regimeClassification: entryMap?.modelSelection?.regimeClass ?? entry.marketPhase,
      volatilityState: entryMap?.feedQuality ?? 'unknown',
      liquidityContext: entryMap?.volumeContext ?? entryMap?.footprintConfluence ?? entry.monitorSummary ?? 'Liquidity context unavailable.',
      intendedStop: stop,
      intendedTarget: target,
      intendedTargetPlan: entryMap?.targetLogic ?? entryMap?.precisionEntryPlan ?? 'Target plan unavailable.',
      thesisSnapshot: {
        summary: entry.vaultumThesisSnapshot.summary,
        lines: entry.vaultumThesisSnapshot.lines,
      },
    },
    inTrade: {
      mfe: rMultiple != null ? Math.max(rMultiple, entry.outcome === 'win' ? rMultiple : 0.25) : entry.outcome === 'win' ? 1 : entry.outcome === 'loss' ? 0.25 : 0,
      mae: rMultiple != null ? Math.min(rMultiple, entry.outcome === 'loss' ? rMultiple : -0.25) : entry.outcome === 'loss' ? -1 : entry.outcome === 'win' ? -0.25 : 0,
      liquiditySweepBeforeMove: /sweep|liquidity/.test(`${entry.confirmationNotes} ${entry.vaultumThesisSnapshot.lines.join(' ')}`.toLowerCase()) || null,
      displacementConfirmed: /displacement|impulse|expansion/.test(`${entry.confirmationNotes} ${entry.notes}`.toLowerCase()) || null,
      structureShiftAfterEntry: /shift|choch|bos|structure/.test(`${entry.confirmationNotes} ${entry.invalidationNotes}`.toLowerCase()) || null,
      timeToReactionMinutes: null,
      timeToTargetMinutes: null,
      timeToStopMinutes: null,
    },
    exit: {
      exitType: inferExitType(entry),
      actualExitPrices: entry.exit != null ? [entry.exit] : [],
      exitEfficiency,
      priceExtendedBeyondExit: entry.outcome === 'flat' ? true : null,
      fullTpRealistic: entry.outcome === 'loss' ? false : null,
    },
    review,
  }));
}

function buildMissedSetupLearningCase(candidate: MissedSetupCandidate, note = ''): LearningCase {
  const now = new Date().toISOString();
  return finalizeAdaptiveLearningCase(finalizeLearningCase({
    id: `learning:${candidate.id}`,
    sourceId: candidate.id,
    caseType: 'missed_setup',
    source: 'patrol',
    createdAt: candidate.createdAt,
    updatedAt: now,
    market: normalizeMarket(candidate.market),
    primaryFocus: LEARNING_PRIMARY_MARKETS.includes(normalizeMarket(candidate.market) as (typeof LEARNING_PRIMARY_MARKETS)[number]),
    setupFamily: candidate.setupFamily,
    tags: [candidate.zoneLabel, candidate.patrolState, 'missed'],
    preTrade: {
      market: normalizeMarket(candidate.market),
      session: classifySession(candidate.createdAt),
      tradeDate: candidate.createdAt,
      timeframeStack: [candidate.timeframe],
      majorStructure: candidate.summary,
      minorStructure: 'Missed setup candidate from live patrol.',
      setupType: candidate.setupFamily === 'reversal' ? 'reversal' : candidate.setupFamily === 'continuation' ? 'continuation' : 'other',
      zone: { ...parseNumericRange(candidate.zone), label: candidate.zoneLabel || 'structure-zone' },
      chosenEntryLevel: candidate.recommendedEntry,
      precisionScore: candidate.confidence != null ? Math.round(candidate.confidence) : null,
      participationScore: candidate.patrolState === 'armed' ? 72 : 58,
      macroContext: candidate.summary,
      regimeClassification: candidate.patrolState,
      volatilityState: 'patrol-derived',
      liquidityContext: candidate.reasonForSkip,
      intendedStop: null,
      intendedTarget: null,
      intendedTargetPlan: 'Missed setup captured from live patrol rather than an executed trade.',
      thesisSnapshot: {
        summary: candidate.summary,
        lines: [candidate.summary, candidate.reasonForSkip],
      },
    },
    inTrade: {
      mfe: null,
      mae: null,
      liquiditySweepBeforeMove: null,
      displacementConfirmed: null,
      structureShiftAfterEntry: null,
      timeToReactionMinutes: null,
      timeToTargetMinutes: null,
      timeToStopMinutes: null,
    },
    exit: {
      exitType: 'n/a',
      actualExitPrices: [],
      exitEfficiency: null,
      priceExtendedBeyondExit: null,
      fullTpRealistic: null,
    },
    review: {
      setupQualityScore: candidate.confidence != null ? Math.round(candidate.confidence) : null,
      entryQualityScore: null,
      managementQualityScore: null,
      exitQualityScore: null,
      outcome: 'missed',
      analysisQualityScore: candidate.confidence != null ? Math.round(candidate.confidence) : null,
      primaryFailureMode: 'none',
      notes: note || candidate.reasonForSkip,
    },
  }));
}

function buildChartReviewLearningCase(input: {
  review: VaultumChartReviewResponse;
  market: string;
  timeframe: string;
  note?: string;
}): LearningCase {
  const now = new Date().toISOString();
  const bestEntry = Number(input.review.chartLogic.bestEntryPrice);
  const invalidation = Number(input.review.chartLogic.invalidation);
  const zone = parseNumericRange(input.review.chartLogic.zone);
  return finalizeAdaptiveLearningCase(finalizeLearningCase({
    id: `learning:chart-review:${now}:${Math.random().toString(36).slice(2, 8)}`,
    caseType: 'chart_review_example',
    source: 'chart-review',
    createdAt: now,
    updatedAt: now,
    market: normalizeMarket(input.market),
    primaryFocus: LEARNING_PRIMARY_MARKETS.includes(normalizeMarket(input.market) as (typeof LEARNING_PRIMARY_MARKETS)[number]),
    setupFamily: 'other',
    tags: ['chart-review', input.review.alignment, input.review.executionPhase],
    preTrade: {
      market: normalizeMarket(input.market),
      session: classifySession(now),
      tradeDate: now,
      timeframeStack: [input.timeframe],
      majorStructure: input.review.chartLogic.majorStructure,
      minorStructure: input.review.chartLogic.minorStructure,
      setupType: input.review.chartLogic.setupType === 'no-trade' ? 'other' : input.review.chartLogic.setupType,
      zone: { low: zone.low, high: zone.high, label: input.review.chartLogic.zoneLabel },
      chosenEntryLevel: Number.isFinite(bestEntry) ? bestEntry : null,
      precisionScore: input.review.thesisScore,
      participationScore: input.review.chartLogic.participation.state === 'confirmed' ? 76 : input.review.chartLogic.participation.state === 'building' ? 58 : 34,
      macroContext: input.review.knowledgeContext?.summary ?? input.review.chartReadSummary,
      regimeClassification: input.review.executionPhase,
      volatilityState: input.review.alignment,
      liquidityContext: input.review.chartLogic.keyEvents.join(' | '),
      intendedStop: Number.isFinite(invalidation) ? invalidation : null,
      intendedTarget: Number(Number(input.review.chartLogic.tp1)) || null,
      intendedTargetPlan: input.review.chartLogic.actionLines.join(' | '),
      thesisSnapshot: {
        summary: input.review.chartReadSummary,
        lines: [
          input.review.conclusion,
          ...input.review.chartLogic.actionLines.slice(0, 4),
          ...(input.review.knowledgeContext?.focusConcepts?.slice(0, 3) ?? []),
        ],
      },
    },
    inTrade: {
      mfe: null,
      mae: null,
      liquiditySweepBeforeMove: /sweep/.test(input.review.chartLogic.participation.liquidityInteraction.toLowerCase()) || null,
      displacementConfirmed: input.review.chartLogic.participation.state === 'confirmed' || /displacement/.test(input.review.chartLogic.participation.displacementReaction.toLowerCase()) || null,
      structureShiftAfterEntry: /shift/.test(input.review.chartLogic.participation.microStructureShift.toLowerCase()) || null,
      timeToReactionMinutes: null,
      timeToTargetMinutes: null,
      timeToStopMinutes: null,
    },
    exit: {
      exitType: 'n/a',
      actualExitPrices: [],
      exitEfficiency: null,
      priceExtendedBeyondExit: null,
      fullTpRealistic: null,
    },
    review: {
      setupQualityScore: input.review.thesisScore,
      entryQualityScore: input.review.thesisScore,
      managementQualityScore: null,
      exitQualityScore: null,
      outcome: 'open',
      analysisQualityScore: input.review.alignment === 'aligned' ? 78 : input.review.alignment === 'mixed' ? 60 : 38,
      primaryFailureMode: 'none',
      notes: [input.note, input.review.answer].filter(Boolean).join('\n'),
    },
  }));
}

async function upsertDerivedProposals(cases: LearningCase[], overrides: LearningOverrideProfile[]): Promise<LearningProposal[]> {
  const existing = await listLearningProposals();
  const merged = new Map(existing.map((item) => [item.id, item]));

  const markets = [...new Set(cases.map((item) => item.market).filter(Boolean))];
  markets.forEach((market) => {
    const override = buildOperatorAdaptiveProfile({
      market,
      cases,
      proposals: existing.filter((item) => item.market === market),
      override: overrides.find((item) => item.market === market) ?? defaultLearningOverrideProfile(market),
    });
    const proposals = buildAdaptiveProposals(cases, market, override);
    proposals.forEach((proposal) => {
      const previous = merged.get(proposal.id);
      merged.set(proposal.id, previous ? { ...proposal, state: previous.state, createdAt: previous.createdAt, updatedAt: new Date().toISOString() } : proposal);
    });
  });

  const values = [...merged.values()];
  await saveLearningProposals(values);
  return values;
}

async function ensureDefaultOverrides(markets: string[]): Promise<LearningOverrideProfile[]> {
  const existing = await listLearningOverrides();
  const merged = new Map(existing.map((item) => [item.market, item]));
  const required = [...new Set([...LEARNING_PRIMARY_MARKETS, ...markets.map(normalizeMarket)])];
  required.forEach((market) => {
    if (!merged.has(market)) merged.set(market, defaultLearningOverrideProfile(market));
  });
  const values = [...merged.values()];
  await saveLearningOverrides(values);
  return values;
}

async function buildLocalBundle(operatorId = DEFAULT_OPERATOR_ID): Promise<LearningSyncBundle> {
  const [cases, missedCandidates, overrides] = await Promise.all([
    listLearningCases(),
    listMissedSetupCandidates(),
    listLearningOverrides(),
  ]);
  const proposals = await upsertDerivedProposals(cases, overrides);
  return {
    operatorId,
    syncedAt: new Date().toISOString(),
    cases,
    missedCandidates,
    proposals,
    overrides,
  };
}

export async function ensureLearningMigration(): Promise<void> {
  const journalEntries = await loadTradeJournal();
  const existingCases = await listLearningCases();
  const existingBySource = new Set(existingCases.map((item) => item.sourceId).filter(Boolean));
  const additions = journalEntries
    .filter((entry) => !existingBySource.has(entry.id))
    .map((entry) => buildTradeLearningCase(entry));

  if (additions.length) {
    await saveLearningCases([...existingCases, ...additions]);
  }

  const cases = (additions.length ? [...existingCases, ...additions] : existingCases).map((item) => finalizeAdaptiveLearningCase(item));
  await saveLearningCases(cases);
  await ensureDefaultOverrides(cases.map((item) => item.market));
  await upsertDerivedProposals(cases, await listLearningOverrides());
}

export async function syncLearningBundle(operatorId = DEFAULT_OPERATOR_ID): Promise<LearningSyncBundle> {
  await ensureLearningMigration();
  const bundle = await buildLocalBundle(operatorId);
  await invokeVaultumRpc('analytics', 'sync_learning_cases', bundle as unknown as Record<string, unknown>);
  await saveLearningSyncMeta({
    operatorId,
    syncedAt: bundle.syncedAt,
    exportedAt: (await getLearningSyncMeta(operatorId))?.exportedAt ?? null,
    importedAt: (await getLearningSyncMeta(operatorId))?.importedAt ?? null,
  });
  return bundle;
}

export async function recordLearningCaseFromJournal(input: {
  entry: StoredTradeJournalEntry;
  entryMap?: EntryMapResponse | null;
  sync?: boolean;
}): Promise<LearningCase> {
  const learningCase = buildTradeLearningCase(input.entry, input.entryMap);
  await saveLearningCase(learningCase);
  await ensureDefaultOverrides([learningCase.market]);
  await upsertDerivedProposals(await listLearningCases(), await listLearningOverrides());
  if (input.sync !== false) {
    await syncLearningBundle();
  }
  return learningCase;
}

export async function recordChartReviewExample(input: {
  review: VaultumChartReviewResponse;
  market: string;
  timeframe: string;
  note?: string;
  sync?: boolean;
}): Promise<LearningCase> {
  const learningCase = buildChartReviewLearningCase(input);
  await saveLearningCase(learningCase);
  await ensureDefaultOverrides([learningCase.market]);
  await upsertDerivedProposals(await listLearningCases(), await listLearningOverrides());
  if (input.sync !== false) {
    await syncLearningBundle();
  }
  return learningCase;
}

export async function refreshMissedSetupCandidate(input: {
  patrol: SetupPatrolResponse | null;
  market: string;
  timeframe: string;
}): Promise<MissedSetupCandidate | null> {
  if (!input.patrol || input.patrol.patrolState !== 'armed') return null;
  const market = normalizeMarket(input.market);
  const cases = await listLearningCases();
  const recentMatch = cases.some((item) =>
    item.market === market
    && Math.abs(new Date(item.createdAt).getTime() - new Date(input.patrol!.generatedAt).getTime()) <= 6 * 60 * 60 * 1000
    && (item.caseType === 'trade' || item.caseType === 'skipped' || item.caseType === 'missed_setup'),
  );
  if (recentMatch) return null;

  const existing = await listMissedSetupCandidates();
  const openMatch = existing.find((item) =>
    item.market === market
    && item.verdict === 'pending'
    && item.zone === (input.patrol?.entryMap?.institutionalReferenceZone ?? input.patrol?.entryMap?.entryZone ?? 'n/a'),
  );
  if (openMatch) return openMatch;

  const entryMap = input.patrol.entryMap;
  const candidate: MissedSetupCandidate = {
    id: `missed:${market.toLowerCase()}:${Date.now().toString(36)}`,
    createdAt: input.patrol.generatedAt,
    updatedAt: new Date().toISOString(),
    market,
    timeframe: input.timeframe,
    patrolState: input.patrol.patrolState,
    summary: input.patrol.summary,
    reasonForSkip: input.patrol.whatIsMissing[0] ?? 'Live patrol marked this setup actionable, but it was not taken yet.',
    zoneLabel: entryMap?.institutionalReference ?? entryMap?.premiumDiscountState ?? 'structure-zone',
    zone: entryMap?.institutionalReferenceZone ?? entryMap?.entryZone ?? 'n/a',
    recommendedEntry: Number(entryMap?.preferredEntryLevel ?? '') || null,
    confidence: entryMap?.confidence ?? null,
    setupFamily: entryMap?.phase === 'reversal' ? 'reversal' : entryMap?.phase === 'continuation' ? 'continuation' : market === 'XAUUSD' ? 'gold-primary' : market === 'US30' ? 'us30-primary' : 'other',
    verdict: 'pending',
  };
  await saveMissedSetupCandidate(candidate);
  return candidate;
}

export async function confirmMissedSetupCandidate(candidateId: string, note = ''): Promise<LearningCase | null> {
  const candidates = await listMissedSetupCandidates();
  const candidate = candidates.find((item) => item.id === candidateId);
  if (!candidate) return null;
  const learningCase = buildMissedSetupLearningCase(candidate, note);
  await saveLearningCase(learningCase);
  await saveMissedSetupCandidate({
    ...candidate,
    updatedAt: new Date().toISOString(),
    verdict: 'confirmed',
    linkedCaseId: learningCase.id,
  });
  await ensureDefaultOverrides([learningCase.market]);
  await upsertDerivedProposals(await listLearningCases(), await listLearningOverrides());
  await syncLearningBundle();
  return learningCase;
}

export async function dismissMissedSetupCandidate(candidateId: string, reason = ''): Promise<MissedSetupCandidate | null> {
  const candidates = await listMissedSetupCandidates();
  const candidate = candidates.find((item) => item.id === candidateId);
  if (!candidate) return null;
  const updated: MissedSetupCandidate = {
    ...candidate,
    updatedAt: new Date().toISOString(),
    reasonForSkip: reason || candidate.reasonForSkip,
    verdict: 'dismissed',
  };
  await saveMissedSetupCandidate(updated);
  await syncLearningBundle();
  return updated;
}

export async function loadLearningDashboard(market = 'XAUUSD'): Promise<LearningDashboardResponse> {
  const normalizedMarket = normalizeMarket(market);
  await syncLearningBundle();
  const remote = await invokeVaultumRpc<LearningDashboardResponse>('analytics', 'get_learning_dashboard', {
    market: normalizedMarket,
    operatorId: DEFAULT_OPERATOR_ID,
  });
  if (remote) return remote;

  const bundle = await buildLocalBundle(DEFAULT_OPERATOR_ID);
  const override = buildOperatorAdaptiveProfile({
    market: normalizedMarket,
    cases: bundle.cases,
    proposals: bundle.proposals.filter((item) => item.market === normalizedMarket),
    override: bundle.overrides.find((item) => item.market === normalizedMarket) ?? defaultLearningOverrideProfile(normalizedMarket, bundle.proposals.filter((item) => item.market === normalizedMarket)),
  });
  return buildAdaptiveLearningDashboard({
    market: normalizedMarket,
    cases: bundle.cases,
    missedCandidates: bundle.missedCandidates,
    proposals: bundle.proposals,
    overrides: override,
  });
}

export async function loadLearningRecommendations(market = 'XAUUSD'): Promise<LearningRecommendationResponse> {
  const normalizedMarket = normalizeMarket(market);
  await syncLearningBundle();
  const remote = await invokeVaultumRpc<LearningRecommendationResponse>('analytics', 'get_learning_recommendations', {
    market: normalizedMarket,
    operatorId: DEFAULT_OPERATOR_ID,
  });
  if (remote) return remote;

  const bundle = await buildLocalBundle(DEFAULT_OPERATOR_ID);
  const override = buildOperatorAdaptiveProfile({
    market: normalizedMarket,
    cases: bundle.cases,
    proposals: bundle.proposals.filter((item) => item.market === normalizedMarket),
    override: bundle.overrides.find((item) => item.market === normalizedMarket) ?? defaultLearningOverrideProfile(normalizedMarket),
  });
  return buildAdaptiveRecommendationResponse({
    market: normalizedMarket,
    cases: bundle.cases,
    overrides: override,
    proposals: bundle.proposals.filter((item) => item.market === normalizedMarket),
  });
}

export async function loadDecisionConflicts(market = 'XAUUSD') {
  const normalizedMarket = normalizeMarket(market);
  await syncLearningBundle();
  const remote = await invokeVaultumRpc<any[]>('analytics', 'get_decision_conflicts', {
    market: normalizedMarket,
    operatorId: DEFAULT_OPERATOR_ID,
  });
  if (remote) return remote;
  return buildDecisionConflictCases((await buildLocalBundle(DEFAULT_OPERATOR_ID)).cases, normalizedMarket);
}

export async function loadEdgePressureDashboard(market = 'XAUUSD') {
  const normalizedMarket = normalizeMarket(market);
  await syncLearningBundle();
  const remote = await invokeVaultumRpc<any[]>('analytics', 'get_edge_pressure_dashboard', {
    market: normalizedMarket,
    operatorId: DEFAULT_OPERATOR_ID,
  });
  if (remote) return remote;
  return buildEdgePressureStats((await buildLocalBundle(DEFAULT_OPERATOR_ID)).cases, normalizedMarket);
}

export async function loadRegimePerformance(market = 'XAUUSD') {
  const normalizedMarket = normalizeMarket(market);
  await syncLearningBundle();
  const remote = await invokeVaultumRpc<any[]>('analytics', 'get_regime_performance', {
    market: normalizedMarket,
    operatorId: DEFAULT_OPERATOR_ID,
  });
  if (remote) return remote;
  return buildRegimePerformanceStats((await buildLocalBundle(DEFAULT_OPERATOR_ID)).cases, normalizedMarket);
}

export async function loadExecutionLeaks(market = 'XAUUSD') {
  const normalizedMarket = normalizeMarket(market);
  await syncLearningBundle();
  const remote = await invokeVaultumRpc<any[]>('analytics', 'get_execution_leaks', {
    market: normalizedMarket,
    operatorId: DEFAULT_OPERATOR_ID,
  });
  if (remote) return remote;
  return buildExecutionLeakStats((await buildLocalBundle(DEFAULT_OPERATOR_ID)).cases, normalizedMarket);
}

export async function loadOpportunityCost(market = 'XAUUSD') {
  const normalizedMarket = normalizeMarket(market);
  await syncLearningBundle();
  const remote = await invokeVaultumRpc<any[]>('analytics', 'get_opportunity_cost', {
    market: normalizedMarket,
    operatorId: DEFAULT_OPERATOR_ID,
  });
  if (remote) return remote;
  return buildOpportunityCostStats((await buildLocalBundle(DEFAULT_OPERATOR_ID)).cases, normalizedMarket);
}

export async function loadAdaptiveProposals(market = 'XAUUSD') {
  const normalizedMarket = normalizeMarket(market);
  await syncLearningBundle();
  const remote = await invokeVaultumRpc<LearningRecommendationResponse>('analytics', 'get_adaptive_proposals', {
    market: normalizedMarket,
    operatorId: DEFAULT_OPERATOR_ID,
  });
  if (remote) return remote;
  const bundle = await buildLocalBundle(DEFAULT_OPERATOR_ID);
  return buildAdaptiveRecommendationResponse({
    market: normalizedMarket,
    cases: bundle.cases,
    overrides: bundle.overrides.find((item) => item.market === normalizedMarket) ?? null,
    proposals: bundle.proposals.filter((item) => item.market === normalizedMarket),
  });
}

export async function loadOperatorAdaptiveProfile(market = 'XAUUSD') {
  const normalizedMarket = normalizeMarket(market);
  await syncLearningBundle();
  const remote = await invokeVaultumRpc<LearningOverrideProfile>('analytics', 'get_operator_adaptive_profile', {
    market: normalizedMarket,
    operatorId: DEFAULT_OPERATOR_ID,
  });
  if (remote) return remote;
  const bundle = await buildLocalBundle(DEFAULT_OPERATOR_ID);
  return buildOperatorAdaptiveProfile({
    market: normalizedMarket,
    cases: bundle.cases,
    proposals: bundle.proposals.filter((item) => item.market === normalizedMarket),
    override: bundle.overrides.find((item) => item.market === normalizedMarket) ?? null,
  });
}

export async function loadDoctrineTension(market = 'XAUUSD') {
  const normalizedMarket = normalizeMarket(market);
  const dashboard = await loadLearningDashboard(normalizedMarket);
  return dashboard.doctrineTension ?? buildDoctrineTensionFlags(dashboard.cases, normalizedMarket);
}

export async function updateLearningProposalState(input: {
  proposalId: string;
  state: LearningProposal['state'];
  market: string;
}): Promise<void> {
  const proposals = await listLearningProposals();
  const proposal = proposals.find((item) => item.id === input.proposalId);
  if (!proposal) return;

  const updatedProposal: LearningProposal = {
    ...proposal,
    state: input.state,
    updatedAt: new Date().toISOString(),
  };
  await saveLearningProposal(updatedProposal);

  const overrides = await listLearningOverrides();
  const market = normalizeMarket(input.market);
  const currentOverride = overrides.find((item) => item.market === market) ?? defaultLearningOverrideProfile(market);
  let nextOverride = { ...currentOverride, updatedAt: new Date().toISOString() };

  if (input.state === 'approved') {
    nextOverride = {
      ...nextOverride,
      approvedProposalIds: [...new Set([...nextOverride.approvedProposalIds, updatedProposal.id])],
    };
    const nextValue = updatedProposal.suggestedChange.to;
    switch (updatedProposal.category) {
      case 'precision-threshold':
        nextOverride.precisionThreshold = typeof nextValue === 'number' ? nextValue : nextOverride.precisionThreshold;
        break;
      case 'participation-threshold':
        nextOverride.participationThreshold = typeof nextValue === 'number' ? nextValue : nextOverride.participationThreshold;
        break;
      case 'allowed-sessions':
        nextOverride.allowedSessions = Array.isArray(nextValue) ? nextValue.map((item) => String(item)) : nextOverride.allowedSessions;
        break;
      case 'allowed-regimes':
        nextOverride.allowedRegimes = Array.isArray(nextValue) ? nextValue.map((item) => String(item)) : nextOverride.allowedRegimes;
        break;
      case 'tp-aggressiveness':
        nextOverride.tpAggressiveness = (typeof nextValue === 'string' ? nextValue : nextOverride.tpAggressiveness) as LearningOverrideProfile['tpAggressiveness'];
        break;
      case 'stop-buffer':
        nextOverride.stopBufferPct = typeof nextValue === 'number' ? nextValue : nextOverride.stopBufferPct;
        break;
      case 'minimum-structure-quality':
        nextOverride.minimumStructureQuality = typeof nextValue === 'number' ? nextValue : nextOverride.minimumStructureQuality;
        break;
    }
  }

  nextOverride = {
    ...nextOverride,
    auditTrail: [
      ...(nextOverride.auditTrail ?? []).filter((item) => item.proposalId !== updatedProposal.id),
      {
        proposalId: updatedProposal.id,
        category: updatedProposal.category,
        state: input.state,
        updatedAt: new Date().toISOString(),
      },
    ],
  };

  await saveLearningOverride(nextOverride);
  await invokeVaultumRpc('analytics', 'update_adaptive_proposal_state', {
    operatorId: DEFAULT_OPERATOR_ID,
    market,
    proposalId: updatedProposal.id,
    state: input.state,
  });
  await syncLearningBundle();
}

export async function exportLearningBundle(): Promise<LearningSyncBundle> {
  const bundle = await buildLocalBundle(DEFAULT_OPERATOR_ID);
  const meta = await getLearningSyncMeta(DEFAULT_OPERATOR_ID);
  await saveLearningSyncMeta({
    operatorId: DEFAULT_OPERATOR_ID,
    syncedAt: meta?.syncedAt ?? bundle.syncedAt,
    exportedAt: new Date().toISOString(),
    importedAt: meta?.importedAt ?? null,
  });
  return bundle;
}

export async function importLearningBundle(bundle: LearningSyncBundle): Promise<void> {
  const currentCases = await listLearningCases();
  const currentProposals = await listLearningProposals();
  const currentOverrides = await listLearningOverrides();
  const currentMissed = await listMissedSetupCandidates();

  const mergedCases = new Map(currentCases.map((item) => [item.id, item]));
  bundle.cases.forEach((item) => mergedCases.set(item.id, item));
  await saveLearningCases([...mergedCases.values()]);

  const mergedMissed = new Map(currentMissed.map((item) => [item.id, item]));
  bundle.missedCandidates.forEach((item) => mergedMissed.set(item.id, item));
  for (const item of mergedMissed.values()) {
    await saveMissedSetupCandidate(item);
  }

  const mergedProposals = new Map(currentProposals.map((item) => [item.id, item]));
  bundle.proposals.forEach((item) => mergedProposals.set(item.id, item));
  await saveLearningProposals([...mergedProposals.values()]);

  const mergedOverrides = new Map(currentOverrides.map((item) => [item.market, item]));
  bundle.overrides.forEach((item) => mergedOverrides.set(item.market, item));
  await saveLearningOverrides([...mergedOverrides.values()]);

  await saveLearningSyncMeta({
    operatorId: DEFAULT_OPERATOR_ID,
    syncedAt: bundle.syncedAt,
    exportedAt: (await getLearningSyncMeta(DEFAULT_OPERATOR_ID))?.exportedAt ?? null,
    importedAt: new Date().toISOString(),
  });
  await syncLearningBundle();
}
