# VAULTUM Trading Ontology

## Purpose

This document turns the Desktop `MACRO TRENDS` folder into structured operating language for Vaultum.

It is not a loose summary.
It is a house reference for:

- market-structure language
- macro and FX mechanics
- model selection
- source quality discipline

Primary desk focus remains:

- `XAUUSD / GOLD`
- `US30`

Secondary focus:

- `GBPUSD`
- `EURUSD`
- `USDJPY`
- `GBPJPY`

## House Language

### Major Structure

The higher-timeframe swing ladder.
For Vaultum intraday work this normally means `4H` and `1D`.

Use it for:

- directional privilege
- deciding whether a lower-timeframe setup is continuation or countertrend

Do not use it for:

- exact entry timing by itself

### Minor Structure

The internal `5m` / `15m` sequence used for timing inside the higher-timeframe zone.

Use it for:

- local BOS
- reclaim
- rejection
- trigger validation

Do not use it to overrule a broken major thesis.

### Continuation

A trend-resumption state where:

- impulse already happened
- correction already happened
- trigger is now aligning back with the original trend

This is usually Vaultum's preferred execution phase.

### Reversal

A real directional handoff, not just a tired candle.

Minimum standard:

- prior structure fails
- acceptance starts building in the opposite direction
- macro or flow no longer supports the old move

### Liquidity Sweep

A run beyond obvious highs, lows, or stop pools that may trap breakout traders or trigger stops.

Operational rule:

- sweep alone is not a trade
- wait for reclaim, rejection, or clear acceptance

### Displacement

A forceful move with range expansion and real participation.

Operational rule:

- displacement validates that a zone or thesis actually worked
- weak expansion without follow-through is not enough

### Premium And Discount

Value location inside the active dealing range.

Operational rule:

- `discount` improves long precision
- `premium` improves short precision
- neither one is a standalone signal

### Regime Transition

A state where the old regime is failing and the new one is not fully accepted.

Operational rule:

- reduce conviction
- reduce size
- reduce pyramiding

### Macro Pressure vs Macro Context

`Macro pressure` is the force.
Examples:

- yields
- DXY
- policy divergence
- volatility stress

`Macro context` is the why-now frame.
Examples:

- inflation repricing
- growth scare
- safe-haven demand
- intervention risk

### Forex Mechanics

Vaultum should read FX in operational terms:

- `base vs quote`: which side is strengthening faster
- `rates differentials`: BOE/ECB/BOJ/Fed spread logic before trusting continuation
- `cross construction`: GBPJPY must be read through both GBP and JPY mechanics
- `sessions and liquidity`: London and New York timing changes signal quality
- `yen mechanics`: yield spreads, carry unwind, and intervention risk matter constantly

## Model Selection

### Linear Regression

Best for:

- driver ranking
- fair-value stretch
- small pricing inefficiencies

Not best for:

- nonlinear squeeze behavior
- structural regime breaks

### ARIMA

Best for:

- short-memory baseline forecasts
- transformed or residual series

Not best for:

- violent trend days
- event-driven regime change

### GARCH

Best for:

- volatility clustering
- risk envelope
- stop-width discipline

Not best for:

- direction by itself

### Kalman Filter

Best for:

- noisy real-time state extraction
- smoothing hidden trend or fair-value estimates

Not best for:

- fixing a bad state model
- overriding market structure

### Regime Switching / Hidden Markov

Best for:

- trend/range/transition state detection
- deciding when a model or playbook should change

Not best for:

- tiny sample sizes
- fuzzy state definitions

### Monte Carlo

Best for:

- path odds
- target-first vs invalidation-first thinking
- drawdown and scenario distribution

Not best for:

- certainty language
- replacing structure

### Neural Networks

Best for:

- nonlinear sidecars with enough representative data

Not best for:

- explainability-critical execution logic
- sparse, unstable data

### Reflexivity

Best for:

- judging self-reinforcement
- controlling winner-only pyramiding
- spotting fragility and exhaustion watch

Not best for:

- rescuing losers
- bypassing invalidation

### Macro-Cycle Hybrid

Best for:

- FX cycle support
- macro-sensitive market backdrop
- combining rates, CPI, and trend-state logic

Not best for:

- exact `5m` entry points by itself

### Quantamental Panel

Best for:

- cross-country macro ranking
- normalized factor panels
- regime backdrop

Not best for:

- final trigger timing

## Market Playbooks

### XAUUSD

- Read `real yields`, `DXY`, and safe-haven pressure first.
- Prefer discount continuation from a real institutional zone.
- Use futures-backed volume first when available.
- Reflexivity matters a lot because Gold can trend hard once macro and narrative align.

### US30

- Read `yields`, `risk appetite`, and volatility first.
- Prefer continuation only when the rates/equity message is not fighting itself.
- Treat cash-session acceptance as higher quality than thin-session drift.

