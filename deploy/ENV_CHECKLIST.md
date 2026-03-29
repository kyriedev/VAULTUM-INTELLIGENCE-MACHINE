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

Notes:

- `FINNHUB_API_KEY` improves equities and ETF quote coverage
- `FRED_API_KEY` powers macro series
- `TRADINGECONOMICS_API_KEY` upgrades the live economic calendar beyond guest mode

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

or

- `GROQ_API_KEY`
- optional `GROQ_MODEL`

Optional local/private path later:

- `OLLAMA_API_URL`
- optional `OLLAMA_API_KEY`
- optional `OLLAMA_MODEL`

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
