export const LEARNING_PRIMARY_MARKETS = ['XAUUSD', 'US30'] as const;
export const LEARNING_PROPOSAL_SAMPLE_FLOOR = 4;

export type LearningCaseType = 'trade' | 'skipped' | 'missed_setup' | 'chart_review_example';
export type LearningOutcome = 'win' | 'loss' | 'flat' | 'open' | 'skipped' | 'missed';
export type SetupType = 'continuation' | 'reversal' | 'other';
export type LearningProposalCategory =
  | 'precision-threshold'
  | 'participation-threshold'
  | 'allowed-sessions'
  | 'allowed-regimes'
  | 'tp-aggressiveness'
  | 'stop-buffer'
  | 'minimum-structure-quality';
export type LearningProposalState = 'pending' | 'approved' | 'rejected';
export type SetupFamilyKey =
  | 'continuation'
  | 'reversal'
  | 'premium-sell'
  | 'discount-buy'
  | 'sweep-and-reclaim'
  | 'major-minor-structure'
  | 'session-london'
  | 'session-new-york'
  | 'session-asia'
  | 'gold-primary'
  | 'us30-primary'
  | 'fx-secondary'
  | 'other';
export type FailureModeKey =
  | 'entered-too-early'
  | 'poor-exact-price'
  | 'no-real-participation'
  | 'target-too-ambitious'
  | 'stop-inside-liquidity'
  | 'reversal-into-continuation'
  | 'continuation-into-exhaustion'
  | 'macro-regime-mismatch'
  | 'noisy-overlapping-structure'
  | 'managed-well'
  | 'none';
export type TpAggressiveness = 'conservative' | 'balanced' | 'aggressive';
export type AdaptiveRegimeTag = 'trending' | 'ranging' | 'volatile_expansion' | 'low_liquidity' | 'news_driven' | 'mixed_transition';
export type OperatorDecisionState = 'execute' | 'skip' | 'miss' | 'review_only';
export type VaultumRecommendationState = 'take' | 'wait' | 'skip';
export type ConflictType = 'both_right' | 'both_wrong' | 'operator_right_vaultum_wrong' | 'vaultum_right_operator_wrong';
export type ExecutionLeakType =
  | 'early_entry'
  | 'late_entry'
  | 'broad_zone_entry'
  | 'weak_participation'
  | 'stop_inside_liquidity'
  | 'target_too_ambitious'
  | 'premature_exit'
  | 'hesitation_skip';

export interface AdaptiveProposalEvidence {
  sampleCount: number;
  confidenceScore: number;
  expectedUpsidePct: number | null;
  evidenceSummary: string;
  supportingStats: string[];
}

export interface LearningCaseAdaptiveSnapshot {
  regimeTag: AdaptiveRegimeTag;
  operatorDecision: OperatorDecisionState;
  vaultumRecommendation: VaultumRecommendationState;
  executionLeakTags: ExecutionLeakType[];
  trueSetupEdge: number | null;
  executionLeakScore: number | null;
  netRealizedEdge: number | null;
}

export interface LearningCasePreTrade {
  market: string;
  session: string;
  tradeDate: string;
  timeframeStack: string[];
  majorStructure: string;
  minorStructure: string;
  setupType: SetupType;
  zone: { low: number | null; high: number | null; label: string };
  chosenEntryLevel: number | null;
  precisionScore: number | null;
  participationScore: number | null;
  macroContext: string;
  regimeClassification: string;
  volatilityState: string;
  liquidityContext: string;
  intendedStop: number | null;
  intendedTarget: number | null;
  intendedTargetPlan: string;
  thesisSnapshot: { summary: string; lines: string[] };
}

export interface LearningCaseInTrade {
  mfe: number | null;
  mae: number | null;
  liquiditySweepBeforeMove: boolean | null;
  displacementConfirmed: boolean | null;
  structureShiftAfterEntry: boolean | null;
  timeToReactionMinutes: number | null;
  timeToTargetMinutes: number | null;
  timeToStopMinutes: number | null;
}

export interface LearningCaseExit {
  exitType: 'tp_hit' | 'sl_hit' | 'partial' | 'manual_exit' | 'open' | 'n/a';
  actualExitPrices: number[];
  exitEfficiency: number | null;
  priceExtendedBeyondExit: boolean | null;
  fullTpRealistic: boolean | null;
}

