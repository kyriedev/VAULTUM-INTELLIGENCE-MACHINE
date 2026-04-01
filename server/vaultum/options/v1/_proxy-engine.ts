import { fetchYahooChart } from '../../_shared/yahoo';
import {
  americanOptionDiagnostics,
  buildStrategySnapshots,
  buildStraddleShockLadder,
  buildSyntheticSurface,
  selectPricingModel,
  type AmericanStyleDiagnostics,
  type OptionStrategySnapshot,
  type PricingSurfacePoint,
  type StrategyShockPoint,
  type SurfaceFitDiagnostics,
} from './_math';
import { fetchTdOptionChain } from './_td-chain';

function resolveSymbol(symbol: string): string {
  const value = (symbol || 'XAUUSD').toUpperCase();
  const map: Record<string, string> = {
    XAUUSD: 'GC=F',
    GOLD: 'GC=F',
    WTI: 'CL=F',
    OIL: 'CL=F',
    EURUSD: 'EURUSD=X',
    GBPUSD: 'GBPUSD=X',
    USDJPY: 'USDJPY=X',
    DXY: 'DX-Y.NYB',
    SPX: '^GSPC',
    NDX: '^IXIC',
    US30: 'DIA',
    '^DJI': 'DIA',
    DJI: 'DIA',
    DIA: 'DIA',
    'YM=F': 'DIA',
  };
  return map[value] ?? value;
}

function extractSeries(chart: { candles?: Array<{ open: number; high: number; low: number; close: number }> } | null): { open: number[]; high: number[]; low: number[]; close: number[] } {
  const candles = chart?.candles ?? [];
  return {
    open: candles.map((value) => value.open),
    high: candles.map((value) => value.high),
    low: candles.map((value) => value.low),
    close: candles.map((value) => value.close),
  };
}

async function fetchYahooSeries(sourceSymbol: string, range: string, interval: string): Promise<{ candles: Array<{ open: number; high: number; low: number; close: number }> }> {
  const payload = await fetchYahooChart(sourceSymbol, range, interval);
  if (!payload?.candles.length) throw new Error(payload?.warnings?.[0] || 'No Yahoo options proxy candles available');
  return payload;
}

function percentile(values: number[], current: number): number {
  if (!values.length) return 50;
  const below = values.filter((value) => value <= current).length;
  return Math.round((below / values.length) * 100);
}

function roundToIncrement(value: number, increment: number): number {
  return Number((Math.round(value / increment) * increment).toFixed(increment < 1 ? 4 : 2));
}

