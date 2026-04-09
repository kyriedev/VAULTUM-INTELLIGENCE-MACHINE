# VAULTUM Operator Manual

## What Vaultum Is

VAULTUM is an analysis terminal for discretionary trading.

It is built to help an operator answer six questions before a trade:

1. What regime is the market in?
2. What execution phase is active right now?
3. Where is the institutional reference zone?
4. What confirms or invalidates the idea?
5. What data is real, proxy, or synthetic?
6. What is the cleanest path to precision rather than guesswork?

VAULTUM is not an execution platform.
Orders are placed manually outside Vaultum.

## Primary Operator Focus

VAULTUM can cover more than one market, but the desk is centered on:

- `XAUUSD / GOLD`
- `US30`

Secondary FX focus is:

- `GBPUSD`
- `EURUSD`
- `USDJPY`
- `GBPJPY`

Those FX pairs now have a dedicated cross-country rates differential scoreboard so the AI can reason through:

- `BOE vs Fed`
- `ECB vs Fed`
- `Fed vs BOJ`
- `BOE vs BOJ`

For the deeper house language, model-selection rules, MACRO TRENDS source ledger, and retrieval-ready knowledge stack, use [VAULTUM_TRADING_ONTOLOGY.md](./VAULTUM_TRADING_ONTOLOGY.md) and [VAULTUM_KNOWLEDGE_SYSTEM.md](./VAULTUM_KNOWLEDGE_SYSTEM.md).

## Core Operating Idea

VAULTUM should be used in this order:

1. Read the macro and trust context.
2. Read the execution phase.
3. Read the institutional reference and invalidation.
4. Read the precision ladder.
5. Decide whether the setup is ready, watch-only, or stand-aside.
6. Execute manually outside Vaultum if the setup is clean.
7. Review the trade manually inside the journal afterward.

## The Decision Chain

VAULTUM is designed around this sequence:

`regime -> phase -> setup -> execution -> risk -> review`

Do not skip steps.
The system is strongest when used as a chain, not as isolated panels.

## What The Main Labels Mean

### Regime

This is the higher-level backdrop.
Examples:

- `risk-on easing`
- `risk-off tightening`
- `mixed transition`

Regime tells you what kind of market you are in.
It does not give the actual entry.

### Execution Phase

The Entry Map classifies price into:

- `impulse`
- `correction`
- `continuation`
- `transition`

Use them like this:

- `Impulse`: structure has displaced but the pullback is not complete yet.
- `Correction`: price is retracing into the institutional zone.
- `Continuation`: pullback and trigger are aligned; this is the execution phase you usually want.
- `Transition`: the stack is not clean enough yet.

### Readiness

- `ready`: the stack is good enough to act on manually.
- `watch`: bias exists, but trigger quality is not there yet.
- `stand-aside`: the system is telling you not to force the trade.

### Trust Labels

VAULTUM labels source quality on purpose.
You should always know whether the reading is:

- `exchange volume`
- `broker volume`
- `proxy`
- `synthetic`
- `estimated`

If something is not tape-true, Vaultum should say so directly.

## Main Panels And How To Use Them

### Macro Regime

Use this first.
It tells you:

- broad regime
- rates and liquidity backdrop
- risk appetite
- major macro drivers

For FX, read the rates differential board inside the macro/economic layer before trusting spot continuation.

### Entry Map

This is the main execution panel.
It should answer:

- direction
- phase
- readiness
- entry zone
- invalidation
- trim zone
- target logic
- precision ladder
- pyramiding rule

If Entry Map says `stand-aside`, do not downgrade that to a random “maybe”.

### Institutional Monitor

Use this to see whether the live market is being supported or fought by:

- real yields
- dollar regime
- dealer posture
- positioning
- liquidity stress
- policy divergence

### Orderflow / Pressure / Volume Profile

Use these to refine execution, not to create a thesis by themselves.

They should confirm:

- whether price is accepting or rejecting the zone
- whether participation is real enough
- whether buyers or sellers are in control
- whether absorption or exhaustion is showing up

### Analyst OS

Use this when you want the system to organize the workflow, blindspots, and trust state for you.

### Trade Journal

This is the post-trade learning loop.
It is manual by design.
It now auto-captures a `Vaultum Thesis Snapshot` every time you save an entry so the review preserves:

- what Vaultum said
- the current phase
- confluence math
- institutional reference
- invalidation
- macro context
- precision plan
- pyramiding rule

## GOLD Workflow

Gold is one of the two primary desk markets.

Use this order:

1. Read dollar regime and real-yield pressure.
2. Check safe-haven pressure and event risk.
3. Read Entry Map phase.
4. Identify the institutional reference zone.
5. Wait for correction-to-continuation behavior rather than chasing impulse.
6. Use volume profile and orderflow to confirm whether the zone is actually being defended.

