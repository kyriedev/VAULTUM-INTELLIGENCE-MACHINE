import { interpretStrikePressureFromOcr, interpretStrikePressureFromRows } from '../../../options/v1/_strike-pressure.ts';
import { buildConfluenceDecision } from './confluence-engine.ts';
import { buildCotIntelligence } from './cot-engine.ts';
import { buildMonteCarloRiskEngine } from './monte-carlo-risk-engine.ts';
import { buildNewsIntelligence } from './news-engine.ts';
import { buildOptionsChainStructure } from './options/chain-structure.ts';
import { buildDealerLogic } from './options/dealer-logic.ts';
import {
  confidenceFromParts,
  magnitudeToStrength,
  round,
  signedScoreToBias,
  type MarketDecisionEngineOutput,
  type NormalizedHeadlineInput,
  type OptionsChainRowInput,
  type OptionsIntelligenceOutput,
} from './shared.ts';

function nowMinus(minutes: number): string {
  return new Date(Date.now() - (minutes * 60_000)).toISOString();
}

function structuredStrikeRows(rows: OptionsChainRowInput[]): Array<{
  strike: number;
  kind: 'put' | 'call';
  price: number | null;
  delta: number | null;
  impliedVol?: number | null;
  openInterest?: number | null;
  totalVolume?: number | null;
  expiryBucket?: string | null;
  daysToExpiration?: number | null;
}> {
  return rows.flatMap((row) => ([
    {
      strike: row.strike,
      kind: 'call' as const,
      price: row.callPrice,
      delta: row.callDelta,
      impliedVol: row.impliedVol ?? null,
      openInterest: row.callOpenInterest ?? null,
      totalVolume: row.callVolume ?? null,
      expiryBucket: row.expiryBucket ?? null,
      daysToExpiration: row.daysToExpiration ?? null,
    },
    {
      strike: row.strike,
      kind: 'put' as const,
      price: row.putPrice,
      delta: row.putDelta != null ? -Math.abs(row.putDelta) : null,
      impliedVol: row.impliedVol ?? null,
      openInterest: row.putOpenInterest ?? null,
      totalVolume: row.putVolume ?? null,
      expiryBucket: row.expiryBucket ?? null,
      daysToExpiration: row.daysToExpiration ?? null,
    },
  ]));
}

