declare const process: { env: Record<string, string | undefined> };

import { RELAY_CONFIG } from './_config.ts';
import { getOrRefreshRelaySnapshot } from './_cache.ts';
import { fetchJsonWithRetry, fetchTextWithRetry } from './_http.ts';
import type {
  MacroIndicatorPoint,
  RelayMacroSnapshot,
  RelayProviderStatus,
  RelayUnifiedPoint,
} from './_types.ts';
import { getFredSeries } from '../../macro/v1/get-fred-series.ts';

function env(name: string): string {
  return (process.env[name] || '').trim();
}

function toNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildIndicatorPoint(asset: string, current: number | null, previous: number | null, timestamp: string | null, source: string): MacroIndicatorPoint {
  const change = current != null && previous != null ? Number((current - previous).toFixed(4)) : null;
  return {
    asset,
    value: current,
    previous,
    change,
    timestamp,
    source,
  };
}

function toUnifiedPoint(asset: string, value: number | null, timestamp: string | null, source: string): RelayUnifiedPoint {
  return {
    timestamp: timestamp ?? new Date().toISOString(),
    asset,
    price: value,
    volume: null,
    buy_volume: null,
    sell_volume: null,
    source,
  };
}

function providerStatus(
  provider: string,
  state: RelayProviderStatus['state'],
  detail: string,
  source: string | null,
): RelayProviderStatus {
  return {
    provider,
    state,
    detail,
    updatedAt: new Date().toISOString(),
    source,
  };
}

async function fetchWorldBankIndicator(country: string, indicator: string): Promise<MacroIndicatorPoint> {
  const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(country)}/indicator/${encodeURIComponent(indicator)}?format=json&per_page=2&mrv=2`;
  const response = await fetchJsonWithRetry<any[]>(url, { timeoutMs: 7_500, retries: 1 });
  const rows = Array.isArray(response.data?.[1]) ? response.data[1] : [];
  const latest = rows[0] ?? null;
  const previous = rows[1] ?? null;
  return buildIndicatorPoint(
    `${country}:${indicator}`,
    toNumber(latest?.value),
    toNumber(previous?.value),
    typeof latest?.date === 'string' ? latest.date : null,
    'World Bank',
  );
}

function extractImfSeriesValue(payload: any, indicator: string, country: string): { current: number | null; previous: number | null; timestamp: string | null } {
  const upperIndicator = indicator.toUpperCase();
  const upperCountry = country.toUpperCase();
  const search = (node: any): Array<{ year: string; value: number }> => {
    if (node == null) return [];
    if (Array.isArray(node)) return node.flatMap(search);
    if (typeof node !== 'object') return [];

    const candidates: Array<{ year: string; value: number }> = [];
    const maybeCountry = node[upperCountry] ?? node[country] ?? null;
    if (maybeCountry && typeof maybeCountry === 'object') {
      Object.entries(maybeCountry).forEach(([year, value]) => {
        const numeric = toNumber(value);
        if (numeric != null) candidates.push({ year, value: numeric });
      });
      if (candidates.length) return candidates;
    }

    if (upperIndicator in node || indicator in node) {
      return search(node[upperIndicator] ?? node[indicator]);
    }

    return Object.values(node).flatMap(search);
  };

  const entries = search(payload)
    .sort((left, right) => Number(left.year) - Number(right.year));
  const current = entries[entries.length - 1] ?? null;
  const previous = entries[entries.length - 2] ?? null;
  return {
    current: current?.value ?? null,
    previous: previous?.value ?? null,
    timestamp: current?.year ?? null,
  };
}

async function fetchImfIndicator(country: string, indicator: string): Promise<MacroIndicatorPoint> {
  const url = `https://www.imf.org/external/datamapper/api/v1/${encodeURIComponent(indicator)}/${encodeURIComponent(country)}`;
  const response = await fetchJsonWithRetry<any>(url, { timeoutMs: 7_500, retries: 1 });
  const series = extractImfSeriesValue(response.data, indicator, country);
  return buildIndicatorPoint(
    `${country}:${indicator}`,
    series.current,
    series.previous,
    series.timestamp,
    'IMF DataMapper',
  );
}

async function fetchOptionalScrapeMetric(provider: 'Trading Economics' | 'WTO', urlValue: string, asset: string): Promise<MacroIndicatorPoint> {
  const response = await fetchTextWithRetry(urlValue, {
    headers: { Accept: 'text/html' },
    timeoutMs: 6_500,
    retries: 0,
  });
  const html = response.data.toLowerCase();
  const score = provider === 'Trading Economics'
    ? ((html.match(/calendar/g)?.length ?? 0) * 2) + (html.match(/importance/g)?.length ?? 0)
    : ((html.match(/tariff/g)?.length ?? 0) * 2) + (html.match(/trade/g)?.length ?? 0) + (html.match(/restriction/g)?.length ?? 0) + (html.match(/member/g)?.length ?? 0);
  return buildIndicatorPoint(asset, score, null, new Date().toISOString(), provider);
}

