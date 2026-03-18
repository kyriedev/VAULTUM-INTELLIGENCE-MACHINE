const memoryCache = new Map<string, { value: unknown; expiresAt: number }>();
const inFlight = new Map<string, Promise<unknown>>();

export async function getCachedOrCompute<T>(key: string, compute: () => Promise<T> | T, ttlSeconds = 300): Promise<T> {
  const now = Date.now();
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value as T;

  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = Promise.resolve(compute()).then((value) => {
    memoryCache.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
    inFlight.delete(key);
    return value;
  }).catch((error) => {
    inFlight.delete(key);
    throw error;
  });

  inFlight.set(key, promise);
  return promise as Promise<T>;
}