function buildMockOptionsIntelligence(input: {
  market: string;
  spotPrice: number;
  focusStrike: number;
  rows: OptionsChainRowInput[];
  netGamma: number;
  dealerBias: string;
  expansionRisk: string;
}): OptionsIntelligenceOutput {
  const strikeResponse = interpretStrikePressureFromRows({
    symbol: input.market,
    spotPrice: input.spotPrice,
    focusStrike: input.focusStrike,
    rows: structuredStrikeRows(input.rows),
  });

  const chainStructure = buildOptionsChainStructure({
    market: input.market,
    spotPrice: input.spotPrice,
    rows: input.rows,
  });

  const dealerLogic = buildDealerLogic({
    spotPrice: input.spotPrice,
    focusStrike: strikeResponse.focusStrike ?? chainStructure.focusStrike ?? input.focusStrike,
    focusPressureRead: strikeResponse.focusReading?.pressureRead ?? null,
    focusLevelRole: strikeResponse.focusReading?.levelRole ?? null,
    focusConfidence: strikeResponse.focusReading?.confidence ?? null,
    gammaLevels: {
      netGamma: input.netGamma,
      gammaFlip: input.focusStrike,
      volatilityZone: input.netGamma < 0 ? 'expansion' : 'compression',
      chainAvailable: true,
      sourceLabel: 'demo-gamma-structure',
    },
    dealerPressure: {
      bias: input.dealerBias,
      pressureScore: strikeResponse.focusReading?.pressureRead === 'bearish pressure zone' ? 76 : 72,
      expansionRisk: input.expansionRisk,
      chainAvailable: true,
      sourceLabel: 'demo-dealer-logic',
    },
    crowdedStrikes: chainStructure.crowdedStrikes,
  });

  const biasScore = (
    (strikeResponse.focusReading?.levelRole === 'support candidate' ? 0.38 : strikeResponse.focusReading?.levelRole === 'resistance candidate' ? -0.38 : 0)
    + (dealerLogic.bias === 'bullish' ? 0.18 : dealerLogic.bias === 'bearish' ? -0.18 : 0)
    + ((chainStructure.supportCandidates[0]?.score ?? 0) * 0.15)
    - ((chainStructure.resistanceCandidates[0]?.score ?? 0) * 0.15)
  );
  const bias = signedScoreToBias(biasScore);
  const confidence = confidenceFromParts([
    strikeResponse.focusReading != null ? strikeResponse.focusReading.confidence / 100 : 0.42,
    dealerLogic.confidence,
    0.86,
  ]);
  const strength = magnitudeToStrength(Math.abs(biasScore));
  const summary = [
    strikeResponse.uiSummary,
    dealerLogic.summary,
    chainStructure.supportCandidates[0]
      ? `Support candidates: ${chainStructure.supportCandidates.slice(0, 2).map((item) => item.strike).join(' / ')}.`
      : 'No strong support strike candidates were resolved.',
    chainStructure.resistanceCandidates[0]
      ? `Resistance candidates: ${chainStructure.resistanceCandidates.slice(0, 2).map((item) => item.strike).join(' / ')}.`
      : 'No strong resistance strike candidates were resolved.',
  ].join(' ');

  return {
    source: 'Vaultum options intelligence engine (demo)',
    timestamp: new Date().toISOString(),
    asset: input.market,
    bias,
    strength,
    confidence,
    summary,
    uiSummary: `${strikeResponse.uiSummary} ${dealerLogic.summary}`,
    notes: [
      'Demo mode uses structured same-strike rows so the output stays deterministic.',
      'Premium and delta remain strike heuristics and still need nearby strikes, gamma, OI, volume, and expiry structure for stronger conviction.',
    ],
    rawInputs: {
      market: input.market,
      spotPrice: input.spotPrice,
      focusStrike: input.focusStrike,
      sourceMode: 'structured-input',
    },
    derivedMetrics: {
      supportCandidates: chainStructure.supportCandidates,
      resistanceCandidates: chainStructure.resistanceCandidates,
      magnetStrikes: chainStructure.magnetStrikes,
      crowdedStrikes: chainStructure.crowdedStrikes,
      strikePressure: strikeResponse.focusReading
        ? {
          focusStrike: strikeResponse.focusStrike,
          pressureRead: strikeResponse.focusReading.pressureRead,
          levelRole: strikeResponse.focusReading.levelRole,
          confidence: strikeResponse.focusReading.confidence,
          summary: strikeResponse.uiSummary,
          notes: strikeResponse.notes,
        }
        : null,
      dealerLogic: {
        gammaRegime: dealerLogic.gammaRegime,
        hedgePressure: dealerLogic.hedgePressure,
        tendency: dealerLogic.tendency,
        pinRisk: dealerLogic.pinRisk,
        confidence: dealerLogic.confidence,
        label: dealerLogic.label,
      },
      screenshotExplainer: null,
    },
  };
}

const goldHeadlines: NormalizedHeadlineInput[] = [
  { headline: 'Fed speakers repeat higher-for-longer message as inflation stays sticky', source: 'Reuters', timestamp: nowMinus(35) },
  { headline: 'US CPI surprises to the upside, Treasury yields push higher', source: 'Bloomberg', timestamp: nowMinus(28) },
  { headline: 'Trump says tariffs remain on the table in future trade negotiations', source: 'x:@WalterBloomberg', timestamp: nowMinus(18) },
];

