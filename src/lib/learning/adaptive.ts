import {
  LEARNING_PROPOSAL_SAMPLE_FLOOR,
  buildLearningDashboard,
  buildLearningPerformanceSummary,
  buildLearningProposals,
  defaultLearningOverrideProfile,
  finalizeLearningCase,
  type AdaptiveProposalEvidence,
  type AdaptiveRegimeTag,
  type ConflictType,
  type DecisionConflictCase,
  type DoctrineTensionFlag,
  type EdgePressureStats,
  type ExecutionLeakStats,
  type ExecutionLeakType,
  type LearningCase,
  type LearningDashboardResponse,
  type LearningOverrideProfile,
  type LearningProposal,
  type LearningRecommendationResponse,
  type MissedSetupCandidate,
  type OperatorAdaptiveProfile,
  type OperatorDecisionState,
  type OpportunityCostStats,
  type RegimePerformanceStats,
  type SetupFamilyKey,
  type VaultumRecommendationState,
} from './engine.ts';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number | null | undefined, digits = 1): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function average(values: Array<number | null | undefined>): number | null {
  const clean = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function pct(part: number, total: number): number {
  return total > 0 ? round((part / total) * 100, 1) ?? 0 : 0;
}

function normalizeMarket(value: string): string {
  const market = String(value || 'XAUUSD').trim().toUpperCase();
  if (market === 'GOLD') return 'XAUUSD';
  return market || 'XAUUSD';
}

function matchMarket(market: string, caseItem: { market: string }): boolean {
  return market === 'ALL' ? true : normalizeMarket(caseItem.market) === normalizeMarket(market);
}

function rValue(caseItem: LearningCase): number | null {
  if (caseItem.review.outcome === 'win') return 1;
  if (caseItem.review.outcome === 'loss') return -1;
  if (caseItem.review.outcome === 'flat') return 0;
  return null;
}

function groupBy<T>(items: LearningCase[], pick: (item: LearningCase) => T): Map<T, LearningCase[]> {
  const map = new Map<T, LearningCase[]>();
  items.forEach((item) => {
    const key = pick(item);
    map.set(key, [...(map.get(key) ?? []), item]);
  });
  return map;
}

function normalizeRegimeTag(caseItem: LearningCase): AdaptiveRegimeTag {
  const text = [
    caseItem.preTrade.regimeClassification,
    caseItem.preTrade.volatilityState,
    caseItem.preTrade.liquidityContext,
    caseItem.preTrade.macroContext,
    caseItem.review.notes,
  ].join(' ').toLowerCase();

  if (/(news|headline|event|fomc|cpi|nfp|powell|lagarde|tariff|sanction|war|missile|ceasefire|tweet|x post)/.test(text)) return 'news_driven';
  if (/(volatile|expansion|expanded|shock|panic|squeeze|impulse expansion)/.test(text)) return 'volatile_expansion';
  if (/(low liquidity|thin|holiday|illiquid|off-session|asia drift)/.test(text)) return 'low_liquidity';
  if (/(range|ranging|balance|mean reversion|auction)/.test(text)) return 'ranging';
  if (/(transition|mixed|reversal|unclear|change of character)/.test(text)) return 'mixed_transition';
  return 'trending';
}

function inferOperatorDecision(caseItem: LearningCase): OperatorDecisionState {
  if (caseItem.caseType === 'trade') return 'execute';
  if (caseItem.caseType === 'skipped') return 'skip';
  if (caseItem.caseType === 'missed_setup') return 'miss';
  return 'review_only';
}

function inferVaultumRecommendation(caseItem: LearningCase): VaultumRecommendationState {
  const text = [
    caseItem.preTrade.thesisSnapshot.summary,
    caseItem.preTrade.thesisSnapshot.lines.join(' '),
    caseItem.review.notes,
  ].join(' ').toLowerCase();
  const setup = caseItem.review.setupQualityScore ?? 55;
  const analysis = caseItem.review.analysisQualityScore ?? setup;
  const precision = caseItem.preTrade.precisionScore ?? 55;
  const participation = caseItem.preTrade.participationScore ?? 55;

  if (/no trade|stand aside|skip|invalidated|avoid/.test(text) || setup < 48 || analysis < 48) return 'skip';
  if (setup >= 62 && analysis >= 60 && precision >= 60 && participation >= 58) return 'take';
  return 'wait';
}

function inferExecutionLeakTags(caseItem: LearningCase): ExecutionLeakType[] {
  const tags = new Set<ExecutionLeakType>();
  const notes = caseItem.review.notes.toLowerCase();
  const failure = caseItem.review.primaryFailureMode;

  if (failure === 'entered-too-early' || /early entry|first touch/.test(notes)) tags.add('early_entry');
  if (/late entry|chase|entered late/.test(notes)) tags.add('late_entry');
  if (failure === 'poor-exact-price' || (caseItem.preTrade.precisionScore ?? 100) < 45) tags.add('broad_zone_entry');
  if (failure === 'no-real-participation' || (caseItem.preTrade.participationScore ?? 100) < 50) tags.add('weak_participation');
  if (failure === 'stop-inside-liquidity') tags.add('stop_inside_liquidity');
  if (failure === 'target-too-ambitious') tags.add('target_too_ambitious');
  if ((caseItem.exit.priceExtendedBeyondExit && (caseItem.exit.exitEfficiency ?? 100) < 55) || /took profit too early|cut early|premature exit/.test(notes)) tags.add('premature_exit');
  if ((caseItem.caseType === 'skipped' || caseItem.caseType === 'missed_setup') && (caseItem.review.setupQualityScore ?? 0) >= 65) tags.add('hesitation_skip');

  return [...tags];
}

function estimateTrueSetupEdge(caseItem: LearningCase): number {
  const setup = caseItem.review.setupQualityScore ?? 55;
  const analysis = caseItem.review.analysisQualityScore ?? setup;
  const precision = caseItem.preTrade.precisionScore ?? 55;
  const participation = caseItem.preTrade.participationScore ?? 55;
  const directionBonus = caseItem.primaryFocus ? 4 : 0;
  return clamp(Math.round((setup * 0.36) + (analysis * 0.24) + (precision * 0.18) + (participation * 0.22) + directionBonus), 0, 100);
}

function estimateExecutionLeakScore(caseItem: LearningCase, leakTags: ExecutionLeakType[]): number {
  const entryLeak = 100 - (caseItem.review.entryQualityScore ?? 55);
  const managementLeak = 100 - (caseItem.review.managementQualityScore ?? 55);
  const exitLeak = 100 - (caseItem.review.exitQualityScore ?? 55);
  const penalty = leakTags.length * 6;
  return clamp(Math.round((entryLeak * 0.42) + (managementLeak * 0.33) + (exitLeak * 0.25) + penalty), 0, 100);
}

function estimateNetRealizedEdge(caseItem: LearningCase, trueSetupEdge: number, executionLeakScore: number): number {
  const outcomeScore =
    caseItem.review.outcome === 'win' ? 88
      : caseItem.review.outcome === 'loss' ? 18
        : caseItem.review.outcome === 'flat' ? 50
          : caseItem.review.outcome === 'open' ? 54
            : caseItem.review.outcome === 'skipped' || caseItem.review.outcome === 'missed' ? 42
              : 50;
  return clamp(Math.round((trueSetupEdge * 0.58) - (executionLeakScore * 0.34) + (outcomeScore - 50)), 0, 100);
}

export function finalizeAdaptiveLearningCase(caseItem: LearningCase): LearningCase {
  const finalized = finalizeLearningCase(caseItem);
  const regimeTag = normalizeRegimeTag(finalized);
  const operatorDecision = inferOperatorDecision(finalized);
  const vaultumRecommendation = inferVaultumRecommendation(finalized);
  const executionLeakTags = inferExecutionLeakTags(finalized);
  const trueSetupEdge = estimateTrueSetupEdge(finalized);
  const executionLeakScore = estimateExecutionLeakScore(finalized, executionLeakTags);
  const netRealizedEdge = estimateNetRealizedEdge(finalized, trueSetupEdge, executionLeakScore);

  return {
    ...finalized,
    adaptive: {
      regimeTag,
      operatorDecision,
      vaultumRecommendation,
      executionLeakTags,
      trueSetupEdge,
      executionLeakScore,
      netRealizedEdge,
    },
  };
}

function normalizeCases(cases: LearningCase[], market = 'ALL'): LearningCase[] {
  return cases
    .map((item) => finalizeAdaptiveLearningCase(item))
    .filter((item) => matchMarket(market, item));
}

function buildFamilyMfeLookup(cases: LearningCase[]): Map<string, number> {
  const lookup = new Map<string, number>();
  const traded = cases.filter((item) => item.caseType === 'trade');
  const register = (key: string, items: LearningCase[]) => {
    const avg = average(items.map((item) => item.inTrade.mfe));
    if (avg != null) lookup.set(key, avg);
  };

  for (const [key, items] of groupBy(traded, (item) => `${item.market}|${item.setupFamily}|${item.adaptive?.regimeTag ?? normalizeRegimeTag(item)}`).entries()) register(key, items);
  for (const [key, items] of groupBy(traded, (item) => `${item.market}|${item.setupFamily}`).entries()) register(key, items);
  for (const [key, items] of groupBy(traded, (item) => item.setupFamily).entries()) register(String(key), items);
  return lookup;
}

function opportunityForCase(caseItem: LearningCase, edgePressure: EdgePressureStats[], mfeLookup: Map<string, number>): { potentialMFE: number | null; score: number; highEdgeMatch: boolean } {
  const normalized = finalizeAdaptiveLearningCase(caseItem);
  const regime = normalized.adaptive?.regimeTag ?? normalizeRegimeTag(normalized);
  const familyKey = `${normalized.market}|${normalized.setupFamily}|${regime}`;
  const marketFamilyKey = `${normalized.market}|${normalized.setupFamily}`;
  const potentialMFE =
    mfeLookup.get(familyKey)
    ?? mfeLookup.get(marketFamilyKey)
    ?? mfeLookup.get(normalized.setupFamily)
    ?? round((normalized.adaptive?.trueSetupEdge ?? estimateTrueSetupEdge(normalized)) / 52, 2);
  const pressure = edgePressure.find((item) => item.market === normalized.market && item.family === normalized.setupFamily && item.regime === regime)
    ?? edgePressure.find((item) => item.market === normalized.market && item.family === normalized.setupFamily && item.regime === 'all');
  const highEdgeMatch = (pressure?.edgePressureScore ?? 0) >= 68;
  const score = clamp(Math.round(((potentialMFE ?? 0) * 34) + (((normalized.adaptive?.trueSetupEdge ?? 55) - 50) * 0.7) + (highEdgeMatch ? 12 : 0)), 0, 100);
  return { potentialMFE: round(potentialMFE, 2), score, highEdgeMatch };
}

export function buildEdgePressureStats(cases: LearningCase[], market = 'ALL'): EdgePressureStats[] {
  const normalized = normalizeCases(cases, market);
  const outputs: EdgePressureStats[] = [];
  const families = [...new Set(normalized.map((item) => item.setupFamily))];

  const buildStat = (family: SetupFamilyKey, regime: AdaptiveRegimeTag | 'all', items: LearningCase[]): EdgePressureStats => {
    const trades = items.filter((item) => item.caseType === 'trade');
    const winRate = pct(trades.filter((item) => item.review.outcome === 'win').length, trades.length || items.length);
    const expectancyR = round(average(trades.map(rValue)), 2);
    const avgMFE = round(average(trades.map((item) => item.inTrade.mfe)), 2);
    const avgMAE = round(average(trades.map((item) => item.inTrade.mae)), 2);
    const entryEfficiency = round(average(items.map((item) => item.review.entryQualityScore)), 1);
    const exitEfficiency = round(average(items.map((item) => item.exit.exitEfficiency)), 1);
    const sampleConfidence = clamp(Math.round((items.length / 12) * 100), 0, 100);
    const confirmed = items.filter((item) => (item.preTrade.participationScore ?? 0) >= 60);
    const participationConfirmationRate = pct(confirmed.length, items.length);
    const regimeConsistency = regime === 'all'
      ? clamp(Math.round((new Set(items.map((item) => item.adaptive?.regimeTag ?? normalizeRegimeTag(item))).size / 4) * 100), 35, 100)
      : ((expectancyR ?? -1) >= 0 ? 76 : 42);
    const expectancyScore = clamp(Math.round((((expectancyR ?? 0) + 1.5) / 3) * 100), 0, 100);
    const mfeScore = clamp(Math.round((avgMFE ?? 0) * 32), 0, 100);
    const maeScore = clamp(100 - Math.round(Math.abs(avgMAE ?? 0) * 40), 0, 100);
    const edgePressureScore = clamp(Math.round(
      (expectancyScore * 0.22)
      + (winRate * 0.16)
      + (mfeScore * 0.11)
      + (maeScore * 0.08)
      + ((entryEfficiency ?? 55) * 0.12)
      + ((exitEfficiency ?? 55) * 0.08)
      + (regimeConsistency * 0.09)
      + (sampleConfidence * 0.08)
      + (participationConfirmationRate * 0.06),
    ), 0, 100);

    return {
      market: items[0]?.market ?? normalizeMarket(market),
      regime,
      family,
      sampleCount: items.length,
      sampleConfidence,
      winRate,
      expectancyR,
      avgMFE,
      avgMAE,
      entryEfficiency,
      exitEfficiency,
      regimeConsistency,
      participationConfirmationRate,
      edgePressureScore,
      weakening: sampleConfidence >= 45 && edgePressureScore < 52,
    };
  };

  families.forEach((family) => {
    const familyItems = normalized.filter((item) => item.setupFamily === family);
    if (!familyItems.length) return;
    outputs.push(buildStat(family, 'all', familyItems));
    const regimes = [...new Set(familyItems.map((item) => item.adaptive?.regimeTag ?? normalizeRegimeTag(item)))];
    regimes.forEach((regime) => {
      const items = familyItems.filter((item) => (item.adaptive?.regimeTag ?? normalizeRegimeTag(item)) === regime);
      outputs.push(buildStat(family, regime, items));
    });
  });

  return outputs.sort((left, right) => right.edgePressureScore - left.edgePressureScore || right.sampleCount - left.sampleCount);
}

export function buildOpportunityCostStats(cases: LearningCase[], market = 'ALL'): OpportunityCostStats[] {
  const normalized = normalizeCases(cases, market);
  const edgePressure = buildEdgePressureStats(normalized, market);
  const mfeLookup = buildFamilyMfeLookup(normalized);
  const skippedCases = normalized.filter((item) => item.caseType === 'skipped' || item.caseType === 'missed_setup');

  const grouped = new Map<string, Array<{ caseItem: LearningCase; score: number; potentialMFE: number | null; highEdgeMatch: boolean }>>();
  skippedCases.forEach((caseItem) => {
    const regime = caseItem.adaptive?.regimeTag ?? normalizeRegimeTag(caseItem);
    const opportunity = opportunityForCase(caseItem, edgePressure, mfeLookup);
    const key = `${caseItem.market}|${caseItem.preTrade.session}|${regime}`;
    grouped.set(key, [...(grouped.get(key) ?? []), { caseItem, ...opportunity }]);
  });

  return [...grouped.entries()].map(([key, items]) => {
    const [bucketMarket, session, regime] = key.split('|');
    return {
      market: bucketMarket,
      session,
      regime: regime as AdaptiveRegimeTag,
      sampleCount: items.length,
      estimatedPotentialMFE: round(average(items.map((item) => item.potentialMFE)), 2),
      avgTrueSetupEdge: round(average(items.map((item) => item.caseItem.adaptive?.trueSetupEdge)), 1),
      highEdgeMatchRate: pct(items.filter((item) => item.highEdgeMatch).length, items.length),
      opportunityCostScore: round(average(items.map((item) => item.score)), 1) ?? 0,
      topFamilies: [...new Set(items.map((item) => item.caseItem.setupFamily))].slice(0, 3),
    };
  }).sort((left, right) => right.opportunityCostScore - left.opportunityCostScore);
}

export function buildDecisionConflictCases(cases: LearningCase[], market = 'ALL'): DecisionConflictCase[] {
  const normalized = normalizeCases(cases, market);
  const edgePressure = buildEdgePressureStats(normalized, market);
  const mfeLookup = buildFamilyMfeLookup(normalized);

  return normalized
    .filter((item) => item.adaptive?.operatorDecision !== 'review_only')
    .map((caseItem) => {
      const adaptive = caseItem.adaptive ?? finalizeAdaptiveLearningCase(caseItem).adaptive!;
      const opportunity = opportunityForCase(caseItem, edgePressure, mfeLookup);
      const operatorPositive = adaptive.operatorDecision === 'execute'
        ? caseItem.review.outcome === 'win'
        : opportunity.score < 58;
      const vaultumPositive = adaptive.vaultumRecommendation === 'take'
        ? (caseItem.review.outcome === 'win' || opportunity.score >= 58 || (adaptive.trueSetupEdge ?? 0) >= 72)
        : opportunity.score < 58;

      let conflictType: ConflictType = 'both_wrong';
      if (operatorPositive && vaultumPositive) conflictType = 'both_right';
      else if (!operatorPositive && !vaultumPositive) conflictType = 'both_wrong';
      else if (operatorPositive) conflictType = 'operator_right_vaultum_wrong';
      else conflictType = 'vaultum_right_operator_wrong';

      const explanation =
        conflictType === 'both_right'
          ? 'Operator decision and Vaultum stance both aligned with the observed market result.'
          : conflictType === 'both_wrong'
            ? 'Operator decision and Vaultum stance both failed to align with what the market actually rewarded.'
            : conflictType === 'operator_right_vaultum_wrong'
              ? 'Operator judgement outperformed the current Vaultum recommendation on this case.'
              : 'Vaultum saw edge that the operator missed or rejected.';

      return {
        id: `conflict:${caseItem.id}`,
        caseId: caseItem.id,
        market: caseItem.market,
        timestamp: caseItem.createdAt,
        regime: adaptive.regimeTag,
        setupFamily: caseItem.setupFamily,
        operatorDecision: adaptive.operatorDecision,
        vaultumRecommendation: adaptive.vaultumRecommendation,
        actualOutcome: caseItem.review.outcome,
        conflictType,
        trueSetupEdge: adaptive.trueSetupEdge,
        opportunityCostScore: adaptive.operatorDecision === 'execute' ? null : opportunity.score,
        explanation,
      };
    })
    .sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)));
}

