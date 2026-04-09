import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';

export type ExtractionQuality = 'full' | 'partial' | 'metadata-only' | 'excluded';
export type DocumentFit = 'core' | 'supporting' | 'limited' | 'excluded';
export type TradingModelKey =
  | 'linear-regression'
  | 'arima'
  | 'garch'
  | 'kalman-filter'
  | 'regime-switching'
  | 'monte-carlo'
  | 'neural-networks'
  | 'reflexivity'
  | 'macro-cycle-hybrid'
  | 'quantamental-panel';

export type DoctrineTerm = {
  key: string;
  label: string;
  definition: string;
  operationalUse: string;
  whenItMatters: string;
  whenItDoesNot: string;
};

export type TradingModelPlaybook = {
  key: TradingModelKey;
  label: string;
  job: string;
  whenItMatters: string;
  whenItDoesNot: string;
  limitations: string[];
};

export type MarketPlaybook = {
  market: string;
  role: 'primary' | 'secondary';
  summary: string;
  macroPressure: string[];
  structureFocus: string[];
  precisionRules: string[];
  preferredModels: TradingModelKey[];
  preferredVolumeAnchor: string;
};

export type DoctrineSource = {
  document: string;
  topic: string;
  extractionQuality: ExtractionQuality;
  fit: DocumentFit;
};

export type TradingDoctrineResponse = {
  generatedAt: string;
  summary: string;
  operatorProfile: {
    executionMode: string;
    primaryMarkets: string[];
    secondaryMarkets: string[];
    workflow: string[];
  };
  focusMarket: MarketPlaybook;
  languageRules: string[];
  marketStructureOntology: DoctrineTerm[];
  macroOntology: DoctrineTerm[];
  forexMechanics: DoctrineTerm[];
  modelSelection: TradingModelPlaybook[];
  recommendedModels: TradingModelPlaybook[];
  marketPlaybooks: MarketPlaybook[];
  sourceLedger: DoctrineSource[];
  trustRules: string[];
  blindspots: string[];
};

