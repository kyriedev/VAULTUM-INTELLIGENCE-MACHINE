# Deploy

## Web

Deploy VAULTUM web-first on Vercel.

Recommended Vercel settings:
- Framework Preset: `Vite`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`
- Node.js Version: `22.x`

This repo now includes `vercel.json` so Vercel does not have to infer the build command.

If a project-level Vercel setting still says `vite build`, replace it with `npm run build` or clear it and let `vercel.json` win.

Broker feed notes:
- `OANDA_API_KEY` + `OANDA_ACCOUNT_ID` enables the direct broker path for supported symbols
- `FXCM_RELAY_URL` is the deployment-safe path for promoting FXCM as the preferred broker-flow layer later
- setup details live in `deploy/BROKER_SETUP.md`
- full env checklist lives in `deploy/ENV_CHECKLIST.md`

## Desktop

Desktop packaging should continue through Tauri from `src-tauri` using the same frontend codebase.

## Relay / Services

Use Railway only when needed for:
- Redis or persistent cache services
- scheduled ingestion jobs
- upstream relay/proxy services
- private model or connector services
