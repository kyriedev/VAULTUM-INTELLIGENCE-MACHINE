# VAULTUM

Institutional trading activity terminal, preserving the dense World Monitor terminal shell while refocusing the product on macro, markets, liquidity, options, positioning, and geopolitical trading intelligence.

## Focus

- Macro regime interpretation
- Market structure and cross-asset context
- Geopolitical and trade-policy impact
- Prediction market context
- Options and positioning workflow
- AI reasoning layer with explicit uncertainty handling

## Scripts

- `npm run dev`
- `npm run build`
- `npm run build:pwa`
- `npm run typecheck`
- `npm run desktop:dev`
- `npm run desktop:build`

## Architecture

- `src/` frontend terminal shell and panel system
- `server/` domain RPC handlers and reasoning logic
- `api/` edge entrypoints
- `public/` web manifest, service worker, icons, and installable-web assets
- `src-tauri/` desktop shell and packaging scaffold
- `proto/` service contracts
- `data/` reference watchlists and seeds

## Current State

This repository is being migrated toward a World Monitor-derived trading terminal with:

- terminal-density panel layout
- central app context and loader orchestration
- cache-aware backend RPC domains
- AI-assisted institutional analysis
- live-market-first panel set for gold, oil, FX, volatility, liquidity, options, and positioning
- installable web app path through `site.webmanifest` + `public/sw.js`
- desktop packaging scaffold through `src-tauri/`

Deployment/env references:

- `deploy/DEPLOYMENT.md`
- `deploy/BROKER_SETUP.md`
- `deploy/ENV_CHECKLIST.md`