export const marketStructureOntology: DoctrineTerm[] = [
  {
    key: 'major-structure',
    label: 'Major Structure',
    definition: 'The higher-timeframe swing ladder that decides directional privilege, usually 4H and 1D for Vaultum intraday work.',
    operationalUse: 'Use it to decide whether lower-timeframe trades are trend continuation or countertrend fades.',
    whenItMatters: 'Before any entry logic or lower-timeframe confirmation.',
    whenItDoesNot: 'After a confirmed higher-timeframe regime break has already invalidated the old ladder.',
  },
  {
    key: 'minor-structure',
    label: 'Minor Structure',
    definition: 'The internal 5m and 15m sequence that refines timing inside the higher-timeframe zone.',
    operationalUse: 'Use it for break of structure, reclaim, rejection, and trigger timing.',
    whenItMatters: 'When price is already near the planned institutional reference.',
    whenItDoesNot: 'When the major structure and macro thesis are already broken.',
  },
  {
    key: 'impulse',
    label: 'Impulse',
    definition: 'The forceful leg that takes ground, breaks opposing structure, and establishes a fresh dealing range.',
    operationalUse: 'Use it to identify when price is expanding away from value and the next job is to wait for correction rather than chase.',
    whenItMatters: 'Immediately after a valid structure break or directional expansion.',
    whenItDoesNot: 'When price is already retracing, rotating, or failing to hold the breakout.',
  },
  {
    key: 'correction',
    label: 'Correction',
    definition: 'The controlled retracement back into the important structure area after an impulse, without yet proving a new reversal.',
    operationalUse: 'Use it to locate the broad area for the next trade idea, then wait for execution-layer confirmation inside it.',
    whenItMatters: 'Between impulse and continuation, especially when price is returning into demand, supply, or value.',
    whenItDoesNot: 'When the old trend has already lost acceptance and the market is handing off into reversal.',
  },
  {
    key: 'continuation',
    label: 'Continuation',
    definition: 'Trend-resumption after impulse and correction have already happened and trigger alignment returns in the original direction.',
    operationalUse: 'Treat it as Vaultum\'s preferred execution phase because location and confirmation usually line up together.',
    whenItMatters: 'When the desk wants the cleanest intraday expression of a valid thesis.',
    whenItDoesNot: 'During unstable transition or event-driven repricing that keeps breaking pullback logic.',
  },
  {
    key: 'reversal',
    label: 'Reversal',
    definition: 'A genuine directional handoff where the prior structure loses authority and price starts accepting in the opposite regime.',
    operationalUse: 'Demand a failed prior defense and new acceptance pattern rather than calling every exhaustion candle a reversal.',
    whenItMatters: 'After sweeps, failed continuation, or macro regime shifts.',
    whenItDoesNot: 'When price only sweeps liquidity and quickly restores the old trend.',
  },
  {
    key: 'liquidity-sweep',
    label: 'Liquidity Sweep',
    definition: 'A run beyond obvious highs, lows, or stop pools that does not necessarily earn acceptance through the level.',
    operationalUse: 'Use sweeps as context, then wait for reclaim, rejection, or acceptance before acting.',
    whenItMatters: 'Near session extremes, external highs/lows, and range edges.',
    whenItDoesNot: 'When price keeps accepting through the level and turns the sweep into a true breakout.',
  },
  {
    key: 'displacement',
    label: 'Displacement',
    definition: 'A forceful move with range expansion and participation that proves one side is aggressively taking ground.',
    operationalUse: 'Use it to validate fair-value gaps, continuation quality, and true structure breaks.',
    whenItMatters: 'After a zone touch, reclaim, or sweep when the desk needs proof.',
    whenItDoesNot: 'When the candle only looks large but lacks follow-through or participation.',
  },
  {
    key: 'premium-discount',
    label: 'Premium And Discount',
    definition: 'Value location inside the dealing range, where longs want discount access and shorts want premium access.',
    operationalUse: 'Use it to improve entry precision, never as a standalone signal.',
    whenItMatters: 'During correction and continuation phases.',
    whenItDoesNot: 'When the active range itself is invalid or price is already in free expansion.',
  },
  {
    key: 'main-fib',
    label: 'Main Fib',
    definition: 'The higher-timeframe retracement map drawn from the major dealing range that sets the broad premium/discount location.',
    operationalUse: 'Use it to define the structure-first broad area before looking for any lower-timeframe precision.',
    whenItMatters: 'When major structure is clear and the desk is waiting for the next correction zone.',
    whenItDoesNot: 'When the major range itself is invalid, unclear, or already transitioning.',
  },
  {
    key: 'minor-fib',
    label: 'Minor Fib',
    definition: 'The internal retracement map drawn from the active lower-timeframe leg to refine entry location inside the broad structure area.',
    operationalUse: 'Use it to refine the execution layer inside the main fib zone, not to override the major map.',
    whenItMatters: 'When price has already reached the broad area and the desk wants a more exact execution pocket.',
    whenItDoesNot: 'When it conflicts with major structure or is being used as a standalone trigger.',
  },
  {
    key: 'orderflow-confirmation',
    label: 'Orderflow Confirmation',
    definition: 'Participation proof that price is actually responding inside the important structure area through imbalance, absorption, delta, or clear reaction.',
    operationalUse: 'Use it as the third layer after structure and price location: confirm the reaction before entry, not before the zone exists.',
    whenItMatters: 'At the execution layer inside a valid structure zone.',
    whenItDoesNot: 'When it is being used to force a trade against higher-timeframe structure or macro context.',
  },
  {
    key: 'regime-transition',
    label: 'Regime Transition',
    definition: 'A state where the prior macro or structural regime is losing coherence and the next one is not fully accepted yet.',
    operationalUse: 'Reduce conviction, size, and pyramiding when the desk is in transition.',
    whenItMatters: 'Around central-bank repricing, volatility shocks, and failed follow-through.',
    whenItDoesNot: 'After the new regime has already re-established clean acceptance and continuation.',
  },
];

