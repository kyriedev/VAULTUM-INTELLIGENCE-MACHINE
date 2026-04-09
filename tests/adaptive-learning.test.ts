import assert from 'node:assert/strict';

import { defaultLearningOverrideProfile, finalizeLearningCase, type LearningCase } from '../src/lib/learning/engine.ts';
import {
  buildAdaptiveLearningDashboard,
  buildAdaptiveProposals,
  buildDecisionConflictCases,
  buildExecutionLeakStats,
  buildOperatorAdaptiveProfile,
  finalizeAdaptiveLearningCase,
} from '../src/lib/learning/adaptive.ts';

function makeCase(input: Partial<LearningCase> & {
  market?: string;
  outcome?: LearningCase['review']['outcome'];
  caseType?: LearningCase['caseType'];
  setupType?: LearningCase['preTrade']['setupType'];
  session?: string;
  regime?: string;
  precision?: number | null;
  participation?: number | null;
  failureMode?: LearningCase['review']['primaryFailureMode'];
  macroContext?: string;
  notes?: string;
  volatilityState?: string;
} = {}): LearningCase {
  const now = new Date('2026-04-09T10:00:00.000Z').toISOString();
  return finalizeAdaptiveLearningCase(finalizeLearningCase({
    id: input.id ?? `case:${Math.random().toString(36).slice(2, 8)}`,
    caseType: input.caseType ?? 'trade',
    source: 'journal',
    createdAt: now,
    updatedAt: now,
    market: input.market ?? 'XAUUSD',
    primaryFocus: true,
    setupFamily: 'other',
    tags: [],
    preTrade: {
      market: input.market ?? 'XAUUSD',
      session: input.session ?? 'london',
      tradeDate: now,
      timeframeStack: ['4h', '15m', '5m'],
      majorStructure: 'Bullish major structure.',
      minorStructure: 'Minor correction into demand.',
      setupType: input.setupType ?? 'continuation',
      zone: { low: 100, high: 102, label: 'demand' },
      chosenEntryLevel: 101,
      precisionScore: input.precision ?? 72,
      participationScore: input.participation ?? 72,
      macroContext: input.macroContext ?? 'Macro aligned.',
      regimeClassification: input.regime ?? 'trend',
      volatilityState: input.volatilityState ?? 'expanded',
      liquidityContext: 'Sweep and displacement confirmed.',
      intendedStop: 99,
      intendedTarget: 105,
      intendedTargetPlan: 'Use opposing liquidity for exits.',
      thesisSnapshot: {
        summary: 'Bullish continuation inside discount.',
        lines: ['Bullish major structure.', 'Minor correction into demand.'],
      },
    },
    inTrade: {
      mfe: input.outcome === 'loss' ? 0.25 : 1.2,
      mae: input.outcome === 'loss' ? -1 : -0.25,
      liquiditySweepBeforeMove: true,
      displacementConfirmed: true,
      structureShiftAfterEntry: true,
      timeToReactionMinutes: 8,
      timeToTargetMinutes: 55,
      timeToStopMinutes: null,
    },
    exit: {
      exitType: input.outcome === 'loss' ? 'sl_hit' : 'tp_hit',
      actualExitPrices: input.outcome === 'loss' ? [99] : [105],
      exitEfficiency: input.outcome === 'loss' ? 35 : 74,
      priceExtendedBeyondExit: input.outcome === 'loss' ? false : true,
      fullTpRealistic: input.outcome === 'loss' ? false : true,
    },
    review: {
      setupQualityScore: 82,
      entryQualityScore: input.precision ?? 72,
      managementQualityScore: 70,
      exitQualityScore: input.outcome === 'loss' ? 35 : 72,
      outcome: input.outcome ?? 'win',
      analysisQualityScore: 84,
      primaryFailureMode: input.failureMode ?? 'none',
      notes: input.notes ?? '',
    },
    ...input,
  }));
}

export function runAdaptiveLearningTests(): void {
  {
    const newsCase = makeCase({ macroContext: 'CPI release shock with headline risk.', regime: 'transition' });
    assert.equal(newsCase.adaptive?.regimeTag, 'news_driven');

    const rangingCase = makeCase({ macroContext: 'Quiet tape.', regime: 'range', volatilityState: 'contained' });
    assert.equal(rangingCase.adaptive?.regimeTag, 'ranging');
  }

  {
    const skippedHighEdge = makeCase({
      caseType: 'skipped',
      outcome: 'skipped',
      precision: 78,
      participation: 74,
      notes: 'Clean continuation setup with strong confluence and participation.',
    });
    const supportingCases = [
      makeCase({ outcome: 'win' }),
      makeCase({ outcome: 'win' }),
      makeCase({ outcome: 'win' }),
      makeCase({ outcome: 'win' }),
    ];
    const conflicts = buildDecisionConflictCases([...supportingCases, skippedHighEdge], 'XAUUSD');
    const skippedConflict = conflicts.find((item) => item.caseId === skippedHighEdge.id);
    assert.ok(skippedConflict);
    assert.equal(skippedConflict?.conflictType, 'vaultum_right_operator_wrong');
  }

  {
    const goodIdeaBadExecution = makeCase({
      outcome: 'loss',
      precision: 32,
      failureMode: 'poor-exact-price',
      notes: 'Broad zone entry after waiting too long.',
    });
    const leaks = buildExecutionLeakStats([goodIdeaBadExecution], 'XAUUSD');
    const broad = leaks.find((item) => item.leakType === 'broad_zone_entry');
    assert.ok(broad);
    assert.ok((broad?.avgTrueSetupEdge ?? 0) > (broad?.avgNetRealizedEdge ?? 100));
  }

  {
    const sparse = buildAdaptiveProposals([makeCase({ outcome: 'win' })], 'XAUUSD', defaultLearningOverrideProfile('XAUUSD'));
    assert.equal(sparse.length, 0);
  }

  {
    const cases = [
      makeCase({ market: 'US30', outcome: 'loss', precision: 30, failureMode: 'entered-too-early' }),
      makeCase({ market: 'US30', outcome: 'loss', precision: 34, failureMode: 'entered-too-early' }),
      makeCase({ market: 'US30', outcome: 'loss', precision: 36, failureMode: 'entered-too-early' }),
      makeCase({ market: 'US30', outcome: 'loss', precision: 38, failureMode: 'entered-too-early' }),
    ];
    const proposals = buildAdaptiveProposals(cases, 'US30', defaultLearningOverrideProfile('US30'));
    assert.ok(proposals.some((item) => item.category === 'precision-threshold'));
    assert.ok(proposals.every((item) => item.suggestedChange.bounded));
    assert.ok(proposals.every((item) => (item.confidenceScore ?? 0) > 0));
  }

  {
    const profile = buildOperatorAdaptiveProfile({
      market: 'XAUUSD',
      cases: [makeCase({ outcome: 'win' })],
      override: null,
    });
    assert.equal(profile.market, 'XAUUSD');
    assert.ok(Array.isArray(profile.approvedProposalIds));
  }

  {
    const dashboard = buildAdaptiveLearningDashboard({
      market: 'XAUUSD',
      cases: [makeCase({ outcome: 'win' }), makeCase({ caseType: 'skipped', outcome: 'skipped' })],
      missedCandidates: [],
      proposals: [],
      overrides: null,
    });
    assert.ok(Array.isArray(dashboard.edgePressure));
    assert.ok(Array.isArray(dashboard.decisionConflicts));
    assert.ok(dashboard.adaptiveProfile);
  }
}
