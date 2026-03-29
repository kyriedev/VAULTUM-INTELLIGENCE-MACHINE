type RateLimitOptions = {
  limit?: number;
  windowMs?: number;
  scope?: string;
};

type RateLimitResult = {
  allowed: boolean;
  status?: number;
  headers: Record<string, string>;
  body?: { ok: boolean; error: string };
};

const buckets = new Map<string, number[]>();

function now(): number {
  return Date.now();
}

function getClientIp(req: any): string {
  return (
    req.headers?.['cf-connecting-ip'] ||
    req.headers?.['x-real-ip'] ||
    String(req.headers?.['x-forwarded-for'] || '').split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    '0.0.0.0'
  );
}

function pruneBucket(key: string, windowMs: number): number[] {
  const timestamps = buckets.get(key) ?? [];
  const cutoff = now() - windowMs;
  const fresh = timestamps.filter((value) => value > cutoff);
  buckets.set(key, fresh);
  return fresh;
}

export function allowRequest(req: any, options: RateLimitOptions = {}): RateLimitResult {
  const limit = Number(options.limit || 180);
  const windowMs = Number(options.windowMs || 60_000);
  const scope = String(options.scope || 'rpc');
  const path = String(req.url || scope);
  const key = `${scope}:${getClientIp(req)}:${path}`;
  const recent = pruneBucket(key, windowMs);

  if (recent.length >= limit) {
    const retryAfterMs = Math.max(1_000, windowMs - (now() - recent[0]!));
    return {
      allowed: false,
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil(retryAfterMs / 1000)),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
      },
      body: { ok: false, error: 'Rate limit exceeded' },
    };
  }

  recent.push(now());
  buckets.set(key, recent);
  return {
    allowed: true,
    headers: {
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': String(Math.max(0, limit - recent.length)),
    },
  };
}
