export type IntelligenceBias = 'bullish' | 'bearish' | 'neutral' | 'mixed';
export type IntelligenceStrength = 'weak' | 'moderate' | 'strong';

export type BaseEngineOutput<RawInputs = unknown, DerivedMetrics = unknown> = {
  source: string;
  timestamp: string;
  asset: string;
  bias: IntelligenceBias;
  strength: IntelligenceStrength;
  confidence: number;
  summary: string;
  uiSummary: string;
  notes: string[];
  rawInputs: RawInputs;
  derivedMetrics: DerivedMetrics;
};

export type NormalizedHeadlineInput = {
  id?: string;
  headline: string;
  source: string;
  timestamp: string;
  assetTags?: string[];
  url?: string | null;
  bodyText?: string | null;
};

export type NewsHeadlineInterpretation = {
  id: string;
  headline: string;
  source: string;
  timestamp: string;
  eventCategory: string;
  sourceTier: 'tier1' | 'tier2' | 'tier3' | 'tier4';
  sentimentScore: number;
  impactScore: number;
  confidenceScore: number;
  recencyWeight: number;
  contradictionFlag: boolean;
  assetRelevance: Record<string, number>;
  dominantTransmissionPath: string;
  summary: string;
};

export type NewsIntelligenceOutput = BaseEngineOutput<
  {
    market: string;
    headlines: NormalizedHeadlineInput[];
    observedMovePct?: number | null;
  },
  {
    narrative: string;
    headlinesAnalyzed: NewsHeadlineInterpretation[];
    dominantAssets: Array<{ asset: string; score: number }>;
    netSentiment: number;
    impactLevel: number;
    regimeBias: IntelligenceBias;
    contradictions: string[];
    confirmsCurrentMove: 'confirms' | 'contradicts' | 'insufficient-data';
  }
>;

export type CotHistoricalPoint = {
  timestamp?: string;
  hedgerNet: number;
  specNet: number;
};

export type CotIntelligenceInput = {
  market: string;
  commercialLong: number;
  commercialShort: number;
  nonCommercialLong: number;
  nonCommercialShort: number;
  spreading?: number;
  openInterest?: number | null;
  weeklyCommercialChange?: number | null;
  weeklySpecChange?: number | null;
  historicalSeries?: CotHistoricalPoint[];
  currentPrice?: number | null;
  timestamp?: string;
  source?: string;
};

export type CotIntelligenceOutput = BaseEngineOutput<CotIntelligenceInput, {
  hedgerNet: number;
  hedgerDeltaWow: number;
  hedgerPercentile: number;
  speculatorPercentile: number;
  divergenceScore: number;
  posture: 'bullish' | 'bearish' | 'defensive' | 'neutral';
  postureStrength: number;
  macroBias: IntelligenceBias;
  hedgerNetShare: number | null;
  speculatorNetShare: number | null;
}>;

export type MonteCarloRiskInput = {
  market: string;
  winRate: number;
  rewardRisk: number;
  riskPerTradePct: number;
  numberOfTrades: number;
  simulations?: number;
  slippageBps?: number;
  feeBps?: number;
  winMultipliers?: number[];
  lossMultipliers?: number[];
  recentPerformanceRegime?: 'stable' | 'stressed' | 'improving' | 'degrading';
  seed?: number;
};

export type MonteCarloRiskOutput = BaseEngineOutput<MonteCarloRiskInput, {
  simulations: number;
  expectedReturn: number;
  medianReturn: number;
  drawdownP50: number;
  drawdownP90: number;
  probabilityProfit: number;
  probabilityBreakevenOrLoss: number;
  probabilityDrawdownGt5: number;
  probabilityDrawdownGt10: number;
  survivalProbability: number;
  averageMaxWinStreak: number;
  averageMaxLossStreak: number;
  riskLabel: 'safe-to-scale' | 'balanced' | 'reduce' | 'pause';
  recommendation: string;
}>;

export type OptionsChainRowInput = {
  strike: number;
  callPrice: number | null;
  putPrice: number | null;
  callDelta: number | null;
  putDelta: number | null;
  impliedVol?: number | null;
  callOpenInterest?: number | null;
  putOpenInterest?: number | null;
  callVolume?: number | null;
  putVolume?: number | null;
  expiryBucket?: string | null;
  daysToExpiration?: number | null;
};

export type OptionsStrikeLevel = {
  strike: number;
  score: number;
  role: 'support' | 'resistance' | 'magnet' | 'crowded';
  explanation: string;
};

