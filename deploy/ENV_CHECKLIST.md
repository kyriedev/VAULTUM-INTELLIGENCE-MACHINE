# VAULTUM Environment Checklist

This is the clean env checklist for Vaultum in the current phase.

## 1. Core Deploy

Set these first:

- `VITE_API_BASE=/api`
- `VITE_APP_TITLE=VAULTUM AI`
- `VITE_APP_SUBTITLE=Institutional Market Intelligence Terminal`
- `VITE_DEFAULT_ASSET=XAUUSD`
- `VITE_DEFAULT_REGION=global`

## 2. Recommended Data Feeds

These make the terminal materially better:

- `FINNHUB_API_KEY`
- `FRED_API_KEY`
- `TRADINGECONOMICS_API_KEY`
- optional `TWELVEDATA_API_KEY`
- optional `TDA_API_KEY`

Notes:

- `FINNHUB_API_KEY` improves equities and ETF quote coverage
- `FRED_API_KEY` powers macro series
- `TRADINGECONOMICS_API_KEY` upgrades the live economic calendar beyond guest mode
- `TWELVEDATA_API_KEY` adds a direct technical-indicator and market-state sidecar, plus selective quote/symbol coverage
- `TDA_API_KEY` optionally unlocks a listed-options chain overlay for smarter gamma/dealer context on supported proxy underlyings

## 3. Broker Feed Stack

### OANDA

- `OANDA_API_KEY`
- `OANDA_ACCOUNT_ID`
- optional `OANDA_API_URL`

Use now if you want direct broker candles and pricing for supported symbols.

### Relay / FXCM / Stream Tier

- `WS_RELAY_URL`
- optional `VITE_WS_RELAY_URL`
- `RELAY_SHARED_SECRET`
- optional `FXCM_RELAY_URL`
- optional `FXCM_API_TOKEN`

Use this when you want worldmonitor-style relay-backed broker/live stream normalization and stronger YouTube live detection.

## 4. Shared Cache

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Use this if you want:

- cross-instance cache
- stale-on-error behavior across deploys
- fewer repeated upstream hits

## 5. AI Providers

Choose one or more:

- `OPENROUTER_API_KEY`
- optional `OPENROUTER_MODEL`
- optional `OPENROUTER_VISION_MODEL`

or

- `GROQ_API_KEY`
- optional `GROQ_MODEL`
- optional `GROQ_VISION_MODEL`

Optional local/private path later:

- `OLLAMA_API_URL`
- optional `OLLAMA_API_KEY`
- optional `OLLAMA_MODEL`
- optional `OLLAMA_VISION_MODEL`

Notes:

- the normal model envs drive text reasoning
- the optional `*_VISION_MODEL` envs unlock screenshot/chart-review analysis in the AI panel
- if no vision model is configured, Vaultum still compares the chart request against live context, but it will say the screenshot itself was not machine-read

## 6. Optional / Later

- `WTO_API_KEY`
- `VAULTUM_LOCAL_SECRET`
- `LOCAL_OPERATOR_SECRET`
- `ADMIN_SECRET`

## 7. Current Best Production Bundle

If you want Vaultum to feel complete right now, gather these:

- `FINNHUB_API_KEY`
- `FRED_API_KEY`
- `TRADINGECONOMICS_API_KEY`
- optional `TWELVEDATA_API_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `OANDA_API_KEY`
- `OANDA_ACCOUNT_ID`
- one AI provider key set
- `WS_RELAY_URL`
- `RELAY_SHARED_SECRET`

That gives you:

- stronger quote coverage
- macro series
- live pair-aware calendar
- shared cache
- direct broker feed
- AI cloud fallback
- relay-backed stream/broker readiness

---

## Multi-tenant auth & billing (new)

Vaultum now ships a zero-dependency multi-tenant auth layer (`server/_shared/auth.ts`)
with endpoints at `api/auth.ts` and billing at `api/billing.ts`.

Required for any authenticated deployment:

- `VAULTUM_AUTH_SECRET` — HMAC key for signing session cookies (**required**; generate with `openssl rand -hex 32`)

Optional overrides:

- `VAULTUM_SESSION_TTL_SECONDS` — session lifetime (default 12h)
- `VAULTUM_COOKIE_NAME` — session cookie name (default `vaultum_session`)
- `VAULTUM_TENANTS_FILE` — tenant/user store path (default `data/tenants.json`, gitignored; swap for a DB adapter at scale)
- `VAULTUM_ADMIN_EMAIL` / `VAULTUM_ADMIN_PASSWORD` — seed owner for the default tenant on first boot (change these in production!)

Billing (Stripe, optional — endpoints degrade gracefully without keys):

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_FREE` / `STRIPE_PRICE_PRO` / `STRIPE_PRICE_INSTITUTIONAL`
- `VAULTUM_PUBLIC_URL` — checkout success/cancel redirect base

Endpoints:

- `POST /api/auth?action=signup|login|logout|keys:create|keys:revoke`, `GET /api/auth?action=me`
- `GET /api/billing?action=plans|subscription`, `POST /api/billing?action=checkout|webhook`

RPC routes remain open by default (single-tenant behavior preserved); attach
`authenticateRequest(req)` from `server/_shared/auth.ts` to gate specific
domains per tenant as needed.