export const macroOntology: DoctrineTerm[] = [
  {
    key: 'macro-pressure',
    label: 'Macro Pressure',
    definition: 'The directional push coming from rates, yields, dollar liquidity, policy divergence, volatility, and cross-asset stress.',
    operationalUse: 'Use it to judge whether the chart is swimming with or against the larger engine.',
    whenItMatters: 'Before trusting continuation on GOLD, US30, and major FX.',
    whenItDoesNot: 'When used alone as a substitute for price location and confirmation.',
  },
  {
    key: 'macro-context',
    label: 'Macro Context',
    definition: 'The narrative frame that explains why the market should care now: policy path, data surprise, risk regime, or positioning unwind.',
    operationalUse: 'Use it to explain why a move matters, not just that it exists.',
    whenItMatters: 'When deciding which signals deserve weight and which are noise.',
    whenItDoesNot: 'When it becomes a story that ignores actual participation and structure.',
  },
  {
    key: 'reflexivity',
    label: 'Reflexivity',
    definition: 'A self-reinforcing state where price, narrative, and positioning begin amplifying each other.',
    operationalUse: 'Use it to label the move as self-reinforcing, fragile, or exhaustion watch and to control pyramiding discipline.',
    whenItMatters: 'During strong trend days, squeezes, and policy repricing.',
    whenItDoesNot: 'As an excuse to add to losers or ignore event risk.',
  },
];

export const forexMechanics: DoctrineTerm[] = [
  {
    key: 'base-vs-quote',
    label: 'Base Versus Quote Mechanics',
    definition: 'FX expresses the value of the base currency in terms of the quote currency, so the driver question is always which side is strengthening faster.',
    operationalUse: 'Frame FX bias as base strength versus quote strength rather than generic pair direction.',
    whenItMatters: 'On every FX market read.',
    whenItDoesNot: 'Only when the question is about pure notation rather than trading logic.',
  },
  {
    key: 'rates-differentials',
    label: 'Rates Differentials',
    definition: 'The policy-rate and yield-gap relationship between the two currencies that shapes carry incentive and repricing pressure.',
    operationalUse: 'Use the BOE/ECB/BOJ/Fed scoreboard as a directional reality check before trusting continuation.',
    whenItMatters: 'Most on GBPUSD, EURUSD, USDJPY, and GBPJPY.',
    whenItDoesNot: 'Less during one-off shock events where intervention or extreme risk aversion temporarily dominates.',
  },
  {
    key: 'cross-construction',
    label: 'Cross Construction',
    definition: 'A cross inherits part of its behavior from the component majors, so GBPJPY should be read through both GBP drivers and USDJPY-style yen mechanics.',
    operationalUse: 'Treat crosses as layered trades instead of single-driver instruments.',
    whenItMatters: 'On GBPJPY and other macro crosses.',
    whenItDoesNot: 'When one leg is overwhelmingly dominant in the current session.',
  },
  {
    key: 'sessions-and-liquidity',
    label: 'Sessions And Liquidity',
    definition: 'FX behavior changes by London, New York, Asia, and overlap sessions because participation is not evenly distributed.',
    operationalUse: 'Use session timing to judge whether sweeps and breakouts are trustworthy.',
    whenItMatters: 'For intraday timing, especially around London and NY opens.',
    whenItDoesNot: 'For broad higher-timeframe bias calls that are not timing exact entries.',
  },
  {
    key: 'yen-mechanics',
    label: 'Yen Mechanics',
    definition: 'JPY pairs are especially sensitive to yield spreads, carry unwind, intervention risk, and global risk aversion.',
    operationalUse: 'Treat USDJPY and GBPJPY as fast macro instruments where rates and risk can overpower neat chart structure.',
    whenItMatters: 'Any time USDJPY or GBPJPY is on the desk.',
    whenItDoesNot: 'Never fully stops mattering; it only loses relative weight when macro is quiet.',
  },
];