export type OptionsIntelligenceOutput = BaseEngineOutput<{
  market: string;
  spotPrice: number | null;
  focusStrike?: number | null;
  sourceMode: 'structured-chain' | 'structured-input' | 'ocr-heuristic' | 'synthetic-live' | 'unavailable';
}, {
  supportCandidates: OptionsStrikeLevel[];
  resistanceCandidates: OptionsStrikeLevel[];
  magnetStrikes: OptionsStrikeLevel[];
  crowdedStrikes: OptionsStrikeLevel[];
  strikePressure: {
    focusStrike: number | null;
    pressureRead: string;
    levelRole: string;
    confidence: number;
    summary: string;
    notes: string[];
  } | null;
  dealerLogic: {
    gammaRegime: string;
    hedgePressure: string;
    tendency: string;
    pinRisk: string;
    confidence: number;
    label: 'synthetic dealer logic' | 'inferred hedge pressure' | 'heuristic gamma regime';
  };
  screenshotExplainer: {
    approximate: boolean;
    summary: string;
  } | null;
}>;

export type ConfluenceDecisionOutput = BaseEngineOutput<{
  market: string;
  news: NewsIntelligenceOutput | null;
  cot: CotIntelligenceOutput | null;
  monteCarloRisk: MonteCarloRiskOutput | null;
  options: OptionsIntelligenceOutput | null;
}, {
  overallBias: IntelligenceBias;
  biasStrength: IntelligenceStrength;
  macroPosture: string;
  optionsPressureMap: {
    support: OptionsStrikeLevel[];
    resistance: OptionsStrikeLevel[];
    magnets: OptionsStrikeLevel[];
  };
  riskRegime: string;
  keyLevels: {
    support: number[];
    resistance: number[];
  };
  scenarioA: string;
  scenarioB: string;
  invalidation: string;
  alignmentScore: number;
  effectiveConfidence: number;
  trustHaircuts: Array<{
    label: string;
    haircut: number;
    reason: string;
  }>;
}>;

export type MarketDecisionEngineOutput = {
  generatedAt: string;
  market: string;
  timeframe: string;
  news: NewsIntelligenceOutput | null;
  cot: CotIntelligenceOutput | null;
  monteCarloRisk: MonteCarloRiskOutput | null;
  options: OptionsIntelligenceOutput | null;
  confluence: ConfluenceDecisionOutput;
  uiSummary: {
    headline: string;
    bullets: string[];
  };
  sampleMode: boolean;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function normalizeMarket(market?: string): string {
  const upper = String(market || 'XAUUSD').trim().toUpperCase();
  const aliases: Record<string, string> = {
    GOLD: 'XAUUSD',
    GC: 'XAUUSD',
    'GC=F': 'XAUUSD',
    '^DJI': 'US30',
    DIA: 'US30',
    DJI: 'US30',
    DOW: 'US30',
    USD: 'DXY',
  };
  return aliases[upper] ?? upper;
}

export function signedScoreToBias(score: number): IntelligenceBias {
  if (score >= 0.18) return 'bullish';
  if (score <= -0.18) return 'bearish';
  if (Math.abs(score) >= 0.08) return 'mixed';
  return 'neutral';
}

export function magnitudeToStrength(value: number): IntelligenceStrength {
  const magnitude = Math.abs(value);
  if (magnitude >= 0.62) return 'strong';
  if (magnitude >= 0.28) return 'moderate';
  return 'weak';
}

export function confidenceFromParts(parts: number[]): number {
  if (!parts.length) return 0.35;
  return round(clamp01(parts.reduce((sum, value) => sum + value, 0) / parts.length), 3);
}

export function biasScoreFromLabel(bias: IntelligenceBias): number {
  if (bias === 'bullish') return 1;
  if (bias === 'bearish') return -1;
  if (bias === 'mixed') return 0.2;
  return 0;
}

export function humanizeBias(bias: IntelligenceBias): string {
  if (bias === 'bullish') return 'bullish';
  if (bias === 'bearish') return 'bearish';
  if (bias === 'mixed') return 'mixed';
  return 'neutral';
}

export function marketAssetKey(market: string): string {
  const normalized = normalizeMarket(market);
  if (normalized === 'XAUUSD') return 'gold';
  if (normalized === 'US30') return 'indices';
  if (normalized === 'WTI' || normalized === 'OIL') return 'oil';
  if (normalized === 'DXY') return 'usd';
  if (normalized === 'EURUSD') return 'eurusd';
  if (normalized === 'GBPUSD') return 'gbpusd';
  if (normalized === 'USDJPY') return 'usdjpy';
  if (normalized === 'GBPJPY') return 'gbpjpy';
  return normalized.toLowerCase();
}

export function resolveCotMarket(market: string): 'GOLD' | 'WTI' | null {
  const normalized = normalizeMarket(market);
  if (normalized === 'XAUUSD') return 'GOLD';
  if (normalized === 'WTI' || normalized === 'OIL') return 'WTI';
  return null;
}

export function percentileFromHistory(current: number, history: number[]): number {
  if (!history.length) return 50;
  const below = history.filter((value) => value <= current).length;
  return round((below / history.length) * 100, 1);
}
