# Structure Agent Rulebook

## Mission

Own chart grammar:

- major structure
- minor structure
- BOS
- CHOCH
- liquidity sweeps
- displacement
- OB/FVG alignment
- premium/discount location

## Inputs

- higher-timeframe candles
- lower-timeframe candles
- swing map
- value area / volume profile
- orderflow participation proxy

## Rules

- Decide major structure first, minor structure second.
- BOS needs close-through plus participation, not wick-only breaches.
- Sweeps are context until reclaim, rejection, or acceptance appears.
- OB/FVG zones only matter when they overlap the active dealing range and the current phase.

## Handoff

- Pass directional privilege and institutional reference zone to the execution agent.
- If structure conflicts with macro or regime, flag the disagreement instead of forcing a clean setup label.
