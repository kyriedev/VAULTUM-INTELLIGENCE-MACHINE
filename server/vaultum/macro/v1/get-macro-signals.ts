import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { fetchJSON, rateOfChange, smaCalc, extractClosePrices, extractAlignedPriceVolume } from './_shared';
import { getBisPolicyRates } from './get-bis-policy-rates';
import { getEnergyPrices } from './get-energy-prices';
import { getFredSeries } from './get-fred-series';
import { buildRatesDifferentialScoreboard } from './get-rates-differentials';

type MacroBias = 'bullish' | 'bearish' | 'mixed' | 'neutral';
type ReflexivityState =
  | 'self-reinforcing bullish'
  | 'self-reinforcing bearish'
  | 'fragile continuation'
  | 'exhaustion watch'
  | 'neutral';
type PyramidingStance = 'press-winners-only' | 'test-then-press' | 'one-shot-only' | 'stand-aside';

type MarketMacroView = {
  market: string;
  bias: MacroBias;
  convictionScore: number;
  reflexivityState: ReflexivityState;
  reflexivityScore: number;
  summary: string;
  drivers: string[];
  blindspots: string[];
  executionFocus: string;
  precisionMode: string;
  pyramiding: {
    stance: PyramidingStance;
    maxAdds: number;
    summary: string;
    addConditions: string[];
    noAddConditions: string[];
  };
};

type MacroMetricSet = {
  dxyRoc20: number | null;
  goldRoc20: number | null;
  yieldRoc20: number | null;
  spxRoc20: number | null;
  vixRoc5: number | null;
  usdJpyRoc20: number | null;
  eurUsdRoc20: number | null;
  gbpUsdRoc20: number | null;
  gbpJpyRoc20: number | null;
  us30Roc20: number | null;
  realYield10: number | null;
  realYieldTrend20: number | null;
  curve2s10s: number | null;
  curveShape: string;
  fedRate: number | null;
  ecbRate: number | null;
  boeRate: number | null;
  bojRate: number | null;
  oilChange: number | null;
  riskTone: 'risk-on' | 'risk-off' | 'mixed';
  safeHavenPressure: string;
  carryStress: string;
  dollarRegime: string;
  realYieldPressure: string;
  policyDivergence: string;
  geopoliticalStress: string;
};

const TRACKED_MARKETS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'GBPJPY', 'US30'] as const;

function latestObservation(series: { observations?: Array<{ value: number | null }> } | null | undefined): number | null {
  const observations = series?.observations ?? [];
  for (const item of observations) {
    if (item?.value != null && Number.isFinite(item.value)) return item.value;
  }
  return null;
}

