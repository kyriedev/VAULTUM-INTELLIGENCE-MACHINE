declare const process: { env: Record<string, string | undefined> };

import { REGIME_CONFIG } from '../../../config/regime.ts';
import { buildNormalizedSeries } from '../normalize.ts';
import type { NormalizedMarketCandle, ProviderFetchResult, ProviderHealthSnapshot, RegimeProxyDefinition } from '../types.ts';
import { fetchJson } from '../../../../server/_shared/fetch-json.ts';
import { fetchYahooChart } from '../../../../server/vaultum/_shared/yahoo.ts';

type RelayPayload = {
  candles?: Array<{
    time?: string;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number | null;
  }>;
  data?: Array<{
    time?: string;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number | null;
  }>;
};

function env(name: string): string {
  return (process.env[name] || '').trim();
}

function failure(detail: string, symbol: string, startedAt: number): ProviderFetchResult {
  return {
    series: null,
    providerHealth: {
      provider: 'yahooRelay',
      state: 'down',
      detail,
      successes: 0,
      failures: 1,
      staleHits: 0,
      symbols: [symbol],
      lastSuccessAt: null,
      lastErrorAt: new Date().toISOString(),
      lastLatencyMs: Date.now() - startedAt,
    },
  };
}

function normalizeRelayCandles(payload: RelayPayload | null | undefined): NormalizedMarketCandle[] {
  const source = Array.isArray(payload?.candles) ? payload.candles : Array.isArray(payload?.data) ? payload.data : [];
  return source.map((candle) => ({
    time: typeof candle.time === 'string' ? candle.time : '',
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: typeof candle.volume === 'number' ? candle.volume : null,
  }));
}

async function fetchViaRelay(symbol: string): Promise<{ candles: NormalizedMarketCandle[]; warning: string | null }> {
  const base = env('YAHOO_RELAY_URL');
  if (!base) return { candles: [], warning: 'YAHOO_RELAY_URL is not configured; direct Yahoo fallback is in use.' };
  const url = new URL(base);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('range', '1y');
  url.searchParams.set('interval', '1d');
  const payload = await fetchJson<RelayPayload>(url.toString(), { timeoutMs: REGIME_CONFIG.request.timeoutMs });
  return {
    candles: normalizeRelayCandles(payload),
    warning: null,
  };
}

export async function fetchYahooRelaySeries(proxy: RegimeProxyDefinition): Promise<ProviderFetchResult> {
  const startedAt = Date.now();
  const symbol = proxy.providerSymbols.yahooRelay;
  const relay = await fetchViaRelay(symbol);
  let warnings = relay.warning ? [relay.warning] : [];
  let candles = relay.candles;

  if (!candles.length) {
    const chart = await fetchYahooChart(symbol, '1y', '1d');
    candles = chart?.candles.map((candle) => ({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    })) ?? [];
    warnings = [
      ...warnings,
      ...(chart?.warnings ?? []),
      relay.warning ? 'Yahoo relay was unavailable, so direct Yahoo chart fallback was used.' : 'Direct Yahoo chart fallback was used.',
    ];
  }

  const series = buildNormalizedSeries({
    proxy,
    source: 'yahooRelay',
    sourceSymbol: symbol,
    candles,
    warnings,
  });

  if (!series) {
    return failure(`Yahoo relay fallback returned insufficient normalized candles for ${symbol}.`, symbol, startedAt);
  }

  const providerHealth: ProviderHealthSnapshot = {
    provider: 'yahooRelay',
    state: relay.warning ? 'degraded' : 'active',
    detail: relay.warning
      ? `Yahoo relay used direct Yahoo fallback for ${symbol}.`
      : `Yahoo relay delivered ${candles.length} daily candles for ${symbol}.`,
    successes: 1,
    failures: 0,
    staleHits: 0,
    symbols: [symbol],
    lastSuccessAt: new Date().toISOString(),
    lastErrorAt: null,
    lastLatencyMs: Date.now() - startedAt,
  };

  return { series, providerHealth };
}
