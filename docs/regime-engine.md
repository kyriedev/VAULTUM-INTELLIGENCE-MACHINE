# Regime Engine

VAULTUM's cross-asset regime layer is now broker-independent by default.

## Why It Changed

The previous `get-cross-asset-regime.ts` path was a thin one-day heuristic. It leaned too heavily on a handful of Yahoo moves and did not provide enough structure, confidence scoring, or provider fault tolerance for the rest of the machine.

The new regime engine:

- uses accessible cross-asset proxies instead of broker-only feeds
- normalizes provider output behind one market-data shape
- scores liquidity, risk, volatility stability, correlation, and confidence separately
- derives synthetic flow from price/volatility behavior instead of pretending broker volume is always available
- keeps broker volume as an optional enhancement only

## Provider Fallback

Provider order:

1. `Finnhub`
2. `Alpha Vantage`
3. `Yahoo relay` fallback

The provider layer adds:

- request timeout
- retry with backoff
- in-flight deduplication
- memory cache with TTL
- stale-on-error fallback
- provider health tracking

If Upstash is configured, the provider layer also reuses the shared cache adapter for stale recovery.

## Proxies Used

The regime engine currently uses a proxy basket that is intentionally provider-friendly:

- `UUP` for the dollar / DXY proxy
- `GLD` for gold
- `TLT` for the US duration / yield proxy
- `QQQ` for NASDAQ risk
- `SPY` for S&P 500 risk
- `IBIT` for bitcoin proxy risk
- `USO` for oil
- `FXY` for JPY / carry stress
- `VIXY` for volatility pressure

These are configurable in [regime.ts](/c:/Users/user/Desktop/VAULTUM%20INTELLIGENCE%20MACHINE/src/config/regime.ts).

## Synthetic Flow

`syntheticFlow` is explicitly derived, not real exchange or broker volume.

It is built from:

- price velocity
- range expansion
- ATR / volatility expansion
- cross-asset confirmation
- persistence
- reversal pressure

This gives VAULTUM a flow-intensity signal even when broker-volume access is unavailable.

## Optional Broker Volume

Broker volume is now isolated behind `src/lib/market/providers/brokerVolume.ts`.

Rules:

- it is optional
- it never blocks regime computation
- if unavailable, the engine continues with synthetic flow
- if partially available, it is treated as an enhancement rather than a foundation

## Output Shape

The regime output now returns:

- classification: `RISK_ON`, `RISK_OFF`, `NEUTRAL`, or `TRANSITION`
- component scores
- confidence score
- drivers
- warnings
- provider health
- timestamp
- lookback windows used
- synthetic flow intensity

Compatibility fields such as `regime`, `riskState`, and `supporting` are still exposed so older consumers do not break while the rest of the app upgrades around the stronger model.

## Environment Variables

Required or useful variables:

- `FINNHUB_API_KEY`
- `ALPHAVANTAGE_API_KEY`
- `YAHOO_RELAY_URL`

Optional enhancement variables:

- `OANDA_API_KEY`
- `FXCM_RELAY_URL`
- `WS_RELAY_URL`
- `RELAY_SHARED_SECRET`

## Configuration

Thresholds, weights, provider priority, proxy symbols, cache TTLs, and lookback windows live in [regime.ts](/c:/Users/user/Desktop/VAULTUM%20INTELLIGENCE%20MACHINE/src/config/regime.ts).
