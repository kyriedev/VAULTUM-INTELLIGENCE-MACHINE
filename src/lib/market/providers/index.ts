declare const process: { env: Record<string, string | undefined> };

import { REGIME_CONFIG, REGIME_PROVIDER_PRIORITY, REGIME_PROXY_DEFINITIONS, type RegimeProxyId } from '../../../config/regime.ts';
import type {
  MarketProviderName,
  NormalizedMarketSeries,
  ProviderFetchResult,
  ProviderHealthSnapshot,
} from '../types.ts';
import { getCachedJson, setCachedJson } from '../../../../server/_shared/redis.ts';

type SharedCacheEnvelope<T> = {
  value: T;
  cachedAt: number;
  expiresAt: number;
  staleUntil: number;
};

type SharedCacheAdapter = {
  get<T>(key: string): Promise<SharedCacheEnvelope<T> | null>;
  set<T>(key: string, entry: SharedCacheEnvelope<T>): Promise<void>;
};

type ProviderLoader = () => Promise<ProviderFetchResult>;

type ResolverOptions = {
  now?: () => number;
  sharedCache?: SharedCacheAdapter;
  registryFactory?: typeof providerRegistry;
};

type ProxyFetchOutcome = {
  series: NormalizedMarketSeries | null;
  providerHealth: Record<Exclude<MarketProviderName, 'brokerVolume'>, ProviderHealthSnapshot>;
};

type CacheEntry<T> = SharedCacheEnvelope<T>;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultHealth(provider: Exclude<MarketProviderName, 'brokerVolume'>): ProviderHealthSnapshot {
  return {
    provider,
    state: 'inactive',
    detail: 'Provider was not requested yet.',
    successes: 0,
    failures: 0,
    staleHits: 0,
    symbols: [],
    lastSuccessAt: null,
    lastErrorAt: null,
    lastLatencyMs: null,
  };
}

function buildEnvelope<T>(value: T, now: number): CacheEntry<T> {
  return {
    value,
    cachedAt: now,
    expiresAt: now + REGIME_CONFIG.cache.providerTtlMs,
    staleUntil: now + REGIME_CONFIG.cache.providerStaleTtlMs,
  };
}

function isFresh<T>(entry: CacheEntry<T> | null | undefined, now: number): entry is CacheEntry<T> {
  return Boolean(entry && entry.expiresAt > now);
}

function isServeable<T>(entry: CacheEntry<T> | null | undefined, now: number): entry is CacheEntry<T> {
  return Boolean(entry && entry.staleUntil > now);
}

function mergeSymbols(target: string[], incoming: string[]): string[] {
  return [...new Set([...target, ...incoming])];
}

function mergeHealth(current: ProviderHealthSnapshot, next: ProviderHealthSnapshot): ProviderHealthSnapshot {
  const successes = current.successes + next.successes;
  const failures = current.failures + next.failures;
  const staleHits = current.staleHits + next.staleHits;
  const state = successes > 0
    ? (failures > 0 || staleHits > 0 || next.state === 'degraded' ? 'degraded' : next.state === 'stale' ? 'stale' : 'active')
    : staleHits > 0
      ? 'stale'
      : current.state === 'inactive' && next.state === 'inactive'
        ? 'inactive'
        : 'down';

  return {
    provider: current.provider,
    state,
    detail: next.detail || current.detail,
    successes,
    failures,
    staleHits,
    symbols: mergeSymbols(current.symbols, next.symbols),
    lastSuccessAt: next.lastSuccessAt ?? current.lastSuccessAt,
    lastErrorAt: next.lastErrorAt ?? current.lastErrorAt,
    lastLatencyMs: next.lastLatencyMs ?? current.lastLatencyMs,
  };
}

function sharedCacheKey(provider: string, symbol: string): string {
  return `market:provider:${provider}:${symbol}:${REGIME_CONFIG.timeframe}`;
}

