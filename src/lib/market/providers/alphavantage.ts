declare const process: { env: Record<string, string | undefined> };

import { REGIME_CONFIG } from '../../../config/regime.ts';
import { buildNormalizedSeries } from '../normalize.ts';
import type { ProviderFetchResult, ProviderHealthSnapshot, RegimeProxyDefinition } from '../types.ts';
import { fetchJson } from '../../../../server/_shared/fetch-json.ts';

type AlphaVantageDailyPayload = {
  'Time Series (Daily)'?: Record<string, {
    '1. open'?: string;
    '2. high'?: string;
    '3. low'?: string;
    '4. close'?: string;
    '6. volume'?: string;
  }>;
  Note?: string;
  Information?: string;
  'Error Message'?: string;
};

const ALPHAVANTAGE_URL = 'https://www.alphavantage.co/query';

function env(name: string): string {
  return (process.env[name] || '').trim();
}

function inactive(detail: string): ProviderFetchResult {
  return {
    series: null,
    providerHealth: {
      provider: 'alphavantage',
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
      provider: 'alphavantage',
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

export function alphaVantageConfigured(): boolean {
  return Boolean(env('ALPHAVANTAGE_API_KEY'));
}

export async function fetchAlphaVantageSeries(proxy: RegimeProxyDefinition): Promise<ProviderFetchResult> {
  if (!alphaVantageConfigured()) {
    return inactive('ALPHAVANTAGE_API_KEY is not configured, so the provider is skipped.');
  }

  const startedAt = Date.now();
  const symbol = proxy.providerSymbols.alphavantage;
  const url = new URL(ALPHAVANTAGE_URL);
  url.searchParams.set('function', 'TIME_SERIES_DAILY_ADJUSTED');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('outputsize', 'full');
  url.searchParams.set('apikey', env('ALPHAVANTAGE_API_KEY'));

  const payload = await fetchJson<AlphaVantageDailyPayload>(url.toString(), { timeoutMs: REGIME_CONFIG.request.timeoutMs });
  const rows = payload?.['Time Series (Daily)'];
  if (!rows || typeof rows !== 'object') {
    return failure(
      payload?.Note || payload?.Information || payload?.['Error Message'] || `Alpha Vantage daily series was unavailable for ${symbol}.`,
      symbol,
      startedAt,
    );
  }

  const candles = Object.entries(rows)
    .map(([date, values]) => ({
      time: new Date(`${date}T00:00:00.000Z`).toISOString(),
      open: Number(values['1. open']),
      high: Number(values['2. high']),
      low: Number(values['3. low']),
      close: Number(values['4. close']),
      volume: Number.isFinite(Number(values['6. volume'])) ? Number(values['6. volume']) : null,
    }));

  const series = buildNormalizedSeries({
    proxy,
    source: 'alphavantage',
    sourceSymbol: symbol,
    candles,
  });

  if (!series) {
    return failure(`Alpha Vantage returned insufficient normalized candles for ${symbol}.`, symbol, startedAt);
  }

  const providerHealth: ProviderHealthSnapshot = {
    provider: 'alphavantage',
    state: 'active',
    detail: `Alpha Vantage delivered ${candles.length} daily candles for ${symbol}.`,
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
