declare const process: { env: Record<string, string | undefined> };

type CacheEnvelope<T> = {
  value: T;
  cachedAt: number;
  expiresAt: number;
  staleUntil: number;
};

const memoryCache = new Map<string, CacheEnvelope<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

const REDIS_TIMEOUT_MS = 3_000;
const MIN_STALE_TTL_SECONDS = 180;

function env(name: string): string {
  return (process.env[name] || '').trim();
}

function getKeyPrefix(): string {
  const vercelEnv = env('VERCEL_ENV');
  if (!vercelEnv || vercelEnv === 'production') return '';
  const sha = env('VERCEL_GIT_COMMIT_SHA').slice(0, 8) || 'dev';
  return `${vercelEnv}:${sha}:`;
}

let cachedPrefix: string | undefined;
function prefixKey(key: string): string {
  if (cachedPrefix === undefined) cachedPrefix = getKeyPrefix();
  return cachedPrefix ? `${cachedPrefix}${key}` : key;
}

function staleTtlSeconds(ttlSeconds: number): number {
  return Math.max(ttlSeconds, MIN_STALE_TTL_SECONDS);
}

function buildEnvelope<T>(value: T, ttlSeconds: number): CacheEnvelope<T> {
  const now = Date.now();
  const staleSeconds = staleTtlSeconds(ttlSeconds);
  return {
    value,
    cachedAt: now,
    expiresAt: now + ttlSeconds * 1000,
    staleUntil: now + (ttlSeconds + staleSeconds) * 1000,
  };
}

function normalizeEnvelope<T>(value: unknown): CacheEnvelope<T> | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<CacheEnvelope<T>>;
  if (!('value' in candidate) || typeof candidate.expiresAt !== 'number' || typeof candidate.staleUntil !== 'number') return null;
  return {
    value: candidate.value as T,
    cachedAt: typeof candidate.cachedAt === 'number' ? candidate.cachedAt : Date.now(),
    expiresAt: candidate.expiresAt,
    staleUntil: candidate.staleUntil,
  };
}

function isFresh<T>(record: CacheEnvelope<T> | null | undefined): record is CacheEnvelope<T> {
  return Boolean(record && record.expiresAt > Date.now());
}

function isServeable<T>(record: CacheEnvelope<T> | null | undefined): record is CacheEnvelope<T> {
  return Boolean(record && record.staleUntil > Date.now());
}

function setMemoryEnvelope<T>(key: string, record: CacheEnvelope<T>): void {
  memoryCache.set(key, record as CacheEnvelope<unknown>);
}

export function sharedCacheConfigured(): boolean {
  return Boolean(env('UPSTASH_REDIS_REST_URL') && env('UPSTASH_REDIS_REST_TOKEN'));
}

export function sharedCacheMode(): 'memory-only' | 'memory-plus-upstash' {
  return sharedCacheConfigured() ? 'memory-plus-upstash' : 'memory-only';
}

export async function getCachedJson<T>(key: string, raw = false): Promise<T | null> {
  if (!sharedCacheConfigured()) return null;
  const url = env('UPSTASH_REDIS_REST_URL');
  const token = env('UPSTASH_REDIS_REST_TOKEN');
  try {
    const finalKey = raw ? key : prefixKey(key);
    const response = await fetch(`${url}/get/${encodeURIComponent(finalKey)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { result?: string };
    if (!payload.result) return null;
    return JSON.parse(payload.result) as T;
  } catch {
    return null;
  }
}

export async function setCachedJson(key: string, value: unknown, ttlSeconds: number, raw = false): Promise<void> {
  if (!sharedCacheConfigured()) return;
  const url = env('UPSTASH_REDIS_REST_URL');
  const token = env('UPSTASH_REDIS_REST_TOKEN');
  try {
    const finalKey = raw ? key : prefixKey(key);
    await fetch(`${url}/set/${encodeURIComponent(finalKey)}/${encodeURIComponent(JSON.stringify(value))}/EX/${Math.max(1, ttlSeconds)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    });
  } catch {
    /* best effort */
  }
}

async function getSharedEnvelope<T>(key: string): Promise<CacheEnvelope<T> | null> {
  const payload = await getCachedJson<CacheEnvelope<T>>(key);
  return normalizeEnvelope<T>(payload);
}

async function setSharedEnvelope<T>(key: string, record: CacheEnvelope<T>): Promise<void> {
  const ttlSeconds = Math.max(1, Math.ceil((record.staleUntil - Date.now()) / 1000));
  await setCachedJson(key, record, ttlSeconds);
}

export async function getCachedOrCompute<T>(key: string, compute: () => Promise<T> | T, ttlSeconds = 300): Promise<T> {
  const memoryRecord = normalizeEnvelope<T>(memoryCache.get(key));
  if (isFresh(memoryRecord)) return memoryRecord.value;

  let sharedRecord: CacheEnvelope<T> | null = null;
  if (!isFresh(memoryRecord) && sharedCacheConfigured()) {
    sharedRecord = await getSharedEnvelope<T>(key);
    if (isFresh(sharedRecord)) {
      setMemoryEnvelope(key, sharedRecord);
      return sharedRecord.value;
    }
  }

  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = Promise.resolve(compute())
    .then(async (value) => {
      const record = buildEnvelope(value, ttlSeconds);
      setMemoryEnvelope(key, record);
      await setSharedEnvelope(key, record);
      return value;
    })
    .catch(async (error) => {
      const staleMemory = normalizeEnvelope<T>(memoryCache.get(key));
      if (isServeable(staleMemory)) return staleMemory.value;

      if (!sharedRecord && sharedCacheConfigured()) sharedRecord = await getSharedEnvelope<T>(key);
      if (isServeable(sharedRecord)) {
        setMemoryEnvelope(key, sharedRecord);
        return sharedRecord.value;
      }

      throw error;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise as Promise<T>;
}
