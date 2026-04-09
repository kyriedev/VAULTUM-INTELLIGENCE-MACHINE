# VAULTUM Knowledge System

Vaultum now stores its `MACRO TRENDS` ingestion as a real decision layer, not loose notes.

## What Exists

- `system.get_trading_doctrine`: house definitions and market playbooks
- `system.get_knowledge_graph`: unified ontology, evidence ledger, retrieval map, agent map
- `system.get_knowledge_coverage`: validation and blindspot report
- `system.get_concept_simulation`: recent-history replay for concept stability and model-routing validation
- `system.get_detection_engine`: concept-to-input and heuristic bindings
- `system.get_model_selection_engine`: regime-based model routing
- `system.get_agent_rulebooks`: structure, macro, quant, and execution responsibilities
- `analytics.get_setup_patrol`: live setup monitoring for the chart workspace

## Retrieval

Vaultum does not assume every concept is already sitting in prompt memory.

It retrieves from:

- doctrine terms
- concept bindings
- model playbooks
- document evidence ledger
- agent rulebooks

The current retrieval layer is lexical and structured. It is ready for a future embedding upgrade, but it already forces the system to pull the right concept family instead of speaking from vague memory.

## Validation

Each concept is expected to have:

- a clear definition
- detection logic
- context rules
- failure cases
- confidence logic

The coverage report marks weak areas honestly, especially where the source PDFs were image-heavy or metadata-only.

## Simulation Hook

Vaultum now includes a recent-history `concept simulation` hook.

It replays the latest candle window and checks:

- how the checklist concepts behaved
- how continuation versus reversal logic held up
- how the model-selection engine mapped to realized trend / mean-reversion / unstable-noise outcomes

It is intentionally honest about its limits:

- price/volatility/participation replay is live
- full historical macro/news replay is not yet a complete tape

## Active Monitoring

Vaultum can actively rescan live structure, macro, orderflow, and catalyst state through `setup patrol`.

Current limitation:

- the TradingView embed is not treated as a fully controllable chart camera, so Vaultum does not pretend it can reliably auto-pan left/right in-app
- instead, it monitors the live decision state and alerts when a high-probability setup is forming