export const modelSelection: TradingModelPlaybook[] = [
  {
    key: 'linear-regression',
    label: 'Linear Regression',
    job: 'Measure driver contribution and small pricing inefficiencies.',
    whenItMatters: 'When the relationship is approximately linear and the desk needs a clean baseline for driver ranking or fair-value stretch.',
    whenItDoesNot: 'During unstable regime shifts or highly nonlinear squeeze conditions.',
    limitations: ['Misses nonlinear turning points.', 'Assumes the relationship is still structurally valid.'],
  },
  {
    key: 'arima',
    label: 'ARIMA',
    job: 'Model short-memory time-series structure and baseline drift.',
    whenItMatters: 'As a baseline forecaster for stationary or transformed short-horizon series.',
    whenItDoesNot: 'On explosive trend days or structural breaks.',
    limitations: ['Weakens quickly in regime change.', 'More useful as a benchmark than a full trading engine.'],
  },
  {
    key: 'garch',
    label: 'GARCH',
    job: 'Estimate volatility clustering and risk expansion probability.',
    whenItMatters: 'For stop-width, risk envelope, and whether continuation has enough stability to size up.',
    whenItDoesNot: 'As a direction model.',
    limitations: ['Measures variance, not direction.', 'Can lag sudden regime breaks.'],
  },
  {
    key: 'kalman-filter',
    label: 'Kalman Filter',
    job: 'Estimate a hidden state from noisy observations and update it recursively.',
    whenItMatters: 'When the feed is noisy and Vaultum needs a live state estimate instead of a static average.',
    whenItDoesNot: 'When the assumed state model is wrong or the market is in a hard structural break.',
    limitations: ['Calibration matters a lot.', 'Will not rescue bad structural framing.'],
  },
  {
    key: 'regime-switching',
    label: 'Regime Switching / Hidden Markov',
    job: 'Separate the market into latent states so model logic changes with conditions.',
    whenItMatters: 'When the same rules stop working across all sessions and Vaultum needs to know if it is in trend, range, or transition.',
    whenItDoesNot: 'When the state boundaries are too noisy or sample size is too short.',
    limitations: ['Poor state design creates false confidence.', 'Can wobble around event shocks.'],
  },
  {
    key: 'monte-carlo',
    label: 'Monte Carlo',
    job: 'Simulate many possible paths to judge distribution rather than point certainty.',
    whenItMatters: 'When the question is about path risk, target-first odds, or invalidation-first odds.',
    whenItDoesNot: 'As certainty language or as a replacement for structure.',
    limitations: ['Bad assumptions create precise-looking nonsense.', 'Scenario quality depends on input realism.'],
  },
  {
    key: 'neural-networks',
    label: 'Neural Networks',
    job: 'Capture nonlinear interactions when enough representative data exists.',
    whenItMatters: 'When the signal is nonlinear, the feature set is rich, and validation discipline is strong.',
    whenItDoesNot: 'When data is sparse, regime drift is fast, or explainability is critical.',
    limitations: ['Easy to overfit.', 'Interpretability is weak.'],
  },
  {
    key: 'reflexivity',
    label: 'Reflexivity Model',
    job: 'Judge whether price, narrative, and positioning are self-reinforcing or fragile.',
    whenItMatters: 'During strong trends, squeezes, and policy repricing.',
    whenItDoesNot: 'As a loophole to add to losers or ignore invalidation.',
    limitations: ['Harder to calibrate exactly.', 'Can over-encourage conviction if discipline is weak.'],
  },
  {
    key: 'macro-cycle-hybrid',
    label: 'Macro-Cycle Hybrid',
    job: 'Blend macro fundamentals, technical state detection, and nonlinear classification to forecast broader supportive or hostile cycles.',
    whenItMatters: 'For FX and macro-sensitive markets when the desk needs cycle awareness beyond the next candle.',
    whenItDoesNot: 'For micromanaging 1m noise without local confirmation.',
    limitations: ['Stronger for cycle selection than exact entry price.', 'Government intervention can degrade timing quality.'],
  },
  {
    key: 'quantamental-panel',
    label: 'Quantamental Panel',
    job: 'Convert multi-country macro data into normalized signal panels that can be ranked and combined.',
    whenItMatters: 'When Vaultum needs consistent macro backdrop scoring across currencies and macro-sensitive markets.',
    whenItDoesNot: 'As the final trigger layer for exact intraday execution.',
    limitations: ['Data lag matters.', 'Normalization can hide context if used blindly.'],
  },
];

