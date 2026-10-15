/**
 * VAULTUM multi-tenant auth core.
 *
 * Zero-dependency, serverless-friendly building blocks:
 * - HMAC-SHA256 signed stateless sessions carried in an HttpOnly cookie.
 * - Per-tenant API-key issuance + constant-time verification.
 * - Roles: viewer < trader < admin.
 *
 * Persistence is intentionally pluggable (see TENANT_STORE_BACKEND). The
 * default JSON-file store keeps local/dev friction-free; point
 * TENANTS_FILE at a mounted volume or swap in a DB-backed store for prod.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

declare const process: { env: Record<string, string | undefined>; cwd(): string };

export type Role = 'viewer' | 'trader' | 'admin';

const ROLE_RANK: Record<Role, number> = { viewer: 0, trader: 1, admin: 2 };

export function hasRole(actual: Role | undefined, required: Role | undefined): boolean {
  if (!required) return true;
  if (!actual) return false;
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export interface SessionPayload {
  sub: string; // user id
  tid: string; // tenant id
  role: Role;
  email: string;
  iat: number; // seconds
  exp: number; // seconds
}

export interface UserRecord {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string; // scrypt:salt:hash
  role: Role;
  createdAt: string;
}

export interface TenantRecord {
  id: string;
  name: string;
  plan: 'free' | 'pro' | 'institutional';
  apiKeys: ApiKeyRecord[];
  createdAt: string;
}

export interface ApiKeyRecord {
  id: string;
  label: string;
  hash: string; // sha256 of the secret part
  prefix: string; // first 8 chars of secret, for display only
  createdAt: string;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
}

interface StoreShape {
  tenants: TenantRecord[];
  users: UserRecord[];
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function env(name: string): string {
  return (process.env[name] || '').trim();
}

export function authSecret(): string {
  const secret = env('VAULTUM_AUTH_SECRET');
  if (!secret) throw new Error('VAULTUM_AUTH_SECRET is not set');
  return secret;
}

export function sessionTtlSeconds(): number {
  return Number(env('VAULTUM_SESSION_TTL_SECONDS') || 60 * 60 * 12);
}

export function sessionCookieName(): string {
  return env('VAULTUM_COOKIE_NAME') || 'vaultum_session';
}

export function isProductionRuntime(): boolean {
  const e = env('VERCEL_ENV') || env('NODE_ENV') || '';
  return e === 'production' || e === 'production-equivalent';
}

// ---------------------------------------------------------------------------
// Password hashing (scrypt, no deps)
// ---------------------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = String(stored).split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Signed sessions (stateless HMAC token: base64(payload).base64(sig))
// ---------------------------------------------------------------------------

function sign(data: string): string {
  return crypto.createHmac('sha256', authSecret()).update(data).digest('base64url');
}

export function createSessionToken(payload: Omit<SessionPayload, 'iat' | 'exp'>): string {
  const now = Math.floor(Date.now() / 1000);
  const full: SessionPayload = { ...payload, iat: now, exp: now + sessionTtlSeconds() };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function parseCookies(header: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(header || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function buildSessionCookie(token: string, maxAgeSeconds = sessionTtlSeconds()): string {
  const parts = [
    `${sessionCookieName()}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (isProductionRuntime()) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(): string {
  return buildSessionCookie('', 0);
}

// ---------------------------------------------------------------------------
// API keys: "vlt_<tenantId>_<secret>", stored hashed
// ---------------------------------------------------------------------------

export function generateApiKey(tenantId: string, label: string): { record: ApiKeyRecord; secret: string } {
  const secretPart = crypto.randomBytes(24).toString('base64url');
  const secret = `vlt_${tenantId}_${secretPart}`;
  const record: ApiKeyRecord = {
    id: crypto.randomUUID(),
    label,
    hash: crypto.createHash('sha256').update(secretPart).digest('hex'),
    prefix: secretPart.slice(0, 8),
    createdAt: new Date().toISOString(),
    revokedAt: null,
  };
  return { record, secret };
}

export function verifyApiKeySecret(secret: string): { tenantId: string; key: ApiKeyRecord } | null {
  const m = /^vlt_([a-zA-Z0-9_-]+)_(.+)$/.exec(String(secret || ''));
  if (!m) return null;
  const tenant = readStore().tenants.find((t) => t.id === m[1]);
  if (!tenant) return null;
  const hash = crypto.createHash('sha256').update(m[2]).digest('hex');
  const key = tenant.apiKeys.find((k) => {
    try {
      return !k.revokedAt && crypto.timingSafeEqual(Buffer.from(k.hash, 'hex'), Buffer.from(hash, 'hex'));
    } catch {
      return false;
    }
  });
  if (!key) return null;
  return { tenantId: tenant.id, key };
}

// ---------------------------------------------------------------------------
// Request authentication (cookie session OR Authorization: Bearer vlt_...)
// ---------------------------------------------------------------------------

export interface AuthContext {
  tenantId: string;
  userId?: string;
  email?: string;
  role: Role;
  via: 'session' | 'apikey';
}

export function authenticateRequest(req: any): AuthContext | null {
  try {
    const bearer = String(req.headers?.authorization || '');
    if (bearer.startsWith('Bearer vlt_')) {
      const ok = verifyApiKeySecret(bearer.slice(7).trim());
      if (ok) {
        const tenant = readStore().tenants.find((t) => t.id === ok.tenantId);
        return { tenantId: ok.tenantId, role: (tenant?.plan === 'free' ? 'viewer' : 'admin') as Role, via: 'apikey' };
      }
    }
    const cookies = parseCookies(req.headers?.cookie);
    const session = verifySessionToken(cookies[sessionCookieName()]);
    if (session) return { tenantId: session.tid, userId: session.sub, email: session.email, role: session.role, via: 'session' };
  } catch {
    // Missing VAULTUM_AUTH_SECRET or malformed input => unauthenticated.
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// JSON file store (pluggable; replace with DB adapter for production scale)
// ---------------------------------------------------------------------------

const ADMIN_ROLE: Role = 'admin';

function storePath(): string {
  const configured = env('VAULTUM_TENANTS_FILE');
  if (configured) return path.resolve(configured);
  return path.join(process.cwd(), 'data', 'tenants.json');
}

let cache: { mtimeMs: number; store: StoreShape } | null = null;

function emptyStore(): StoreShape {
  return { tenants: [], users: [] };
}

export function readStore(): StoreShape {
  const file = storePath();
  let stat: fs.Stats | null = null;
  try {
    stat = fs.statSync(file);
  } catch {
    cache = null;
    return seedIfEmpty();
  }
  if (cache && cache.mtimeMs === stat.mtimeMs) return cache.store;
  let store: StoreShape;
  try {
    store = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(store.tenants) || !Array.isArray(store.users)) store = emptyStore();
  } catch {
    store = emptyStore();
  }
  cache = { mtimeMs: stat.mtimeMs, store };
  return store;
}

function writeStore(store: StoreShape): void {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store, null, 2));
  cache = { mtimeMs: fs.statSync(file).mtimeMs, store };
}

/** Creates a default single tenant + owner so existing operators upgrade seamlessly. */
function seedIfEmpty(): StoreShape {
  const file = storePath();
  if (fs.existsSync(file)) {
    const store = readStore();
    cache = { mtimeMs: fs.statSync(file).mtimeMs, store };
    return store;
  }
  const email = env('VAULTUM_ADMIN_EMAIL') || 'operator@vaultum.local';
  const password = env('VAULTUM_ADMIN_PASSWORD') || 'change-me-on-first-login';
  const tenant: TenantRecord = {
    id: 'default',
    name: 'VAULTUM Operator',
    plan: 'institutional',
    apiKeys: [],
    createdAt: new Date().toISOString(),
  };
  const store: StoreShape = {
    tenants: [tenant],
    users: [{
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      email,
      passwordHash: hashPassword(password),
      role: ADMIN_ROLE,
      createdAt: new Date().toISOString(),
    }],
  };
  try {
    writeStore(store);
  } catch {
    // Read-only filesystem (e.g. some serverless roots): fall back to ephemeral store.
  }
  return store;
}

