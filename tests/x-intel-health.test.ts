import assert from 'node:assert/strict';

import { buildFeedSnapshotMeta } from '../server/vaultum/_shared/feed-health.ts';
import { buildConfluenceDecision } from '../server/vaultum/intelligence/v1/engine/confluence-engine.ts';
import { parseAccounts } from '../server/vaultum/intelligence/v1/x/helpers.ts';
import { resolveSourceProfiles } from '../server/vaultum/intelligence/v1/x/watched-sources.ts';

export function runXIntelHealthTests(): void {
  {
    const accounts = parseAccounts([
      'https://x.com/financialjuice',
      'https://x.com/DeItaone',
      'https://x.com/unusual_whales',
      'https://x.com/investingLive_',
    ]);

    assert.deepEqual(
      accounts.map((item) => item.handle),
      ['financialjuice', 'deltaone', 'unusual_whales', 'investinglive_'],
    );
  }

  {
    const profiles = resolveSourceProfiles(parseAccounts([
      'https://x.com/DeItaone',
      'https://x.com/unusual_whales',
      'https://x.com/investingLive_',
    ]));

    assert.equal(profiles[0]?.displayName, 'DeItaone');
    assert.equal(profiles[1]?.displayName, 'Unusual Whales');
    assert.equal(profiles[2]?.displayName, 'investingLive');
  }

  {
    const meta = buildFeedSnapshotMeta({
      label: 'X Event Intelligence',
      generatedAt: new Date(Date.now() - (240 * 60_000)).toISOString(),
      lastUpdatedAt: new Date(Date.now() - (240 * 60_000)).toISOString(),
      staleAfterMinutes: 60,
      sourceMode: 'headline',
      available: true,
      detail: 'Old social snapshot',
      fallbackState: 'stale-fallback',
    });

    assert.equal(meta.status, 'STALE');
    assert.ok(meta.trustHaircut >= 0.2);
  }

  {
    const confluence = buildConfluenceDecision({
      market: 'XAUUSD',
      news: {
        source: 'test',
        timestamp: new Date().toISOString(),
        asset: 'XAUUSD',
        bias: 'bearish',
        strength: 'moderate',
        confidence: 0.78,
        summary: 'News test',
        uiSummary: 'News test',
        notes: [],
        rawInputs: {},
        derivedMetrics: {
          narrative: 'headline conflict',
          headlinesAnalyzed: [],
          dominantAssets: [],
          netSentiment: -0.2,
          impactLevel: 0.6,
          regimeBias: 'bearish',
          contradictions: ['conflicting sources'],
          confirmsCurrentMove: 'contradicts',
        },
      },
      cot: {
        source: 'test',
        timestamp: new Date(Date.now() - (10 * 24 * 60 * 60 * 1000)).toISOString(),
        asset: 'GOLD',
        bias: 'bearish',
        strength: 'moderate',
        confidence: 0.72,
        summary: 'COT test',
        uiSummary: 'COT test',
        notes: [],
        rawInputs: {},
        derivedMetrics: {
          hedgerNet: -1,
          hedgerDeltaWow: -1,
          hedgerPercentile: 90,
          speculatorPercentile: 90,
          divergenceScore: 0.7,
          posture: 'defensive',
          postureStrength: 0.8,
          macroBias: 'bearish',
          hedgerNetShare: -8,
          speculatorNetShare: 10,
        },
      },
      monteCarloRisk: {
        source: 'test',
        timestamp: new Date().toISOString(),
        asset: 'XAUUSD',
        bias: 'neutral',
        strength: 'weak',
        confidence: 0.68,
        summary: 'Risk test',
        uiSummary: 'Risk test',
        notes: [],
        rawInputs: {},
        derivedMetrics: {
          simulations: 1000,
          expectedReturn: 0.08,
          medianReturn: 0.05,
          drawdownP50: 0.04,
          drawdownP90: 0.12,
          probabilityProfit: 0.56,
          probabilityBreakevenOrLoss: 0.44,
          probabilityDrawdownGt5: 0.36,
          probabilityDrawdownGt10: 0.19,
          survivalProbability: 0.82,
          averageMaxWinStreak: 4,
          averageMaxLossStreak: 3,
          riskLabel: 'pause',
          recommendation: 'pause',
        },
      },
      options: {
        source: 'test',
        timestamp: new Date().toISOString(),
        asset: 'XAUUSD',
        bias: 'bearish',
        strength: 'moderate',
        confidence: 0.74,
        summary: 'Options test',
        uiSummary: 'Options test',
        notes: [],
        rawInputs: {
          market: 'XAUUSD',
          spotPrice: 2300,
          focusStrike: 2310,
          sourceMode: 'synthetic-live',
        },
        derivedMetrics: {
          supportCandidates: [],
          resistanceCandidates: [{ strike: 2310, score: 0.6, role: 'resistance', explanation: 'test' }],
          magnetStrikes: [],
          crowdedStrikes: [],
          strikePressure: {
            focusStrike: 2310,
            pressureRead: 'bearish pressure zone',
            levelRole: 'resistance candidate',
            confidence: 61,
            summary: 'test',
            notes: [],
          },
          dealerLogic: {
            gammaRegime: 'synthetic',
            hedgePressure: 'sell-rallies',
            tendency: 'expand',
            pinRisk: 'low',
            confidence: 0.52,
            label: 'synthetic dealer logic',
          },
          screenshotExplainer: null,
        },
      },
    });

    assert.ok((confluence.derivedMetrics.trustHaircuts ?? []).length >= 3);
    assert.ok(confluence.confidence < 0.75);
  }
}
