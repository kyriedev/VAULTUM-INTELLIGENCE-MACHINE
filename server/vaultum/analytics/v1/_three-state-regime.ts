export type ThreeStateMarketRegimeState = 'bull' | 'bear' | 'sideways';

export type ThreeStateMarketRegimeSnapshot = {
  state: ThreeStateMarketRegimeState;
  label: 'Bull' | 'Bear' | 'Sideways';
  confidence: number;
  sourceLabel: string;
  sampleSize: number;
  clusterState: ThreeStateMarketRegimeState;
  trendFilter: 'bullish' | 'bearish' | 'mixed';
  stabilityPct: number;
  counts: Record<ThreeStateMarketRegimeState, number>;
  latestFeatures: {
    dailyReturnPct: number;
    volatility21Pct: number;
    rsi14: number;
    ma50: number;
    ma200: number;
    priceVsMa50Pct: number;
    priceVsMa200Pct: number;
  };
  summary: string;
};

type FeatureRow = {
  close: number;
  dailyReturn: number;
  volatility21: number;
  rsi14: number;
  ma50: number;
  ma200: number;
};

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function calculateRsiSeries(values: number[], period = 14): number[] {
  if (!values.length) return [];
  const gains: number[] = [];
  const losses: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index]! - values[index - 1]!;
    gains.push(delta > 0 ? delta : 0);
    losses.push(delta < 0 ? Math.abs(delta) : 0);
  }

  const rsi: number[] = [50];
  for (let index = 0; index < gains.length; index += 1) {
    const start = Math.max(0, index - period + 1);
    const avgGain = average(gains.slice(start, index + 1));
    const avgLoss = average(losses.slice(start, index + 1));
    if (!avgLoss) {
      rsi.push(100);
      continue;
    }
    const rs = avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }
  return rsi;
}

function buildFeatureRows(closes: number[]): FeatureRow[] {
  const rsi = calculateRsiSeries(closes, 14);
  const dailyReturns = closes.map((close, index) => {
    if (index === 0 || !closes[index - 1]) return 0;
    return (close / closes[index - 1]!) - 1;
  });
  const rows: FeatureRow[] = [];

  for (let index = 200; index < closes.length; index += 1) {
    const returnWindow = dailyReturns.slice(Math.max(1, index - 20), index + 1);
    const ma50 = average(closes.slice(index - 49, index + 1));
    const ma200 = average(closes.slice(index - 199, index + 1));
    rows.push({
      close: closes[index]!,
      dailyReturn: dailyReturns[index] ?? 0,
      volatility21: standardDeviation(returnWindow),
      rsi14: rsi[index] ?? 50,
      ma50,
      ma200,
    });
  }

  return rows;
}

function standardize(points: number[][]): number[][] {
  if (!points.length) return [];
  const columns = points[0]!.map((_value, columnIndex) => points.map((point) => point[columnIndex]!));
  const means = columns.map((values) => average(values));
  const deviations = columns.map((values) => standardDeviation(values) || 1);
  return points.map((point) => point.map((value, columnIndex) => (value - means[columnIndex]!) / deviations[columnIndex]!));
}

function squaredDistance(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + ((value - right[index]!) ** 2), 0);
}

function initializeCentroids(points: number[][]): number[][] {
  const sorted = points
    .map((point, index) => ({ point, index }))
    .sort((left, right) => left.point[0]! - right.point[0]!);
  const pick = (ratio: number) => sorted[Math.floor((sorted.length - 1) * ratio)]?.point ?? sorted[sorted.length - 1]!.point;
  return [pick(0.15), pick(0.5), pick(0.85)].map((point) => [...point]);
}