export interface LearningCaseReview {
  setupQualityScore: number | null;
  entryQualityScore: number | null;
  managementQualityScore: number | null;
  exitQualityScore: number | null;
  outcome: LearningOutcome;
  analysisQualityScore: number | null;
  primaryFailureMode: FailureModeKey;
  notes: string;
}

export interface LearningCase {
  id: string;
  sourceId?: string;
  caseType: LearningCaseType;
  source: 'journal' | 'patrol' | 'chart-review' | 'import';
  createdAt: string;
  updatedAt: string;
  market: string;
  primaryFocus: boolean;
  setupFamily: SetupFamilyKey;
  tags: string[];
  preTrade: LearningCasePreTrade;
  inTrade: LearningCaseInTrade;
  exit: LearningCaseExit;
  review: LearningCaseReview;
  adaptive?: LearningCaseAdaptiveSnapshot | null;
}

export interface MissedSetupCandidate {
  id: string;
  createdAt: string;
  updatedAt: string;
  market: string;
  timeframe: string;
  patrolState: 'armed' | 'monitoring' | 'standby';
  summary: string;
  reasonForSkip: string;
  zoneLabel: string;
  zone: string;
  recommendedEntry: number | null;
  confidence: number | null;
  setupFamily: SetupFamilyKey;
  verdict: 'pending' | 'confirmed' | 'dismissed';
  linkedCaseId?: string;
}

export interface LearningProposal {
  id: string;
  market: string;
  createdAt: string;
  updatedAt: string;
  category: LearningProposalCategory;
  state: LearningProposalState;
  title: string;
  explanation: string;
  evidence: string[];
  suggestedChange: {
    key: string;
    from: number | string | string[] | null;
    to: number | string | string[] | null;
    bounded: boolean;
  };
  sampleCount?: number;
  confidenceScore?: number | null;
  expectedUpsidePct?: number | null;
  evidenceSummary?: string | null;
  adaptiveEvidence?: AdaptiveProposalEvidence | null;
}

export interface LearningOverrideProfile {
  market: string;
  updatedAt: string;
  precisionThreshold: number;
  participationThreshold: number;
  allowedSessions: string[];
  allowedRegimes: string[];
  tpAggressiveness: TpAggressiveness;
  stopBufferPct: number;
  minimumStructureQuality: number;
  approvedProposalIds: string[];
  preferredFamilies?: SetupFamilyKey[];
  avoidFamilies?: SetupFamilyKey[];
  doctrineUnderReview?: string[];
  adaptiveNotes?: string[];
  auditTrail?: Array<{
    proposalId: string;
    category: LearningProposalCategory;
    state: LearningProposalState;
    updatedAt: string;
  }>;
}

export type OperatorAdaptiveProfile = LearningOverrideProfile;

export interface SetupFamilyStats {
  family: SetupFamilyKey;
  sampleCount: number;
  winRate: number;
  expectancyR: number | null;
  avgSetupQuality: number | null;
  avgEntryQuality: number | null;
  avgManagementQuality: number | null;
  avgExitQuality: number | null;
  avgMAE: number | null;
  avgMFE: number | null;
  participationConfirmedWinRate: number;
  entryEfficiency: number | null;
  exitEfficiency: number | null;
}

export interface FailureModeStats {
  failureMode: FailureModeKey;
  sampleCount: number;
  lossRate: number;
  markets: string[];
  families: SetupFamilyKey[];
}

export interface LearningPerformanceSummary {
  totalCases: number;
  tradedCases: number;
  expectancyR: number | null;
  avgMAE: number | null;
  avgMFE: number | null;
  entryEfficiency: number | null;
  exitEfficiency: number | null;
  stopOutBeforeTargetRate: number;
  participationConfirmedWinRate: number;
  bySession: Array<{ session: string; sampleCount: number; expectancyR: number | null }>;
  byMarket: Array<{ market: string; sampleCount: number; expectancyR: number | null }>;
  continuationVsReversalByRegime: Array<{ regime: string; continuationExpectancyR: number | null; reversalExpectancyR: number | null }>;
}

export interface DecisionConflictCase {
  id: string;
  caseId: string;
  market: string;
  timestamp: string;
  regime: AdaptiveRegimeTag;
  setupFamily: SetupFamilyKey;
  operatorDecision: OperatorDecisionState;
  vaultumRecommendation: VaultumRecommendationState;
  actualOutcome: LearningOutcome;
  conflictType: ConflictType;
  trueSetupEdge: number | null;
  opportunityCostScore: number | null;
  explanation: string;
}

