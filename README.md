# VAULTUM

VAULTUM is a web-first institutional market intelligence terminal focused on gold, FX, macro, liquidity, orderflow, options, positioning, reports, and AI-assisted execution context.

This repo is currently optimized for a single web-first deployment path:

1. Run it locally with Vite.
2. Deploy it to Vercel as a web app.
3. Add better feeds and shared cache over time.
4. Package desktop later from the same codebase.

## What Is In The Repo

- `src/` frontend terminal UI, panels, layout, and client services
- `server/` backend domain engines, analytics, AI planner, and shared market logic
- `api/` Vercel/serverless entrypoints for the frontend and MCP surface
- `public/` installable web assets such as manifest and service worker
- `src-tauri/` desktop packaging scaffold for later
- `deploy/` deployment, broker, and environment guides

## Scripts

- `npm run dev`
- `npm run build`
- `npm run build:web`
- `npm run build:pwa`
- `npm run preview`
- `npm run typecheck`
- `npm run desktop:dev`
- `npm run desktop:build`

## Local Development

Requirements:

- Node.js `22.x`
- npm

Steps:

1. Copy `.env.example` to `.env`
2. Leave most secrets blank if you just want the app to boot
3. Run `npm install`
4. Run `npm run dev`
5. Open the local Vite URL shown in the terminal

Important:

- The app can boot without most provider keys
- Missing keys degrade specific panels instead of crashing the whole shell
- `npm run build` should pass before you deploy

## Preferred Deployment Target

Use:

- GitHub for source control
- Vercel for hosting

Hold off on Railway, Docker, or desktop packaging until the web deployment is stable.

This repo already includes [vercel.json](/c:/Users/user/Desktop/VAULTUM%20INTELLIGENCE%20MACHINE/vercel.json), and the current backend is designed to work well with Vercel serverless routes under `api/`.

## Vercel Settings

Use these exact settings in Vercel:

- Framework Preset: `Vite`
- Root Directory: repository root
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`
- Node.js Version: `22.x`

Important:

- Do not use `vite build` as the build command
- If an old Vercel project is still cached with the wrong settings, clear them and redeploy
- Two common deployment misconfigurations are the wrong build command and the wrong Node version

## Environment Variables

### Browser-visible vars

Anything starting with `VITE_` is browser-visible.

Use `VITE_` only for public runtime config such as:

- `VITE_API_BASE=/api`
- `VITE_APP_TITLE`
- `VITE_APP_SUBTITLE`
- `VITE_DEFAULT_ASSET`
- `VITE_DEFAULT_REGION`

Do not put secret API keys in `VITE_*`.

### Server-only vars

These stay on the server and should be configured in Vercel project settings, not committed to the repo:

- `FINNHUB_API_KEY`
- `FRED_API_KEY`
- `TRADINGECONOMICS_API_KEY`
- `TWELVEDATA_API_KEY`
- `TDA_API_KEY`
- `OPENROUTER_API_KEY`
- `GROQ_API_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `OANDA_API_KEY`
- `OANDA_ACCOUNT_ID`
- `WS_RELAY_URL`
- `RELAY_SHARED_SECRET`

### Minimum useful deploy

For your first useful deploy, try to set at least:

- `VITE_API_BASE=/api`
- `FINNHUB_API_KEY`
- `FRED_API_KEY`
- `TRADINGECONOMICS_API_KEY`

That gives you a much better first production result without making the setup too heavy.

## How Users Will Use Vaultum

Right now, the repo is set up as an operator-managed deployment, not a multi-tenant SaaS.

That means:

- you deploy Vaultum
- you configure the server environment once
- users open the app and use it

Right now users do not need to:

- create their own provider env files
- paste API keys into the frontend
- redeploy the app themselves just to use it

If you later want a SaaS model with per-user accounts, billing, or bring-your-own-keys, that would be a later product phase and needs explicit auth and secret-management work.

## After Deploy

After the first Vercel deploy, check:

1. The app root loads
2. `/api/bootstrap` returns JSON
3. The main panels populate
4. AI Insights responds
5. Runtime Config shows sensible provider states
6. `npm run build` still passes locally after each change

## Deployment Workflow

Use this rollout order:

1. Get `npm run dev` working locally
2. Get `npm run build` passing locally
3. Create a fresh Vercel project with the exact settings above
4. Add only the minimum env vars first
5. Deploy
6. Add better feeds gradually after the shell is live

That is safer than configuring every provider before the first successful deployment.

## Current Architecture Notes

- TradingView is chart UI and screener UI, not Vaultum's source of truth for backend market intelligence
- AI answers are built from backend tools and deterministic fallbacks, not only from rendered panel text
- The execution stack now includes a shared entry map for `4H / 15m / 5m` structure, trigger, and invalidation logic
- Reports, monitor, AI, bootstrap, and chart context now share more of the same execution spine

## Deployment Docs

For deeper setup details, use:

- [deploy/DEPLOYMENT.md](/c:/Users/user/Desktop/VAULTUM%20INTELLIGENCE%20MACHINE/deploy/DEPLOYMENT.md)
- [deploy/ENV_CHECKLIST.md](/c:/Users/user/Desktop/VAULTUM%20INTELLIGENCE%20MACHINE/deploy/ENV_CHECKLIST.md)
- [deploy/BROKER_SETUP.md](/c:/Users/user/Desktop/VAULTUM%20INTELLIGENCE%20MACHINE/deploy/BROKER_SETUP.md)
- [deploy/README.md](/c:/Users/user/Desktop/VAULTUM%20INTELLIGENCE%20MACHINE/deploy/README.md)
