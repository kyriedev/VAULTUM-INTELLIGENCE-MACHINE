import { CHROME_UA } from '../../../_shared/constants.ts';

export type RelayFetchOptions = {
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
};

export type RelayFetchResult<T> = {
  data: T;
  status: number;
  latencyMs: number;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeHeaders(headers?: Record<string, string>): Record<string, string> {
  return {
    Accept: 'application/json',
    'User-Agent': CHROME_UA,
    ...(headers ?? {}),
  };
}

export async function fetchJsonWithRetry<T>(url: string, options?: RelayFetchOptions): Promise<RelayFetchResult<T>> {
  const timeoutMs = options?.timeoutMs ?? 6_000;
  const retries = Math.max(0, options?.retries ?? 2);
  const backoffMs = Math.max(150, options?.backoffMs ?? 350);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const startedAt = Date.now();
    try {
      const response = await fetch(url, {
        method: options?.method ?? 'GET',
        headers: mergeHeaders(options?.headers),
        body: options?.body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      const data = await response.json() as T;
      return {
        data,
        status: response.status,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) {
        await wait(backoffMs * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error(`Relay fetch failed for ${url}`);
}

export async function fetchTextWithRetry(url: string, options?: RelayFetchOptions): Promise<RelayFetchResult<string>> {
  const timeoutMs = options?.timeoutMs ?? 6_000;
  const retries = Math.max(0, options?.retries ?? 2);
  const backoffMs = Math.max(150, options?.backoffMs ?? 350);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const startedAt = Date.now();
    try {
      const response = await fetch(url, {
        method: options?.method ?? 'GET',
        headers: mergeHeaders(options?.headers),
        body: options?.body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return {
        data: await response.text(),
        status: response.status,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) {
        await wait(backoffMs * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error(`Relay text fetch failed for ${url}`);
}