function createSharedCacheAdapter(): SharedCacheAdapter {
  return {
    async get<T>(key: string): Promise<CacheEntry<T> | null> {
      return getCachedJson<CacheEntry<T>>(key);
    },
    async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
      const ttlSeconds = clamp(Math.ceil((entry.staleUntil - Date.now()) / 1000), 60, 3600);
      await setCachedJson(key, entry, ttlSeconds);
    },
  };
}

function providerRegistry(proxyId: RegimeProxyId) {
  const proxy = REGIME_PROXY_DEFINITIONS[proxyId];
  return {
    finnhub: {
      configured: Boolean((process.env.FINNHUB_API_KEY || '').trim()),
      symbol: proxy.providerSymbols.finnhub,
      load: async () => (await import('./finnhub.ts')).fetchFinnhubSeries(proxy),
    },
    alphavantage: {
      configured: Boolean((process.env.ALPHAVANTAGE_API_KEY || '').trim()),
      symbol: proxy.providerSymbols.alphavantage,
      load: async () => (await import('./alphavantage.ts')).fetchAlphaVantageSeries(proxy),
    },
    yahooRelay: {
      configured: true,
      symbol: proxy.providerSymbols.yahooRelay,
      load: async () => (await import('./yahooRelay.ts')).fetchYahooRelaySeries(proxy),
    },
  };
}

