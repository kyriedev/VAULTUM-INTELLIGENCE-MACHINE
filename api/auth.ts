import {
  authenticateRequest,
  buildSessionCookie,
  clearSessionCookie,
  createSessionToken,
  createTenantWithOwner,
  addApiKeyToTenant,
  revokeApiKey,
  findUserByEmail,
  findTenant,
  publicTenant,
  verifyPassword,
  hasRole,
} from '../server/_shared/auth';

function readInput(req: any): any {
  if (req.method === 'POST' && req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  return req.query ?? {};
}

export default async function handler(req: any, res: any): Promise<void> {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  const method = String(req.method || 'GET').toUpperCase();
  const action = String(req.query?.action ?? '');
  const input = readInput(req);

  try {
    if (method === 'POST' && action === 'signup') {
      const { tenant, user } = createTenantWithOwner({
        name: String(input.name || ''),
        email: String(input.email || ''),
        password: String(input.password || ''),
      });
      const token = createSessionToken({ sub: user.id, tid: tenant.id, role: user.role, email: user.email });
      res.setHeader('set-cookie', buildSessionCookie(token));
      res.status(201).json({ ok: true, data: { tenant: publicTenant(tenant) } });
      return;
    }

    if (method === 'POST' && action === 'login') {
      const user = findUserByEmail(String(input.email || ''));
      const ok = user ? verifyPassword(String(input.password || ''), user.passwordHash) : false;
      if (!ok || !user) {
        res.status(401).json({ ok: false, error: 'Invalid credentials' });
        return;
      }
      const token = createSessionToken({ sub: user.id, tid: user.tenantId, role: user.role, email: user.email });
      res.setHeader('set-cookie', buildSessionCookie(token));
      res.status(200).json({ ok: true, data: { email: user.email, tenantId: user.tenantId, role: user.role } });
      return;
    }

    if (method === 'POST' && action === 'logout') {
      res.setHeader('set-cookie', clearSessionCookie());
      res.status(200).json({ ok: true, data: null });
      return;
    }

    const auth = authenticateRequest(req);

    if (action === 'me') {
      if (!auth) {
        res.status(401).json({ ok: false, error: 'Not authenticated' });
        return;
      }
      const tenant = findTenant(auth.tenantId);
      res.status(200).json({ ok: true, data: { auth, tenant: tenant ? publicTenant(tenant) : null } });
      return;
    }

    // Tenant-scoped actions below require a valid session or API key.
    if (!auth) {
      res.status(401).json({ ok: false, error: 'Not authenticated' });
      return;
    }

    if (method === 'POST' && action === 'keys:create') {
      if (!hasRole(auth.role, 'admin')) {
        res.status(403).json({ ok: false, error: 'Admin role required' });
        return;
      }
      const { record, secret } = addApiKeyToTenant(auth.tenantId, String(input.label || 'api key'));
      res.status(201).json({ ok: true, data: { id: record.id, label: record.label, prefix: record.prefix, secret } });
      return;
    }

    if (method === 'POST' && action === 'keys:revoke') {
      if (!hasRole(auth.role, 'admin')) {
        res.status(403).json({ ok: false, error: 'Admin role required' });
        return;
      }
      const revoked = revokeApiKey(auth.tenantId, String(input.keyId || ''));
      res.status(revoked ? 200 : 404).json({ ok: revoked, data: revoked ? { keyId: input.keyId } : null, error: revoked ? undefined : 'Key not found' });
      return;
    }

    res.status(400).json({ ok: false, error: `Unknown auth action: ${action || '(none)'}` });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown auth error' });
  }
}