export function buildRegimePerformanceStats(cases: LearningCase[], market = 'ALL'): RegimePerformanceStats[] {
  const normalized = normalizeCases(cases, market);
  const opportunity = buildOpportunityCostStats(normalized, market);
  const groups = groupBy(normalized, (item) => item.adaptive?.regimeTag ?? normalizeRegimeTag(item));

  return [...groups.entries()].map(([regime, items]) => {
    const trades = items.filter((item) => item.caseType === 'trade');
    const vaultumTakeCases = items.filter((item) => (item.adaptive?.vaultumRecommendation ?? inferVaultumRecommendation(item)) === 'take');
    const familyCounts = [...groupBy(items, (item) => item.setupFamily).entries()]
      .sort((left, right) => right[1].length - left[1].length);
    const leakCounts = new Map<ExecutionLeakType, number>();
    items.forEach((item) => (item.adaptive?.executionLeakTags ?? []).forEach((tag) => leakCounts.set(tag, (leakCounts.get(tag) ?? 0) + 1)));
    const dominantLeak = [...leakCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
    const regimeOpp = opportunity.filter((item) => item.regime === regime && matchMarket(market, item));

    return {
      market: items[0]?.market ?? normalizeMarket(market),
      regime,
      sampleCount: items.length,
      tradeCount: trades.length,
      operatorWinRate: pct(trades.filter((item) => item.review.outcome === 'win').length, trades.length),
      vaultumTakeRate: pct(vaultumTakeCases.length, items.length),
      vaultumTakeWinRate: pct(vaultumTakeCases.filter((item) => item.review.outcome === 'win').length, vaultumTakeCases.length),
      avgTrueSetupEdge: round(average(items.map((item) => item.adaptive?.trueSetupEdge)), 1),
      avgExecutionLeakScore: round(average(items.map((item) => item.adaptive?.executionLeakScore)), 1),
      avgNetRealizedEdge: round(average(items.map((item) => item.adaptive?.netRealizedEdge)), 1),
      dominantFamily: familyCounts[0]?.[0] ?? null,
      dominantLeak,
      opportunityCostScore: round(average(regimeOpp.map((item) => item.opportunityCostScore)), 1),
    };
  }).sort((left, right) => (right.avgNetRealizedEdge ?? 0) - (left.avgNetRealizedEdge ?? 0));
}

export function buildExecutionLeakStats(cases: LearningCase[], market = 'ALL'): ExecutionLeakStats[] {
  const normalized = normalizeCases(cases, market);
  const map = new Map<ExecutionLeakType, LearningCase[]>();
  normalized.forEach((item) => {
    const tags = item.adaptive?.executionLeakTags ?? inferExecutionLeakTags(item);
    tags.forEach((tag) => map.set(tag, [...(map.get(tag) ?? []), item]));
  });

  const explain: Record<ExecutionLeakType, string> = {
    early_entry: 'Good ideas are being entered before reaction and confirmation actually show up.',
    late_entry: 'Price is already moving before the operator commits, reducing reward asymmetry.',
    broad_zone_entry: 'Entries are too broad inside the zone instead of being tied to the true execution layer.',
    weak_participation: 'Setups are being taken without genuine sweep, displacement, or micro-shift evidence.',
    stop_inside_liquidity: 'Stops are sitting where obvious liquidity can be cleaned out first.',
    target_too_ambitious: 'Targets are asking for more extension than the regime is regularly giving.',
    premature_exit: 'Good structure is working, but profits are being cut before opposing liquidity or slowdown.',
    hesitation_skip: 'High-quality setups are being skipped despite favorable family/regime conditions.',
  };

  return [...map.entries()].map(([leakType, items]) => ({
    market: items[0]?.market ?? normalizeMarket(market),
    leakType,
    sampleCount: items.length,
    avgTrueSetupEdge: round(average(items.map((item) => item.adaptive?.trueSetupEdge)), 1),
    avgExecutionLeakScore: round(average(items.map((item) => item.adaptive?.executionLeakScore)), 1),
    avgNetRealizedEdge: round(average(items.map((item) => item.adaptive?.netRealizedEdge)), 1),
    impactedFamilies: [...new Set(items.map((item) => item.setupFamily))],
    impactedRegimes: [...new Set(items.map((item) => item.adaptive?.regimeTag ?? normalizeRegimeTag(item)))],
    explanation: explain[leakType],
  })).sort((left, right) => right.sampleCount - left.sampleCount);
}

export function buildDoctrineTensionFlags(cases: LearningCase[], market = 'ALL'): DoctrineTensionFlag[] {
  const normalized = normalizeCases(cases, market);
  const flags: DoctrineTensionFlag[] = [];
  const trades = normalized.filter((item) => item.caseType === 'trade');
  const confirmed = trades.filter((item) => (item.preTrade.participationScore ?? 0) >= 60);
  const unconfirmed = trades.filter((item) => (item.preTrade.participationScore ?? 0) < 60);
  const confirmedWin = pct(confirmed.filter((item) => item.review.outcome === 'win').length, confirmed.length);
  const unconfirmedWin = pct(unconfirmed.filter((item) => item.review.outcome === 'win').length, unconfirmed.length);

  if (confirmed.length >= LEARNING_PROPOSAL_SAMPLE_FLOOR && unconfirmed.length >= LEARNING_PROPOSAL_SAMPLE_FLOOR && confirmedWin <= unconfirmedWin) {
    flags.push({
      id: `doctrine:${normalizeMarket(market)}:participation`,
      market: normalizeMarket(market),
      doctrineSlice: 'participation-confirmation',
      assumption: 'Participation-confirmed setups should outperform unconfirmed attempts.',
      sampleCount: confirmed.length + unconfirmed.length,
      confidenceScore: clamp(Math.round(((confirmed.length + unconfirmed.length) / 14) * 100), 0, 95),
      observedOutcome: `Confirmed win rate ${confirmedWin}% vs unconfirmed ${unconfirmedWin}%`,
      expectedOutcome: 'Confirmed participation should show a higher win rate and cleaner net edge.',
      tensionScore: clamp(Math.round(unconfirmedWin - confirmedWin + 55), 0, 100),
      status: 'under_review',
    });
  }

  const trendTrades = trades.filter((item) => (item.adaptive?.regimeTag ?? normalizeRegimeTag(item)) === 'trending');
  const continuation = trendTrades.filter((item) => item.preTrade.setupType === 'continuation');
  const reversal = trendTrades.filter((item) => item.preTrade.setupType === 'reversal');
  const continuationExpectancy = average(continuation.map(rValue));
  const reversalExpectancy = average(reversal.map(rValue));
  if (continuation.length >= LEARNING_PROPOSAL_SAMPLE_FLOOR && reversal.length >= LEARNING_PROPOSAL_SAMPLE_FLOOR && (continuationExpectancy ?? 0) <= (reversalExpectancy ?? 0)) {
    flags.push({
      id: `doctrine:${normalizeMarket(market)}:trend-continuation`,
      market: normalizeMarket(market),
      doctrineSlice: 'trend-continuation-priority',
      assumption: 'Continuation should normally outperform reversal attempts in clean trending regimes.',
      sampleCount: continuation.length + reversal.length,
      confidenceScore: clamp(Math.round(((continuation.length + reversal.length) / 14) * 100), 0, 95),
      observedOutcome: `Continuation expectancy ${round(continuationExpectancy, 2) ?? 'n/a'}R vs reversal ${round(reversalExpectancy, 2) ?? 'n/a'}R`,
      expectedOutcome: 'Trend continuation should retain a cleaner expectancy edge than countertrend reversal attempts.',
      tensionScore: clamp(Math.round((((reversalExpectancy ?? 0) - (continuationExpectancy ?? 0)) * 40) + 50), 0, 100),
      status: 'under_review',
    });
  }

  const highPrecision = trades.filter((item) => (item.preTrade.precisionScore ?? 0) >= 70);
  const lowPrecision = trades.filter((item) => (item.preTrade.precisionScore ?? 0) < 50);
  const highPrecisionWin = pct(highPrecision.filter((item) => item.review.outcome === 'win').length, highPrecision.length);
  const lowPrecisionWin = pct(lowPrecision.filter((item) => item.review.outcome === 'win').length, lowPrecision.length);
  if (highPrecision.length >= LEARNING_PROPOSAL_SAMPLE_FLOOR && lowPrecision.length >= LEARNING_PROPOSAL_SAMPLE_FLOOR && highPrecisionWin <= lowPrecisionWin) {
    flags.push({
      id: `doctrine:${normalizeMarket(market)}:precision`,
      market: normalizeMarket(market),
      doctrineSlice: 'precision-ranking',
      assumption: 'Higher-precision entries should outperform broad or low-precision entries.',
      sampleCount: highPrecision.length + lowPrecision.length,
      confidenceScore: clamp(Math.round(((highPrecision.length + lowPrecision.length) / 14) * 100), 0, 95),
      observedOutcome: `High-precision win rate ${highPrecisionWin}% vs low-precision ${lowPrecisionWin}%`,
      expectedOutcome: 'High-precision execution should deliver better realized outcomes and fewer leaks.',
      tensionScore: clamp(Math.round(lowPrecisionWin - highPrecisionWin + 55), 0, 100),
      status: 'under_review',
    });
  }

  return flags;
}

function decorateProposal(base: LearningProposal, evidence: AdaptiveProposalEvidence): LearningProposal {
  return {
    ...base,
    sampleCount: evidence.sampleCount,
    confidenceScore: evidence.confidenceScore,
    expectedUpsidePct: evidence.expectedUpsidePct,
    evidenceSummary: evidence.evidenceSummary,
    adaptiveEvidence: evidence,
  };
}

function evidence(sampleCount: number, expectedUpsidePct: number | null, supportingStats: string[]): AdaptiveProposalEvidence {
  const confidenceScore = clamp(Math.round(38 + (sampleCount * 6) + (supportingStats.length * 4)), 0, 96);
  return {
    sampleCount,
    confidenceScore,
    expectedUpsidePct,
    evidenceSummary: supportingStats[0] ?? 'Adaptive evidence summary unavailable.',
    supportingStats,
  };
}

export function buildAdaptiveProposals(cases: LearningCase[], market = 'ALL', existingOverride?: OperatorAdaptiveProfile | null): LearningProposal[] {
  const normalized = normalizeCases(cases, market);
  const override = existingOverride ?? defaultLearningOverrideProfile(market);
  const base = buildLearningProposals(normalized, market, override);
  const leaks = buildExecutionLeakStats(normalized, market);
  const regimes = buildRegimePerformanceStats(normalized, market);
  const opportunities = buildOpportunityCostStats(normalized, market);
  const outputs = new Map<string, LearningProposal>();

  base.forEach((proposal) => {
    let sampleCount = normalized.length;
    if (proposal.category === 'precision-threshold') {
      sampleCount = leaks.find((item) => item.leakType === 'early_entry' || item.leakType === 'broad_zone_entry')?.sampleCount ?? sampleCount;
    } else if (proposal.category === 'participation-threshold') {
      sampleCount = leaks.find((item) => item.leakType === 'weak_participation')?.sampleCount ?? sampleCount;
    } else if (proposal.category === 'tp-aggressiveness') {
      sampleCount = leaks.find((item) => item.leakType === 'target_too_ambitious')?.sampleCount ?? sampleCount;
    } else if (proposal.category === 'stop-buffer') {
      sampleCount = leaks.find((item) => item.leakType === 'stop_inside_liquidity')?.sampleCount ?? sampleCount;
    }
    const enhanced = decorateProposal(proposal, evidence(sampleCount, round(clamp(sampleCount * 1.6, 2, 15), 1), proposal.evidence));
    outputs.set(enhanced.id, enhanced);
  });

  const weakRegime = regimes.find((item) => item.sampleCount >= LEARNING_PROPOSAL_SAMPLE_FLOOR && (item.avgNetRealizedEdge ?? 100) < 44);
  if (weakRegime && ![...outputs.values()].some((item) => item.category === 'allowed-regimes' && item.market === normalizeMarket(market))) {
    const nextRegimes = override.allowedRegimes.filter((item) => item !== weakRegime.regime);
    if (nextRegimes.length) {
      const proposal: LearningProposal = {
        id: `adaptive-regime-filter:${normalizeMarket(market).toLowerCase()}`,
        market: normalizeMarket(market),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: 'allowed-regimes',
        state: 'pending',
        title: `Reduce exposure in ${weakRegime.regime.replaceAll('_', ' ')} regimes`,
        explanation: 'One regime bucket is persistently leaking realized edge relative to its setup quality.',
        evidence: [
          `${weakRegime.regime} average net edge ${weakRegime.avgNetRealizedEdge ?? 'n/a'}.`,
          `Opportunity cost ${weakRegime.opportunityCostScore ?? 'n/a'} shows hesitation alone is not the only issue.`,
        ],
        suggestedChange: {
          key: 'allowed-regimes',
          from: override.allowedRegimes,
          to: nextRegimes,
          bounded: true,
        },
      };
      outputs.set(proposal.id, decorateProposal(proposal, evidence(
        weakRegime.sampleCount,
        round(clamp(((55 - (weakRegime.avgNetRealizedEdge ?? 40)) * 0.35), 2, 14), 1),
        [
          `${weakRegime.regime} is underperforming with ${weakRegime.sampleCount} cases.`,
          `Average net realized edge is ${weakRegime.avgNetRealizedEdge ?? 'n/a'} while true setup edge is ${weakRegime.avgTrueSetupEdge ?? 'n/a'}.`,
        ],
      )));
    }
  }

  const hesitation = opportunities.find((item) => item.sampleCount >= LEARNING_PROPOSAL_SAMPLE_FLOOR && item.opportunityCostScore >= 68);
  if (hesitation && ![...outputs.values()].some((item) => item.category === 'allowed-sessions' && item.market === normalizeMarket(market))) {
    const bestSession = buildLearningPerformanceSummary(normalized, market).bySession
      .sort((left, right) => (right.expectancyR ?? -99) - (left.expectancyR ?? -99))[0];
    if (bestSession) {
      const proposal: LearningProposal = {
        id: `adaptive-session-focus:${normalizeMarket(market).toLowerCase()}`,
        market: normalizeMarket(market),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: 'allowed-sessions',
        state: 'pending',
        title: 'Bias execution toward the cleaner session window',
        explanation: 'Missed or skipped opportunity is clustering in a way that suggests session discipline can improve realized edge.',
        evidence: [
          `${hesitation.session} opportunity cost ${hesitation.opportunityCostScore}.`,
          `Best realized expectancy currently comes from ${bestSession.session}.`,
        ],
        suggestedChange: {
          key: 'allowed-sessions',
          from: override.allowedSessions,
          to: [bestSession.session],
          bounded: true,
        },
      };
      outputs.set(proposal.id, decorateProposal(proposal, evidence(
        hesitation.sampleCount,
        round(clamp(hesitation.opportunityCostScore * 0.12, 2, 12), 1),
        [
          `${hesitation.session} is producing repeated missed edge in ${hesitation.regime}.`,
          `${bestSession.session} remains the cleanest realized session in the current sample.`,
        ],
      )));
    }
  }

  return [...outputs.values()].sort((left, right) => (right.confidenceScore ?? 0) - (left.confidenceScore ?? 0));
}

export function buildOperatorAdaptiveProfile(input: {
  market?: string;
  cases: LearningCase[];
  proposals?: LearningProposal[];
  override?: OperatorAdaptiveProfile | null;
}): OperatorAdaptiveProfile {
  const market = normalizeMarket(input.market || 'XAUUSD');
  const normalized = normalizeCases(input.cases, market);
  const base = {
    ...(input.override ?? defaultLearningOverrideProfile(market)),
    market,
    updatedAt: new Date().toISOString(),
  };
  const proposals = input.proposals ?? buildAdaptiveProposals(normalized, market, base);
  const edgePressure = buildEdgePressureStats(normalized, market)
    .filter((item) => item.regime === 'all' && item.sampleCount >= LEARNING_PROPOSAL_SAMPLE_FLOOR);
  const doctrine = buildDoctrineTensionFlags(normalized, market);
  const preferredFamilies = edgePressure.filter((item) => item.edgePressureScore >= 68).slice(0, 3).map((item) => item.family);
  const avoidFamilies = edgePressure.filter((item) => item.edgePressureScore < 48).slice(0, 3).map((item) => item.family);

  return {
    ...base,
    preferredFamilies,
    avoidFamilies,
    doctrineUnderReview: doctrine.filter((item) => item.status === 'under_review').map((item) => item.id),
    adaptiveNotes: [
      preferredFamilies.length ? `Preferred families: ${preferredFamilies.join(', ')}.` : 'No family has enough stable edge to become preferred yet.',
      avoidFamilies.length ? `Avoid families: ${avoidFamilies.join(', ')}.` : 'No family is weak enough yet to become an avoid list.',
    ],
    auditTrail: proposals
      .filter((item) => item.state !== 'pending')
      .map((item) => ({
        proposalId: item.id,
        category: item.category,
        state: item.state,
        updatedAt: item.updatedAt,
      })),
  };
}

export function buildAdaptiveLearningDashboard(input: {
  market?: string;
  cases: LearningCase[];
  missedCandidates?: MissedSetupCandidate[];
  proposals?: LearningProposal[];
  overrides?: OperatorAdaptiveProfile | null;
}): LearningDashboardResponse {
  const market = normalizeMarket(input.market || 'XAUUSD');
  const cases = normalizeCases(input.cases, market);
  const proposals = input.proposals?.length ? input.proposals : buildAdaptiveProposals(cases, market, input.overrides ?? null);
  const adaptiveProfile = buildOperatorAdaptiveProfile({
    market,
    cases,
    proposals,
    override: input.overrides ?? null,
  });
  const base = buildLearningDashboard({
    market,
    cases,
    missedCandidates: input.missedCandidates ?? [],
    proposals,
    overrides: adaptiveProfile,
  });
  const decisionConflicts = buildDecisionConflictCases(cases, market);
  const edgePressure = buildEdgePressureStats(cases, market);
  const regimePerformance = buildRegimePerformanceStats(cases, market);
  const executionLeaks = buildExecutionLeakStats(cases, market);
  const opportunityCost = buildOpportunityCostStats(cases, market);
  const doctrineTension = buildDoctrineTensionFlags(cases, market);

  return {
    ...base,
    proposals,
    overrides: adaptiveProfile,
    adaptiveProfile,
    decisionConflicts,
    edgePressure,
    regimePerformance,
    executionLeaks,
    opportunityCost,
    doctrineTension,
    insights: [
      ...base.insights,
      edgePressure[0] ? `${edgePressure[0].family} is carrying the strongest current edge pressure at ${edgePressure[0].edgePressureScore}.` : 'Edge pressure still needs more sample depth.',
      decisionConflicts.find((item) => item.conflictType === 'vaultum_right_operator_wrong')
        ? 'Vaultum is already seeing some setups the operator is skipping; review the conflict table before tightening filters further.'
        : 'No clear operator-vs-Vaultum conflict skew is visible yet.',
    ].slice(0, 6),
    blindspots: [
      ...base.blindspots,
      decisionConflicts.length < LEARNING_PROPOSAL_SAMPLE_FLOOR ? 'Decision-conflict evidence is still sparse, so operator-vs-Vaultum edge separation is early-stage.' : null,
      doctrineTension.some((item) => item.status === 'under_review') ? 'One or more doctrine slices are under review; treat them as testable assumptions, not broken doctrine.' : null,
    ].filter((item): item is string => Boolean(item)),
  };
}

export function buildAdaptiveRecommendationResponse(input: {
  market?: string;
  cases: LearningCase[];
  overrides?: OperatorAdaptiveProfile | null;
  proposals?: LearningProposal[];
}): LearningRecommendationResponse {
  const market = normalizeMarket(input.market || 'XAUUSD');
  const cases = normalizeCases(input.cases, market);
  const overrides = buildOperatorAdaptiveProfile({
    market,
    cases,
    proposals: input.proposals,
    override: input.overrides ?? null,
  });
  const proposals = input.proposals?.length ? input.proposals : buildAdaptiveProposals(cases, market, overrides);
  return {
    generatedAt: new Date().toISOString(),
    market,
    summary: proposals.length
      ? `${market} adaptive layer generated ${proposals.length} bounded proposal${proposals.length === 1 ? '' : 's'} without changing core doctrine or live execution logic.`
      : `${market} adaptive layer does not yet have enough stable evidence for a bounded proposal.`,
    proposals,
    overrides,
  };
}
