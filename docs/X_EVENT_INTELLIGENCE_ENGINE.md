# X Event Intelligence Engine

VAULTUM's X layer is no longer a raw social feed. It is a rules-driven event-intelligence pipeline that watches selected X accounts, clusters related posts, scores credibility and impact, validates the implied move against live markets, and turns the result into macro and execution guidance.

## What It Does

For each tracked post, the engine tries to answer:

- Does this matter?
- Which assets are exposed?
- Is the impact immediate, intraday, or stale?
- Is the source credible?
- Has the market actually confirmed the headline?
- Should VAULTUM ignore it, monitor it, shift bias, or treat it as a tradeable catalyst?

The pipeline is:

`post -> parsed event -> credibility -> impact map -> live reaction validation -> actionability -> trading guidance`

## Core Files

- Backend entrypoint: `server/vaultum/intelligence/v1/get-x-intel.ts`
- Pipeline orchestration: `server/vaultum/intelligence/v1/x/pipeline.ts`
- Watched source profiles: `server/vaultum/intelligence/v1/x/watched-sources.ts`
- Event mappings and asset rules: `server/vaultum/intelligence/v1/x/rules.ts`
- Mock scenarios: `server/vaultum/intelligence/v1/x/mock-data.ts`
- Panel UI: `src/components/panels/NewsIntelPanel.ts`

## Environment

These variables control live X monitoring:

```env
X_API_BEARER_TOKEN=
X_API_BASE_URL=https://api.twitter.com/2
X_INTEL_ACCOUNTS=financialjuice:6:macro,unusual_whales:5:headline,DeItaone:5:headline,investingLive_:4:headline
X_INTEL_POST_LIMIT=18
X_INTEL_POLLING_MS=60000
```

`X_INTEL_ACCOUNTS` format:

- `handle[:weight[:category]]`
- full `https://x.com/...` URLs are accepted and normalized into handles automatically
- Example: `Reuters:5:wire`

Suggested categories:

- `official`
- `wire`
- `headline`
- `macro`
- `analyst`

Default tracked watchlist in Vaultum currently includes:

- `financialjuice`
- `unusual_whales`
- `DeItaone`
- `investingLive_`

## Source Credibility

Each tracked handle is resolved into a `SourceProfile` with:

- `sourceTier`
- `baseCredibilityScore`
- `historicalHitRate`
- `falseAlarmPenalty`
- `speedBonus`
- `marketMovingRelevanceScore`

Tier guidance:

- `tier1`: official institutions / top wire
- `tier2`: reliable headline desks / fast wires
- `tier3`: analysts / commentary
- `tier4`: noisy or engagement-driven sources

## Event Types

The rules engine currently supports these primary event classes:

- `tariff_announcement`
- `tariff_threat`
- `trade_talk_progress`
- `trade_talk_breakdown`
- `sanctions`
- `export_control`
- `military_escalation`
- `military_deescalation`
- `ceasefire`
- `shipping_disruption`
- `strait_or_chokepoint_risk`
- `oil_supply_risk`
- `energy_infrastructure_attack`
- `diplomatic_statement`
- `central_bank_comment`
- `inflation_signal`
- `growth_signal`
- `fiscal_signal`
- `regulatory_action`
- `rumor_unconfirmed`
- `narrative_noise`

These are defined in `server/vaultum/intelligence/v1/x/rules.ts` so they can be tuned without rewriting the panel or pipeline.

## Impact Mapping

Events are translated into cross-asset maps for:

- `XAUUSD`
- `WTI`
- `BRENT`
- `DXY`
- `EURUSD`
- `USDJPY`
- `US500`
- `NASDAQ`
- `US30`
- `US2Y`
- `US10Y`
- `VIX`

Each impacted asset gets:

- direction bias
- impact magnitude
- time horizon
- explanation
- primary vs secondary role

## Live Market Validation

The engine does not stop at inference. It validates headline impact against live market behavior using recent Yahoo chart data where available.

Validation windows:

- `1m`
- `5m`
- `15m`
- `60m`

Validation states:

- `confirmed`
- `partial`
- `not_confirmed`
- `contradictory`

This prevents a fast headline from being treated as real if oil, gold, yields, or equities do not confirm it.

## Actionability States

Each cluster is assigned one of these states:

- `IGNORE`
- `LOG_ONLY`
- `MONITOR`
- `MACRO_BIAS_SHIFT`
- `EXECUTION_CAUTION`
- `TRADEABLE_CATALYST`

The engine is intentionally not direct signal logic. It will not say "`post = buy`". It adjusts macro and setup permissions instead.

## Trading Guidance

For important events the engine emits:

- `regimeEffect`
- `directionalBiasByAsset`
- `setupAdjustments`
- `riskFlags`
- `expiryOrDecayWindow`

Examples:

- `Gold longs allowed only on pullbacks while escalation remains active.`
- `Avoid fading first oil impulse while chokepoint risk remains unconfirmed but active.`
- `Macro bias shifted to de-escalation; safe-haven premium likely compressing.`

## Decay Model

Every event has a half-life model:

- `flash`
- `intraday`
- `multi-day`

This helps VAULTUM avoid treating stale posts as fresh catalysts.

## Mock Feed

A mock RPC exists for testing and UI demos:

- RPC: `intelligence.get_x_intel_mock`

Mock scenarios include:

- ceasefire
- tariff threat
- oil supply disruption
- rumor with no confirmation

This lets the panel render realistic event cards even when live X access is not configured yet.

## Panel Behavior

The `Live News / X Alerts` panel:

- actively polls on a timer
- uses the backend monitor cadence from `X_INTEL_POLLING_MS`
- shows filtered event cards instead of a scrolling feed
- exposes:
  - actionability
  - validation
  - credibility
  - impact
  - half-life
  - asset map
  - explanation

Filters include:

- `All`
- `High Impact`
- `Tradeable`
- `Macro Bias`
- `Needs Confirmation`
- `Ignored / Noise`

Sorting includes:

- newest
- highest impact
- highest credibility
- strongest confirmed reaction

## Current Limits

- Live X monitoring still requires `X_API_BEARER_TOKEN` and a tracked-account list.
- X is treated as a fast headline layer, not truth by itself.
- Validation depends on available public market feeds and proxy volume in some assets.
- OTC FX still uses stronger macro/price validation than centralized tape confirmation.

## Recommended First Accounts

If you want a clean initial list for macro and fast headline coverage, start with:

- `Reuters`
- `Bloomberg`
- `WalterBloomberg`
- `FirstSquawk`
- `FinancialJuice`
- `POTUS`
- `WhiteHouse`
- `TreasuryDept`
- `FederalReserve`

Then add your own preferred discretionary or desk accounts selectively instead of bloating the watchlist with noisy commentary.
