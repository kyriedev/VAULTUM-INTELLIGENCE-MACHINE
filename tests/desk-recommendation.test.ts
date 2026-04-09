import assert from 'node:assert/strict';

import { buildDeskRecommendation } from '../server/vaultum/analytics/v1/_desk-recommendation.ts';

export function runDeskRecommendationTests(): void {
  {
    const recommendation = buildDeskRecommendation({
      market: 'XAUUSD',
      timeframe: '1h',
      execution: {
        action: 'lean-long',
        stance: 'bullish',
        confidence: 'high',
        ensembleScore: 42.5,
        summary: 'Bullish desk read.',
        actionPlan: 'Buy dips.',
      },
      riskEnvelope: {
        actionMode: 'standard',
        sizeBand: 'standard',
        riskBudgetPct: 0.8,
        riskScore: 38,
        tradeSuppression: false,
        body: 'Risk gate open.',
      },
      entryMap: {
        biasLabel: 'Bullish',
        phase: 'phase-2',
        readiness: 'ready',
        direction: 'long',
        confidenceLabel: 'high',
        executionRead: 'Buy pullbacks into the discount pocket.',
        entryZone: '3328.00 - 3334.00',
        trimZone: '3362.00 - 3368.00',
        invalidationLevel: '3319.50',
        triggerPattern: 'bull flag continuation',
        sourceLabel: 'Entry map engine',
      },
      scenario: {
        horizonLabel: 'next 24 hours',
        pathBias: 'upside drift favored',
        targetLevel: 3366,
        invalidationLevel: 3319.5,
        supportLevel: 3328,
        targetFirstProbability: 61,
        invalidationFirstProbability: 29,
        supportHoldProbability: 64,
        breakEvenProbability: 58,
        medianMaxDrawdownPct: 0.9,
        expectedMovePct: 1.4,
        sourceLabel: 'Monte Carlo engine',
      },
      flowProxy: {
        flowBias: 'call-chasing proxy',
        dealerPositioning: 'short-gamma-like inventory',
        squeezeRisk: 'moderate',
        callWall: 3365,
        putWall: 3325,
        gammaFlip: 3344,
        pricingModel: 'black-76',
        theoreticalAtmVol: 18.2,
        downsideSkew: 2.4,
        expectedMove1w: 2.3,
        expectedMove1m: 4.8,
        dealerCorridorWidth: 40,
        surfaceFit: {
          quality: 'good',
          rmse: 0.12,
        },
        featuredStrategy: 'call spread',
        featuredStrategySummary: 'Call spread favors upside with defined risk.',
        americanExerciseRisk: 'hold-like-european ATM call / exercise-sensitive ATM put',
        sourceLabel: 'Synthetic options proxy',
      },
      gammaLevels: {
        pricingModel: 'black-76',
        greekAgreementScore: 91,
        greekAgreementLabel: 'tight',
        ivSolverMethod: 'newton',
        ivSolverIterations: 4,
        ivSolverResidual: 0.0001,
        ivSolverConverged: true,
        surfaceFit: {
          quality: 'good',
          rmse: 0.12,
          riskReversal1m: 1.7,
          butterfly1m: 0.6,
        },
        sourceLabel: 'Synthetic gamma engine',
      },
      dealerPressure: {
        conclusion: 'Dealer pressure still leans upside while negative gamma keeps extension risk alive.',
        bias: 'bullish',
        pressureScore: 68,
        expansionRisk: 'moderate',
        sourceLabel: 'Synthetic dealer pressure',
      },
      pressure: {
        dominance: 'buyers controlling',
        score: 34,
        sourceLabel: 'Pressure engine',
      },
      orderflow: {
        dominance: 'buyers controlling',
        buySellPressure: 28,
        priceDeltaDivergence: 'none',
        divergenceDetail: 'none',
        sourceLabel: 'Orderflow engine',
      },
      macroSignals: {
        regime: 'risk-off with haven support',
        goldBias: 'bullish',
      },
      technicalPattern: 'bull flag continuation',
    });

    assert.equal(recommendation.bias, 'Bullish bias');
    assert.match(recommendation.entrySuggestion, /Buy weakness into 3328\.00 - 3334\.00/i);
    assert.match(recommendation.reEntrySuggestion, /reload only on an accepted retest/i);
    assert.match(recommendation.exitSuggestion, /Scale profits into 3362\.00 - 3368\.00/i);
    assert.match(recommendation.monteCarloSummary, /target-first 61\.0%/i);
    assert.match(recommendation.optionsMathSummary, /Black-76 futures carry model/i);
    assert.equal(recommendation.quotedEvidence.length, 6);
  }

  {
    const recommendation = buildDeskRecommendation({
      market: 'EURUSD',
      timeframe: '4h',
      execution: {
        action: 'stand-down',
        stance: 'bullish but suppressed',
        confidence: 'low',
        ensembleScore: 8,
        summary: 'Suppressed desk read.',
        actionPlan: 'Stand aside.',
      },
      riskEnvelope: {
        actionMode: 'suppressed',
        sizeBand: 'stand-down',
        riskBudgetPct: 0,
        riskScore: 84,
        tradeSuppression: true,
        body: 'Event load is too high.',
      },
      entryMap: {
        phase: 'transition',
        readiness: 'watch',
        confidenceLabel: 'medium',
        sourceLabel: 'Entry map engine',
      },
      scenario: null,
      flowProxy: null,
      gammaLevels: null,
      dealerPressure: null,
      pressure: null,
      orderflow: null,
      macroSignals: {
        regime: 'mixed',
        goldBias: 'neutral',
      },
      technicalPattern: 'range',
    });

    assert.equal(recommendation.bias, 'Transition / stand down');
    assert.match(recommendation.entrySuggestion, /Do not open fresh EURUSD risk/i);
    assert.match(recommendation.reEntrySuggestion, /Re-entry is not active yet/i);
    assert.match(recommendation.exitSuggestion, /Exit guidance is conditional/i);
  }
}