export interface EdgePressureStats {
  market: string;
  regime: AdaptiveRegimeTag | 'all';
  family: SetupFamilyKey;
  sampleCount: number;
  sampleConfidence: number;
  winRate: number;
  expectancyR: number | null;
  avgMFE: number | null;
  avgMAE: number | null;
  entryEfficiency: number | null;
  exitEfficiency: number | null;
  regimeConsistency: number;
  participationConfirmationRate: number;
  edgePressureScore: number;
  weakening: boolean;
}

export interface RegimePerformanceStats {
  market: string;
  regime: AdaptiveRegimeTag;
  sampleCount: number;
  tradeCount: number;
  operatorWinRate: number;
  vaultumTakeRate: number;
  vaultumTakeWinRate: number;
  avgTrueSetupEdge: number | null;
  avgExecutionLeakScore: number | null;
  avgNetRealizedEdge: number | null;
  dominantFamily: SetupFamilyKey | null;
  dominantLeak: ExecutionLeakType | null;
  opportunityCostScore: number | null;
}

export interface ExecutionLeakStats {
  market: string;
  leakType: ExecutionLeakType;
  sampleCount: number;
  avgTrueSetupEdge: number | null;
  avgExecutionLeakScore: number | null;
  avgNetRealizedEdge: number | null;
  impactedFamilies: SetupFamilyKey[];
  impactedRegimes: AdaptiveRegimeTag[];
  explanation: string;
}

export interface OpportunityCostStats {
  market: string;
  session: string;
  regime: AdaptiveRegimeTag;
  sampleCount: number;
  estimatedPotentialMFE: number | null;
  avgTrueSetupEdge: number | null;
  highEdgeMatchRate: number;
  opportunityCostScore: number;
  topFamilies: SetupFamilyKey[];
}

export interface DoctrineTensionFlag {
  id: string;
  market: string;
  doctrineSlice: string;
  assumption: string;
  sampleCount: number;
  confidenceScore: number;
  observedOutcome: string;
  expectedOutcome: string;
  tensionScore: number;
  status: 'stable' | 'under_review';
}

export interface LearningDashboardResponse {
  generatedAt: string;
  market: string;
  summary: string;
  cases: LearningCase[];
  missedCandidates: MissedSetupCandidate[];
  proposals: LearningProposal[];
  overrides: LearningOverrideProfile | null;
  familyStats: SetupFamilyStats[];
  failureModes: FailureModeStats[];
  performance: LearningPerformanceSummary;
  insights: string[];
  blindspots: string[];
  decisionConflicts?: DecisionConflictCase[];
  edgePressure?: EdgePressureStats[];
  regimePerformance?: RegimePerformanceStats[];
  executionLeaks?: ExecutionLeakStats[];
  opportunityCost?: OpportunityCostStats[];
  adaptiveProfile?: OperatorAdaptiveProfile | null;
  doctrineTension?: DoctrineTensionFlag[];
}

export interface LearningRecommendationResponse {
  generatedAt: string;
  market: string;
  summary: string;
  proposals: LearningProposal[];
  overrides: LearningOverrideProfile | null;
}

export interface LearningSyncBundle {
  operatorId: string;
  syncedAt: string;
  cases: LearningCase[];
  missedCandidates: MissedSetupCandidate[];
  proposals: LearningProposal[];
  overrides: LearningOverrideProfile[];
}

function average(values: Array<number | null | undefined>): number | null {
  const clean = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function round(value: number | null | undefined, digits = 1): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function pct(part: number, total: number): number {
  return total > 0 ? round((part / total) * 100, 1) ?? 0 : 0;
}

function bounded(current: number, delta: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, current + delta));
}

function toMarket(value: string): string {
  const market = String(value || 'XAUUSD').toUpperCase();
  if (market === 'GOLD') return 'XAUUSD';
  return market;
}

export function classifySession(dateLike: string): string {
  const hour = new Date(dateLike).getUTCHours();
  if (hour >= 7 && hour < 13) return 'london';
  if (hour >= 13 && hour < 21) return 'new-york';
  if (hour >= 0 && hour < 7) return 'asia';
  return 'off-session';
}

