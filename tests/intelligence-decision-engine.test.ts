import assert from 'node:assert/strict';

import { buildDecisionDemoFixtures } from '../server/vaultum/intelligence/v1/engine/demo-fixtures.ts';
import { buildCotIntelligence } from '../server/vaultum/intelligence/v1/engine/cot-engine.ts';
import { buildMonteCarloRiskEngine } from '../server/vaultum/intelligence/v1/engine/monte-carlo-risk-engine.ts';
import { buildNewsIntelligence } from '../server/vaultum/intelligence/v1/engine/news-engine.ts';

export async function runIntelligenceDecisionEngineTests(): Promise<void> {
  {
    const news = buildNewsIntelligence({
      market: 'XAUUSD',
      source: 'test-headlines',
      headlines: [
        { headline: 'Fed says rates may stay higher for longer as inflation stays sticky', source: 'Reuters', timestamp: new Date().toISOString() },
        { headline: 'Treasury yields rise after hot CPI print', source: 'Bloomberg', timestamp: new Date().toISOString() },
      ],
    });

    assert.equal(news.bias, 'bearish');
    assert.ok(news.confidence > 0.6);
    assert.ok(news.derivedMetrics.narrative.length > 0);
  }

  {
    const cot = buildCotIntelligence({
      market: 'GOLD',
      commercialLong: 120_000,
      commercialShort: 215_000,
      nonCommercialLong: 236_000,
      nonCommercialShort: 82_000,
      openInterest: 498_000,
      weeklyCommercialChange: -12_000,
      weeklySpecChange: 8_200,
      historicalSeries: [
        { hedgerNet: -140_000, specNet: 155_000 },
        { hedgerNet: -128_000, specNet: 146_000 },
        { hedgerNet: -118_000, specNet: 139_000 },
      ],
      source: 'test-cot',
    });

    assert.equal(cot.derivedMetrics.posture, 'defensive');
    assert.ok(cot.derivedMetrics.hedgerPercentile >= 66);
    assert.ok(cot.confidence > 0.6);
  }

  {
    const risk = buildMonteCarloRiskEngine({
      market: 'XAUUSD',
      winRate: 0.5,
      rewardRisk: 2,
      riskPerTradePct: 1,
      numberOfTrades: 30,
      simulations: 1200,
      slippageBps: 3,
      feeBps: 1,
      seed: 20260409,
    });

    assert.ok(['safe-to-scale', 'balanced', 'reduce'].includes(risk.derivedMetrics.riskLabel));
    assert.ok(risk.derivedMetrics.survivalProbability > 0.5);
    assert.ok(risk.derivedMetrics.drawdownP90 >= risk.derivedMetrics.drawdownP50);
  }

  {
    const fixtures = await buildDecisionDemoFixtures();

    assert.equal(fixtures.gold.market, 'XAUUSD');
    assert.equal(fixtures.gold.confluence.bias, 'bearish');
    assert.ok(fixtures.gold.options?.derivedMetrics?.resistanceCandidates?.length);
    assert.equal(fixtures.usd.market, 'DXY');
    assert.equal(fixtures.usd.confluence.bias, 'bullish');
    assert.equal(fixtures.optionsScreenshotExample.pressureRead, 'bearish pressure zone');
    assert.equal(fixtures.optionsScreenshotExample.levelRole, 'resistance candidate');
    assert.ok((fixtures.optionsScreenshotExample.confidence ?? 0) >= 40);
    assert.match(fixtures.optionsScreenshotExample.summary, /puts are more expensive than calls/i);
  }
}
