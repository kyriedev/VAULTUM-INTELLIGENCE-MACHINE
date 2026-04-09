import assert from 'node:assert/strict';

import {
  buildLearningDashboard,
  buildLearningProposals,
  defaultLearningOverrideProfile,
  finalizeLearningCase,
  type LearningCase,
} from '../src/lib/learning/engine.ts';

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
} = {}): LearningCase {
  const now = new Date('2026-04-09T10:00:00.000Z').toISOString();
  return finalizeLearningCase({
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
      macroContext: 'Macro aligned.',
      regimeClassification: input.regime ?? 'trend',
      volatilityState: 'expanded',
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
      mfe: input.review?.outcome === 'loss' ? 0.25 : 1.2,
      mae: input.review?.outcome === 'loss' ? -1 : -0.25,
      liquiditySweepBeforeMove: true,
      displacementConfirmed: true,
      structureShiftAfterEntry: true,
      timeToReactionMinutes: 8,
      timeToTargetMinutes: 55,
      timeToStopMinutes: null,
    },
    exit: {
      exitType: input.review?.outcome === 'loss' ? 'sl_hit' : 'tp_hit',
      actualExitPrices: input.review?.outcome === 'loss' ? [99] : [105],
      exitEfficiency: input.review?.outcome === 'loss' ? 35 : 74,
      priceExtendedBeyondExit: input.review?.outcome === 'loss' ? false : true,
      fullTpRealistic: input.review?.outcome === 'loss' ? false : true,
    },
    review: {
      setupQualityScore: 82,
      entryQualityScore: input.precision ?? 72,
      managementQualityScore: 70,
      exitQualityScore: input.review?.outcome === 'loss' ? 35 : 72,
      outcome: input.outcome ?? 'win',
      analysisQualityScore: 84,
      primaryFailureMode: input.failureMode ?? 'none',
      notes: input.review?.notes ?? '',
    },
    ...input,
  });
}

export function runLearningEngineTests(): void {
  {
    const caseItem = makeCase({
      outcome: 'loss',
      precision: 34,
      failureMode: 'entered-too-early',
    });

    assert.equal(caseItem.review.outcome, 'loss');
    assert.equal(caseItem.review.setupQualityScore, 82);
    assert.equal(caseItem.review.entryQualityScore, 34);
    assert.equal(caseItem.review.primaryFailureMode, 'entered-too-early');
  }

  {
    const cases = [
      makeCase({ market: 'XAUUSD', outcome: 'win' }),
      makeCase({ market: 'XAUUSD', outcome: 'loss', precision: 30, failureMode: 'entered-too-early' }),
      makeCase({ market: 'XAUUSD', outcome: 'loss', precision: 32, failureMode: 'entered-too-early' }),
    ];
    const proposals = buildLearningProposals(cases, 'XAUUSD', defaultLearningOverrideProfile('XAUUSD'));
    assert.equal(proposals.length, 0);
  }

  {
    const cases = [
      makeCase({ market: 'US30', outcome: 'loss', precision: 30, failureMode: 'entered-too-early' }),
      makeCase({ market: 'US30', outcome: 'loss', precision: 34, failureMode: 'entered-too-early' }),
      makeCase({ market: 'US30', outcome: 'loss', precision: 36, failureMode: 'entered-too-early' }),
      makeCase({ market: 'US30', outcome: 'loss', precision: 38, failureMode: 'entered-too-early' }),
    ];
    const proposals = buildLearningProposals(cases, 'US30', defaultLearningOverrideProfile('US30'));
    assert.ok(proposals.some((item) => item.category === 'precision-threshold'));
    assert.ok(proposals.every((item) => item.suggestedChange.bounded));
  }

  {
    const dashboard = buildLearningDashboard({
      market: 'XAUUSD',
      cases: [makeCase({ market: 'XAUUSD', outcome: 'win' })],
      missedCandidates: [],
      proposals: [],
      overrides: defaultLearningOverrideProfile('XAUUSD'),
    });

    assert.equal(dashboard.performance.totalCases, 1);
    assert.ok(dashboard.blindspots.some((item) => /sample size is still thin/i.test(item)));
    assert.equal(dashboard.familyStats[0]?.family, 'gold-primary');
  }
}