async function refreshRelayMacroSnapshot(): Promise<Omit<RelayMacroSnapshot, 'cacheState' | 'stale'>> {
  const normalized: RelayUnifiedPoint[] = [];
  const warnings: string[] = [];
  const indicators: RelayMacroSnapshot['indicators'] = {
    fred: {},
    worldBank: {},
    imf: {},
    optional: {},
  };
  const providers: Record<string, RelayProviderStatus> = {};

  const fredResults = await Promise.all(RELAY_CONFIG.fredSeries.map(async (seriesId) => {
    const payload = await getFredSeries({ seriesId, limit: 2 });
    const latest = payload.observations?.[0] ?? null;
    const previous = payload.observations?.[1] ?? null;
    const point = buildIndicatorPoint(seriesId, latest?.value ?? null, previous?.value ?? null, latest?.date ?? null, payload.source);
    indicators.fred[seriesId] = point;
    normalized.push(toUnifiedPoint(seriesId, point.value, point.timestamp, payload.source));
    return point.value != null;
  }));
  providers.fred = providerStatus(
    'fred',
    fredResults.some(Boolean) ? 'live' : 'error',
    fredResults.some(Boolean) ? 'FRED macro series refreshed successfully.' : 'FRED series were unavailable or the key is missing.',
    'FRED',
  );
  if (!fredResults.some(Boolean)) warnings.push('FRED macro series are unavailable, so rates context is degraded.');

  const worldBankResults = await Promise.all(RELAY_CONFIG.worldBankIndicators.map(async ({ country, indicator }) => {
    try {
      const point = await fetchWorldBankIndicator(country, indicator);
      indicators.worldBank[`${country}:${indicator}`] = point;
      normalized.push(toUnifiedPoint(`${country}:${indicator}`, point.value, point.timestamp, point.source));
      return point.value != null;
    } catch (error) {
      warnings.push(`World Bank ${country}:${indicator} unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
      return false;
    }
  }));
  providers.worldBank = providerStatus(
    'world-bank',
    worldBankResults.some(Boolean) ? 'live' : 'error',
    worldBankResults.some(Boolean) ? 'World Bank indicators refreshed.' : 'World Bank indicators did not return usable values.',
    'World Bank',
  );

  const imfResults = await Promise.all(RELAY_CONFIG.imfIndicators.map(async ({ country, indicator }) => {
    try {
      const point = await fetchImfIndicator(country, indicator);
      indicators.imf[`${country}:${indicator}`] = point;
      normalized.push(toUnifiedPoint(`${country}:${indicator}`, point.value, point.timestamp, point.source));
      return point.value != null;
    } catch (error) {
      warnings.push(`IMF ${country}:${indicator} unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
      return false;
    }
  }));
  providers.imf = providerStatus(
    'imf',
    imfResults.some(Boolean) ? 'live' : 'error',
    imfResults.some(Boolean) ? 'IMF indicators refreshed.' : 'IMF indicators did not return usable values.',
    'IMF DataMapper',
  );

  const optionalIndicators: Array<Promise<boolean>> = [];
  if (RELAY_CONFIG.optionalScrapersEnabled) {
    const tradingEconomicsUrl = env('TRADING_ECONOMICS_SCRAPE_URL');
    const wtoUrl = env('WTO_SCRAPE_URL');

    if (tradingEconomicsUrl) {
      optionalIndicators.push((async () => {
        try {
          const point = await fetchOptionalScrapeMetric('Trading Economics', tradingEconomicsUrl, 'TRADING_ECONOMICS:CALENDAR_ACTIVITY');
          indicators.optional.tradingEconomics = point;
          normalized.push(toUnifiedPoint(point.asset, point.value, point.timestamp, point.source));
          return point.value != null;
        } catch (error) {
          warnings.push(`Trading Economics optional scrape failed: ${error instanceof Error ? error.message : 'unknown error'}`);
          return false;
        }
      })());
    }

    if (wtoUrl) {
      optionalIndicators.push((async () => {
        try {
          const point = await fetchOptionalScrapeMetric('WTO', wtoUrl, 'WTO:TRADE_RESTRICTION_ACTIVITY');
          indicators.optional.wto = point;
          normalized.push(toUnifiedPoint(point.asset, point.value, point.timestamp, point.source));
          return point.value != null;
        } catch (error) {
          warnings.push(`WTO optional scrape failed: ${error instanceof Error ? error.message : 'unknown error'}`);
          return false;
        }
      })());
    }
  }

  const optionalResults = optionalIndicators.length ? await Promise.all(optionalIndicators) : [];
  providers.optionalScrapers = providerStatus(
    'optional-scrapers',
    !RELAY_CONFIG.optionalScrapersEnabled
      ? 'disabled'
      : optionalIndicators.length === 0
        ? 'inactive'
        : optionalResults.some(Boolean)
          ? 'live'
          : 'error',
    !RELAY_CONFIG.optionalScrapersEnabled
      ? 'Optional scrapers are disabled by configuration.'
      : optionalIndicators.length === 0
        ? 'Optional scrapers are enabled but no scrape URLs were provided.'
        : optionalResults.some(Boolean)
          ? 'Optional scrapers returned usable metrics.'
          : 'Optional scrapers did not return usable metrics.',
    optionalIndicators.length ? 'HTML scrape sidecar' : null,
  );

  return {
    timestamp: new Date().toISOString(),
    normalized,
    indicators,
    providers,
    warnings,
  };
}

export async function getRelayMacroSnapshot(input?: { forceRefresh?: boolean }): Promise<RelayMacroSnapshot> {
  const useCache = !input?.forceRefresh;
  const result = useCache
    ? await getOrRefreshRelaySnapshot(
      'macro',
      'global',
      () => refreshRelayMacroSnapshot(),
      RELAY_CONFIG.macroCacheTtlSeconds,
      RELAY_CONFIG.macroStaleTtlSeconds,
    )
    : {
      value: await refreshRelayMacroSnapshot(),
      cacheState: 'live' as const,
      stale: false,
      updatedAt: new Date().toISOString(),
    };

  return {
    ...result.value,
    cacheState: result.cacheState,
    stale: result.stale,
  };
}