function priorObservation(series: { observations?: Array<{ value: number | null }> } | null | undefined, offset: number): number | null {
  const observations = (series?.observations ?? []).filter((item) => item?.value != null && Number.isFinite(item.value));
  return observations[offset]?.value ?? null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeMarket(market?: string): string {
  const normalized = String(market || '').trim().toUpperCase();
  const aliases: Record<string, string> = {
    GOLD: 'XAUUSD',
    'GC=F': 'XAUUSD',
    'EURUSD=X': 'EURUSD',
    'GBPUSD=X': 'GBPUSD',
    'USDJPY=X': 'USDJPY',
    'GBPJPY=X': 'GBPJPY',
    '^DJI': 'US30',
    DJI: 'US30',
    DIA: 'US30',
    'YM=F': 'US30',
    'YM1!': 'US30',
  };
  const resolved = aliases[normalized] ?? normalized;
  return (TRACKED_MARKETS as readonly string[]).includes(resolved) ? resolved : 'XAUUSD';
}

function biasFromScore(score: number): MacroBias {
  if (score >= 18) return 'bullish';
  if (score <= -18) return 'bearish';
  if (Math.abs(score) >= 8) return 'mixed';
  return 'neutral';
}

function reflexivityFrom(score: number, trend: number | null): ReflexivityState {
  if (Math.abs(score) < 10) return 'neutral';
  if (trend == null) return Math.abs(score) >= 18 ? 'fragile continuation' : 'neutral';
  if (score >= 18 && trend >= 0.6) return 'self-reinforcing bullish';
  if (score <= -18 && trend <= -0.6) return 'self-reinforcing bearish';
  if ((score >= 18 && trend <= -0.35) || (score <= -18 && trend >= 0.35)) return 'exhaustion watch';
  return 'fragile continuation';
}

function signedPct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function signedPoints(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)} pts`;
}

function describeBias(bias: MacroBias): string {
  if (bias === 'bullish') return 'bullish';
  if (bias === 'bearish') return 'bearish';
  if (bias === 'mixed') return 'mixed';
  return 'neutral';
}

function priceTrendForMarket(market: string, metrics: MacroMetricSet): number | null {
  if (market === 'XAUUSD') return metrics.goldRoc20;
  if (market === 'EURUSD') return metrics.eurUsdRoc20;
  if (market === 'GBPUSD') return metrics.gbpUsdRoc20;
  if (market === 'USDJPY') return metrics.usdJpyRoc20;
  if (market === 'GBPJPY') return metrics.gbpJpyRoc20;
  if (market === 'US30') return metrics.us30Roc20;
  return null;
}

function blindspotsForMarket(market: string): string[] {
  if (market === 'XAUUSD') {
    return [
      'Physical-market demand, ETF creation flow, and China-specific gold demand are only indirectly modeled here.',
      'Gold can decouple from the usual dollar/yield relationship during acute geopolitical stress.',
    ];
  }
  if (market === 'US30') {
    return [
      'Dow breadth, earnings dispersion, and sector rotation are thinner here than in a full equity terminal stack.',
      'Index-level macro can stay constructive while industrial components diverge underneath the surface.',
    ];
  }
  if (market === 'USDJPY' || market === 'GBPJPY') {
    return [
      'BOJ communication shocks and carry unwinds can reprice faster than slower macro proxies update.',
      'JPY crosses can gap violently when volatility or funding stress jumps, even if the broader thesis still looks clean.',
    ];
  }
  return [
    'Cross-currency basis, local front-end rates, and country-specific data surprises are only partially modeled.',
    'FX spot can briefly trade on positioning squeezes even when the slower macro thesis remains valid.',
  ];
}

function buildPyramidingPlan(market: string, bias: MacroBias, convictionScore: number, reflexivityState: ReflexivityState): MarketMacroView['pyramiding'] {
  const stance: PyramidingStance =
    bias === 'neutral' || convictionScore < 52
      ? 'stand-aside'
      : reflexivityState === 'self-reinforcing bullish' || reflexivityState === 'self-reinforcing bearish'
        ? convictionScore >= 78
          ? 'press-winners-only'
          : 'test-then-press'
        : reflexivityState === 'exhaustion watch'
          ? 'one-shot-only'
          : convictionScore >= 64
            ? 'test-then-press'
            : 'one-shot-only';
  const maxAdds =
    stance === 'press-winners-only' ? 2
      : stance === 'test-then-press' ? 1
        : 0;

  const addConditions = [
    'Start with a test position only when price enters the preferred zone and the 5m trigger validates it.',
    'Add only if price proves the thesis by accepting away from the zone and the macro drivers stay aligned.',
    'Treat each add as a winner press, not as rescue size.',
  ];
  const noAddConditions = [
    'Never add below invalidation or while price is still inside a failed balance.',
    'Do not add into a high-impact calendar print that is about to hit the tape.',
    'Do not keep pressing if macro reflexivity flips to exhaustion watch or if orderflow diverges against the move.',
  ];

  const summary =
    stance === 'press-winners-only'
      ? `${market} macro reflexivity is strong enough to justify Soros-style winner pressing, but only after the test entry works; maximum adds ${maxAdds}, and never add below invalidation.`
      : stance === 'test-then-press'
        ? `${market} supports a test position first and one confirming add if the market validates the thesis; keep the add reserved for strength, not for repair.`
        : stance === 'one-shot-only'
          ? `${market} is not clean enough for aggressive pyramiding. Take one precise shot or wait, and do not compound into noise.`
          : `${market} is not in a state where pyramiding makes sense. Wait for a cleaner macro-feedback loop before pressing size.`;

  return {
    stance,
    maxAdds,
    summary,
    addConditions,
    noAddConditions,
  };
}

function buildMarketView(market: string, metrics: MacroMetricSet): MarketMacroView {
  const realYieldDriver = metrics.realYieldTrend20 ?? metrics.yieldRoc20 ?? 0;
  const priceTrend = priceTrendForMarket(market, metrics);
  const eurUsdRateGap = metrics.ecbRate != null && metrics.fedRate != null ? Number((metrics.ecbRate - metrics.fedRate).toFixed(2)) : null;
  const gbpUsdRateGap = metrics.boeRate != null && metrics.fedRate != null ? Number((metrics.boeRate - metrics.fedRate).toFixed(2)) : null;
  const usdJpyRateGap = metrics.fedRate != null && metrics.bojRate != null ? Number((metrics.fedRate - metrics.bojRate).toFixed(2)) : null;
  const gbpJpyRateGap = metrics.boeRate != null && metrics.bojRate != null ? Number((metrics.boeRate - metrics.bojRate).toFixed(2)) : null;
  let rawScore = 0;
  let drivers: string[] = [];
  let executionFocus = 'Keep the macro backdrop in sync with the execution phase before trusting any entry.';
  let precisionMode = 'Work inside the zone edges, then demand trigger confirmation before pressing.';

  if (market === 'XAUUSD') {
    rawScore =
      (-(metrics.dxyRoc20 ?? 0) * 8.5)
      + (-(realYieldDriver) * 14)
      + ((metrics.safeHavenPressure === 'elevated' ? 10 : metrics.safeHavenPressure === 'contained' ? -4 : 0))
      + ((metrics.geopoliticalStress === 'elevated' ? 6 : metrics.geopoliticalStress === 'watch' ? 2 : 0))
      + ((metrics.goldRoc20 ?? 0) * 4.5);
    drivers = [
      `DXY ${metrics.dollarRegime} (${signedPct(metrics.dxyRoc20)} 20d)`,
      `real-yield pressure ${metrics.realYieldPressure} (${metrics.realYield10 != null ? metrics.realYield10.toFixed(2) : 'n/a'})`,
      `haven pressure ${metrics.safeHavenPressure}`,
      `gold trend ${signedPct(metrics.goldRoc20)}`,
    ];
    executionFocus = 'Gold should be traded through dollar and real-yield pressure first, then through haven demand and tape confirmation.';
    precisionMode = 'Prefer discount-zone taps and only add when price reclaims the zone with real volume and supportive macro.';
  } else if (market === 'EURUSD') {
    rawScore =
      (-(metrics.dxyRoc20 ?? 0) * 10)
      + (-(realYieldDriver) * 8.5)
      + ((eurUsdRateGap ?? 0) * 4.2)
      + ((metrics.eurUsdRoc20 ?? 0) * 5)
      + ((metrics.riskTone === 'risk-on' ? 4 : metrics.riskTone === 'risk-off' ? -4 : 0))
      + ((metrics.policyDivergence === 'policy gap narrowing' ? 5 : metrics.policyDivergence === 'fed restrictive leader' ? -7 : 0));
    drivers = [
      `DXY ${metrics.dollarRegime} (${signedPct(metrics.dxyRoc20)} 20d)`,
      `real-yield pressure ${metrics.realYieldPressure}`,
      `ECB-Fed gap ${signedPoints(eurUsdRateGap)}`,
      `EURUSD trend ${signedPct(metrics.eurUsdRoc20)}`,
    ];
    executionFocus = 'EURUSD should respect dollar and rates first; fade only when spot and macro stop reinforcing each other.';
    precisionMode = 'Use premium/discount precision inside the zone and let the reclaim or rejection at the zone edge do the heavy lifting.';
  } else if (market === 'GBPUSD') {
    rawScore =
      (-(metrics.dxyRoc20 ?? 0) * 9.5)
      + (-(realYieldDriver) * 7.5)
      + ((gbpUsdRateGap ?? 0) * 4.8)
      + ((metrics.gbpUsdRoc20 ?? 0) * 5.5)
      + ((metrics.riskTone === 'risk-on' ? 5 : metrics.riskTone === 'risk-off' ? -5 : 0))
      + ((metrics.policyDivergence === 'policy gap narrowing' ? 4 : metrics.policyDivergence === 'fed restrictive leader' ? -6 : 0));
    drivers = [
      `DXY ${metrics.dollarRegime} (${signedPct(metrics.dxyRoc20)} 20d)`,
      `risk tone ${metrics.riskTone}`,
      `BOE-Fed gap ${signedPoints(gbpUsdRateGap)}`,
      `GBPUSD trend ${signedPct(metrics.gbpUsdRoc20)}`,
    ];
    executionFocus = 'GBPUSD needs both dollar pressure and broader risk tone to agree before you trust a continuation entry.';
    precisionMode = 'The best cable entries usually come from zone edges that line up with a live macro push, not from mid-range chasing.';
  } else if (market === 'USDJPY') {
    rawScore =
      ((metrics.dxyRoc20 ?? 0) * 5.5)
      + (realYieldDriver * 12.5)
      + ((usdJpyRateGap ?? 0) * 4.8)
      + ((metrics.usdJpyRoc20 ?? 0) * 6)
      + ((metrics.carryStress === 'contained' ? 7 : metrics.carryStress === 'elevated' ? -10 : 0))
      + ((metrics.riskTone === 'risk-on' ? 3 : metrics.riskTone === 'risk-off' ? -4 : 0));
    drivers = [
      `US yields ${signedPct(metrics.yieldRoc20)} 20d with ${metrics.realYieldPressure} real-rate pressure`,
      `DXY ${metrics.dollarRegime}`,
      `Fed-BOJ gap ${signedPoints(usdJpyRateGap)}`,
      `carry stress ${metrics.carryStress}`,
      `USDJPY trend ${signedPct(metrics.usdJpyRoc20)}`,
    ];
    executionFocus = 'USDJPY should be traded as a rates-and-carry instrument first; the tape can stay reflexive as long as yields and carry keep validating it.';
    precisionMode = 'Use the zone for the test, then add only if yields and USDJPY both keep accepting higher after the reclaim.';
  } else if (market === 'GBPJPY') {
    rawScore =
      ((metrics.gbpJpyRoc20 ?? 0) * 6)
      + ((metrics.gbpUsdRoc20 ?? 0) * 4)
      + ((gbpJpyRateGap ?? 0) * 4.5)
      + ((metrics.carryStress === 'contained' ? 10 : metrics.carryStress === 'elevated' ? -14 : 0))
      + ((metrics.riskTone === 'risk-on' ? 7 : metrics.riskTone === 'risk-off' ? -7 : 0))
      + (realYieldDriver * 3);
    drivers = [
      `BOE-BOJ gap ${signedPoints(gbpJpyRateGap)}`,
      `carry stress ${metrics.carryStress}`,
      `risk tone ${metrics.riskTone}`,
      `GBPUSD trend proxy ${signedPct(metrics.gbpUsdRoc20)}`,
      `GBPJPY trend ${signedPct(metrics.gbpJpyRoc20)}`,
    ];
    executionFocus = 'GBPJPY is a reflexive carry trade more than a pure macro pair; do not ignore volatility or sudden JPY safe-haven squeezes.';
    precisionMode = 'Entries should be surgical: test the zone, confirm with momentum, and avoid stacking size when carry looks shaky.';
  } else if (market === 'US30') {
    rawScore =
      ((metrics.us30Roc20 ?? 0) * 6)
      + ((metrics.spxRoc20 ?? 0) * 6)
      + ((metrics.vixRoc5 != null ? -metrics.vixRoc5 * 4.5 : 0))
      + ((metrics.dxyRoc20 != null ? -metrics.dxyRoc20 * 2.5 : 0))
      + (realYieldDriver * -5.5)
      + ((metrics.riskTone === 'risk-on' ? 8 : metrics.riskTone === 'risk-off' ? -8 : 0));
    drivers = [
      `equity risk tone ${metrics.riskTone}`,
      `US30 trend ${signedPct(metrics.us30Roc20)}`,
      `VIX impulse ${signedPct(metrics.vixRoc5, 1)} 5d`,
      `real-yield pressure ${metrics.realYieldPressure}`,
    ];
    executionFocus = 'US30 wants softer volatility and non-hostile yields; when those align, continuation entries tend to carry better.';
    precisionMode = 'Do not chase Dow strength at resistance; the best adds come after acceptance from support or after a clean range expansion confirms the move.';
  }

  const score = Number(clamp(rawScore, -100, 100).toFixed(1));
  const bias = biasFromScore(score);
  const reflexivityState = reflexivityFrom(score, priceTrend);
  const reflexivityScore = Number(clamp(Math.abs(score) + (reflexivityState.startsWith('self-reinforcing') ? 12 : reflexivityState === 'exhaustion watch' ? -8 : 0), 0, 100).toFixed(0));
  const convictionScore = Number(clamp(Math.abs(score) + (bias === 'mixed' ? -6 : 0) + (reflexivityState === 'exhaustion watch' ? -8 : 0), 0, 100).toFixed(0));
  const pyramiding = buildPyramidingPlan(market, bias, convictionScore, reflexivityState);
  const blindspots = blindspotsForMarket(market);
  const summary = `${market} macro bias is ${describeBias(bias)} (${convictionScore}/100) with ${reflexivityState}. ${drivers[0] ?? 'Macro drivers are mixed.'}`;

  return {
    market,
    bias,
    convictionScore,
    reflexivityState,
    reflexivityScore,
    summary,
    drivers,
    blindspots,
    executionFocus,
    precisionMode,
    pyramiding,
  };
}

export async function getMacroSignals(input: { market?: string } = {}): Promise<any> {
  const market = input.market ? normalizeMarket(input.market) : null;
  return getCachedOrCompute(cacheKey('macro', `signals:${market ?? 'global'}`), async () => {
    const yahooBase = 'https://query1.finance.yahoo.com/v8/finance/chart';
    const [
      dxyChart,
      goldChart,
      us10yChart,
      spxChart,
      vixChart,
      usdJpyChart,
      eurUsdChart,
      gbpUsdChart,
      gbpJpyChart,
      us30Chart,
      fred2y,
      fred10y,
      fredReal10y,
      bisPolicyRates,
      energyPrices,
    ] = await Promise.all([
      fetchJSON(`${yahooBase}/DX-Y.NYB?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/GC=F?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/^TNX?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/^GSPC?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/^VIX?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/JPY=X?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/EURUSD=X?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/GBPUSD=X?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/GBPJPY=X?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/DIA?range=1y&interval=1d`).catch(() => null),
      getFredSeries({ seriesId: 'DGS2', limit: 60 }).catch(() => ({ observations: [], source: 'FRED unavailable' })),
      getFredSeries({ seriesId: 'DGS10', limit: 60 }).catch(() => ({ observations: [], source: 'FRED unavailable' })),
      getFredSeries({ seriesId: 'DFII10', limit: 60 }).catch(() => ({ observations: [], source: 'FRED unavailable' })),
      getBisPolicyRates().catch(() => ({ rates: [] })),
      getEnergyPrices().catch(() => ({ prices: [] })),
    ]);

    const dxy = extractClosePrices(dxyChart);
    const gold = extractClosePrices(goldChart);
    const us10y = extractClosePrices(us10yChart);
    const spx = extractClosePrices(spxChart);
    const vix = extractClosePrices(vixChart);
    const usdJpy = extractClosePrices(usdJpyChart);
    const eurUsd = extractClosePrices(eurUsdChart);
    const gbpUsd = extractClosePrices(gbpUsdChart);
    const gbpJpy = extractClosePrices(gbpJpyChart);
    const us30 = extractClosePrices(us30Chart);
    const goldAligned = extractAlignedPriceVolume(goldChart);

    const dxyRoc20 = rateOfChange(dxy, 20);
    const goldRoc20 = rateOfChange(gold, 20);
    const yieldRoc20 = rateOfChange(us10y, 20);
    const spxRoc20 = rateOfChange(spx, 20);
    const vixRoc5 = rateOfChange(vix, 5);
    const usdJpyRoc20 = rateOfChange(usdJpy, 20);
    const eurUsdRoc20 = rateOfChange(eurUsd, 20);
    const gbpUsdRoc20 = rateOfChange(gbpUsd, 20);
    const gbpJpyRoc20 = rateOfChange(gbpJpy, 20);
    const us30Roc20 = rateOfChange(us30, 20);
    const twoYear = latestObservation(fred2y);
    const tenYear = latestObservation(fred10y);
    const realYield10 = latestObservation(fredReal10y);
    const priorRealYield10 = priorObservation(fredReal10y, 20);
    const realYieldTrend20 = realYield10 != null && priorRealYield10 != null ? Number((realYield10 - priorRealYield10).toFixed(2)) : null;
    const curve2s10s = twoYear != null && tenYear != null ? Number((tenYear - twoYear).toFixed(2)) : null;
    const curveShape =
      curve2s10s == null
        ? 'unknown'
        : curve2s10s < 0
          ? 'inverted'
          : curve2s10s < 0.35
            ? 'flat'
            : curve2s10s > 1.2
              ? 'steep'
              : 'normal';
    const fedRate = bisPolicyRates.rates.find((rate: any) => rate.bank === 'Federal Reserve')?.rate ?? null;
    const ecbRate = bisPolicyRates.rates.find((rate: any) => rate.bank === 'European Central Bank')?.rate ?? null;
    const boeRate = bisPolicyRates.rates.find((rate: any) => rate.bank === 'Bank of England')?.rate ?? null;
    const bojRate = bisPolicyRates.rates.find((rate: any) => rate.bank === 'Bank of Japan')?.rate ?? null;
    const policyDivergence =
      fedRate != null && ecbRate != null && boeRate != null && bojRate != null
        ? fedRate > ecbRate && fedRate > boeRate && fedRate > bojRate
          ? 'fed restrictive leader'
          : bojRate < 1 && fedRate - bojRate >= 2
            ? 'boj ultra-easy laggard'
            : (Math.abs(fedRate - ecbRate) <= 1 || Math.abs(fedRate - boeRate) <= 1)
              ? 'policy gap narrowing'
              : 'policy gap mixed'
        : 'unknown';
    const oilChange = energyPrices.prices.find((item: any) => item.symbol === 'CL=F')?.change ?? null;

    const goldSma50 = smaCalc(gold, 50);
    const goldPrice = gold[gold.length - 1] ?? null;
    let goldVwap30: number | null = null;
    if (goldAligned.length >= 30) {
      const last30 = goldAligned.slice(-30);
      let sumPv = 0;
      let sumV = 0;
      last30.forEach(({ price, volume }) => {
        sumPv += price * volume;
        sumV += volume;
      });
      if (sumV > 0) goldVwap30 = Number((sumPv / sumV).toFixed(2));
    }

    const riskTone =
      spxRoc20 != null && vixRoc5 != null
        ? spxRoc20 >= 0 && vixRoc5 <= 0
          ? 'risk-on'
          : spxRoc20 < 0 && vixRoc5 > 0
            ? 'risk-off'
            : 'mixed'
        : 'mixed';

    const regime =
      dxyRoc20 !== null && spxRoc20 !== null
        ? ((realYieldTrend20 ?? yieldRoc20 ?? 0) > 0) && dxyRoc20 > 0 && spxRoc20 < 0
          ? ((goldRoc20 ?? 0) > 0 && (vixRoc5 ?? 0) > 0 ? 'risk-off with haven support' : 'risk-off tightening')
          : ((realYieldTrend20 ?? yieldRoc20 ?? 0) <= 0) && spxRoc20 >= 0
            ? 'risk-on easing'
            : 'mixed transition'
        : 'unknown';

    const goldBias =
      goldPrice && goldSma50
        ? goldPrice > goldSma50 && (goldVwap30 === null || goldPrice > goldVwap30)
          ? 'bullish'
          : goldPrice < goldSma50 && (goldVwap30 === null || goldPrice < goldVwap30)
            ? 'bearish'
            : 'neutral-to-soft'
        : 'unknown';

    const safeHavenPressure =
      goldRoc20 !== null && vixRoc5 !== null
        ? goldRoc20 > 0 && vixRoc5 > 0
          ? 'elevated'
          : goldRoc20 < 0 && vixRoc5 <= 0
            ? 'contained'
            : 'mixed'
        : 'unknown';

    const dollarRegime =
      dxyRoc20 == null
        ? 'unknown'
        : dxyRoc20 > 1
          ? 'strong-dollar'
          : dxyRoc20 < -1
            ? 'weak-dollar'
            : 'range-dollar';
    const realYieldPressure =
      realYield10 == null
        ? 'unknown'
        : realYield10 >= 1.75 || (realYieldTrend20 != null && realYieldTrend20 > 0.15)
          ? 'restrictive'
          : realYield10 <= 1.1 || (realYieldTrend20 != null && realYieldTrend20 < -0.15)
            ? 'easing'
            : 'contained';
    const geopoliticalStress =
      (oilChange ?? 0) > 2 && (vixRoc5 ?? 0) > 4
        ? 'elevated'
        : (oilChange ?? 0) > 1 || (vixRoc5 ?? 0) > 2
          ? 'watch'
          : 'contained';
    const carryStress =
      usdJpyRoc20 == null
        ? 'unknown'
        : usdJpyRoc20 <= -1.5
          ? 'elevated'
          : usdJpyRoc20 >= 1.5
            ? 'contained'
            : 'moderate';

    const metricSet: MacroMetricSet = {
      dxyRoc20,
      goldRoc20,
      yieldRoc20,
      spxRoc20,
      vixRoc5,
      usdJpyRoc20,
      eurUsdRoc20,
      gbpUsdRoc20,
      gbpJpyRoc20,
      us30Roc20,
      realYield10,
      realYieldTrend20,
      curve2s10s,
      curveShape,
      fedRate,
      ecbRate,
      boeRate,
      bojRate,
      oilChange,
      riskTone,
      safeHavenPressure,
      carryStress,
      dollarRegime,
      realYieldPressure,
      policyDivergence,
      geopoliticalStress,
    };
    const ratesDifferentials = buildRatesDifferentialScoreboard({
      market,
      fedRate,
      ecbRate,
      boeRate,
      bojRate,
      eurUsdRoc20,
      gbpUsdRoc20,
      usdJpyRoc20,
      gbpJpyRoc20,
    });

    const marketViews = Object.fromEntries(
      TRACKED_MARKETS.map((trackedMarket) => [trackedMarket, buildMarketView(trackedMarket, metricSet)]),
    ) as Record<(typeof TRACKED_MARKETS)[number], MarketMacroView>;
    const focus = market ? marketViews[market as keyof typeof marketViews] ?? null : null;

    return {
      requestedMarket: market,
      focus,
      marketViews,
      regime,
      goldBias,
      safeHavenPressure,
      confirmed: {
        dxyRoc20,
        dxyChange: dxyRoc20,
        yieldRoc20,
        realYield10,
        realYieldTrend20,
        curve2s10s,
        curveShape,
        spxRoc20,
        vixRoc5,
        jpyRoc20: usdJpyRoc20,
        usdJpyRoc20,
        eurUsdRoc20,
        gbpUsdRoc20,
        gbpJpyRoc20,
        us30Roc20,
        goldRoc20,
      },
      inferred: {
        dollarLiquidityPressure: dxyRoc20 !== null && dxyRoc20 > 1 ? 'elevated' : dxyRoc20 !== null && dxyRoc20 < -1 ? 'easing' : 'normalizing',
        carryStress,
        dollarRegime,
        realYieldPressure,
        policyDivergence,
        geopoliticalStress,
        riskTone,
      },
      policy: {
        fedRate,
        ecbRate,
        boeRate,
        bojRate,
        divergence: policyDivergence,
      },
      ratesDifferentials,
      energy: {
        wtiChange: oilChange,
      },
      rates: {
        nominal2y: twoYear,
        nominal10y: tenYear,
        real10y: realYield10,
        curve2s10s,
        curveShape,
      },
      missing: ratesDifferentials.missing,
    };
  }, 900);
}
