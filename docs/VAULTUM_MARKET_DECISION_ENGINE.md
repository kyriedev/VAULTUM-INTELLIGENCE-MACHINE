# VAULTUM Market Decision Engine

## Purpose
The Market Decision Engine turns four intelligence layers into one decision-ready view:

- `News Intelligence`: narrative, event impact, source quality, decay
- `COT Intelligence`: hedger-first weekly institutional posture
- `Monte Carlo Risk`: survival and drawdown distribution
- `Options Intelligence`: strike pressure, cautious dealer logic, support/resistance pressure zones

It does not replace VAULTUM's structure-first execution engine. It is a context and pressure layer that explains why the tape is leaning one way or another.

## Modules
- `server/vaultum/intelligence/v1/engine/news-engine.ts`
- `server/vaultum/intelligence/v1/engine/cot-engine.ts`
- `server/vaultum/intelligence/v1/engine/monte-carlo-risk-engine.ts`
- `server/vaultum/intelligence/v1/engine/options/chain-structure.ts`
- `server/vaultum/intelligence/v1/engine/options/dealer-logic.ts`
- `server/vaultum/intelligence/v1/engine/options/engine.ts`
- `server/vaultum/intelligence/v1/engine/confluence-engine.ts`
- `server/vaultum/intelligence/v1/get-market-decision-engine.ts`
- `server/vaultum/intelligence/v1/get-market-decision-demo.ts`

## Modeling Rules
- News decays with time and source quality matters.
- COT is higher-timeframe posture, not intraday timing.
- Monte Carlo is risk distribution, not direction prediction.
- Options strike pressure is heuristic unless nearby strikes, gamma, OI, volume, and expiry structure confirm it.
- Synthetic dealer logic must always be labeled as inferred, likely, or heuristic.

## RPCs
- `intelligence.get_market_decision_engine`
- `intelligence.get_market_decision_demo`

## UI
The terminal panel is `Decision Fusion`.

It shows:
- overall bias
- fusion confidence
- support and resistance pressure levels
- scenario A / scenario B / invalidation
- engine-by-engine plain-English summaries

## Demo Fixtures
The demo endpoint returns:
- `gold`
- `usd`
- `options-screenshot`

The demo path is deterministic and does not rely on live chain fetches.

## Options Screenshot Example
The demo screenshot example intentionally represents:

- same-strike comparison
- puts more expensive than calls
- put delta slightly stronger than call delta

Expected read:
- `bearish pressure zone`
- `resistance candidate`
- `possible sell-into-rally hedging pressure`

Important caveat:
This is still a heuristic unless nearby strikes, gamma, OI, volume, and expiry structure confirm it.

## Frontend Flow
- `Decision Fusion` pulls the live engine with the current market focus.
- It degrades cleanly if one or more engines are unavailable.
- Existing structure, execution, journal, and learning layers remain unchanged.
