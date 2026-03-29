import { CHROME_UA } from '../../../_shared/constants';

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
  };
  return map[value] ?? value;
}

function extractSeries(chart: any): { open: number[]; high: number[]; low: number[]; close: number[] } {
  const quote = chart?.chart?.result?.[0]?.indicators?.quote?.[0];
  return {
    open: (quote?.open ?? []).filter((value: number | null) => value != null),
    high: (quote?.high ?? []).filter((value: number | null) => value != null),
    low: (quote?.low ?? []).filter((value: number | null) => value != null),
    close: (quote?.close ?? []).filter((value: number | null) => value != null),
  };
}

async function fetchYahooChart(sourceSymbol: string, range: string, interval: string): Promise<any> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sourceSymbol)}?range=${range}&interval=${interval}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': CHROME_UA },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Options proxy upstream ${response.status}`);
  return response.json() as Promise<any>;
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

export async function buildSyntheticOptionsProxy(input: { symbol: string }): Promise<{
  symbol: string;
  sourceSymbol: string;
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
  snapshots: Array<{ tenor: string; bias: string; impliedVol: number }>;
  sourceLabel: string;
}> {
  const sourceSymbol = resolveSymbol(input.symbol);
  const [dailyPayload, intradayPayload] = await Promise.all([
    fetchYahooChart(sourceSymbol, '6mo', '1d'),
    fetchYahooChart(sourceSymbol, '5d', '1h'),
  ]);
  const series = extractSeries(dailyPayload);
  const intradaySeries = extractSeries(intradayPayload);
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
  for (let index = 20; index <= dailyReturns.length; index++) {
    const window = dailyReturns.slice(index - 20, index);
    realizedHistory.push(standardDeviation(window) * Math.sqrt(252) * 100);
  }
  const volPercentile = percentile(realizedHistory, realizedVol20);

  const trValues: number[] = [];
  for (let index = 1; index < series.close.length; index++) {
    trValues.push(trueRange(series.high[index], series.low[index], series.close[index - 1]));
  }
  const atr14 = average(trValues.slice(-14));
  const momentum20 = ((price - series.close[series.close.length - 21]) / series.close[series.close.length - 21]) * 100;
  const intradayAnchor = intradaySeries.close.length > 12 ? intradaySeries.close[intradaySeries.close.length - 13] : null;
  const tickMomentum = intradayAnchor ? ((intradaySeries.close[intradaySeries.close.length - 1] - intradayAnchor) / intradayAnchor) * 100 : momentum20 / 4;
  const recentRange = average(trValues.slice(-5));
  const rangeExpansion = atr14 > 0 ? recentRange / atr14 : 1;

  const netGamma = (volPercentile >= 68 || rangeExpansion >= 1.2 || Math.abs(momentum20) >= 4 || Math.abs(tickMomentum) >= 1.2) ? -1 : 1;
  const increment = strikeIncrement(sourceSymbol, price);
  const wallDistance = atr14 * (netGamma < 0 ? 1.25 : 0.85);
  const gammaFlip = roundToIncrement(price - (momentum20 * atr14 * 0.08), increment);
  const callWall = roundToIncrement(price + wallDistance, increment);
  const putWall = roundToIncrement(price - wallDistance, increment);
  const pressureScore = Math.max(0, Math.min(100, Math.round((volPercentile * 0.4) + (Math.max(rangeExpansion - 1, 0) * 30) + Math.min(Math.abs(momentum20) * 3, 18) + Math.min(Math.abs(tickMomentum) * 12, 16))));
  const pressureBias = netGamma < 0 ? 'volatility expansion proxy' : 'stabilizing / pinning proxy';
  const expansionRisk = pressureScore >= 75 ? 'high' : pressureScore >= 55 ? 'moderate' : 'contained';

  return {
    symbol: input.symbol,
    sourceSymbol,
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
    volatilityZone: netGamma < 0 ? 'expansion-risk' : 'pinning-risk',
    pressureScore,
    pressureBias,
    pressureConclusion: netGamma < 0
      ? 'Synthetic dealer model flags short-gamma style conditions with higher move amplification risk.'
      : 'Synthetic dealer model points to more balanced inventory and better pinning odds around nearby strikes.',
    expansionRisk,
    snapshots: [
      { tenor: '1W', bias: netGamma < 0 ? 'event-vol premium elevated' : 'front-end vol contained', impliedVol: Number((realizedVol20 * 1.08).toFixed(1)) },
      { tenor: '1M', bias: pressureScore >= 70 ? 'flow chasing realized expansion' : 'structure consistent with mean reversion', impliedVol: Number((realizedVol20 * 1.02).toFixed(1)) },
      { tenor: '3M', bias: realizedVol20 > realizedVol60 ? 'term structure backwardation proxy' : 'term structure carry premium proxy', impliedVol: Number((realizedVol60 * 0.98).toFixed(1)) },
    ],
    sourceLabel: 'Synthetic options engine built from live price, realized volatility, ATR, range expansion, and short-horizon momentum because free direct options flow is not wired yet.',
  };
}