export function deriveSetupFamily(input: {
  market: string;
  setupType: SetupType;
  session: string;
  majorStructure: string;
  minorStructure: string;
  macroContext: string;
  liquiditySweepBeforeMove?: boolean | null;
  regimeClassification?: string;
  chosenEntryLevel?: number | null;
  zoneLow?: number | null;
  zoneHigh?: number | null;
}): SetupFamilyKey {
  const market = toMarket(input.market);
  const lowerMajor = input.majorStructure.toLowerCase();
  const lowerMinor = input.minorStructure.toLowerCase();
  const lowerMacro = input.macroContext.toLowerCase();
  if (market === 'XAUUSD') return 'gold-primary';
  if (market === 'US30') return 'us30-primary';
  if (['EURUSD', 'GBPUSD', 'USDJPY', 'GBPJPY'].includes(market)) return 'fx-secondary';
  if (input.setupType === 'continuation') return 'continuation';
  if (input.setupType === 'reversal') return 'reversal';
  if (input.liquiditySweepBeforeMove) return 'sweep-and-reclaim';
  if (/premium/.test(lowerMajor + lowerMinor)) return 'premium-sell';
  if (/discount/.test(lowerMajor + lowerMinor)) return 'discount-buy';
  if (/major/.test(lowerMajor) && /minor/.test(lowerMinor)) return 'major-minor-structure';
  if (/rates|yield|dxy|boj|boe|ecb|fed/.test(lowerMacro)) return 'fx-secondary';
  if (input.session === 'london') return 'session-london';
  if (input.session === 'new-york') return 'session-new-york';
  if (input.session === 'asia') return 'session-asia';
  return 'other';
}

export function deriveFailureMode(input: LearningCase): FailureModeKey {
  if (input.review.primaryFailureMode && input.review.primaryFailureMode !== 'none') return input.review.primaryFailureMode;
  const notes = `${input.review.notes} ${input.preTrade.macroContext} ${input.preTrade.liquidityContext}`.toLowerCase();
  if (input.review.outcome === 'win' && (input.review.entryQualityScore ?? 0) >= 65 && (input.review.managementQualityScore ?? 0) >= 65) return 'managed-well';
  if ((input.review.entryQualityScore ?? 100) < 45 && (input.preTrade.precisionScore ?? 100) < 45) return 'poor-exact-price';
  if ((input.preTrade.participationScore ?? 100) < 45 || notes.includes('no confirmation')) return 'no-real-participation';
  if ((input.exit.fullTpRealistic === false) || notes.includes('too ambitious')) return 'target-too-ambitious';
  if (notes.includes('inside liquidity') || notes.includes('tight stop')) return 'stop-inside-liquidity';
  if (input.preTrade.setupType === 'reversal' && /continuation|trend/.test(input.preTrade.regimeClassification.toLowerCase())) return 'reversal-into-continuation';
  if (input.preTrade.setupType === 'continuation' && /exhaust|transition|range/.test(input.preTrade.regimeClassification.toLowerCase())) return 'continuation-into-exhaustion';
  if (/macro/.test(notes) || /rates|yield|dxy|regime mismatch/.test(notes)) return 'macro-regime-mismatch';
  if (/overlap|noisy|unclear|chop/.test(notes)) return 'noisy-overlapping-structure';
  if (input.review.outcome === 'loss' && (input.preTrade.participationScore ?? 100) >= 60 && (input.review.entryQualityScore ?? 100) < 55) return 'entered-too-early';
  return 'none';
}