function strikeIncrement(symbol: string, price: number): number {
  if (/=X$/.test(symbol)) return symbol === 'USDJPY=X' ? 0.25 : 0.0025;
  if (symbol === 'GC=F') return 5;
  if (symbol === 'CL=F') return 1;
  if (price >= 1000) return 5;
  if (price >= 100) return 1;
  return 0.5;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function trueRange(high: number, low: number, previousClose: number): number {
  return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeSyntheticStrikeMap(points: PricingSurfacePoint[], spot: number): {
  callWall: number;
  putWall: number;
  gammaFlip: number;
  topStrikes: Array<{ strike: number; kind: 'call' | 'put' | 'balance'; gammaWeight: number }>;
} {
  const strikeMap = new Map<number, { callGamma: number; putGamma: number; total: number }>();

  points.forEach((point) => {
    const existing = strikeMap.get(point.strike) ?? { callGamma: 0, putGamma: 0, total: 0 };
    const callGamma = Math.abs(point.call.gamma) * point.interestWeight * 10_000;
    const putGamma = Math.abs(point.put.gamma) * point.interestWeight * 10_000;
    existing.callGamma += callGamma;
    existing.putGamma += putGamma;
    existing.total += callGamma + putGamma;
    strikeMap.set(point.strike, existing);
  });

  const strikes = [...strikeMap.entries()].map(([strike, metrics]) => ({
    strike,
    ...metrics,
  }));

  const callWall = [...strikes].sort((left, right) => right.callGamma - left.callGamma)[0]?.strike ?? spot;
  const putWall = [...strikes].sort((left, right) => right.putGamma - left.putGamma)[0]?.strike ?? spot;
  const gammaFlip = [...strikes]
    .sort((left, right) => Math.abs(left.callGamma - left.putGamma) - Math.abs(right.callGamma - right.putGamma))[0]?.strike
    ?? spot;

  const topStrikes = [
    ...[...strikes].sort((left, right) => right.callGamma - left.callGamma).slice(0, 2).map((item) => ({ strike: item.strike, kind: 'call' as const, gammaWeight: item.callGamma })),
    ...[...strikes].sort((left, right) => right.putGamma - left.putGamma).slice(0, 2).map((item) => ({ strike: item.strike, kind: 'put' as const, gammaWeight: item.putGamma })),
    { strike: gammaFlip, kind: 'balance' as const, gammaWeight: Math.abs((strikeMap.get(gammaFlip)?.callGamma ?? 0) - (strikeMap.get(gammaFlip)?.putGamma ?? 0)) },
  ].sort((left, right) => right.gammaWeight - left.gammaWeight).slice(0, 5);

  return { callWall, putWall, gammaFlip, topStrikes };
}

function tenorBias(tenor: string, impliedVol: number, atmVol: number, skew: number): string {
  if (tenor === '1W') {
    return impliedVol >= atmVol * 1.04
      ? 'front-end event premium elevated'
      : 'front-end vol relatively contained';
  }
  if (tenor === '1M') {
    return skew > 1.5
      ? 'downside protection remains richer than upside'
      : 'term structure looks closer to balanced carry';
  }
  return impliedVol >= atmVol
    ? 'back-end volatility carrying a premium'
    : 'back-end volatility is flatter than front-end pressure';
}

type SyntheticOptionsProxy = {
  symbol: string;
  sourceSymbol: string;
  pricingModel: string;
  price: number;
  atr14: number;
  realizedVol20: number;
  realizedVol60: number;
  volPercentile: number;
  momentum20: number;
  rangeExpansion: number;
  tickMomentum: number;
  netGamma: number;
  gammaFlip: number;
  callWall: number;
  putWall: number;
  volatilityZone: string;
  pressureScore: number;
  pressureBias: string;
  pressureConclusion: string;
  expansionRisk: string;
  snapshots: Array<{
    tenor: string;
    bias: string;
    impliedVol: number;
    expectedMove: number;
    atmCall: number;
    atmPut: number;
    model: string;
  }>;
  sourceLabel: string;
  theoreticalAtmVol: number;
  downsideSkew: number;
  expectedMove1w: number;
  expectedMove1m: number;
  dealerCorridorWidth: number;
  callOpenInterestProxy: number;
  putOpenInterestProxy: number;
  totalInterestProxy: number;
  chainProxyUnderlying: string | null;
  chainAvailable: boolean;
  chainOpenInterest: number | null;
  chainVolume: number | null;
  topStrikes: Array<{ strike: number; kind: 'call' | 'put' | 'balance'; gammaWeight: number }>;
  atmGreeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
  numericalGreeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
  greekAgreementScore: number;
  greekAgreementLabel: string;
  greekAgreementNote: string;
  ivSolverMethod: string;
  ivSolverIterations: number;
  ivSolverResidual: number;
  ivSolverConverged: boolean;
  ivSolverBounded: boolean;
  limitedIv: number;
  limitedIvConverged: boolean;
  ivSurface: Array<{
    tenor: string;
    tenorDays: number;
    atmVol: number;
    putWingVol: number;
    callWingVol: number;
    skew: number;
  }>;
  surfaceFit: SurfaceFitDiagnostics;
  americanDiagnostics: {
    call: AmericanStyleDiagnostics;
    put: AmericanStyleDiagnostics;
  };
  strategyPackages: OptionStrategySnapshot[];
  featuredStrategy: string;
  featuredStrategySummary: string;
  shockLadder: StrategyShockPoint[];
};

export async function buildSyntheticOptionsProxy(input: { symbol: string }): Promise<SyntheticOptionsProxy> {
  const sourceSymbol = resolveSymbol(input.symbol);
  const [dailyPayload, intradayPayload, ratePayload, tdChain] = await Promise.all([
    fetchYahooSeries(sourceSymbol, '6mo', '1d'),
    fetchYahooSeries(sourceSymbol, '5d', '1h'),
    fetchYahooSeries('^IRX', '1mo', '1d').catch(() => null),
    fetchTdOptionChain(input.symbol).catch(() => null),
  ]);
  const series = extractSeries(dailyPayload);
  const intradaySeries = extractSeries(intradayPayload);
  const rateSeries = ratePayload ? extractSeries(ratePayload) : { open: [], high: [], low: [], close: [] };
  if (series.close.length < 60 || series.high.length < 20 || series.low.length < 20) {
    throw new Error('Insufficient market history for options proxy engine');
  }

  const price = series.close[series.close.length - 1];
  const dailyReturns = series.close.slice(1).map((close, index) => {
    const previous = series.close[index];
    return previous ? Math.log(close / previous) : 0;
  });
  const rv20Window = dailyReturns.slice(-20);
  const rv60Window = dailyReturns.slice(-60);
  const realizedVol20 = standardDeviation(rv20Window) * Math.sqrt(252) * 100;
  const realizedVol60 = standardDeviation(rv60Window) * Math.sqrt(252) * 100;

  const realizedHistory: number[] = [];
  for (let index = 20; index <= dailyReturns.length; index += 1) {
    const window = dailyReturns.slice(index - 20, index);
    realizedHistory.push(standardDeviation(window) * Math.sqrt(252) * 100);
  }
  const volPercentile = percentile(realizedHistory, realizedVol20);

  const trValues: number[] = [];
  for (let index = 1; index < series.close.length; index += 1) {
    trValues.push(trueRange(series.high[index], series.low[index], series.close[index - 1]));
  }
  const atr14 = average(trValues.slice(-14));
  const momentum20 = ((price - series.close[series.close.length - 21]) / series.close[series.close.length - 21]) * 100;
  const intradayAnchor = intradaySeries.close.length > 12 ? intradaySeries.close[intradaySeries.close.length - 13] : null;
  const tickMomentum = intradayAnchor ? ((intradaySeries.close[intradaySeries.close.length - 1] - intradayAnchor) / intradayAnchor) * 100 : momentum20 / 4;
  const recentRange = average(trValues.slice(-5));
  const rangeExpansion = atr14 > 0 ? recentRange / atr14 : 1;

  const latestRate = rateSeries.close.length ? rateSeries.close[rateSeries.close.length - 1] : 4.5;
  const liveRate = latestRate / 100;
  const increment = strikeIncrement(sourceSymbol, price);
  const pricingModel = selectPricingModel(sourceSymbol);
  const surface = buildSyntheticSurface({
    symbol: sourceSymbol,
    spot: price,
    baseVolPercent: Math.max(realizedVol20, realizedVol60 * 0.92),
    volPercentile,
    rate: liveRate,
    foreignRate: pricingModel === 'garman-kohlhagen' ? 0 : undefined,
    dividendYield: pricingModel === 'merton' ? 0.012 : undefined,
    strikeIncrement: increment,
  });
  const syntheticStrikes = computeSyntheticStrikeMap(surface.points, price);
  const atmSurfacePoint = [...surface.points]
    .filter((point) => point.tenorDays === 30)
    .sort((left, right) => Math.abs(left.strike - price) - Math.abs(right.strike - price))[0]
    ?? surface.points[0];
  const baseTimeYears = (atmSurfacePoint?.tenorDays ?? 30) / 365;
  const baseSurfaceVol = (atmSurfacePoint?.impliedVol ?? surface.atmImpliedVol) / 100;
  const americanDiagnostics = {
    call: americanOptionDiagnostics({
      model: pricingModel,
      optionType: 'c',
      spot: price,
      strike: atmSurfacePoint?.strike ?? price,
      timeYears: baseTimeYears,
      rate: liveRate,
      foreignRate: pricingModel === 'garman-kohlhagen' ? 0 : undefined,
      dividendYield: pricingModel === 'merton' ? 0.012 : undefined,
      volatility: baseSurfaceVol,
    }),
    put: americanOptionDiagnostics({
      model: pricingModel,
      optionType: 'p',
      spot: price,
      strike: atmSurfacePoint?.strike ?? price,
      timeYears: baseTimeYears,
      rate: liveRate,
      foreignRate: pricingModel === 'garman-kohlhagen' ? 0 : undefined,
      dividendYield: pricingModel === 'merton' ? 0.012 : undefined,
      volatility: baseSurfaceVol,
    }),
  };
  const strategyPackages = buildStrategySnapshots({
    points: surface.points,
    spot: price,
    tenorDays: 30,
  });
  const shockLadder = buildStraddleShockLadder({
    model: pricingModel,
    spot: price,
    strike: atmSurfacePoint?.strike ?? price,
    timeYears: baseTimeYears,
    rate: liveRate,
    volatility: baseSurfaceVol,
    atr: Math.max(atr14, increment),
    foreignRate: pricingModel === 'garman-kohlhagen' ? 0 : undefined,
    dividendYield: pricingModel === 'merton' ? 0.012 : undefined,
  });

  let callWall = roundToIncrement(syntheticStrikes.callWall, increment);
  let putWall = roundToIncrement(syntheticStrikes.putWall, increment);
  let gammaFlip = roundToIncrement(syntheticStrikes.gammaFlip, increment);
  let theoreticalAtmVol = Number(surface.atmImpliedVol.toFixed(1));
  let downsideSkew = Number(surface.downsideSkew.toFixed(2));
  let dealerCorridorWidth = Math.abs(callWall - putWall);
  let callOpenInterestProxy = Math.round(surface.points.filter((point) => point.strike >= price).reduce((sum, point) => sum + point.interestWeight * 1000, 0));
  let putOpenInterestProxy = Math.round(surface.points.filter((point) => point.strike <= price).reduce((sum, point) => sum + point.interestWeight * 1000, 0));
  let totalInterestProxy = callOpenInterestProxy + putOpenInterestProxy;
  let topStrikes = syntheticStrikes.topStrikes.map((item) => ({ ...item, strike: roundToIncrement(item.strike, increment) }));
  const chainAvailable = Boolean(tdChain?.contracts?.length);
  const chainProxyUnderlying = tdChain?.proxyUnderlying ?? null;

  if (tdChain) {
    if (tdChain.callWall != null) callWall = roundToIncrement(tdChain.callWall, increment);
    if (tdChain.putWall != null) putWall = roundToIncrement(tdChain.putWall, increment);
    if (tdChain.gammaFlip != null) gammaFlip = roundToIncrement(tdChain.gammaFlip, increment);
    if (tdChain.atmImpliedVol != null) theoreticalAtmVol = Number(tdChain.atmImpliedVol.toFixed(1));
    if (tdChain.downsideSkew != null) downsideSkew = Number(tdChain.downsideSkew.toFixed(2));
    if (tdChain.dealerCorridorWidth != null) dealerCorridorWidth = tdChain.dealerCorridorWidth;
    callOpenInterestProxy = tdChain.callOpenInterest;
    putOpenInterestProxy = tdChain.putOpenInterest;
    totalInterestProxy = tdChain.totalOpenInterest;
    topStrikes = [
      ...(tdChain.callWall != null ? [{ strike: roundToIncrement(tdChain.callWall, increment), kind: 'call' as const, gammaWeight: tdChain.callOpenInterest }] : []),
      ...(tdChain.putWall != null ? [{ strike: roundToIncrement(tdChain.putWall, increment), kind: 'put' as const, gammaWeight: tdChain.putOpenInterest }] : []),
      ...(tdChain.gammaFlip != null ? [{ strike: roundToIncrement(tdChain.gammaFlip, increment), kind: 'balance' as const, gammaWeight: tdChain.totalOpenInterest }] : []),
    ];
  }

  const corridorPct = dealerCorridorWidth > 0 ? dealerCorridorWidth / price : 0;
  const balancedInterest = totalInterestProxy > 0 ? Math.abs(callOpenInterestProxy - putOpenInterestProxy) / totalInterestProxy : 0.5;
  const netGamma = (volPercentile >= 68 || rangeExpansion >= 1.2 || Math.abs(momentum20) >= 4 || Math.abs(tickMomentum) >= 1.2)
    ? -1
    : corridorPct <= 0.08 && balancedInterest <= 0.28
      ? 1
      : -1;
  const pressureScore = Math.max(0, Math.min(100, Math.round(
    (volPercentile * 0.34)
    + (Math.max(rangeExpansion - 1, 0) * 28)
    + Math.min(Math.abs(momentum20) * 2.8, 18)
    + Math.min(Math.abs(tickMomentum) * 10, 14)
    + (corridorPct <= 0.08 ? -8 : 6)
    + (balancedInterest <= 0.25 ? -4 : 4),
  )));
  const pressureBias = netGamma < 0 ? 'short-gamma / expansion proxy' : 'long-gamma / pinning proxy';
  const expansionRisk = pressureScore >= 75 ? 'high' : pressureScore >= 55 ? 'moderate' : 'contained';
  const volatilityZone = netGamma < 0 ? 'expansion-risk' : 'pinning-risk';
  const featuredStrategyName = netGamma < 0
    ? Math.abs(momentum20) >= 1.5 || rangeExpansion >= 1.08
      ? 'Long Straddle'
      : 'Long Strangle'
    : momentum20 >= 1
      ? 'Bull Call Spread'
      : momentum20 <= -1
        ? 'Bear Put Spread'
        : 'Long Strangle';
  const featuredStrategy = strategyPackages.find((strategy) => strategy.name === featuredStrategyName) ?? strategyPackages[0];
  const featuredStrategySummary = featuredStrategy
    ? `${featuredStrategy.name} (${featuredStrategy.thesis}) costs ${featuredStrategy.netPremium.toFixed(2)} with ${featuredStrategy.breakEvenLow != null ? `lower break-even ${featuredStrategy.breakEvenLow.toFixed(2)}` : 'no lower break-even'}${featuredStrategy.breakEvenHigh != null ? ` and upper break-even ${featuredStrategy.breakEvenHigh.toFixed(2)}` : ''}. ${featuredStrategy.summary}`
    : 'Strategy package view unavailable.';

  const snapshots = [
    { tenor: '1W', tenorDays: 7 },
    { tenor: '1M', tenorDays: 30 },
    { tenor: '3M', tenorDays: 90 },
  ].map((tenor) => {
    const atmPoint = surface.points
      .filter((point) => point.tenorDays === tenor.tenorDays)
      .sort((left, right) => Math.abs(left.strike - price) - Math.abs(right.strike - price))[0];
    return {
      tenor: tenor.tenor,
      bias: tenorBias(tenor.tenor, atmPoint?.impliedVol ?? theoreticalAtmVol, theoreticalAtmVol, downsideSkew),
      impliedVol: Number((atmPoint?.impliedVol ?? theoreticalAtmVol).toFixed(1)),
      expectedMove: Number((tenor.tenorDays === 7 ? surface.expectedMove1w : tenor.tenorDays === 30 ? surface.expectedMove1m : surface.expectedMove1m * 1.65).toFixed(2)),
      atmCall: Number((atmPoint?.call.premium ?? 0).toFixed(2)),
      atmPut: Number((atmPoint?.put.premium ?? 0).toFixed(2)),
      model: pricingModel,
    };
  });

  return {
    symbol: input.symbol,
    sourceSymbol,
    pricingModel,
    price: Number(price.toFixed(2)),
    atr14: Number(atr14.toFixed(2)),
    realizedVol20: Number(realizedVol20.toFixed(1)),
    realizedVol60: Number(realizedVol60.toFixed(1)),
    volPercentile,
    momentum20: Number(momentum20.toFixed(2)),
    tickMomentum: Number(tickMomentum.toFixed(2)),
    rangeExpansion: Number(rangeExpansion.toFixed(2)),
    netGamma,
    gammaFlip,
    callWall,
    putWall,
    volatilityZone,
    pressureScore,
    pressureBias,
    pressureConclusion: netGamma < 0
      ? 'Options structure leans short-gamma-like, so breaks away from key strikes can accelerate if pressure and orderflow confirm.'
      : 'Options structure leans long-gamma-like, so price is more likely to pin, mean-revert, or chop between the main walls unless a catalyst breaks the corridor.',
      expansionRisk,
      snapshots,
      sourceLabel: chainAvailable
      ? `Options layer combines live ${chainProxyUnderlying} chain structure from TD Ameritrade-compatible chain data with Vaultum synthetic surface math for model-aware IV, Greeks, strike context, ${surface.surfaceFit.quality} smile calibration, and quantsbin-style strategy / exercise diagnostics.`
      : `Options layer uses Vaultum synthetic surface math built from live price, realized volatility, ATR, range expansion, and model-aware option pricing because free direct listed-options data is not wired here. Current smile fit is ${surface.surfaceFit.quality} (${surface.surfaceFit.rmse} rmse) with live strategy / exercise diagnostics on top.`,
    theoreticalAtmVol,
    downsideSkew,
    expectedMove1w: Number(surface.expectedMove1w.toFixed(2)),
    expectedMove1m: Number(surface.expectedMove1m.toFixed(2)),
    dealerCorridorWidth: Number(dealerCorridorWidth.toFixed(2)),
    callOpenInterestProxy,
    putOpenInterestProxy,
    totalInterestProxy,
    chainProxyUnderlying,
    chainAvailable,
    chainOpenInterest: tdChain?.totalOpenInterest ?? null,
    chainVolume: tdChain?.totalVolume ?? null,
    topStrikes,
    atmGreeks: {
      delta: Number(surface.atmGreeks.delta.toFixed(4)),
      gamma: Number(surface.atmGreeks.gamma.toFixed(6)),
      theta: Number(surface.atmGreeks.theta.toFixed(4)),
      vega: Number(surface.atmGreeks.vega.toFixed(4)),
      rho: Number(surface.atmGreeks.rho.toFixed(4)),
    },
    numericalGreeks: {
      delta: Number(surface.greekAgreement.numerical.delta.toFixed(4)),
      gamma: Number(surface.greekAgreement.numerical.gamma.toFixed(6)),
      theta: Number(surface.greekAgreement.numerical.theta.toFixed(4)),
      vega: Number(surface.greekAgreement.numerical.vega.toFixed(4)),
      rho: Number(surface.greekAgreement.numerical.rho.toFixed(4)),
    },
    greekAgreementScore: surface.greekAgreement.score,
    greekAgreementLabel: surface.greekAgreement.label,
    greekAgreementNote: `ATM call greeks show ${surface.greekAgreement.label} analytical vs numerical agreement with score ${surface.greekAgreement.score}/100 and max drift in ${surface.greekAgreement.maxDiffGreek}.`,
    ivSolverMethod: surface.ivDiagnostics.method,
    ivSolverIterations: surface.ivDiagnostics.iterations,
    ivSolverResidual: surface.ivDiagnostics.residual,
    ivSolverConverged: surface.ivDiagnostics.converged,
    ivSolverBounded: surface.ivDiagnostics.bounded,
      limitedIv: Number((surface.ivDiagnostics.limitedValue * 100).toFixed(2)),
      limitedIvConverged: surface.ivDiagnostics.limitedConverged,
      ivSurface: surface.ivSurface,
      surfaceFit: surface.surfaceFit,
      americanDiagnostics,
      strategyPackages,
      featuredStrategy: featuredStrategy?.name ?? 'n/a',
      featuredStrategySummary,
      shockLadder,
    };
}
