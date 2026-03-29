# Broker Feed Setup

This file explains the broker-related environment variables VAULTUM understands in the current phase.

## Current Broker Stack

VAULTUM currently supports this order of preference:

1. `FXCM` as the preferred broker-flow layer when a relay is configured
2. `OANDA` as the direct broker feed for supported symbols
3. `Yahoo / Finnhub` as live fallback sources

VAULTUM also now supports the same broader infrastructure pattern used by `worldmonitor`:

- `memory cache -> shared Redis -> upstream`
- `relay tier -> broker / live stream normalization`

Important:

- `FXCM` is not yet wired as a direct serverless API path inside VAULTUM.
- `OANDA` is already wired directly.
- If no broker keys are present, VAULTUM still runs and falls back cleanly.

## OANDA Keys

Environment variables:

- `OANDA_API_KEY`
- `OANDA_ACCOUNT_ID`
- optional `OANDA_API_URL`

What they do:

- `OANDA_API_KEY` authenticates requests to the OANDA v20 API
- `OANDA_ACCOUNT_ID` identifies the account used for pricing and candle requests
- `OANDA_API_URL` lets you choose practice or live endpoint if you need to override the default

What VAULTUM uses them for:

- broker pricing on supported FX and spot-style symbols
- broker candle history for pressure, orderflow proxy, pivots, and profile
- broker-aware feed routing and feed-health display

Where to get them:

- open your OANDA fxTrade account
- go to `My Account -> My Services -> Manage API Access`
- generate a personal access token
- copy your account id from the account portal / API account list

## FXCM Keys

Environment variables:

- `WS_RELAY_URL`
- optional `VITE_WS_RELAY_URL`
- optional `RELAY_SHARED_SECRET`
- `FXCM_RELAY_URL`
- optional `FXCM_API_TOKEN`

What they do:

- `WS_RELAY_URL` points VAULTUM to the main relay/service tier you control
- `VITE_WS_RELAY_URL` is reserved for future browser-side subscriptions if needed
- `RELAY_SHARED_SECRET` protects private relay routes between VAULTUM and the relay
- `FXCM_RELAY_URL` points VAULTUM to a deployment-safe relay that you control
- `FXCM_API_TOKEN` is reserved for the relay or later direct broker integration

What VAULTUM uses them for:

- relay-health detection
- future broker/live stream normalization across providers
- feed-health detection
- broker-stack priority
- future promotion of FXCM as the preferred broker-flow source

Why a relay is expected:

- this keeps the web deployment cleaner and avoids hardwiring broker-session logic directly into the frontend/serverless edge
- it also gives us one place to normalize FXCM broker-flow data into VAULTUM's internal shape

## Recommended Setup For This Phase

If you want the cleanest working setup right now:

1. configure `OANDA_API_KEY`
2. configure `OANDA_ACCOUNT_ID`
3. configure `WS_RELAY_URL`
4. configure `RELAY_SHARED_SECRET`
5. leave `FXCM_RELAY_URL` empty unless you are ready to run a relay for FXCM-specific normalization
6. keep `FINNHUB_API_KEY`, `FRED_API_KEY`, and `TRADINGECONOMICS_API_KEY` configured for stronger fallback quality
7. add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` once you want shared cache behavior in production

## What To Expect In The UI

After setup:

- Runtime Config should show whether `FXCM`, `OANDA`, `Finnhub`, and `Yahoo` are active, ready, configured, fallback, or inactive
- Runtime Config should also show `Trading Economics` and `YouTube Live` relay state
- Market quote summaries should explain which broker/fallback path was used
- Orderflow / pressure labels should stay honest about whether the reading is broker proxy, exchange proxy, estimated, or fallback

## Deployment Reminder

For Vercel:

- add the broker env vars in the project environment settings
- redeploy after adding them
- check the Runtime Config panel after deploy to confirm the feed stack state