export function finalizeLearningCase(input: LearningCase): LearningCase {
  const market = toMarket(input.market);
  const session = input.preTrade.session || classifySession(input.createdAt);
  const family = input.setupFamily === 'other'
    ? deriveSetupFamily({
        market,
        setupType: input.preTrade.setupType,
        session,
        majorStructure: input.preTrade.majorStructure,
        minorStructure: input.preTrade.minorStructure,
        macroContext: input.preTrade.macroContext,
        liquiditySweepBeforeMove: input.inTrade.liquiditySweepBeforeMove,
        regimeClassification: input.preTrade.regimeClassification,
      })
    : input.setupFamily;

  const output: LearningCase = {
    ...input,
    market,
    primaryFocus: LEARNING_PRIMARY_MARKETS.includes(market as (typeof LEARNING_PRIMARY_MARKETS)[number]),
    setupFamily: family,
    tags: [...new Set([market.toLowerCase(), family, session, input.preTrade.setupType, input.review.outcome].filter(Boolean))],
    preTrade: {
      ...input.preTrade,
      market,
      session,
      precisionScore: round(input.preTrade.precisionScore ?? null, 0),
      participationScore: round(input.preTrade.participationScore ?? null, 0),
    },
    inTrade: { ...input.inTrade },
    exit: { ...input.exit },
    review: {
      ...input.review,
      setupQualityScore: round(input.review.setupQualityScore ?? null, 0),
      entryQualityScore: round(input.review.entryQualityScore ?? null, 0),
      managementQualityScore: round(input.review.managementQualityScore ?? null, 0),
      exitQualityScore: round(input.review.exitQualityScore ?? null, 0),
      analysisQualityScore: round(input.review.analysisQualityScore ?? null, 0),
      primaryFailureMode: input.review.primaryFailureMode === 'none' ? deriveFailureMode(input) : input.review.primaryFailureMode,
    },
  };

  return output;
}

function caseExpectancy(caseItem: LearningCase): number | null {
  return caseItem.caseType === 'trade' ? average([caseItem.inTrade.mfe, caseItem.inTrade.mae].map((value) => value != null ? value : null)) : null;
}

function rValue(caseItem: LearningCase): number | null {
  if (caseItem.review.outcome === 'win') return 1;
  if (caseItem.review.outcome === 'loss') return -1;
  if (caseItem.review.outcome === 'flat') return 0;
  return null;
}

function matchMarket(market: string, caseItem: { market: string }): boolean {
  return market === 'ALL' ? true : toMarket(caseItem.market) === toMarket(market);
}

function groupCasesBy<T extends string>(items: LearningCase[], pick: (item: LearningCase) => T): Map<T, LearningCase[]> {
  const map = new Map<T, LearningCase[]>();
  items.forEach((item) => {
    const key = pick(item);
    map.set(key, [...(map.get(key) ?? []), item]);
  });
  return map;
}

export function buildSetupFamilyStats(cases: LearningCase[], market = 'ALL'): SetupFamilyStats[] {
  const filtered = cases.filter((item) => matchMarket(market, item));
  return [...groupCasesBy(filtered, (item) => item.setupFamily).entries()].map(([family, items]) => {
    const winners = items.filter((item) => item.review.outcome === 'win');
    const confirmed = items.filter((item) => (item.preTrade.participationScore ?? 0) >= 60);
    return {
      family,
      sampleCount: items.length,
      winRate: pct(winners.length, items.length),
      expectancyR: round(average(items.map(rValue)), 2),
      avgSetupQuality: round(average(items.map((item) => item.review.setupQualityScore)), 1),
      avgEntryQuality: round(average(items.map((item) => item.review.entryQualityScore)), 1),
      avgManagementQuality: round(average(items.map((item) => item.review.managementQualityScore)), 1),
      avgExitQuality: round(average(items.map((item) => item.review.exitQualityScore)), 1),
      avgMAE: round(average(items.map((item) => item.inTrade.mae)), 2),
      avgMFE: round(average(items.map((item) => item.inTrade.mfe)), 2),
      participationConfirmedWinRate: pct(confirmed.filter((item) => item.review.outcome === 'win').length, confirmed.length),
      entryEfficiency: round(average(items.map((item) => item.review.entryQualityScore)), 1),
      exitEfficiency: round(average(items.map((item) => item.exit.exitEfficiency)), 1),
    };
  }).sort((left, right) => right.sampleCount - left.sampleCount || (right.expectancyR ?? -99) - (left.expectancyR ?? -99));
}

export function buildFailureModeStats(cases: LearningCase[], market = 'ALL'): FailureModeStats[] {
  const filtered = cases.filter((item) => matchMarket(market, item));
  return [...groupCasesBy(filtered, (item) => item.review.primaryFailureMode || deriveFailureMode(item)).entries()]
    .map(([failureMode, items]) => ({
      failureMode,
      sampleCount: items.length,
      lossRate: pct(items.filter((item) => item.review.outcome === 'loss').length, items.length),
      markets: [...new Set(items.map((item) => item.market))],
      families: [...new Set(items.map((item) => item.setupFamily))],
    }))
    .sort((left, right) => right.sampleCount - left.sampleCount);
}

