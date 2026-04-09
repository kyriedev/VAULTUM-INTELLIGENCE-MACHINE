import assert from 'node:assert/strict';

import { REGIME_CONFIG, REGIME_PROXY_DEFINITIONS, type RegimeProxyId } from '../src/config/regime.ts';
import { buildNormalizedSeries } from '../src/lib/market/normalize.ts';
import type { BrokerVolumeEnhancement, NormalizedMarketCandle, NormalizedMarketSeries, ProviderHealthSnapshot } from '../src/lib/market/types.ts';
import {
  buildCrossAssetRegimeSnapshot,
  calculateSyntheticFlow,
  calculateConfidenceScore,
  classifyCrossAssetRegime,
} from '../server/vaultum/liquidity/v1/_cross-asset-regime-engine.ts';

function makeCandles(basePrice: number, dailyChangePct: number, length = 140): NormalizedMarketCandle[] {
  const candles: NormalizedMarketCandle[] = [];
  let close = basePrice;
  const start = Date.now() - (length * 24 * 60 * 60 * 1000);

  for (let index = 0; index < length; index += 1) {
    const open = close;
    const intradayBias = (index % 6 === 0 ? dailyChangePct * 0.45 : dailyChangePct * -0.15) / 100;
    close = open * (1 + (dailyChangePct / 100));
    const high = Math.max(open, close) * (1 + Math.abs(intradayBias) + 0.004);
    const low = Math.min(open, close) * (1 - Math.abs(intradayBias) - 0.004);
    candles.push({
      time: new Date(start + (index * 24 * 60 * 60 * 1000)).toISOString(),
      open,
      high,
      low,
      close,
      volume: 1_000_000 + (index * 1_000),
    });
  }

  return candles;
}

function makeSeries(proxyId: RegimeProxyId, dailyChangePct: number): NormalizedMarketSeries {
  const proxy = REGIME_PROXY_DEFINITIONS[proxyId];
  const series = buildNormalizedSeries({
    proxy,
    source: 'yahooRelay',
    sourceSymbol: proxy.providerSymbols.yahooRelay,
    candles: makeCandles(100 + (dailyChangePct * 8), dailyChangePct),
  });
  assert.ok(series, `Expected a normalized series for ${proxyId}`);
  return series;
}

function health(state: ProviderHealthSnapshot['state'] = 'active'): ProviderHealthSnapshot {
  return {
    provider: 'finnhub',
    state,
    detail: `${state} health`,
    successes: state === 'active' ? 1 : 0,
    failures: state === 'down' ? 1 : 0,
    staleHits: state === 'stale' ? 1 : 0,
    symbols: ['TEST'],
    lastSuccessAt: state === 'active' ? new Date().toISOString() : null,
    lastErrorAt: state === 'down' ? new Date().toISOString() : null,
    lastLatencyMs: 5,
  };
}

function providerHealth(overrides?: Partial<Record<'finnhub' | 'alphavantage' | 'yahooRelay', ProviderHealthSnapshot>>) {
  return {
    finnhub: overrides?.finnhub ?? { ...health('active'), provider: 'finnhub' },
    alphavantage: overrides?.alphavantage ?? { ...health('inactive'), provider: 'alphavantage', detail: 'inactive', successes: 0, lastSuccessAt: null, lastLatencyMs: null },
    yahooRelay: overrides?.yahooRelay ?? { ...health('inactive'), provider: 'yahooRelay', detail: 'inactive', successes: 0, lastSuccessAt: null, lastLatencyMs: null },
  };
}

function brokerVolume(): BrokerVolumeEnhancement {
  return {
    available: false,
    state: 'inactive',
    source: 'broker-volume',
    relativeVolume: null,
    flowScore: null,
    timestamp: null,
    warning: 'Broker volume disabled in test.',
  };
}