### GBPUSD

- Read `BOE vs Fed` before trusting the chart.
- Treat London/NY timing seriously.
- Be careful when spot is stretched versus the rates board.

### EURUSD

- Read `ECB vs Fed` and `DXY`.
- Use rates alignment before trusting continuation.
- Do not mistake premium/discount for execution by itself.

### USDJPY

- Read `Fed vs BOJ`, Treasury yields, and intervention risk.
- Treat it as a fast macro market, not a casual pair.

### GBPJPY

- Read it as `GBP logic + JPY logic + risk tone`.
- Demand stronger confirmation than on slower pairs.

## Pyramiding Rule

Vaultum's house rule is:

- `test`
- `confirm`
- `press winners only`
- `never add below invalidation`

Reflexivity can justify pressing a winner.
It never justifies averaging into failure.

## Source Ledger

Each source is tagged by extraction quality:

- `full`: text extraction was strong enough for operational use
- `partial`: useful but incomplete
- `metadata-only`: topic-level support only
- `excluded`: not relevant to trading workflow

### Core / Full

- `README.md`
  - Macro trading philosophy, reflexivity, concentration with discipline, ruthless loss cutting.
- `README2.md`
  - Quantamental workflow: `download -> panel -> learning -> signal -> pnl`.
- `0901.4447v1.pdf`
  - Reflexivity modeled as cognitive/manipulative feedback, fixed points, stability, boom-bust behavior.
  - Visual anchors: staircase diagrams and phase portraits.
- `Kalman_Filter_Estimation_and_Its_Implementation.pdf`
  - Prediction/correction loop, Kalman gain, covariance updates, hidden-state estimation from noisy observations.
  - Visual anchors: recursive algorithm loop and estimation-error plots.
- `ReflexivityinFinancialMarketsATheoreticalFrameworkExtendingtheBlackScholesModel.pdf`
  - Reflexivity can alter drift, volatility, and path dependence; useful for fragility and feedback awareness.
  - Visual anchors: effective-volatility curves, pricing-error plots, reflexivity-intensity scenarios.
- `Trading_Macro-Cycles_of_Foreign_Exchange_Markets_U.pdf`
  - Hybrid macro-cycle modeling for FX, with Markov logistic, neural nets, and combination models.
  - Strong practical takeaway: yield differentials and CPI differentials matter a lot.
  - Visual anchors: model flow diagram, parameter-evolution heatmaps, cumulative-return curves.
- `george-soros-general-theory-of-reflexivity-transcript.pdf`
  - Reflexivity as a challenge to clean equilibrium thinking; useful for house philosophy and risk framing.

### Supporting / Partial

- `3--Introduction_to_Linear_Regression_Analysis__5th_ed._Douglas_C._Montgomery__Elizabeth_A._Peck__and_G._.pdf`
  - Regression foundations, significance, prediction, residual discipline.
- `Market Structure Guidelines.pptx (1).pdf`
  - Start with `up / down / sideways`, then map higher highs/lows or lower highs/lows.
  - Strong support for major/minor structure framing.
- `ModellingandEstimatingofVolatilityusingARCHGARCHmodelsinJordansStockMarket.pdf`
  - Strong enough to anchor GARCH in the volatility/risk layer.
- `Study_of_the_ARIMA_Model_in_Financial_Time_Series_.pdf`
  - Strong enough to anchor ARIMA in the short-memory baseline layer.

### Supporting / Metadata Only

- `A_Markov_Regime-Switching_Model_with_Time-Varying_.pdf`
  - Supports the regime-switching model class, but not fine-detail claims yet.
- `Macrosynergy-Macro-Quantimental-Investment-Handbook.pdf`
  - Supports quantamental workflow and panel thinking, but extraction was too weak for detailed rules.

### Limited / Metadata Only

- `Babypips Forex ( PDFDrive ).pdf`
  - Broad forex primer support only.
- `Market Structure And Powerful Setups [By Wade Fx Setups](1).pdf`
  - Topic support for structure/setups only until manually reviewed more deeply.
- `FULLTEXT01.pdf`
  - Unresolved classification; do not use for decision-critical logic until manually reviewed.

### Excluded

- `9.10.pdf`
  - Accounting-system content, not relevant to Vaultum trading logic.

## Blindspots

- Some chart-heavy PDFs were not cleanly extractable, so document-specific nuance can still improve with manual review.
- Macro-cycle material is stronger for backdrop than exact intraday price points.
- Model choice only helps when the input data is clean and the regime is not already broken.
- High-conviction style increases the cost of confusing a good narrative with a good entry.

## Final Rule

Vaultum should not know these words in a generic internet sense.
It should use them as a decision chain:

`regime -> major structure -> minor structure -> execution phase -> trigger -> risk -> review`
