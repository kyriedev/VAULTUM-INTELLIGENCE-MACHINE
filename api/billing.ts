/**
 * VAULTUM billing surface (multi-tenant).
 *
 * Plan catalog + per-tenant usage metering are implemented for real.
 * Payment processing is deliberately delegated to Stripe Checkout via env
 * config; when keys are absent the endpoints degrade gracefully (same
 * philosophy as the rest of the repo — no hard dependency on external SaaS).
 */

import { authenticateRequest, findTenant, hasRole, readStore, writeUpdatedTenantPlan } from '../server/_shared/auth';

declare const process: { env: Record<string, string | undefined> };

type Plan = 'free' | 'pro' | 'institutional';

const PLANS: Record<Plan, { name: string; priceUsdMonthly: number; rpcLimitPerMinute: number; features: string[] }> = {
  free: { name: 'Observer', priceUsdMonthly: 0, rpcLimitPerMinute: 60, features: ['Read-only market panels', 'Delayed data'] },
  pro: { name: 'Desk', priceUsdMonthly: 149, rpcLimitPerMinute: 240, features: ['All 36 panels', 'AI analyst routing', 'Real-time regime engine'] },
  institutional: { name: 'Institutional', priceUsdMonthly: 899, rpcLimitPerMinute: 600, features: ['Everything in Desk', 'API keys + MCP server', 'Priority provider pool', 'Audit exports'] },
};

function readInput(req: any): any {
  if (req.method === 'POST' && req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  return req.query ?? {};
}

function env(name: string): string {
  return (process.env[name] || '').trim();
}

export default async function handler(req: any, res: any): Promise<void> {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  const method = String(req.method || 'GET').toUpperCase();
  const action = String(req.query?.action ?? '');
  const input = readInput(req);

  try {
    if (action === 'plans') {
      res.status(200).json({ ok: true, data: Object.entries(PLANS).map(([id, plan]) => ({ id, ...plan })) });
      return;
    }

    const auth = authenticateRequest(req);
    if (!auth) {
      res.status(401).json({ ok: false, error: 'Not authenticated' });
      return;
    }
    const tenant = findTenant(auth.tenantId);
    if (!tenant) {
      res.status(404).json({ ok: false, error: 'Tenant not found' });
      return;
    }

    if (action === 'subscription') {
      res.status(200).json({ ok: true, data: { plan: tenant.plan, limits: PLANS[tenant.plan as Plan] ?? PLANS.pro } });
      return;
    }

    if (method === 'POST' && action === 'checkout') {
      if (!hasRole(auth.role, 'admin')) {
        res.status(403).json({ ok: false, error: 'Admin role required' });
        return;
      }
      const targetPlan = String(input.plan || '') as Plan;
      if (!(targetPlan in PLANS)) {
        res.status(400).json({ ok: false, error: `Unknown plan: ${targetPlan}` });
        return;
      }
      const secretKey = env('STRIPE_SECRET_KEY');
      if (!secretKey) {
        // Graceful degradation: report that hosted checkout is not configured.
        res.status(503).json({ ok: false, error: 'Billing provider not configured (set STRIPE_SECRET_KEY)' });
        return;
      }
      const priceId = env(`STRIPE_PRICE_${targetPlan.toUpperCase()}`);
      const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secretKey}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          mode: 'subscription',
          success_url: `${env('VAULTUM_PUBLIC_URL') || 'https://vaultum.app'}/?billing=success`,
          cancel_url: `${env('VAULTUM_PUBLIC_URL') || 'https://vaultum.app'}/?billing=cancelled`,
          client_reference_id: tenant.id,
          ...(priceId ? { 'line_items[0][price]': priceId, 'line_items[0][quantity]': '1' } : {}),
        }),
      }).then((r) => r.json());
      if (!resp?.url) {
        res.status(502).json({ ok: false, error: 'Stripe session creation failed', detail: resp?.error?.message });
        return;
      }
      res.status(200).json({ ok: true, data: { checkoutUrl: resp.url, plan: targetPlan } });
      return;
    }

    if (method === 'POST' && action === 'webhook') {
      // Stripe webhook: verify signature, then sync subscription status to tenant record.
      const secret = env('STRIPE_WEBHOOK_SECRET');
      const signature = String(req.headers?.['stripe-signature'] || '');
      if (!secret || !signature) {
        res.status(400).json({ ok: false, error: 'Webhook not configured or missing stripe-signature header' });
        return;
      }
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const crypto = await import('node:crypto');
      const expected = `t=${String(req.headers?.['stripe-signature-timestamp'] || '')},v1=${crypto.createHmac('sha256', secret).update(`${req.headers?.['stripe-signature-timestamp'] || ''}.${rawBody}`).digest('hex')}`;
      const sigV1 = /v1=([a-f0-9]+)/.exec(signature)?.[1] ?? '';
      const expectedV1 = /v1=([a-f0-9]+)/.exec(expected)?.[1] ?? '';
      if (!sigV1 || !expectedV1 || !crypto.timingSafeEqual(Buffer.from(sigV1.padEnd(64, '0'), 'hex'), Buffer.from(expectedV1.padEnd(64, '0'), 'hex'))) {
        res.status(400).json({ ok: false, error: 'Invalid webhook signature' });
        return;
      }
      const event = JSON.parse(rawBody);
      const obj = event?.data?.object;
      const tenantId = obj?.client_reference_id ?? obj?.metadata?.tenant_id;
      if (tenantId && obj?.items?.data?.[0]?.price) {
        const priceId = String(obj.items.data[0].price.id);
        const lookup = Object.entries(PLANS).find(([planId]) => env(`STRIPE_PRICE_${planId.toUpperCase()}`) === priceId);
        const status = String(obj.status || '');
        if (lookup && (status === 'active' || status === 'trialing')) {
          writeUpdatedTenantPlan(String(tenantId), lookup[0] as Plan);
        } else if ((status === 'canceled' || status === 'unpaid') && findTenant(String(tenantId))) {
          writeUpdatedTenantPlan(String(tenantId), 'free');
        }
      }
      res.status(200).json({ ok: true, data: { received: true, type: event?.type } });
      return;
    }

    res.status(400).json({ ok: false, error: `Unknown billing action: ${action || '(none)'}` });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown billing error' });
  }
}

// readInput is used by POST actions above; readStore re-exported for tooling.
void readInput;
void readStore;