export function createProxySeriesResolver(options: ResolverOptions = {}) {
  const now = options.now ?? (() => Date.now());
  const sharedCache = options.sharedCache ?? createSharedCacheAdapter();
  const registryFactory = options.registryFactory ?? providerRegistry;
  const memoryCache = new Map<string, CacheEntry<NormalizedMarketSeries>>();
  const inFlight = new Map<string, Promise<ProviderFetchResult>>();

  async function requestWithCache(
    provider: Exclude<MarketProviderName, 'brokerVolume'>,
    symbol: string,
    load: ProviderLoader,
  ): Promise<ProviderFetchResult> {
    const key = sharedCacheKey(provider, symbol);
    const currentNow = now();
    const memory = memoryCache.get(key);
    if (isFresh(memory, currentNow)) {
      return {
        series: memory.value,
        providerHealth: {
          provider,
          state: 'active',
          detail: `Served ${symbol} from the warm market-provider memory cache.`,
          successes: 1,
          failures: 0,
          staleHits: 0,
          symbols: [symbol],
          lastSuccessAt: new Date(memory.cachedAt).toISOString(),
          lastErrorAt: null,
          lastLatencyMs: 0,
        },
      };
    }

    const shared = !isFresh(memory, currentNow) ? await sharedCache.get<NormalizedMarketSeries>(key) : null;
    if (isFresh(shared, currentNow)) {
      memoryCache.set(key, shared);
      return {
        series: shared.value,
        providerHealth: {
          provider,
          state: 'active',
          detail: `Served ${symbol} from shared provider cache.`,
          successes: 1,
          failures: 0,
          staleHits: 0,
          symbols: [symbol],
          lastSuccessAt: new Date(shared.cachedAt).toISOString(),
          lastErrorAt: null,
          lastLatencyMs: 0,
        },
      };
    }

    const existing = inFlight.get(key);
    if (existing) return existing;

    const promise = (async () => {
      let lastResult: ProviderFetchResult | null = null;
      for (let attempt = 0; attempt <= REGIME_CONFIG.request.retries; attempt += 1) {
        lastResult = await load();
        if (lastResult.series) {
          const entry = buildEnvelope(lastResult.series, now());
          memoryCache.set(key, entry);
          await sharedCache.set(key, entry);
          return lastResult;
        }
        if (attempt < REGIME_CONFIG.request.retries) {
          await delay(REGIME_CONFIG.request.backoffMs * (attempt + 1));
        }
      }

      const staleMemory = memoryCache.get(key);
      if (isServeable(staleMemory, now())) {
        const staleResult: ProviderFetchResult = {
          series: staleMemory.value,
          providerHealth: {
            ...(lastResult?.providerHealth ?? defaultHealth(provider)),
            provider,
            state: 'stale',
            detail: `Served stale ${symbol} provider cache after upstream failure.`,
            staleHits: 1,
          },
        };
        return staleResult;
      }

      const staleShared = await sharedCache.get<NormalizedMarketSeries>(key);
      if (isServeable(staleShared, now())) {
        memoryCache.set(key, staleShared);
        const staleResult: ProviderFetchResult = {
          series: staleShared.value,
          providerHealth: {
            ...(lastResult?.providerHealth ?? defaultHealth(provider)),
            provider,
            state: 'stale',
            detail: `Served stale shared cache for ${symbol} after upstream failure.`,
            staleHits: 1,
          },
        };
        return staleResult;
      }

      const exhausted: ProviderFetchResult = lastResult ?? {
        series: null,
        providerHealth: {
          ...defaultHealth(provider),
          state: 'down',
          detail: `Provider chain exhausted without usable data for ${symbol}.`,
          failures: 1,
          symbols: [symbol],
          lastErrorAt: new Date().toISOString(),
        },
      };
      return exhausted;
    })().finally(() => {
      inFlight.delete(key);
    });

    inFlight.set(key, promise);
    return promise;
  }

  async function getProxySeries(proxyId: RegimeProxyId): Promise<ProxyFetchOutcome> {
    const providers = registryFactory(proxyId);
    const health = {
      finnhub: defaultHealth('finnhub'),
      alphavantage: defaultHealth('alphavantage'),
      yahooRelay: defaultHealth('yahooRelay'),
    };

    for (const provider of REGIME_PROVIDER_PRIORITY) {
      const current = providers[provider];
      if (!current.configured) {
        health[provider] = {
          ...defaultHealth(provider),
          state: 'inactive',
          detail: `${provider} is not configured for this environment.`,
          symbols: [current.symbol],
        };
        continue;
      }

      const result = await requestWithCache(provider, current.symbol, current.load);
      health[provider] = mergeHealth(health[provider], result.providerHealth);
      if (result.series) {
        return { series: result.series, providerHealth: health };
      }
    }

    return { series: null, providerHealth: health };
  }

  async function getProxyBasket(proxyIds: RegimeProxyId[]): Promise<{
    series: Record<RegimeProxyId, NormalizedMarketSeries | null>;
    providerHealth: Record<Exclude<MarketProviderName, 'brokerVolume'>, ProviderHealthSnapshot>;
  }> {
    const seriesEntries = await Promise.all(proxyIds.map(async (proxyId) => [proxyId, await getProxySeries(proxyId)] as const));
    const providerHealth = {
      finnhub: defaultHealth('finnhub'),
      alphavantage: defaultHealth('alphavantage'),
      yahooRelay: defaultHealth('yahooRelay'),
    };

    const series = Object.fromEntries(
      seriesEntries.map(([proxyId, result]) => {
        providerHealth.finnhub = mergeHealth(providerHealth.finnhub, result.providerHealth.finnhub);
        providerHealth.alphavantage = mergeHealth(providerHealth.alphavantage, result.providerHealth.alphavantage);
        providerHealth.yahooRelay = mergeHealth(providerHealth.yahooRelay, result.providerHealth.yahooRelay);
        return [proxyId, result.series];
      }),
    ) as Record<RegimeProxyId, NormalizedMarketSeries | null>;

    return { series, providerHealth };
  }

  function reset(): void {
    memoryCache.clear();
    inFlight.clear();
  }

  return {
    getProxySeries,
    getProxyBasket,
    reset,
  };
}

const defaultResolver = createProxySeriesResolver();

export async function getNormalizedProxyBasket(proxyIds: RegimeProxyId[]) {
  return defaultResolver.getProxyBasket(proxyIds);
}

export function resetNormalizedProxyProviderState(): void {
  defaultResolver.reset();
}