export const marketPlaybooks: MarketPlaybook[] = [
  {
    market: 'XAUUSD',
    role: 'primary',
    summary: 'Gold is a rates, dollar, stress, and positioning instrument first; continuation from discount is preferred once real-yield and dollar pressure stop fighting the thesis.',
    macroPressure: ['US real yields', 'DXY and liquidity stress', 'safe-haven demand', 'futures-backed volume quality'],
    structureFocus: ['Respect 4H dealing range first.', 'Let major structure define the zone before orderflow refines it.', 'Treat sweeps seriously only after reclaim or failure.'],
    precisionRules: ['Prefer discount taps for longs and premium reactions for shorts.', 'Use COMEX-linked volume first.', 'Pyramiding is winner-only.'],
    preferredModels: ['garch', 'kalman-filter', 'monte-carlo', 'reflexivity'],
    preferredVolumeAnchor: 'COMEX:GC1!',
  },
  {
    market: 'US30',
    role: 'primary',
    summary: 'US30 is a risk appetite, yields, and volatility instrument; continuation is best when the equity tape, yields, and macro stress stop fighting each other.',
    macroPressure: ['US yields', 'risk appetite', 'volatility regime', 'dealer posture'],
    structureFocus: ['Use major structure to classify trend versus failed auction.', 'Let the broad structure area come first and the internal execution layer come second.', 'Prefer displacement with acceptance over drifting breakouts.'],
    precisionRules: ['Do not chase impulse when VIX/yields are hostile.', 'Prefer correction into defended intraday value.', 'Keep size smaller in transition.'],
    preferredModels: ['garch', 'regime-switching', 'kalman-filter', 'monte-carlo'],
    preferredVolumeAnchor: 'CBOT_MINI:YM1!',
  },
  {
    market: 'GBPUSD',
    role: 'secondary',
    summary: 'GBPUSD is a BOE-vs-Fed and DXY expression; continuation is best when the rates board and dollar leg are aligned.',
    macroPressure: ['BOE versus Fed path', 'UK-US yield spread', 'DXY', 'UK and US data surprise asymmetry'],
    structureFocus: ['Use the rates board as a directional gate.', 'Respect London and NY session timing.', 'Cable can reverse hard when stretched versus the spread.'],
    precisionRules: ['Prefer discount longs only when the rates board is supportive.', 'Treat premium longs with extra caution when BOE-Fed logic is fading.'],
    preferredModels: ['macro-cycle-hybrid', 'regime-switching', 'garch', 'quantamental-panel'],
    preferredVolumeAnchor: 'FX:GBPUSD',
  },
  {
    market: 'EURUSD',
    role: 'secondary',
    summary: 'EURUSD should be read through ECB-vs-Fed spread logic, DXY, and growth/inflation repricing before trusting continuation.',
    macroPressure: ['ECB versus Fed path', 'euro-area versus US data surprise', 'DXY', 'cross-asset risk sentiment'],
    structureFocus: ['Use the active dealing range and rates alignment together.', 'Watch for false breaks around session extremes.', 'Premium/discount is only location.'],
    precisionRules: ['Prefer continuation when spot is aligned with the spread and not overstretched.', 'Do not overrate a minor structure flip if macro remains mixed.'],
    preferredModels: ['macro-cycle-hybrid', 'regime-switching', 'garch', 'quantamental-panel'],
    preferredVolumeAnchor: 'FX:EURUSD',
  },
  {
    market: 'USDJPY',
    role: 'secondary',
    summary: 'USDJPY is a yield-spread and risk-tone instrument with intervention risk, so treat it as a fast macro market rather than a casual chart pair.',
    macroPressure: ['Fed versus BOJ spread', 'Treasury-yield impulse', 'carry versus unwind pressure', 'intervention risk'],
    structureFocus: ['Respect rate-spread alignment first.', 'Sweeps can be violent but reversible.', 'Continuation is higher quality when yields and risk tone agree.'],
    precisionRules: ['Do not press when intervention risk is elevated.', 'Require cleaner confirmation than usual because USDJPY can gap through neat levels.'],
    preferredModels: ['macro-cycle-hybrid', 'regime-switching', 'garch', 'reflexivity'],
    preferredVolumeAnchor: 'FX:USDJPY',
  },
  {
    market: 'GBPJPY',
    role: 'secondary',
    summary: 'GBPJPY is a high-beta cross that fuses BOE-vs-BOJ spread logic with global risk tone, so it needs both cross construction and yen mechanics.',
    macroPressure: ['BOE versus BOJ spread', 'risk sentiment', 'component-pair alignment', 'intervention and volatility shock risk'],
    structureFocus: ['Treat GBPJPY as a cross built from two moving macro legs.', 'Use stronger filters than on slower pairs.', 'Continuation is highest quality when both legs contribute.'],
    precisionRules: ['Demand stronger confirmation and cleaner invalidation.', 'Use smaller test size because the pair is naturally faster.', 'Only pyramid when both legs remain supportive.'],
    preferredModels: ['macro-cycle-hybrid', 'regime-switching', 'garch', 'reflexivity'],
    preferredVolumeAnchor: 'FX:GBPJPY',
  },
];

