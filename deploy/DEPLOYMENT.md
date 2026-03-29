# VAULTUM Deployment

This guide is for the deployment-first path:

1. Deploy VAULTUM to Vercel as a web app.
2. Confirm the installable web app works in production.
3. Upgrade to shared cache + relay when you want worldmonitor-style production behavior.
4. Package desktop later with Tauri from the same codebase.

## 1. Vercel Project Settings

Use these exact settings in Vercel:

- Framework Preset: `Vite`
- Root Directory: repository root
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`
- Node.js Version: `22.x`

Important:
- Do not set the build command to `vite build`
- If Vercel has an old custom build command saved, remove it or replace it with `npm run build`
- The repo already includes `vercel.json`, so Vercel should not need to guess the build settings

## 2. What Is Already Configured

The repo is prepared for Vercel web deployment with:

- static frontend build output in `dist`
- Vercel function routes in `api/`
- server-side RPC dispatch through `api/[domain]/v1/[rpc].ts`
- bootstrap route through `api/bootstrap.js`
- production-safe frontend API base routing through `VITE_API_BASE`

## 3. Environment Variables

### First Deploy: Absolute Minimum

No environment variables are strictly required just to boot the app.

VAULTUM can deploy and render without secrets, but data quality will be reduced and some panels will degrade gracefully.

### First Deploy: Strongly Recommended

Set these in Vercel for a useful first production deploy:

- `FINNHUB_API_KEY`
- `FRED_API_KEY`
- `TRADINGECONOMICS_API_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

### Broker Feed Stack: Optional But Useful

For the broker-priority path now supported by VAULTUM:

- `OANDA_API_KEY`
- `OANDA_ACCOUNT_ID`
- optional `OANDA_API_URL`

For the relay-backed broker/live stream architecture:

- `WS_RELAY_URL`
- optional `VITE_WS_RELAY_URL`
- optional `RELAY_SHARED_SECRET`
- optional `FXCM_RELAY_URL`
- optional `FXCM_API_TOKEN`

Important:

- OANDA works directly in the current deployment model
- VAULTUM now supports worldmonitor-style shared cache with `memory -> Redis -> upstream`
- FXCM is treated as a preferred broker-flow layer only when a relay path is configured
- if neither broker feed is configured, VAULTUM falls back cleanly to Yahoo/Finnhub where appropriate

### AI in Production: Optional

Set these only if you want cloud AI responses in production:

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`

Optional alternative:

- `GROQ_API_KEY`
- `GROQ_MODEL`

### Frontend Runtime Vars

Recommended frontend env vars in Vercel:

- `VITE_APP_TITLE`
- `VITE_APP_SUBTITLE`
- `VITE_API_BASE`
- `VITE_DEFAULT_ASSET`
- `VITE_DEFAULT_REGION`
- `VITE_OPENROUTER_ENABLED`
- `VITE_OLLAMA_ENABLED`

For Vercel web deployment, use:

- `VITE_API_BASE=/api`
- `VITE_OPENROUTER_ENABLED=true` only if `OPENROUTER_API_KEY` is also configured
- `VITE_OLLAMA_ENABLED=false`

### Optional / Later

- `WTO_API_KEY`
- `OLLAMA_API_URL`
- `OLLAMA_API_KEY`
- `OLLAMA_MODEL`
- `VITE_OLLAMA_API_URL`
- `VITE_OLLAMA_MODELS`
- `VAULTUM_LOCAL_SECRET`
- `LOCAL_OPERATOR_SECRET`
- `ADMIN_SECRET`

## 4. Step-By-Step Vercel Deploy

1. Push the latest repo state to GitHub.
2. Open Vercel and import the repository.
3. Set the project root to the repo root.
4. Confirm these settings:
   - Framework: `Vite`
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Set Node.js version to `22.x`.
6. Add environment variables.
   - Minimum recommended: `FINNHUB_API_KEY`, `FRED_API_KEY`, `TRADINGECONOMICS_API_KEY`
   - Production-grade cache: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
   - Broker optional: `OANDA_API_KEY`, `OANDA_ACCOUNT_ID`
   - Relay optional but recommended for streams/broker normalization: `WS_RELAY_URL`, `RELAY_SHARED_SECRET`
   - FXCM later: `FXCM_RELAY_URL`
   - Optional AI: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`
   - Frontend runtime: `VITE_API_BASE=/api`
7. Deploy.
8. If the project had old cached settings, redeploy once with build cache cleared.

## 5. Testing Production

After deploy, test these URLs:

1. Open the web app root and confirm the shell loads.
2. Open `/api/bootstrap` and confirm you get JSON.
3. Open `/api/market/v1/list-market-quotes` with a POST request and confirm JSON comes back.
4. Open `/api/mcp` and confirm the MCP endpoint reports its supported methods.
   - verify `tools/list`, `resources/list`, and `prompts/list` respond through the MCP JSON-RPC surface
5. Confirm the main panels populate:
   - Market Radar
   - Macro Regime
   - Gold Engine
   - FX Board
   - AI Insights
6. Confirm the top bar freshness state is not stuck on booting.
7. Ask one AI question in production and verify the response returns a structured answer.
8. Open the Runtime Config panel and confirm the feed stack shows the expected broker/fallback state.
9. Confirm Runtime Config also shows the expected Redis and relay state.
10. Confirm the browser shows the app as installable.
    - manifest should load from `/site.webmanifest`
    - service worker should register from `/sw.js`
    - the `Install App` button should appear on supported browsers when install criteria are met

If the shell loads but panels remain empty:

- check browser network requests to `/api/bootstrap`
- check Vercel function logs
- confirm `VITE_API_BASE=/api`
- confirm upstream keys such as `FINNHUB_API_KEY` and `FRED_API_KEY`

## 6. Shared Cache and Relay

If you want VAULTUM to behave more like `worldmonitor` in production, add these:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `WS_RELAY_URL`
- `RELAY_SHARED_SECRET`
- optional `VITE_WS_RELAY_URL`

What this changes:

- Redis becomes the cross-user, cross-instance cache
- in-memory cache remains the first hot layer
- stale cached responses can still be served when upstreams fail
- relay-backed broker/live feeds become easier to normalize and secure
- Runtime Config will show relay/cache state directly

Full grouped env checklist:

- see `deploy/ENV_CHECKLIST.md`

## 7. Tauri Later

Do not package desktop until the web deploy and installable-web flow are confirmed healthy.

When web is stable:

1. Reuse the same frontend codebase.
2. Point desktop mode either at:
   - same-origin local backend, or
   - remote hosted `/api` base, or
   - desktop-local private services
3. Enable Ollama/local settings only for desktop where appropriate.
4. Use the `src-tauri/` scaffold already included in this repo.
5. Run:
   - `npm run desktop:dev`
   - `npm run desktop:build`
6. Add signing and platform-specific release hardening after the web app is validated.

## 8. Installable Web App

Vaultum now includes the main installable-web pieces:

- `public/site.webmanifest`
- `public/sw.js`
- install prompt wiring in the web shell

That gives you:

- standalone install from supported desktop/mobile browsers
- home-screen style launch on phones
- a shared UI path between browser and installed web terminal

## 9. When Railway Becomes Necessary

Do not introduce Railway by default yet.

Railway or another service host becomes necessary when you need one or more of:

- long-running Node services
- persistent relays for rate-limited providers
- scheduled ingestion jobs
- heavier cache or ETL workloads
- private AI/model proxy services
- a dedicated Redis-backed service tier beyond simple serverless caching

Until then, Vercel is the correct first deployment target.
