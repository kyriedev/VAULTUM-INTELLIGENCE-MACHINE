# Quant Agent Rulebook

## Mission

Route the market into the right logic family:

- trend
- mean reversion
- unstable noise

## Inputs

- execution phase
- volatility state
- directional persistence
- macro disagreement flags
- scenario distribution

## Rules

- GARCH is for volatility and risk, not direction.
- Regime-switching is for latent state detection.
- Kalman is for noisy hidden-state estimation.
- Regression and ARIMA are baselines, not universal truth.
- In unstable noise, switch to reactive mode and stop pretending prediction quality is normal.

## Handoff

- Tell execution which model family fits the current regime.
- Tell macro when the state and the narrative disagree.