export const sourceLedger: DoctrineSource[] = [
  { document: 'README.md', topic: 'macro trading philosophy and reflexive operating doctrine', extractionQuality: 'full', fit: 'core' },
  { document: 'README2.md', topic: 'quantamental panel workflow', extractionQuality: 'full', fit: 'core' },
  { document: '0901.4447v1.pdf', topic: 'mathematical analysis of Soros reflexivity', extractionQuality: 'full', fit: 'core' },
  { document: '3--Introduction_to_Linear_Regression_Analysis__5th_ed._Douglas_C._Montgomery__Elizabeth_A._Peck__and_G._.pdf', topic: 'linear regression foundations', extractionQuality: 'partial', fit: 'supporting' },
  { document: '9.10.pdf', topic: 'non-trading accounting document', extractionQuality: 'metadata-only', fit: 'excluded' },
  { document: 'A_Markov_Regime-Switching_Model_with_Time-Varying_.pdf', topic: 'regime-switching model', extractionQuality: 'metadata-only', fit: 'supporting' },
  { document: 'Babypips Forex ( PDFDrive ).pdf', topic: 'forex mechanics primer', extractionQuality: 'partial', fit: 'supporting' },
  { document: 'FULLTEXT01.pdf', topic: 'unresolved research PDF', extractionQuality: 'metadata-only', fit: 'limited' },
  { document: 'george-soros-general-theory-of-reflexivity-transcript.pdf', topic: 'reflexivity lecture transcript', extractionQuality: 'full', fit: 'supporting' },
  { document: 'Kalman_Filter_Estimation_and_Its_Implementation.pdf', topic: 'Kalman filter estimation', extractionQuality: 'full', fit: 'core' },
  { document: 'Macrosynergy-Macro-Quantimental-Investment-Handbook.pdf', topic: 'macro-quantimental investment handbook', extractionQuality: 'partial', fit: 'supporting' },
  { document: 'Market Structure And Powerful Setups [By Wade Fx Setups](1).pdf', topic: 'practical market-structure setups', extractionQuality: 'partial', fit: 'supporting' },
  { document: 'Market Structure Guidelines.pptx (1).pdf', topic: 'market structure guidelines', extractionQuality: 'partial', fit: 'supporting' },
  { document: 'ModellingandEstimatingofVolatilityusingARCHGARCHmodelsinJordansStockMarket.pdf', topic: 'ARCH/GARCH volatility modeling', extractionQuality: 'partial', fit: 'supporting' },
  { document: 'ReflexivityinFinancialMarketsATheoreticalFrameworkExtendingtheBlackScholesModel.pdf', topic: 'reflexivity and option pricing', extractionQuality: 'full', fit: 'core' },
  { document: 'Study_of_the_ARIMA_Model_in_Financial_Time_Series_.pdf', topic: 'ARIMA time-series modeling', extractionQuality: 'partial', fit: 'supporting' },
  { document: 'Trading_Macro-Cycles_of_Foreign_Exchange_Markets_U.pdf', topic: 'hybrid macro-cycle FX forecasting', extractionQuality: 'full', fit: 'core' },
];

export function normalizeTradingDoctrineMarket(input?: string): string {
  const market = String(input || 'XAUUSD').toUpperCase().trim();
  if (market === 'XAU' || market === 'GOLD') return 'XAUUSD';
  return market || 'XAUUSD';
}

export function findTradingDoctrineFocusMarket(market: string): MarketPlaybook {
  return marketPlaybooks.find((item) => item.market === market) ?? marketPlaybooks[0];
}