export function buildLearningPerformanceSummary(cases: LearningCase[], market = 'ALL'): LearningPerformanceSummary {
  const filtered = cases.filter((item) => matchMarket(market, item));
  const trades = filtered.filter((item) => item.caseType === 'trade');
  const participationConfirmed = trades.filter((item) => (item.preTrade.participationScore ?? 0) >= 60);
  const bySession = [...groupCasesBy(trades, (item) => item.preTrade.session || 'unknown').entries()].map(([session, items]) => ({
    session,
    sampleCount: items.length,
    expectancyR: round(average(items.map(rValue)), 2),
  }));
  const byMarket = [...groupCasesBy(filtered, (item) => item.market).entries()].map(([marketKey, items]) => ({
    market: marketKey,
    sampleCount: items.length,
    expectancyR: round(average(items.map(rValue)), 2),
  }));
  const regimeMap = new Map<string, { continuation: number[]; reversal: number[] }>();
  trades.forEach((item) => {
    const regime = item.preTrade.regimeClassification || 'unknown';
    const bucket = regimeMap.get(regime) ?? { continuation: [], reversal: [] };
    if (item.preTrade.setupType === 'continuation') bucket.continuation.push(rValue(item) ?? 0);
    if (item.preTrade.setupType === 'reversal') bucket.reversal.push(rValue(item) ?? 0);
    regimeMap.set(regime, bucket);
  });

  return {
    totalCases: filtered.length,
    tradedCases: trades.length,
    expectancyR: round(average(trades.map(rValue)), 2),
    avgMAE: round(average(trades.map((item) => item.inTrade.mae)), 2),
    avgMFE: round(average(trades.map((item) => item.inTrade.mfe)), 2),
    entryEfficiency: round(average(trades.map((item) => item.review.entryQualityScore)), 1),
    exitEfficiency: round(average(trades.map((item) => item.exit.exitEfficiency)), 1),
    stopOutBeforeTargetRate: pct(trades.filter((item) => item.exit.exitType === 'sl_hit' && item.exit.priceExtendedBeyondExit).length, trades.length),
    participationConfirmedWinRate: pct(participationConfirmed.filter((item) => item.review.outcome === 'win').length, participationConfirmed.length),
    bySession,
    byMarket,
    continuationVsReversalByRegime: [...regimeMap.entries()].map(([regime, values]) => ({
      regime,
      continuationExpectancyR: round(average(values.continuation), 2),
      reversalExpectancyR: round(average(values.reversal), 2),
    })),
  };
}

export function defaultLearningOverrideProfile(market: string, proposals: LearningProposal[] = []): LearningOverrideProfile {
  return {
    market: toMarket(market),
    updatedAt: new Date().toISOString(),
    precisionThreshold: 60,
    participationThreshold: 60,
    allowedSessions: ['london', 'new-york', 'asia'],
    allowedRegimes: ['trend', 'range', 'transition'],
    tpAggressiveness: 'balanced',
    stopBufferPct: 0.1,
    minimumStructureQuality: 55,
    approvedProposalIds: proposals.filter((item) => item.state === 'approved').map((item) => item.id),
  };
}

function proposal(idBase: string, market: string, category: LearningProposalCategory, title: string, explanation: string, evidence: string[], from: any, to: any): LearningProposal {
  const now = new Date().toISOString();
  return {
    id: `${idBase}:${market.toLowerCase()}`,
    market: toMarket(market),
    createdAt: now,
    updatedAt: now,
    category,
    state: 'pending',
    title,
    explanation,
    evidence,
    suggestedChange: { key: category, from, to, bounded: true },
  };
}