function assignClusters(points: number[][], centroids: number[][]): number[] {
  return points.map((point) => {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    centroids.forEach((centroid, index) => {
      const distance = squaredDistance(point, centroid);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  });
}

function recomputeCentroids(points: number[][], assignments: number[], centroids: number[][]): number[][] {
  return centroids.map((centroid, centroidIndex) => {
    const members = points.filter((_point, index) => assignments[index] === centroidIndex);
    if (!members.length) return centroid;
    return centroid.map((_value, dimension) => average(members.map((point) => point[dimension]!)));
  });
}

function labelFor(state: ThreeStateMarketRegimeState): ThreeStateMarketRegimeSnapshot['label'] {
  if (state === 'bull') return 'Bull';
  if (state === 'bear') return 'Bear';
  return 'Sideways';
}

function trendFilterState(feature: FeatureRow): 'bullish' | 'bearish' | 'mixed' {
  if (feature.close > feature.ma50 && feature.ma50 > feature.ma200 && feature.rsi14 >= 52) return 'bullish';
  if (feature.close < feature.ma50 && feature.ma50 < feature.ma200 && feature.rsi14 <= 48) return 'bearish';
  return 'mixed';
}

function fallbackRegime(closes: number[]): ThreeStateMarketRegimeSnapshot {
  const last = closes[closes.length - 1] ?? 0;
  const ma50 = average(closes.slice(-50));
  const ma200 = average(closes.slice(-200));
  const rsi = calculateRsiSeries(closes, 14);
  const latestRsi = rsi[rsi.length - 1] ?? 50;
  const returns = closes.map((close, index) => (index === 0 || !closes[index - 1] ? 0 : (close / closes[index - 1]!) - 1));
  const recentReturn = returns[returns.length - 1] ?? 0;
  const volatility21 = standardDeviation(returns.slice(-21));
  const trend = trendFilterState({
    close: last,
    dailyReturn: recentReturn,
    volatility21,
    rsi14: latestRsi,
    ma50,
    ma200,
  });
  const state: ThreeStateMarketRegimeState = trend === 'bullish' ? 'bull' : trend === 'bearish' ? 'bear' : 'sideways';
  return {
    state,
    label: labelFor(state),
    confidence: trend === 'mixed' ? 42 : 58,
    sourceLabel: 'Three-state regime classifier is running in fallback mode because there was not enough history for the clustered state model.',
    sampleSize: closes.length,
    clusterState: state,
    trendFilter: trend,
    stabilityPct: 50,
    counts: { bull: state === 'bull' ? 1 : 0, bear: state === 'bear' ? 1 : 0, sideways: state === 'sideways' ? 1 : 0 },
    latestFeatures: {
      dailyReturnPct: Number((recentReturn * 100).toFixed(2)),
      volatility21Pct: Number((volatility21 * 100).toFixed(2)),
      rsi14: Number(latestRsi.toFixed(1)),
      ma50: Number(ma50.toFixed(2)),
      ma200: Number(ma200.toFixed(2)),
      priceVsMa50Pct: ma50 ? Number((((last - ma50) / ma50) * 100).toFixed(2)) : 0,
      priceVsMa200Pct: ma200 ? Number((((last - ma200) / ma200) * 100).toFixed(2)) : 0,
    },
    summary: `${labelFor(state)} fallback regime from MA50/MA200 and RSI only; daily return ${Number((recentReturn * 100).toFixed(2))}%, 21-bar volatility ${Number((volatility21 * 100).toFixed(2))}%, RSI ${Number(latestRsi.toFixed(1))}.`,
  };
}

export function classifyThreeStateMarketRegime(closes: number[]): ThreeStateMarketRegimeSnapshot {
  const cleanCloses = closes.filter((value) => Number.isFinite(value) && value > 0);
  if (cleanCloses.length < 220) return fallbackRegime(cleanCloses);

  const featureRows = buildFeatureRows(cleanCloses);
  if (featureRows.length < 24) return fallbackRegime(cleanCloses);

  const rawPoints = featureRows.map((row) => [row.dailyReturn, row.volatility21, row.rsi14]);
  const points = standardize(rawPoints);
  let centroids = initializeCentroids(points);
  let assignments = assignClusters(points, centroids);

  for (let iteration = 0; iteration < 18; iteration += 1) {
    const nextCentroids = recomputeCentroids(points, assignments, centroids);
    const nextAssignments = assignClusters(points, nextCentroids);
    const unchanged = nextAssignments.every((value, index) => value === assignments[index]);
    centroids = nextCentroids;
    assignments = nextAssignments;
    if (unchanged) break;
  }

  const clusterStats = centroids.map((_centroid, cluster) => {
    const members = featureRows.filter((_row, index) => assignments[index] === cluster);
    return {
      cluster,
      meanReturn: average(members.map((row) => row.dailyReturn)),
      meanVolatility: average(members.map((row) => row.volatility21)),
    };
  }).sort((left, right) => left.meanReturn - right.meanReturn);

  const bearCluster = clusterStats[0]?.cluster ?? 0;
  const bullCluster = clusterStats[clusterStats.length - 1]?.cluster ?? 2;
  const sidewaysCluster = [0, 1, 2].find((cluster) => cluster !== bullCluster && cluster !== bearCluster) ?? 1;
  const stateMap = new Map<number, ThreeStateMarketRegimeState>([
    [bullCluster, 'bull'],
    [bearCluster, 'bear'],
    [sidewaysCluster, 'sideways'],
  ]);

  const clusterSequence = assignments.map((assignment) => stateMap.get(assignment) ?? 'sideways');
  const clusterState = clusterSequence[clusterSequence.length - 1] ?? 'sideways';
  const latestFeature = featureRows[featureRows.length - 1]!;
  const trendFilter = trendFilterState(latestFeature);
  const trendState: ThreeStateMarketRegimeState =
    trendFilter === 'bullish' ? 'bull' : trendFilter === 'bearish' ? 'bear' : 'sideways';

  let state = clusterState;
  if (clusterState !== trendState) {
    if (clusterState === 'sideways') state = trendState;
    else if (trendState === 'sideways') state = clusterState;
    else state = 'sideways';
  }

  const recentWindow = clusterSequence.slice(-20);
  const counts = recentWindow.reduce<Record<ThreeStateMarketRegimeState, number>>((map, value) => {
    map[value] += 1;
    return map;
  }, { bull: 0, bear: 0, sideways: 0 });
  const stabilityPct = recentWindow.length
    ? Math.round((Math.max(counts.bull, counts.bear, counts.sideways) / recentWindow.length) * 100)
    : 50;
  const trendAgreementBonus = clusterState === trendState ? 18 : (clusterState === 'sideways' || trendState === 'sideways' ? 8 : -10);
  const structureBonus =
    state === 'bull' && latestFeature.close > latestFeature.ma200
      ? 8
      : state === 'bear' && latestFeature.close < latestFeature.ma200
        ? 8
        : state === 'sideways'
          ? 4
          : -4;
  const displacementBonus =
    state === 'sideways'
      ? Math.max(0, 10 - Math.round(Math.abs(latestFeature.rsi14 - 50) * 0.2))
      : Math.min(12, Math.round((Math.abs(latestFeature.dailyReturn) * 1400) + (Math.abs(latestFeature.rsi14 - 50) * 0.12)));
  const confidence = clamp(
    Math.round(28 + (stabilityPct * 0.35) + trendAgreementBonus + structureBonus + displacementBonus),
    25,
    92,
  );
  const summaryBits = [
    `${labelFor(state)} regime`,
    `cluster=${clusterState}`,
    `trend-filter=${trendFilter}`,
    `1d return ${(latestFeature.dailyReturn * 100).toFixed(2)}%`,
    `21-bar vol ${(latestFeature.volatility21 * 100).toFixed(2)}%`,
    `RSI ${latestFeature.rsi14.toFixed(1)}`,
  ];

  return {
    state,
    label: labelFor(state),
    confidence,
    sourceLabel: 'Three-state regime layer is adapted from the desktop Market-Regime-Detection-System: returns, 21-bar volatility, and RSI are clustered into bull/bear/sideways states, then sanity-checked against MA50/MA200 trend alignment before execution use.',
    sampleSize: featureRows.length,
    clusterState,
    trendFilter,
    stabilityPct,
    counts,
    latestFeatures: {
      dailyReturnPct: Number((latestFeature.dailyReturn * 100).toFixed(2)),
      volatility21Pct: Number((latestFeature.volatility21 * 100).toFixed(2)),
      rsi14: Number(latestFeature.rsi14.toFixed(1)),
      ma50: Number(latestFeature.ma50.toFixed(2)),
      ma200: Number(latestFeature.ma200.toFixed(2)),
      priceVsMa50Pct: latestFeature.ma50 ? Number((((latestFeature.close - latestFeature.ma50) / latestFeature.ma50) * 100).toFixed(2)) : 0,
      priceVsMa200Pct: latestFeature.ma200 ? Number((((latestFeature.close - latestFeature.ma200) / latestFeature.ma200) * 100).toFixed(2)) : 0,
    },
    summary: `${summaryBits.join(' / ')} / confidence ${confidence}.`,
  };
}
