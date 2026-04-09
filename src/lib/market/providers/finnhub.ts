declare const process: { env: Record<string, string | undefined> };

import { REGIME_CONFIG } from '../../../config/regime.ts';
import { buildNormalizedSeries } from '../normalize.ts';
import type { ProviderFetchResult, ProviderHealthSnapshot, RegimeProxyDefinition } from '../types.ts';
import { fetchJson } from '../../../../server/_shared/fetch-json.ts';

type FinnhubCandlePayload = {
  c?: number[];
  h?: number[];
  l?: number[];
  o?: number[];
  t?: number[];
  v?: number[];
  s?: string;
  error?: string;
};

const FINNHUB_BASE_URL = 'https://api.finnhub.io/api/v1';

function env(name: string): string {
  return (process.env[name] || '').trim();
}

function inactive(detail: string): ProviderFetchResult {
  return {
    series: null,
    providerHealth: {
      provider: 'finnhub',
      state: 'inactive',
      detail,
      successes: 0,
      failures: 0,
      staleHits: 0,
      symbols: [],
      lastSuccessAt: null,
      lastErrorAt: null,
      lastLatencyMs: null,
    },
  };
}

function failure(detail: string, symbol: string, startedAt: number): ProviderFetchResult {
  return {
    series: null,
    providerHealth: {
      provider: 'finnhub',
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

export function finnhubProviderConfigured(): boolean {
  return Boolean(env('FINNHUB_API_KEY'));
}

export async function fetchFinnhubSeries(proxy: RegimeProxyDefinition): Promise<ProviderFetchResult> {
  if (!finnhubProviderConfigured()) {
    return inactive('FINNHUB_API_KEY is not configured, so the provider is skipped.');
  }

  const startedAt = Date.now();
  const symbol = proxy.providerSymbols.finnhub;
  const from = Math.floor((Date.now() - (420 * 24 * 60 * 60 * 1000)) / 1000);
  const to = Math.floor(Date.now() / 1000);
  const url = new URL(`${FINNHUB_BASE_URL}/stock/candle`);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('resolution', 'D');
  url.searchParams.set('from', String(from));
  url.searchParams.set('to', String(to));
  url.searchParams.set('token', env('FINNHUB_API_KEY'));

  const payload = await fetchJson<FinnhubCandlePayload>(url.toString(), { timeoutMs: REGIME_CONFIG.request.timeoutMs });
  if (!payload || payload.s !== 'ok' || !Array.isArray(payload.c) || !payload.c.length) {
    return failure(payload?.error || `Finnhub candle payload was unavailable for ${symbol}.`, symbol, startedAt);
  }

  const candles = payload.t?.map((timestamp, index) => ({
    time: new Date(timestamp * 1000).toISOString(),
    open: Number(payload.o?.[index]),
    high: Number(payload.h?.[index]),
    low: Number(payload.l?.[index]),
    close: Number(payload.c?.[index]),
    volume: Number.isFinite(Number(payload.v?.[index])) ? Number(payload.v?.[index]) : null,
  })) ?? [];

  const series = buildNormalizedSeries({
    proxy,
    source: 'finnhub',
    sourceSymbol: symbol,
    candles,
  });

  if (!series) {
    return failure(`Finnhub returned insufficient normalized candles for ${symbol}.`, symbol, startedAt);
  }

  const providerHealth: ProviderHealthSnapshot = {
    provider: 'finnhub',
    state: 'active',
    detail: `Finnhub delivered ${candles.length} daily candles for ${symbol}.`,
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
