import assert from 'node:assert/strict';

import { REGIME_CONFIG, REGIME_PROXY_DEFINITIONS } from '../src/config/regime.ts';
import { buildNormalizedSeries } from '../src/lib/market/normalize.ts';
import { createProxySeriesResolver } from '../src/lib/market/providers/index.ts';
import type { ProviderFetchResult } from '../src/lib/market/types.ts';

function makeSeriesResult(proxyId: 'usd', source: 'finnhub' | 'alphavantage' | 'yahooRelay', dailyChangePct: number): ProviderFetchResult {
  const proxy = REGIME_PROXY_DEFINITIONS[proxyId];
  const start = Date.now() - (120 * 24 * 60 * 60 * 1000);
  const candles = Array.from({ length: 120 }, (_, index) => {
    const base = 100 + index;
    const close = base * (1 + (dailyChangePct / 100));
    return {
      time: new Date(start + (index * 24 * 60 * 60 * 1000)).toISOString(),
      open: base,
      high: Math.max(base, close) * 1.01,
      low: Math.min(base, close) * 0.99,
      close,
      volume: 1000,
    };
  });
  const series = buildNormalizedSeries({
    proxy,
    source,
    sourceSymbol: proxy.providerSymbols[source],
    candles,
  });
  assert.ok(series);
  return {
    series,
    providerHealth: {
      provider: source,
      state: 'active',
      detail: `${source} success`,
      successes: 1,
      failures: 0,
      staleHits: 0,
      symbols: [proxy.providerSymbols[source]],
      lastSuccessAt: new Date().toISOString(),
      lastErrorAt: null,
      lastLatencyMs: 1,
    },
  };
}

function downResult(provider: 'finnhub' | 'alphavantage' | 'yahooRelay', symbol: string): ProviderFetchResult {
  return {
    series: null,
    providerHealth: {
      provider,
      state: 'down',
      detail: `${provider} failed`,
      successes: 0,
      failures: 1,
      staleHits: 0,
      symbols: [symbol],
      lastSuccessAt: null,
      lastErrorAt: new Date().toISOString(),
      lastLatencyMs: 1,
    },
  };
}

export async function runMarketProviderTests(): Promise<void> {
  {
  const resolver = createProxySeriesResolver({
    sharedCache: {
      async get() { return null; },
      async set() { /* noop */ },
    },
    registryFactory: () => ({
      finnhub: {
        configured: true,
        symbol: 'UUP',
        load: async () => downResult('finnhub', 'UUP'),
      },
      alphavantage: {
        configured: true,
        symbol: 'UUP',
        load: async () => makeSeriesResult('usd', 'alphavantage', -0.10),
      },
      yahooRelay: {
        configured: true,
        symbol: 'UUP',
        load: async () => makeSeriesResult('usd', 'yahooRelay', -0.08),
      },
    }),
  });

  const result = await resolver.getProxySeries('usd');
  assert.ok(result.series);
  assert.equal(result.series?.source, 'alphavantage');
  assert.equal(result.providerHealth.finnhub.state, 'down');
  assert.equal(result.providerHealth.alphavantage.state, 'active');
  }

  {
  let now = Date.UTC(2025, 0, 1, 12, 0, 0);
  let mode: 'success' | 'fail' = 'success';

  const resolver = createProxySeriesResolver({
    now: () => now,
    sharedCache: {
      async get() { return null; },
      async set() { /* noop */ },
    },
    registryFactory: () => ({
      finnhub: {
        configured: true,
        symbol: 'UUP',
        load: async () => mode === 'success' ? makeSeriesResult('usd', 'finnhub', -0.10) : downResult('finnhub', 'UUP'),
      },
      alphavantage: {
        configured: false,
        symbol: 'UUP',
        load: async () => downResult('alphavantage', 'UUP'),
      },
      yahooRelay: {
        configured: false,
        symbol: 'UUP',
        load: async () => downResult('yahooRelay', 'UUP'),
      },
    }),
  });

  const first = await resolver.getProxySeries('usd');
  assert.ok(first.series);
  assert.equal(first.providerHealth.finnhub.state, 'active');

  mode = 'fail';
  now += REGIME_CONFIG.cache.providerTtlMs + 1_000;

  const stale = await resolver.getProxySeries('usd');
  assert.ok(stale.series);
  assert.equal(stale.providerHealth.finnhub.state, 'stale');
  }
}
