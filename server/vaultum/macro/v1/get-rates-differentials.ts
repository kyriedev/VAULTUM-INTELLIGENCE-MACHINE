import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { extractClosePrices, fetchJSON, rateOfChange } from './_shared';
import { getBisPolicyRates } from './get-bis-policy-rates';

const TRACKED_RATE_PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'GBPJPY'] as const;

type TrackedRatePair = (typeof TRACKED_RATE_PAIRS)[number];
type RatesDirectionalBias = 'bullish-base' | 'bearish-base' | 'mixed' | 'neutral';
type RatesAlignment = 'aligned' | 'counter-trend' | 'stretched' | 'mixed' | 'unknown';
type RepricingRisk = 'low' | 'medium' | 'high';

type RatesDifferentialInput = {
  market?: string | null;
  fedRate: number | null;
  ecbRate: number | null;
  boeRate: number | null;
  bojRate: number | null;
  eurUsdRoc20: number | null;
  gbpUsdRoc20: number | null;
  usdJpyRoc20: number | null;
  gbpJpyRoc20: number | null;
};

type PairConfig = {
  pair: TrackedRatePair;
  baseCurrency: string;
  quoteCurrency: string;
  baseBank: string;
  quoteBank: string;
  executionFocus: string;
  blindspots: string[];
};

export type RatesDifferentialCard = {
  pair: TrackedRatePair;
  baseCurrency: string;
  quoteCurrency: string;
  baseBank: string;
  quoteBank: string;
  basePolicyRate: number | null;
  quotePolicyRate: number | null;
  differentialPts: number | null;
  directionalBias: RatesDirectionalBias;
  alignment: RatesAlignment;
  repricingRisk: RepricingRisk;
  spotTrend20dPct: number | null;
  summary: string;
  executionFocus: string;
  blindspots: string[];
};

export type RatesDifferentialScoreboard = {
  requestedMarket: TrackedRatePair | null;
  focus: RatesDifferentialCard | null;
  scoreboard: RatesDifferentialCard[];
  summary: string;
  blindspots: string[];
  missing: string[];
};

const PAIR_CONFIGS: PairConfig[] = [
  {
    pair: 'EURUSD',
    baseCurrency: 'EUR',
    quoteCurrency: 'USD',
    baseBank: 'European Central Bank',
    quoteBank: 'Federal Reserve',
    executionFocus: 'EURUSD should respect the ECB-vs-Fed gap first; rallies deserve more trust only when that gap stops favoring the dollar or the spot trend starts reclaiming against it.',
    blindspots: [
      'Policy-rate spreads lag the faster front-end repricing that can happen around CPI, payrolls, and ECB/Fed guidance shifts.',
      'EURUSD can squeeze counter to the rates gap when positioning is crowded or broad dollar liquidity abruptly rolls over.',
    ],
  },
  {
    pair: 'GBPUSD',
    baseCurrency: 'GBP',
    quoteCurrency: 'USD',
    baseBank: 'Bank of England',
    quoteBank: 'Federal Reserve',
    executionFocus: 'GBPUSD needs the BOE-vs-Fed gap and risk tone to agree; when both are not supporting cable, premium-zone longs should be treated with extra caution.',
    blindspots: [
      'Cable can trade on UK-specific fiscal or growth repricing before slower macro proxies catch up.',
      'BOE expectations often move through the gilt curve before the slower policy-rate series visibly changes.',
    ],
  },
  {
    pair: 'USDJPY',
    baseCurrency: 'USD',
    quoteCurrency: 'JPY',
    baseBank: 'Federal Reserve',
    quoteBank: 'Bank of Japan',
    executionFocus: 'USDJPY is a carry-and-rates instrument first; continuation longs deserve less trust when the Fed-over-BOJ spread is no longer widening or spot is trading against it.',
    blindspots: [
      'JPY crosses can violently reprice on BOJ communication shocks even if the slower rates gap still looks supportive.',
      'Carry unwinds and volatility shocks can overpower the nominal policy spread for several sessions.',
    ],
  },
  {
    pair: 'GBPJPY',
    baseCurrency: 'GBP',
    quoteCurrency: 'JPY',
    baseBank: 'Bank of England',
    quoteBank: 'Bank of Japan',
    executionFocus: 'GBPJPY needs both BOE-over-BOJ carry and broader risk stability; if the pair is stretched versus the rates gap, continuation entries should demand tighter structure precision.',
    blindspots: [
      'GBPJPY is a reflexive carry cross, so price can overshoot well beyond what the slower policy spread alone would justify.',
      'Risk-off repricing can hit GBPJPY harder than the raw BOE-vs-BOJ spread suggests.',
    ],
  },
];