export function buildLearningProposals(cases: LearningCase[], market = 'ALL', existingOverride?: LearningOverrideProfile | null): LearningProposal[] {
  const filtered = cases.filter((item) => matchMarket(market, item));
  const trades = filtered.filter((item) => item.caseType === 'trade');
  const families = buildSetupFamilyStats(filtered, market);
  const failures = buildFailureModeStats(filtered, market);
  const overrides = existingOverride ?? defaultLearningOverrideProfile(market);
  const proposals: LearningProposal[] = [];
  if (trades.length < LEARNING_PROPOSAL_SAMPLE_FLOOR) return proposals;

  const early = failures.find((item) => item.failureMode === 'entered-too-early');
  if ((early?.sampleCount ?? 0) >= LEARNING_PROPOSAL_SAMPLE_FLOOR) {
    proposals.push(proposal(
      'precision-threshold',
      market,
      'precision-threshold',
      'Raise the precision threshold slightly',
      'First-touch or early-inside-zone entries are repeating often enough to justify a tighter precision gate.',
      [`Failure frequency: entered-too-early ${early?.sampleCount}.`, `Current threshold ${overrides.precisionThreshold}.`],
      overrides.precisionThreshold,
      bounded(overrides.precisionThreshold, 5, 55, 85),
    ));
  }

  const noParticipation = failures.find((item) => item.failureMode === 'no-real-participation');
  if ((noParticipation?.sampleCount ?? 0) >= LEARNING_PROPOSAL_SAMPLE_FLOOR) {
    proposals.push(proposal(
      'participation-threshold',
      market,
      'participation-threshold',
      'Raise the participation threshold slightly',
      'Too many setups are being evaluated without real reaction or confirmation.',
      [`Failure frequency: no-real-participation ${noParticipation?.sampleCount}.`, `Current threshold ${overrides.participationThreshold}.`],
      overrides.participationThreshold,
      bounded(overrides.participationThreshold, 5, 55, 85),
    ));
  }

  const targetTooAmbitious = failures.find((item) => item.failureMode === 'target-too-ambitious');
  if ((targetTooAmbitious?.sampleCount ?? 0) >= LEARNING_PROPOSAL_SAMPLE_FLOOR && overrides.tpAggressiveness !== 'conservative') {
    proposals.push(proposal(
      'tp-aggressiveness',
      market,
      'tp-aggressiveness',
      'Reduce TP aggressiveness one step',
      'Exits are asking for too much extension relative to what the market is actually giving.',
      [`Failure frequency: target-too-ambitious ${targetTooAmbitious?.sampleCount}.`, `Current TP mode ${overrides.tpAggressiveness}.`],
      overrides.tpAggressiveness,
      overrides.tpAggressiveness === 'aggressive' ? 'balanced' : 'conservative',
    ));
  }

  const stopInside = failures.find((item) => item.failureMode === 'stop-inside-liquidity');
  if ((stopInside?.sampleCount ?? 0) >= LEARNING_PROPOSAL_SAMPLE_FLOOR) {
    proposals.push(proposal(
      'stop-buffer',
      market,
      'stop-buffer',
      'Widen the stop buffer slightly',
      'Stops are getting tagged inside obvious liquidity too often to ignore.',
      [`Failure frequency: stop-inside-liquidity ${stopInside?.sampleCount}.`, `Current stop buffer ${overrides.stopBufferPct}%.`],
      overrides.stopBufferPct,
      round(bounded(overrides.stopBufferPct, 0.05, 0.05, 0.4), 2),
    ));
  }

  const noisy = failures.find((item) => item.failureMode === 'noisy-overlapping-structure');
  if ((noisy?.sampleCount ?? 0) >= LEARNING_PROPOSAL_SAMPLE_FLOOR) {
    proposals.push(proposal(
      'minimum-structure-quality',
      market,
      'minimum-structure-quality',
      'Raise the minimum structure quality slightly',
      'Overlapping or noisy structure is creating too many low-quality cases.',
      [`Failure frequency: noisy-overlapping-structure ${noisy?.sampleCount}.`, `Current minimum structure quality ${overrides.minimumStructureQuality}.`],
      overrides.minimumStructureQuality,
      bounded(overrides.minimumStructureQuality, 5, 50, 85),
    ));
  }

  const continuation = families.find((item) => item.family === 'continuation');
  const reversal = families.find((item) => item.family === 'reversal');
  if ((continuation?.sampleCount ?? 0) >= LEARNING_PROPOSAL_SAMPLE_FLOOR && (reversal?.sampleCount ?? 0) >= LEARNING_PROPOSAL_SAMPLE_FLOOR && (continuation?.expectancyR ?? -99) > ((reversal?.expectancyR ?? -99) + 0.35)) {
    proposals.push(proposal(
      'allowed-regimes',
      market,
      'allowed-regimes',
      'Tighten reversal permissions in trend-heavy regimes',
      'Continuation setups are materially outperforming reversal attempts in the current sample.',
      [`Continuation expectancy ${continuation?.expectancyR}.`, `Reversal expectancy ${reversal?.expectancyR}.`],
      overrides.allowedRegimes,
      [...new Set([...overrides.allowedRegimes, 'trend'])],
    ));
  }

  const sessionMap = buildLearningPerformanceSummary(filtered, market).bySession;
  const bestSession = sessionMap.sort((left, right) => (right.expectancyR ?? -99) - (left.expectancyR ?? -99))[0];
  if (bestSession && bestSession.sampleCount >= LEARNING_PROPOSAL_SAMPLE_FLOOR && !overrides.allowedSessions.includes(bestSession.session)) {
    proposals.push(proposal(
      'allowed-sessions',
      market,
      'allowed-sessions',
      'Allow only the cleaner session window by default',
      'One session is producing clearly cleaner expectancy than the rest of the sample.',
      [`Best session ${bestSession.session} expectancy ${bestSession.expectancyR}.`],
      overrides.allowedSessions,
      [...new Set([...overrides.allowedSessions, bestSession.session])],
    ));
  }

  return proposals;
}

