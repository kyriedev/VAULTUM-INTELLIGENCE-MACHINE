import {
  clamp,
  confidenceFromParts,
  magnitudeToStrength,
  round,
  signedScoreToBias,
  type MonteCarloRiskInput,
  type MonteCarloRiskOutput,
} from './shared.ts';

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = ((1664525 * state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function percentile(values: number[], point: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = clamp(Math.round((sorted.length - 1) * point), 0, sorted.length - 1);
  return sorted[index] ?? 0;
}

function sampleMultiplier(rng: () => number, values: number[] | undefined, fallback: number): number {
  if (!values?.length) return fallback;
  const index = Math.floor(rng() * values.length);
  return values[index] ?? fallback;
}

function maxStreak(flags: boolean[]): number {
  let streak = 0;
  let max = 0;
  flags.forEach((flag) => {
    streak = flag ? streak + 1 : 0;
    max = Math.max(max, streak);
  });
  return max;
}

export function buildMonteCarloRiskEngine(input: MonteCarloRiskInput): MonteCarloRiskOutput {
  const simulations = Math.max(Math.round(input.simulations ?? 1500), 1000);
  const rng = makeRng(Math.round(input.seed ?? 1337));
  const winRate = clamp(input.winRate, 0.05, 0.95);
  const rewardRisk = Math.max(input.rewardRisk, 0.2);
  const riskPerTradePct = clamp(input.riskPerTradePct, 0.05, 5);
  const numberOfTrades = Math.max(Math.round(input.numberOfTrades), 1);
  const tradingFriction = (Math.max(input.slippageBps ?? 0, 0) + Math.max(input.feeBps ?? 0, 0)) / 10_000;
  const regimePenalty = input.recentPerformanceRegime === 'stressed'
    ? 0.05
    : input.recentPerformanceRegime === 'degrading'
      ? 0.03
      : input.recentPerformanceRegime === 'improving'
        ? -0.015
        : 0;
  const adjustedWinRate = clamp(winRate - regimePenalty, 0.02, 0.98);

  const endingReturns: number[] = [];
  const maxDrawdowns: number[] = [];
  const maxWinStreaks: number[] = [];
  const maxLossStreaks: number[] = [];

  for (let sim = 0; sim < simulations; sim += 1) {
    let equity = 1;
    let peak = 1;
    let maxDrawdown = 0;
    const wins: boolean[] = [];
    const losses: boolean[] = [];

    for (let trade = 0; trade < numberOfTrades; trade += 1) {
      const riskUnit = equity * (riskPerTradePct / 100);
      const isWin = rng() <= adjustedWinRate;
      const rewardMultiple = sampleMultiplier(rng, input.winMultipliers, rewardRisk);
      const lossMultiple = sampleMultiplier(rng, input.lossMultipliers, 1);
      const grossPnl = isWin
        ? riskUnit * rewardMultiple
        : -riskUnit * lossMultiple;
      const cost = equity * tradingFriction;
      equity += grossPnl - cost;
      peak = Math.max(peak, equity);
      const drawdown = peak > 0 ? (peak - equity) / peak : 0;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
      wins.push(isWin);
      losses.push(!isWin);
    }

    endingReturns.push(((equity - 1) * 100));
    maxDrawdowns.push(maxDrawdown * 100);
    maxWinStreaks.push(maxStreak(wins));
    maxLossStreaks.push(maxStreak(losses));
  }

  const expectedReturn = round(endingReturns.reduce((sum, value) => sum + value, 0) / endingReturns.length, 2);
  const medianReturn = round(percentile(endingReturns, 0.5), 2);
  const drawdownP50 = round(percentile(maxDrawdowns, 0.5), 2);
  const drawdownP90 = round(percentile(maxDrawdowns, 0.9), 2);
  const probabilityProfit = round(endingReturns.filter((value) => value > 0).length / simulations, 3);
  const probabilityBreakevenOrLoss = round(1 - probabilityProfit, 3);
  const probabilityDrawdownGt5 = round(maxDrawdowns.filter((value) => value > 5).length / simulations, 3);
  const probabilityDrawdownGt10 = round(maxDrawdowns.filter((value) => value > 10).length / simulations, 3);
  const survivalProbability = round(1 - (maxDrawdowns.filter((value) => value > 20).length / simulations), 3);
  const averageMaxWinStreak = round(maxWinStreaks.reduce((sum, value) => sum + value, 0) / maxWinStreaks.length, 2);
  const averageMaxLossStreak = round(maxLossStreaks.reduce((sum, value) => sum + value, 0) / maxLossStreaks.length, 2);

  const riskLabel: MonteCarloRiskOutput['derivedMetrics']['riskLabel'] =
    survivalProbability >= 0.88 && probabilityDrawdownGt10 <= 0.18 && expectedReturn > 0
      ? 'safe-to-scale'
      : survivalProbability >= 0.74 && probabilityDrawdownGt10 <= 0.34
        ? 'balanced'
        : survivalProbability >= 0.58
          ? 'reduce'
          : 'pause';
  const recommendation = riskLabel === 'safe-to-scale'
    ? 'The model remains resilient enough to scale only if live execution quality is stable.'
    : riskLabel === 'balanced'
      ? 'The model is viable, but size should stay disciplined until drawdown risk compresses.'
      : riskLabel === 'reduce'
        ? 'Reduce size or frequency because drawdown risk is becoming expensive.'
        : 'Pause scaling and protect capital until expectancy and survival improve.';
  const bias = signedScoreToBias((expectedReturn / 100) - (drawdownP90 / 100));
  const strength = magnitudeToStrength(Math.abs((expectedReturn / 100) - (drawdownP90 / 100)));
  const confidence = confidenceFromParts([
    simulations >= 1500 ? 0.9 : 0.74,
    clamp(1 - (probabilityDrawdownGt10 * 0.9), 0.15, 1),
    clamp(probabilityProfit + (survivalProbability * 0.35), 0.15, 1),
  ]);

  return {
    source: 'Vaultum Monte Carlo risk engine',
    timestamp: new Date().toISOString(),
    asset: input.market,
    bias,
    strength,
    confidence,
    summary: `Monte Carlo risk says ${riskLabel.replaceAll('-', ' ')}. Profit probability is ${(probabilityProfit * 100).toFixed(1)}% with drawdown p90 at ${drawdownP90.toFixed(1)}%. ${recommendation}`,
    uiSummary: `Strategy survival is ${(survivalProbability * 100).toFixed(0)}% with drawdown p90 ${drawdownP90.toFixed(1)}%. ${recommendation}`,
    notes: [
      'This engine estimates strategy survival and drawdown distribution, not market direction.',
      'Scaling decisions should still be cross-checked against execution quality and current regime.',
      `Average max win/loss streaks are ${averageMaxWinStreak} / ${averageMaxLossStreak}.`,
    ],
    rawInputs: {
      ...input,
      simulations,
      winRate: adjustedWinRate,
    },
    derivedMetrics: {
      simulations,
      expectedReturn,
      medianReturn,
      drawdownP50,
      drawdownP90,
      probabilityProfit,
      probabilityBreakevenOrLoss,
      probabilityDrawdownGt5,
      probabilityDrawdownGt10,
      survivalProbability,
      averageMaxWinStreak,
      averageMaxLossStreak,
      riskLabel,
      recommendation,
    },
  };
}