function normalizeRatesMarket(market?: string | null): TrackedRatePair | null {
  const normalized = String(market || '').trim().toUpperCase();
  const aliases: Record<string, TrackedRatePair> = {
    EURUSD: 'EURUSD',
    'EURUSD=X': 'EURUSD',
    GBPUSD: 'GBPUSD',
    'GBPUSD=X': 'GBPUSD',
    USDJPY: 'USDJPY',
    'USDJPY=X': 'USDJPY',
    GBPJPY: 'GBPJPY',
    'GBPJPY=X': 'GBPJPY',
  };
  return aliases[normalized] ?? null;
}

function signedPct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function signedPoints(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)} pts`;
}

function directionalBiasFromDifferential(differentialPts: number | null): RatesDirectionalBias {
  if (differentialPts == null || !Number.isFinite(differentialPts)) return 'neutral';
  if (differentialPts >= 0.5) return 'bullish-base';
  if (differentialPts <= -0.5) return 'bearish-base';
  if (Math.abs(differentialPts) >= 0.2) return 'mixed';
  return 'neutral';
}

function alignmentFrom(differentialPts: number | null, spotTrend20dPct: number | null): RatesAlignment {
  if (differentialPts == null || spotTrend20dPct == null) return 'unknown';
  if (Math.abs(differentialPts) < 0.35 && Math.abs(spotTrend20dPct) < 0.6) return 'mixed';
  if (Math.abs(differentialPts) < 0.35) return Math.abs(spotTrend20dPct) >= 1.2 ? 'stretched' : 'mixed';
  const diffSign = Math.sign(differentialPts);
  const spotSign = Math.sign(spotTrend20dPct);
  if (diffSign === 0 || spotSign === 0) return 'mixed';
  if (diffSign !== spotSign) {
    return Math.abs(differentialPts) >= 0.75 && Math.abs(spotTrend20dPct) >= 0.6 ? 'counter-trend' : 'mixed';
  }
  if (Math.abs(spotTrend20dPct) > (Math.abs(differentialPts) * 2.2) + 0.8) return 'stretched';
  return 'aligned';
}

function repricingRiskFrom(alignment: RatesAlignment, differentialPts: number | null): RepricingRisk {
  if (alignment === 'counter-trend') return 'high';
  if (alignment === 'stretched') return Math.abs(differentialPts ?? 0) >= 0.75 ? 'high' : 'medium';
  if (alignment === 'aligned') return Math.abs(differentialPts ?? 0) >= 1 ? 'low' : 'medium';
  return 'medium';
}

function biasSentence(bias: RatesDirectionalBias): string {
  if (bias === 'bullish-base') return 'supports the base currency';
  if (bias === 'bearish-base') return 'favors the quote currency instead';
  if (bias === 'mixed') return 'is only a mild edge';
  return 'is close to neutral';
}

function buildCard(config: PairConfig, input: {
  basePolicyRate: number | null;
  quotePolicyRate: number | null;
  spotTrend20dPct: number | null;
}): RatesDifferentialCard {
  const differentialPts = input.basePolicyRate != null && input.quotePolicyRate != null
    ? Number((input.basePolicyRate - input.quotePolicyRate).toFixed(2))
    : null;
  const directionalBias = directionalBiasFromDifferential(differentialPts);
  const alignment = alignmentFrom(differentialPts, input.spotTrend20dPct);
  const repricingRisk = repricingRiskFrom(alignment, differentialPts);
  const summary = `${config.pair} rates board: ${config.baseBank} ${input.basePolicyRate != null ? `${input.basePolicyRate.toFixed(2)}%` : 'n/a'} vs ${config.quoteBank} ${input.quotePolicyRate != null ? `${input.quotePolicyRate.toFixed(2)}%` : 'n/a'} leaves a ${signedPoints(differentialPts)} policy gap that ${biasSentence(directionalBias)}. Spot is ${alignment} versus the 20d move ${signedPct(input.spotTrend20dPct)} with ${repricingRisk} repricing risk.`;

  return {
    pair: config.pair,
    baseCurrency: config.baseCurrency,
    quoteCurrency: config.quoteCurrency,
    baseBank: config.baseBank,
    quoteBank: config.quoteBank,
    basePolicyRate: input.basePolicyRate,
    quotePolicyRate: input.quotePolicyRate,
    differentialPts,
    directionalBias,
    alignment,
    repricingRisk,
    spotTrend20dPct: input.spotTrend20dPct,
    summary,
    executionFocus: config.executionFocus,
    blindspots: config.blindspots,
  };
}

export function buildRatesDifferentialScoreboard(input: RatesDifferentialInput): RatesDifferentialScoreboard {
  const requestedMarket = normalizeRatesMarket(input.market);
  const scoreboard = PAIR_CONFIGS.map((config) => buildCard(config, {
    basePolicyRate:
      config.pair === 'EURUSD' ? input.ecbRate
        : config.pair === 'GBPUSD' || config.pair === 'GBPJPY' ? input.boeRate
          : input.fedRate,
    quotePolicyRate:
      config.pair === 'USDJPY' || config.pair === 'GBPJPY' ? input.bojRate
        : input.fedRate,
    spotTrend20dPct:
      config.pair === 'EURUSD' ? input.eurUsdRoc20
        : config.pair === 'GBPUSD' ? input.gbpUsdRoc20
          : config.pair === 'USDJPY' ? input.usdJpyRoc20
            : input.gbpJpyRoc20,
  }));
  const focus = requestedMarket ? scoreboard.find((card) => card.pair === requestedMarket) ?? null : null;
  const blindspots = [
    'Policy-rate spreads are slower than live OIS/front-end repricing, so the scoreboard should guide context rather than replace event-aware execution timing.',
    'FX pairs can temporarily trade against rate differentials when positioning squeezes, intervention risk, or cross-asset risk shocks dominate.',
  ];
  const missing = scoreboard
    .filter((card) => card.basePolicyRate == null || card.quotePolicyRate == null)
    .map((card) => `${card.pair} policy-rate inputs are incomplete.`);
  const summary = focus?.summary
    ?? `Rates scoreboard active: ${scoreboard.map((card) => `${card.pair} ${signedPoints(card.differentialPts)} ${card.directionalBias} / ${card.alignment}`).join(' | ')}`;

  return {
    requestedMarket,
    focus,
    scoreboard,
    summary,
    blindspots,
    missing,
  };
}

export async function getRatesDifferentials(input: { market?: string } = {}): Promise<RatesDifferentialScoreboard> {
  const requestedMarket = normalizeRatesMarket(input.market);
  return getCachedOrCompute(cacheKey('macro', `rates-differentials:${requestedMarket ?? 'global'}`), async () => {
    const yahooBase = 'https://query1.finance.yahoo.com/v8/finance/chart';
    const [eurUsdChart, gbpUsdChart, usdJpyChart, gbpJpyChart, bisPolicyRates] = await Promise.all([
      fetchJSON(`${yahooBase}/EURUSD=X?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/GBPUSD=X?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/JPY=X?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/GBPJPY=X?range=1y&interval=1d`).catch(() => null),
      getBisPolicyRates().catch(() => ({ rates: [] })),
    ]);

    const eurUsd = extractClosePrices(eurUsdChart);
    const gbpUsd = extractClosePrices(gbpUsdChart);
    const usdJpy = extractClosePrices(usdJpyChart);
    const gbpJpy = extractClosePrices(gbpJpyChart);

    const fedRate = bisPolicyRates.rates.find((rate: any) => rate.bank === 'Federal Reserve')?.rate ?? null;
    const ecbRate = bisPolicyRates.rates.find((rate: any) => rate.bank === 'European Central Bank')?.rate ?? null;
    const boeRate = bisPolicyRates.rates.find((rate: any) => rate.bank === 'Bank of England')?.rate ?? null;
    const bojRate = bisPolicyRates.rates.find((rate: any) => rate.bank === 'Bank of Japan')?.rate ?? null;

    return buildRatesDifferentialScoreboard({
      market: requestedMarket,
      fedRate,
      ecbRate,
      boeRate,
      bojRate,
      eurUsdRoc20: rateOfChange(eurUsd, 20),
      gbpUsdRoc20: rateOfChange(gbpUsd, 20),
      usdJpyRoc20: rateOfChange(usdJpy, 20),
      gbpJpyRoc20: rateOfChange(gbpJpy, 20),
    });
  }, 900);
}