const usdHeadlines: NormalizedHeadlineInput[] = [
  { headline: 'Fed officials signal policy patience after stronger payrolls report', source: 'Reuters', timestamp: nowMinus(44) },
  { headline: 'US yields rise as traders scale back near-term rate cut bets', source: 'Bloomberg', timestamp: nowMinus(30) },
  { headline: 'Risk sentiment cools after new tariff threat comments from Washington', source: 'x:@DeItaone', timestamp: nowMinus(16) },
];

export async function buildDecisionDemoFixtures(): Promise<{
  gold: MarketDecisionEngineOutput;
  usd: MarketDecisionEngineOutput;
  optionsScreenshotExample: {
    summary: string;
    focusStrike: number | null;
    pressureRead: string | null;
    levelRole: string | null;
    confidence: number | null;
    dealerImplication: string | null;
    notes: string[];
    raw: ReturnType<typeof interpretStrikePressureFromOcr>;
  };
}> {
  const goldNews = buildNewsIntelligence({ market: 'XAUUSD', headlines: goldHeadlines, source: 'demo-news' });
  const goldCot = buildCotIntelligence({
    market: 'GOLD',
    commercialLong: 132_000,
    commercialShort: 226_000,
    nonCommercialLong: 241_000,
    nonCommercialShort: 88_000,
    openInterest: 505_000,
    weeklyCommercialChange: -14_500,
    weeklySpecChange: 9_200,
    historicalSeries: [
      { hedgerNet: -72_000, specNet: 118_000 },
      { hedgerNet: -66_000, specNet: 112_000 },
      { hedgerNet: -89_000, specNet: 136_000 },
      { hedgerNet: -94_000, specNet: 144_000 },
    ],
    source: 'demo-cot',
  });
  const goldRisk = buildMonteCarloRiskEngine({
    market: 'XAUUSD',
    winRate: 0.47,
    rewardRisk: 2.1,
    riskPerTradePct: 1,
    numberOfTrades: 40,
    simulations: 1600,
    slippageBps: 4,
    feeBps: 2,
    recentPerformanceRegime: 'stable',
    seed: 20260409,
  });
  const goldOptions = buildMockOptionsIntelligence({
    market: 'XAUUSD',
    spotPrice: 2368.4,
    focusStrike: 2370,
    netGamma: -0.22,
    dealerBias: 'bearish expansion risk near resistance',
    expansionRisk: 'high',
    rows: [
      { strike: 2360, callPrice: 17.5, putPrice: 18.2, callDelta: 0.42, putDelta: 0.44, callOpenInterest: 1800, putOpenInterest: 2100, callVolume: 220, putVolume: 240 },
      { strike: 2370, callPrice: 13.2, putPrice: 19.8, callDelta: 0.35, putDelta: 0.51, callOpenInterest: 2400, putOpenInterest: 3300, callVolume: 260, putVolume: 420 },
      { strike: 2380, callPrice: 10.7, putPrice: 18.6, callDelta: 0.28, putDelta: 0.47, callOpenInterest: 2000, putOpenInterest: 3050, callVolume: 230, putVolume: 390 },
    ],
  });
  const goldConfluence = buildConfluenceDecision({
    market: 'XAUUSD',
    news: goldNews,
    cot: goldCot,
    monteCarloRisk: goldRisk,
    options: goldOptions,
  });

  const usdNews = buildNewsIntelligence({ market: 'DXY', headlines: usdHeadlines, source: 'demo-news' });
  const usdCot = buildCotIntelligence({
    market: 'USD',
    commercialLong: 68_000,
    commercialShort: 59_000,
    nonCommercialLong: 84_000,
    nonCommercialShort: 71_000,
    openInterest: 240_000,
    weeklyCommercialChange: 4_800,
    weeklySpecChange: -3_600,
    historicalSeries: [
      { hedgerNet: 4_000, specNet: 8_000 },
      { hedgerNet: 6_500, specNet: 10_500 },
      { hedgerNet: 9_000, specNet: 12_000 },
      { hedgerNet: 11_000, specNet: 13_800 },
    ],
    source: 'demo-cot',
  });
  const usdRisk = buildMonteCarloRiskEngine({
    market: 'DXY',
    winRate: 0.52,
    rewardRisk: 1.7,
    riskPerTradePct: 0.8,
    numberOfTrades: 35,
    simulations: 1600,
    slippageBps: 2,
    feeBps: 1,
    recentPerformanceRegime: 'improving',
    seed: 20260410,
  });
  const usdOptions = buildMockOptionsIntelligence({
    market: 'DXY',
    spotPrice: 105.3,
    focusStrike: 105,
    netGamma: 0.19,
    dealerBias: 'bullish carry support around ATM',
    expansionRisk: 'moderate',
    rows: [
      { strike: 104, callPrice: 1.55, putPrice: 1.12, callDelta: 0.58, putDelta: 0.37, callOpenInterest: 2200, putOpenInterest: 1800, callVolume: 180, putVolume: 120 },
      { strike: 105, callPrice: 1.31, putPrice: 0.96, callDelta: 0.52, putDelta: 0.33, callOpenInterest: 2600, putOpenInterest: 1700, callVolume: 240, putVolume: 140 },
      { strike: 106, callPrice: 1.08, putPrice: 0.88, callDelta: 0.47, putDelta: 0.29, callOpenInterest: 2400, putOpenInterest: 1600, callVolume: 210, putVolume: 120 },
    ],
  });
  const usdConfluence = buildConfluenceDecision({
    market: 'DXY',
    news: usdNews,
    cot: usdCot,
    monteCarloRisk: usdRisk,
    options: usdOptions,
  });

  const gold: MarketDecisionEngineOutput = {
    generatedAt: new Date().toISOString(),
    market: 'XAUUSD',
    timeframe: '1h',
    news: goldNews,
    cot: goldCot,
    monteCarloRisk: goldRisk,
    options: goldOptions,
    confluence: goldConfluence,
    uiSummary: {
      headline: goldConfluence.uiSummary,
      bullets: [
        goldNews.uiSummary,
        goldCot.uiSummary,
        goldOptions.uiSummary,
        goldRisk.uiSummary,
      ],
    },
    sampleMode: true,
  };

  const usd: MarketDecisionEngineOutput = {
    generatedAt: new Date().toISOString(),
    market: 'DXY',
    timeframe: '1h',
    news: usdNews,
    cot: usdCot,
    monteCarloRisk: usdRisk,
    options: usdOptions,
    confluence: usdConfluence,
    uiSummary: {
      headline: usdConfluence.uiSummary,
      bullets: [
        usdNews.uiSummary,
        usdCot.uiSummary,
        usdOptions.uiSummary,
        usdRisk.uiSummary,
      ],
    },
    sampleMode: true,
  };

  const screenshot = interpretStrikePressureFromOcr({
    symbol: 'XAUUSD',
    spotPrice: 4760.4,
    focusStrike: 4761.3,
    ocrText: `
      Spot: 4760.4
      Call Price | Call Delta | Strike | Put Delta | Put Price
      5.4 | 0.41 | 4761.3 | -0.54 | 8.9
      4.7 | 0.36 | 4765.0 | -0.48 | 7.8
      4.4 | 0.34 | 4757.5 | -0.46 | 7.2
    `,
  });

  const optionsScreenshotExample = {
    summary: screenshot.uiSummary,
    focusStrike: screenshot.focusStrike,
    pressureRead: screenshot.focusReading?.pressureRead ?? null,
    levelRole: screenshot.focusReading?.levelRole ?? null,
    confidence: screenshot.focusReading?.confidence ?? null,
    dealerImplication: screenshot.focusReading?.dealerImplication ?? null,
    notes: [
      'The screenshot example is heuristic because it is OCR-driven.',
      'Nearby strikes, gamma, OI, volume, and expiry structure should confirm the read before treating it as strong dealer truth.',
      ...screenshot.notes,
    ].slice(0, 5),
    raw: screenshot,
  };

  return { gold, usd, optionsScreenshotExample };
}
