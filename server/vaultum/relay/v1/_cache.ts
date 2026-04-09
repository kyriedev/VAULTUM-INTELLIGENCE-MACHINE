import { cacheKey } from '../../../_shared/cache-keys.ts';
import { getCachedJson, setCachedJson } from '../../../_shared/redis.ts';
import type { RelayCacheState } from './_types.ts';

type RelayEnvelope<T> = {
  value: T;
  updatedAt: string;
  expiresAt: number;
  staleUntil: number;
};

export type RelayCachedResult<T> = {
  value: T;
  cacheState: RelayCacheState;
  stale: boolean;
  updatedAt: string | null;
};

const memoryCache = new Map<string, RelayEnvelope<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

function now(): number {
  return Date.now();
}

function buildKey(scope: string, id: string): string {
  return cacheKey('relay', `${scope}:${id}`);
}

function buildEnvelope<T>(value: T, ttlSeconds: number, staleTtlSeconds: number): RelayEnvelope<T> {
  const current = now();
  return {
    value,
    updatedAt: new Date(current).toISOString(),
    expiresAt: current + (ttlSeconds * 1000),
    staleUntil: current + (staleTtlSeconds * 1000),
  };
}

function normalizeEnvelope<T>(value: unknown): RelayEnvelope<T> | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<RelayEnvelope<T>>;
  if (!('value' in candidate) || typeof candidate.expiresAt !== 'number' || typeof candidate.staleUntil !== 'number') return null;
  return {
    value: candidate.value as T,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
    expiresAt: candidate.expiresAt,
    staleUntil: candidate.staleUntil,
  };
}

function isFresh<T>(record: RelayEnvelope<T> | null | undefined): record is RelayEnvelope<T> {
  return Boolean(record && record.expiresAt > now());
}

function isServeable<T>(record: RelayEnvelope<T> | null | undefined): record is RelayEnvelope<T> {
  return Boolean(record && record.staleUntil > now());
}

export async function readRelaySnapshot<T>(scope: string, id: string): Promise<RelayEnvelope<T> | null> {
  const key = buildKey(scope, id);
  const memoryRecord = normalizeEnvelope<T>(memoryCache.get(key));
  if (memoryRecord) return memoryRecord;
  const sharedRecord = normalizeEnvelope<T>(await getCachedJson<RelayEnvelope<T>>(key));
  if (sharedRecord) memoryCache.set(key, sharedRecord as RelayEnvelope<unknown>);
  return sharedRecord;
}

export async function setRelaySnapshot<T>(
  scope: string,
  id: string,
  value: T,
  ttlSeconds: number,
  staleTtlSeconds: number,
): Promise<RelayEnvelope<T>> {
  const key = buildKey(scope, id);
  const envelope = buildEnvelope(value, ttlSeconds, staleTtlSeconds);
  memoryCache.set(key, envelope as RelayEnvelope<unknown>);
  await setCachedJson(key, envelope, Math.max(1, Math.ceil(staleTtlSeconds)));
  return envelope;
}

export async function getOrRefreshRelaySnapshot<T>(
  scope: string,
  id: string,
  refresh: () => Promise<T>,
  ttlSeconds: number,
  staleTtlSeconds: number,
): Promise<RelayCachedResult<T>> {
  const key = buildKey(scope, id);
  const memoryRecord = normalizeEnvelope<T>(memoryCache.get(key));
  if (isFresh(memoryRecord)) {
    return { value: memoryRecord.value, cacheState: 'live', stale: false, updatedAt: memoryRecord.updatedAt };
  }

  let sharedRecord: RelayEnvelope<T> | null = null;
  if (!isFresh(memoryRecord)) {
    sharedRecord = normalizeEnvelope<T>(await getCachedJson<RelayEnvelope<T>>(key));
    if (isFresh(sharedRecord)) {
      memoryCache.set(key, sharedRecord as RelayEnvelope<unknown>);
      return { value: sharedRecord.value, cacheState: 'live', stale: false, updatedAt: sharedRecord.updatedAt };
    }
  }

  const existing = inFlight.get(key);
  if (existing) {
    const value = await (existing as Promise<T>);
    const updated = await readRelaySnapshot<T>(scope, id);
    return { value, cacheState: 'live', stale: false, updatedAt: updated?.updatedAt ?? null };
  }

  const promise = refresh()
    .then(async (value) => {
      await setRelaySnapshot(scope, id, value, ttlSeconds, staleTtlSeconds);
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);

  try {
    const value = await promise;
    const updated = await readRelaySnapshot<T>(scope, id);
    return { value, cacheState: 'live', stale: false, updatedAt: updated?.updatedAt ?? null };
  } catch (error) {
    let staleRecord: RelayEnvelope<T> | null = null;
    if (isServeable(memoryRecord)) staleRecord = memoryRecord;
    else if (isServeable(sharedRecord)) staleRecord = sharedRecord;
    if (staleRecord !== null) {
      const served = staleRecord as RelayEnvelope<T>;
      memoryCache.set(key, served as RelayEnvelope<unknown>);
      return { value: served.value, cacheState: 'stale', stale: true, updatedAt: served.updatedAt };
    }
    throw error;
  }
}