For GOLD, the system prefers stronger futures-backed volume where available.
That matters because Gold analysis gets weaker when volume becomes purely proxy or synthetic.

## US30 Workflow

US30 is the second primary desk market.

Use this order:

1. Read macro regime and risk appetite.
2. Check yields and volatility.
3. Read Entry Map phase.
4. Check whether dealer posture and orderflow are supportive.
5. Favor continuation only when volatility is not hostile and the structure is clean.

For US30, avoid treating every green candle as continuation.
Continuation is strongest when:

- the risk regime is not hostile
- yields are not abruptly repricing against equities
- the pressure stack is not diverging
- the institutional zone is holding with acceptance

## FX Workflow And Rates Differential Scoreboard

For `GBPUSD`, `EURUSD`, `USDJPY`, and `GBPJPY`, read the rates board before trusting the move.

The board tells you:

- the policy-rate gap
- whether that gap supports the base or quote currency
- whether spot is aligned with the spread
- whether spot is fighting the spread
- whether repricing risk is low, medium, or high

How to read it:

- `bullish-base`: the policy gap supports the pair higher.
- `bearish-base`: the policy gap supports the pair lower.
- `aligned`: spot and rates are reinforcing each other.
- `counter-trend`: spot is trading against the rates spread.
- `stretched`: price has moved farther than the rates gap cleanly explains.

Interpretation:

- `aligned + low repricing risk` is better continuation fuel.
- `counter-trend + high repricing risk` means the pair can snap hard.
- `stretched` means precision matters even more because price may need rebalancing.

## Precision Entry Logic

VAULTUM is not only about zones.
It is also about price points inside those zones.

That is why the Entry Map now carries a precision ladder:

- `test`
- `confirm`
- `press`

Use it like this:

1. `Test`: the first small expression of the idea at the better part of the zone.
2. `Confirm`: add only if the market accepts away from the zone and the trigger validates.
3. `Press`: only after the move proves itself.

This is not averaging down.
It is winner-only scaling.

## Pyramiding Rules

VAULTUM uses a reflexivity-aware pyramiding rule.

It should only encourage scaling when:

- the thesis is already working
- macro is still aligned
- the phase is supportive
- event risk is not about to hit
- price is not below invalidation

Never use pyramiding to rescue a bad entry.

The rule is:

- `test first`
- `confirm second`
- `press winners only`
- `never add below invalidation`

## What The Journal Is For

The journal is how Vaultum learns your real behavior.

Every review should capture:

- what Vaultum said
- what you actually did
- what phase the market was really in
- what confirmed the idea
- what invalidated the idea
- whether you followed or ignored the plan

This matters because the goal is not only to analyze markets well.
The goal is to reduce repeated operator mistakes.

## Best Practices For A High-Risk Operator

If you are naturally aggressive or prone to overleverage, use Vaultum to slow down the decision process.

Treat these as hard filters:

- do not size aggressively in `transition`
- do not add when the system says `stand-aside`
- do not confuse macro conviction with execution readiness
- do not press if the rates board or macro board is fighting the trade
- do not press before correction turns into continuation
- do not turn a test entry into an emotional rescue trade

The more aggressive the operator, the more important precision becomes.

## What Vaultum Will Not Do

Vaultum will not:

- place trades for you
- manage broker execution
- make proxy data look like true tape
- guarantee that a zone must hold
- remove event risk from the market

It is an analysis machine, not a certainty machine.

## Quick Start For New Users

If you hand Vaultum to someone new, tell them to do this first:

1. Open the terminal and read `Macro Regime`.
2. Open `Entry Map` for the active market.
3. Check `Institutional Monitor`.
4. Check `Orderflow`, `Pressure`, and `Volume Profile`.
5. Ask the AI a direct question like:
   - `What phase is GOLD in right now and why?`
   - `Is US30 in continuation or just impulse exhaustion?`
   - `Does the GBPUSD rates board support this long idea?`
6. If the setup is clean, execute manually outside Vaultum.
7. After the trade, log it in `Trade Journal`.

## Example Operator Questions

- `What phase is XAUUSD in right now?`
- `Is US30 ready or still watch-only?`
- `What would invalidate this GOLD continuation idea?`
- `Does the USDJPY policy gap still support longs?`
- `Is GBPJPY stretched versus the BOE-BOJ spread?`
- `Give me the precision ladder for this setup.`
- `What is the strongest blindspot in this idea?`

## Final Reminder

The correct use of Vaultum is not:

`find bias -> full send`

The correct use is:

`read regime -> read phase -> read trust -> read precision -> act manually only if the stack is clean`

That is how Vaultum becomes useful instead of noisy.