export function findUserByEmail(email: string): UserRecord | null {
  const normalized = String(email || '').trim().toLowerCase();
  return readStore().users.find((u) => u.email.toLowerCase() === normalized) ?? null;
}

export function findTenant(id: string): TenantRecord | null {
  return readStore().tenants.find((t) => t.id === id) ?? null;
}

export function publicTenant(tenant: TenantRecord): Omit<TenantRecord, 'apiKeys'> & { apiKeys: Array<Omit<ApiKeyRecord, 'hash'>> } {
  return { ...tenant, apiKeys: tenant.apiKeys.map(({ hash: _hash, ...rest }) => rest) };
}

export function addApiKeyToTenant(tenantId: string, label: string): { record: ApiKeyRecord; secret: string } {
  const store = readStore();
  const tenant = store.tenants.find((t) => t.id === tenantId);
  if (!tenant) throw new Error(`Unknown tenant: ${tenantId}`);
  const created = generateApiKey(tenantId, label || 'api key');
  tenant.apiKeys.push(created.record);
  writeStore(store);
  return created;
}

export function revokeApiKey(tenantId: string, keyId: string): boolean {
  const store = readStore();
  const tenant = store.tenants.find((t) => t.id === tenantId);
  const key = tenant?.apiKeys.find((k) => k.id === keyId);
  if (!key) return false;
  key.revokedAt = new Date().toISOString();
  writeStore(store);
  return true;
}

/** Updates a tenant's billing plan (used by the Stripe webhook sync). */
export function writeUpdatedTenantPlan(tenantId: string, plan: TenantRecord['plan']): boolean {
  const store = readStore();
  const tenant = store.tenants.find((t) => t.id === tenantId);
  if (!tenant) return false;
  tenant.plan = plan;
  writeStore(store);
  return true;
}

export function createTenantWithOwner(input: { name: string; email: string; password: string; plan?: TenantRecord['plan'] }): { tenant: TenantRecord; user: UserRecord } {
  const store = readStore();
  const email = String(input.email || '').trim().toLowerCase();
  if (!email || !input.password) throw new Error('email and password are required');
  if (store.users.some((u) => u.email.toLowerCase() === email)) throw new Error('Email already registered');
  const tenant: TenantRecord = {
    id: crypto.randomUUID(),
    name: input.name || email,
    plan: input.plan || 'pro',
    apiKeys: [],
    createdAt: new Date().toISOString(),
  };
  const user: UserRecord = {
    id: crypto.randomUUID(),
    tenantId: tenant.id,
    email,
    passwordHash: hashPassword(input.password),
    role: ADMIN_ROLE,
    createdAt: new Date().toISOString(),
  };
  store.tenants.push(tenant);
  store.users.push(user);
  writeStore(store);
  return { tenant, user };
}