export function buildLearningDashboard(input: {
  market?: string;
  cases: LearningCase[];
  missedCandidates?: MissedSetupCandidate[];
  proposals?: LearningProposal[];
  overrides?: LearningOverrideProfile | null;
}): LearningDashboardResponse {
  const market = toMarket(input.market || 'ALL');
  const cases = input.cases.map(finalizeLearningCase).filter((item) => matchMarket(market, item));
  const missedCandidates = (input.missedCandidates ?? []).filter((item) => matchMarket(market, item));
  const overrides = input.overrides ?? defaultLearningOverrideProfile(market, input.proposals);
  const proposals = (input.proposals?.length ? input.proposals : buildLearningProposals(cases, market, overrides))
    .filter((item) => matchMarket(market, item));
  const familyStats = buildSetupFamilyStats(cases, market);
  const failureModes = buildFailureModeStats(cases, market);
  const performance = buildLearningPerformanceSummary(cases, market);
  const bestFamily = familyStats[0];
  const worstFailure = failureModes.find((item) => item.failureMode !== 'managed-well' && item.failureMode !== 'none');
  const insights = [
    bestFamily ? `${bestFamily.family} setups are currently the cleanest family with expectancy ${bestFamily.expectancyR ?? 'n/a'}R across ${bestFamily.sampleCount} cases.` : 'Not enough data to identify the cleanest setup family yet.',
    performance.participationConfirmedWinRate > 0 ? `Participation-confirmed cases are winning ${performance.participationConfirmedWinRate}% of the time.` : 'Participation-confirmed cases do not yet have enough sample depth.',
    worstFailure ? `${worstFailure.failureMode} is the most repeated drag with ${worstFailure.sampleCount} tagged cases.` : 'No dominant failure mode has emerged yet.',
  ];
  const blindspots = [
    cases.length < LEARNING_PROPOSAL_SAMPLE_FLOOR ? 'Sample size is still thin, so no live logic change should be inferred from these cases yet.' : null,
    missedCandidates.filter((item) => item.verdict === 'pending').length ? 'There are pending missed-setup candidates that still need operator confirmation before they become learning truth.' : null,
    proposals.some((item) => item.state === 'pending') ? 'Pending proposals exist, but live logic stays unchanged until they are explicitly approved.' : null,
  ].filter((value): value is string => Boolean(value));

  return {
    generatedAt: new Date().toISOString(),
    market,
    summary: `${market} learning loop has ${cases.length} structured cases, ${missedCandidates.length} missed candidates, and ${proposals.length} controlled adjustment proposals.`,
    cases,
    missedCandidates,
    proposals,
    overrides,
    familyStats,
    failureModes,
    performance,
    insights,
    blindspots,
  };
}

export function buildLearningRecommendationResponse(input: {
  market?: string;
  cases: LearningCase[];
  overrides?: LearningOverrideProfile | null;
  proposals?: LearningProposal[];
}): LearningRecommendationResponse {
  const market = toMarket(input.market || 'ALL');
  const overrides = input.overrides ?? defaultLearningOverrideProfile(market);
  const proposals = input.proposals?.length ? input.proposals : buildLearningProposals(input.cases, market, overrides);
  return {
    generatedAt: new Date().toISOString(),
    market,
    summary: proposals.length
      ? `${market} learning engine generated ${proposals.length} bounded adjustment proposals.`
      : `${market} learning engine does not have enough stable evidence for a bounded adjustment yet.`,
    proposals,
    overrides,
  };
}
