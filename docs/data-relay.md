# VAULTUM Data Relay

## Why this exists

VAULTUM can no longer assume that broker APIs or restricted institutional feeds will always be reachable. The relay layer keeps the machine operating by:

- proxying live orderflow from accessible public infrastructure
- normalizing macro and flow data into one common payload
- serving cached or stale-safe snapshots when live requests fail
- treating broker volume as optional enhancement only

## What the relay does

The relay lives under `server/vaultum/relay/v1`.

Primary inputs:

- Binance:
  - WebSocket runtime for `aggTrade` and `depth20`
  - REST fallback for `aggTrades` and `depth`
- Macro:
  - FRED
  - World Bank
  - IMF DataMapper
- Optional sidecars:
  - unofficial TradingView search/scanner sidecar
  - optional HTML scrape metrics for Trading Economics and WTO

All live records are normalized into:

```json
{
  "timestamp": "2026-04-03T18:00:00.000Z",
  "asset": "BTCUSDT",
  "price": 70250.1,
  "volume": 48.25,
  "buy_volume": 26.11,
  "sell_volume": 22.14,
  "source": "binance-ws"
}
```

## Relay outputs

Server functions:

- `relay.get_orderflow`
- `relay.get_volume`
- `relay.get_macro`
- `relay.get_liquidity`

HTTP endpoints:

- `/api/orderflow`
- `/api/volume`
- `/api/macro`
- `/api/liquidity`

Standalone runtime:

- `npm run relay:dev`

## Synthetic flow

When direct broker volume is missing, VAULTUM derives a synthetic flow signal from:

- Binance proxy trade volume
- buy vs sell aggressor balance
- order-book imbalance
- macro weighting from rates and growth proxies
- optional unofficial TradingView technical confirmation

This is clearly labeled as synthetic flow. It is not presented as true OTC broker tape.

## Fallback model

1. Live Binance runtime snapshot if available
2. Binance REST fallback
3. Shared cache or in-memory stale snapshot

For macro:

1. FRED / World Bank / IMF live fetch
2. shared cache or in-memory stale snapshot
3. optional scrape sidecars when enabled

The legacy FX aggregate path now falls back to the relay and returns `sourceMode: "synthetic-relay"` instead of hard failing when broker access is unavailable.

## Cache behavior

The relay reuses the shared cache stack already in VAULTUM:

- in-memory cache by default
- Upstash Redis when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are present
- in-flight dedupe
- stale-on-error serving
- short TTL for flow snapshots, longer TTL for macro snapshots

## Environment

Useful env vars:

- `FRED_API_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `RELAY_RUNTIME_ENABLED`
- `RELAY_HOST`
- `RELAY_PORT`
- `RELAY_BINANCE_SYMBOLS`
- `RELAY_PREWARM_ASSETS`
- `RELAY_PREWARM_INTERVAL_MS`
- `RELAY_TRADINGVIEW_UNOFFICIAL`
- `RELAY_ENABLE_OPTIONAL_SCRAPERS`
- `TRADING_ECONOMICS_SCRAPE_URL`
- `WTO_SCRAPE_URL`

Notes:

- IMF and World Bank do not require project-specific API keys in the current implementation.
- OANDA / FXCM remain optional. If they are configured, the legacy broker aggregate can still use them.
- Vercel should use the API routes only. The long-running WebSocket runtime is meant for local or Railway-style processes.