export function pickTradingDoctrineRecommendedModels(market: string, question: string): TradingModelPlaybook[] {
  const q = question.toLowerCase();
  const requested = new Set<TradingModelKey>();
  const matches: Array<[RegExp, TradingModelKey]> = [
    [/(volatility|vol|atr|variance|garch|arch)/, 'garch'],
    [/(regime|transition|hidden markov|markov|bull bear)/, 'regime-switching'],
    [/(kalman|noise|hidden state|filter|smooth)/, 'kalman-filter'],
    [/(arima|lag|autocorrelation)/, 'arima'],
    [/(monte|scenario|distribution|probability|odds)/, 'monte-carlo'],
    [/(neural|ann|nonlinear|ml prediction)/, 'neural-networks'],
    [/(regression|linear|fair value|mispricing|residual)/, 'linear-regression'],
    [/(reflexiv|pyramid|self-reinforcing|boom|bust)/, 'reflexivity'],
    [/(macro cycle|hybrid|carry|policy gap|forex)/, 'macro-cycle-hybrid'],
    [/(panel|quantamental|cross-country|macro factors)/, 'quantamental-panel'],
  ];

  matches.forEach(([pattern, key]) => {
    if (pattern.test(q)) requested.add(key);
  });

  findTradingDoctrineFocusMarket(market).preferredModels.forEach((key) => {
    if (requested.size < 4) requested.add(key);
  });

  return modelSelection.filter((item) => requested.has(item.key)).slice(0, 4);
}

export async function getTradingDoctrine(input: {
  market?: string;
  question?: string;
}): Promise<TradingDoctrineResponse> {
  const market = normalizeTradingDoctrineMarket(input.market);
  const question = String(input.question || '').trim();

  return getCachedOrCompute(cacheKey('system', `trading-doctrine:${market}:${question || 'default'}`), async () => {
    const focusMarket = findTradingDoctrineFocusMarket(market);

    return {
      generatedAt: new Date().toISOString(),
      summary: 'Vaultum trading doctrine is anchored to manual execution outside the app, with primary focus on XAUUSD and US30. It uses an operational structure lexicon, macro/rates-first FX mechanics, reflexivity-aware pyramiding discipline, and model selection that maps GARCH to volatility, regime-switching to transition detection, Kalman to noisy state extraction, Monte Carlo to scenario odds, and macro-cycle hybrids to FX cycle support.',
      operatorProfile: {
        executionMode: 'analysis-only terminal; no broker execution inside Vaultum',
        primaryMarkets: ['XAUUSD', 'US30'],
        secondaryMarkets: ['GBPUSD', 'EURUSD', 'USDJPY', 'GBPJPY'],
        workflow: ['regime', 'major structure', 'minor structure', 'execution phase', 'trigger', 'risk', 'review'],
      },
      focusMarket,
      languageRules: [
        'Use major structure for directional privilege and minor structure for timing; do not collapse the two.',
        'Use continuation, reversal, liquidity sweep, and displacement as operational states, not vague buzzwords.',
        'Treat premium and discount as value location only, never as standalone entry reasons.',
        'Separate macro pressure from macro context: pressure is directional force, context is the narrative frame.',
        'For FX, frame the read as base versus quote strength and check the rates board before trusting continuation.',
        'Pyramiding means test -> confirm -> press winners only; never add below invalidation.',
        'When a source was only partially extracted, keep its use at the category level instead of claiming fine-detail authority.',
      ],
      marketStructureOntology,
      macroOntology,
      forexMechanics,
      modelSelection,
      recommendedModels: pickTradingDoctrineRecommendedModels(market, question),
      marketPlaybooks,
      sourceLedger,
      trustRules: [
        'Every source stays tagged as full, partial, metadata-only, or excluded.',
        'Metadata-only documents can justify why a model class belongs in the playbook, but not detailed formula claims.',
        'For GOLD and US30, prefer futures-backed volume anchors first and label weaker sources honestly.',
        'For FX, treat spot volume as broker/proxy context and lean more on rates, macro pressure, and session mechanics.',
      ],
      blindspots: [
        'The new OCR pipeline recovers key image-heavy structure and forex PDFs, but deeper page-by-page chart nuance still benefits from targeted re-runs and manual review for one-to-one fidelity.',
        'Macro-cycle and quantamental material is strongest for regime and backdrop; it does not remove the need for intraday structure and timing.',
        'Statistical model choice only helps when the input data is clean and the regime has not structurally shifted.',
        'High-conviction operator style increases the penalty for confusing a good narrative with a good entry price.',
        'Reflexivity can justify pressing a working trade, but it can also hide late-stage fragility if event risk and invalidation discipline are ignored.',
      ],
    };
  }, 300);
}