function riskOnSeriesMap() {
  return {
    usd: makeSeries('usd', -0.16),
    gold: makeSeries('gold', 0.10),
    rates: makeSeries('rates', 0.12),
    nasdaq: makeSeries('nasdaq', 0.22),
    spx: makeSeries('spx', 0.16),
    btc: makeSeries('btc', 0.28),
    oil: makeSeries('oil', 0.10),
    jpy: makeSeries('jpy', -0.10),
    volatility: makeSeries('volatility', -0.18),
  };
}

function riskOffSeriesMap() {
  return {
    usd: makeSeries('usd', 0.18),
    gold: makeSeries('gold', 0.12),
    rates: makeSeries('rates', -0.16),
    nasdaq: makeSeries('nasdaq', -0.24),
    spx: makeSeries('spx', -0.18),
    btc: makeSeries('btc', -0.34),
    oil: makeSeries('oil', -0.10),
    jpy: makeSeries('jpy', 0.15),
    volatility: makeSeries('volatility', 0.24),
  };
}

export function runRegimeEngineTests(): void {
  {
  const snapshot = buildCrossAssetRegimeSnapshot({
    seriesMap: riskOnSeriesMap(),
    providerHealth: providerHealth(),
    brokerVolume: brokerVolume(),
  });

  assert.equal(snapshot.classification, 'RISK_ON');
  assert.ok(snapshot.componentScores.liquidityScore > 55);
  assert.ok(snapshot.componentScores.riskScore > 55);
  assert.ok(snapshot.componentScores.compositeScore >= REGIME_CONFIG.classification.riskOnThreshold);
  }

  {
  const snapshot = buildCrossAssetRegimeSnapshot({
    seriesMap: riskOffSeriesMap(),
    providerHealth: providerHealth(),
    brokerVolume: brokerVolume(),
  });

  assert.ok(snapshot.componentScores.riskScore < 45);
  assert.equal(snapshot.syntheticFlow.direction, 'risk-off-expansion');
  }

  {
  const seriesMap = riskOnSeriesMap();
  const flow = calculateSyntheticFlow(seriesMap, 18, brokerVolume());

  assert.equal(flow.direction, 'risk-on-expansion');
  assert.ok(flow.intensity > 20);
  assert.ok(flow.components.confirmation >= 50);
  }

  {
  const fullSeries = riskOnSeriesMap();
  const baseline = buildCrossAssetRegimeSnapshot({
    seriesMap: fullSeries,
    providerHealth: providerHealth(),
    brokerVolume: brokerVolume(),
  });

  const degradedSeries = {
    ...fullSeries,
    btc: null,
    oil: null,
    jpy: null,
  };
  const degradedConfidence = calculateConfidenceScore(
    {
      liquidityScore: baseline.componentScores.liquidityScore,
      riskScore: baseline.componentScores.riskScore,
      volatilityScore: baseline.componentScores.volatilityScore,
      correlationScore: baseline.componentScores.correlationScore,
    },
    degradedSeries,
    providerHealth({
      finnhub: { ...health('stale'), provider: 'finnhub' },
      alphavantage: { ...health('down'), provider: 'alphavantage' },
      yahooRelay: { ...health('active'), provider: 'yahooRelay' },
    }),
    'TRANSITION',
  );

  assert.ok(degradedConfidence < baseline.componentScores.confidenceScore);
  }

  {
  const flow = calculateSyntheticFlow(riskOffSeriesMap(), -18, brokerVolume());
  const result = classifyCrossAssetRegime({
    liquidityScore: 32,
    riskScore: 28,
    volatilityScore: 30,
    correlationScore: 38,
    syntheticFlow: flow,
    confidenceScore: 72,
  });

  assert.equal(result.classification, 'RISK_OFF');
  }

  {
  const flow = calculateSyntheticFlow(riskOnSeriesMap(), 14, brokerVolume());
  const result = classifyCrossAssetRegime({
    liquidityScore: 66,
    riskScore: 64,
    volatilityScore: 58,
    correlationScore: 61,
    syntheticFlow: flow,
    confidenceScore: 40,
  });

  assert.equal(result.classification, 'TRANSITION');
  }
}
