import {
  findTradingDoctrineFocusMarket,
  forexMechanics,
  macroOntology,
  marketPlaybooks,
  marketStructureOntology,
  modelSelection,
  normalizeTradingDoctrineMarket,
  sourceLedger,
  type DocumentFit,
  type DoctrineTerm,
  type ExtractionQuality,
  type TradingModelKey,
  type TradingModelPlaybook,
} from './get-trading-doctrine';

export type KnowledgeConcept = {
  key: string;
  label: string;
  group: 'structure' | 'macro' | 'fx' | 'execution' | 'quant';
  definition: string;
  operationalDefinition: string;
  detectionLogic: string;
  requiredInputs: string[];
  whenItMatters: string;
  whenItDoesNot: string;
  failureCases: string[];
  confidenceLogic: string;
  relatedConcepts: string[];
  markets: string[];
  sourceDocuments: string[];
  evidenceLevel: 'high' | 'medium' | 'low';
};

export type KnowledgeDocument = {
  document: string;
  topic: string;
  extractionQuality: ExtractionQuality;
  fit: DocumentFit;
  evidenceLevel: 'high' | 'medium' | 'low';
  coreIdeas: string[];
  definitions: string[];
  methods: string[];
  examples: string[];
  visuals: string[];
  limitations: string[];
  operationalUse: string[];
};

export type AgentRulebook = {
  key: 'structure' | 'macro' | 'quant' | 'execution';
  label: string;
  mission: string;
  focusAreas: string[];
  requiredInputs: string[];
  decisionRules: string[];
  avoidRules: string[];
  handoffRules: string[];
  preferredTools: string[];
};

export type KnowledgeMatch = {
  key: string;
  label: string;
  score: number;
  reason: string;
};

export type ModelSelectionDecision = {
  regimeClass: 'trend' | 'mean-reversion' | 'unstable-noise';
  selectedModels: TradingModelPlaybook[];
  avoidPrediction: boolean;
  reactiveMode: boolean;
  confidence: 'low' | 'medium' | 'high';
  reason: string;
  tradeStyle: string;
};

export type KnowledgeCoverageItem = {
  key: string;
  label: string;
  group: KnowledgeConcept['group'];
  definitionReady: boolean;
  detectionReady: boolean;
  contextReady: boolean;
  failureReady: boolean;
  evidenceLevel: KnowledgeConcept['evidenceLevel'];
  status: 'strong' | 'building' | 'thin';
};

function flattenText(parts: Array<string | string[] | undefined>): string {
  return parts
    .flatMap((part) => (Array.isArray(part) ? part : [part ?? '']))
    .join(' ')
    .toLowerCase();
}

function tokenize(value: string): string[] {
  return [...new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  )];
}

function scoreText(tokens: string[], haystack: string): number {
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function termToConcept(term: DoctrineTerm, group: KnowledgeConcept['group'], markets: string[], sources: string[], evidenceLevel: KnowledgeConcept['evidenceLevel']): KnowledgeConcept {
  return {
    key: term.key,
    label: term.label,
    group,
    definition: term.definition,
    operationalDefinition: term.operationalUse,
    detectionLogic: `Operationally detect ${term.label.toLowerCase()} from the market state that matches its definition, then confirm it with the relevant context filter rather than a single candle.`,
    requiredInputs: group === 'macro'
      ? ['macro signals', 'rates or yield context', 'cross-asset stress', 'event-risk map']
      : group === 'fx'
        ? ['pair direction', 'rates differentials', 'session timing', 'dollar or risk context']
        : ['higher-timeframe candles', 'lower-timeframe candles', 'volume or participation proxy', 'trigger context'],
    whenItMatters: term.whenItMatters,
    whenItDoesNot: term.whenItDoesNot,
    failureCases: [
      `Confusing a label for ${term.label.toLowerCase()} with proof that the market has accepted the move.`,
      'Using the concept in isolation when the broader regime, macro pressure, or event risk is hostile.',
    ],
    confidenceLogic: `Confidence rises when ${term.label.toLowerCase()} is aligned with the active market playbook, the right timeframe, and at least one participation or macro filter.`,
    relatedConcepts: [],
    markets,
    sourceDocuments: sources,
    evidenceLevel,
  };
}

export const knowledgeDocuments: KnowledgeDocument[] = [
  {
    document: 'README.md',
    topic: 'macro trader doctrine and reflexive execution',
    extractionQuality: 'full',
    fit: 'core',
    evidenceLevel: 'high',
    coreIdeas: [
      'Macro trading is driven by liquidity, policy, and asymmetric narratives rather than isolated chart patterns.',
      'Reflexive trades should begin as hypotheses, then be pressed only when the market validates them.',
      'Concentration and ruthless loss-cutting matter more than broad diversification for a thesis-driven operator.',
    ],
    definitions: ['reflexivity', 'boom-bust sequence', 'test position', 'winner-only pyramiding'],
    methods: ['identify prevailing bias', 'find the flaw in the narrative', 'ride the reflexive phase', 'reverse only when reality breaks the loop'],
    examples: ['Soros shorting GBP after the ERM premise became unsustainable'],
    visuals: ['narrative feedback loop', 'boom-bust lifecycle'],
    limitations: ['philosophical and tactical, not a precise chart-detection manual'],
    operationalUse: ['reflexivity gating', 'pyramiding discipline', 'macro narrative validation'],
  },
  {
    document: 'README2.md',
    topic: 'quantamental macro workflow',
    extractionQuality: 'full',
    fit: 'core',
    evidenceLevel: 'high',
    coreIdeas: [
      'Macro data should be converted into point-in-time comparable factors before signal building.',
      'Panel normalization, relative value transforms, and sequential model selection matter more than raw indicator levels.',
      'Signal quality should be judged through predictive power and stylized PnL, not only intuition.',
    ],
    definitions: ['quantamental indicator', 'panel normalization', 'linear composite', 'signal-return relation'],
    methods: ['download macro panels', 'normalize or relativize them', 'combine into signals', 'evaluate predictive quality'],
    examples: ['inflation and growth panels normalized into composite macro signals'],
    visuals: ['four-step workflow', 'signal validation charts'],
    limitations: ['higher-level workflow note, not a trading-rule specification for exact entries'],
    operationalUse: ['macro scoring', 'cross-country factor normalization', 'research workflow design'],
  },
  {
    document: '0901.4447v1.pdf',
    topic: 'mathematical analysis of Soros reflexivity',
    extractionQuality: 'full',
    fit: 'core',
    evidenceLevel: 'high',
    coreIdeas: [
      'Reflexive systems can be studied as coupled feedback functions with fixed points and instability.',
      'Boom-bust behavior emerges when feedback drives the system away from stable equilibria.',
      'The key lens is not perfect prediction but recognizing when feedback becomes self-reinforcing or unstable.',
    ],
    definitions: ['cognitive function', 'manipulative function', 'fixed point', 'boom-then-bust'],
    methods: ['discrete dynamical systems framing', 'fixed-point analysis', 'feedback interpretation'],
    examples: ['boom-bust emergence when feedback loops dominate equilibrium behavior'],
    visuals: ['feedback loop diagrams', 'fixed-point stability framing'],
    limitations: ['mathematical framing is conceptual; it does not directly output intraday trigger rules'],
    operationalUse: ['reflexivity state labels', 'fragility detection', 'late-trend caution'],
  },
  {
    document: '3--Introduction_to_Linear_Regression_Analysis__5th_ed._Douglas_C._Montgomery__Elizabeth_A._Peck__and_G._.pdf',
    topic: 'linear regression foundations',
    extractionQuality: 'partial',
    fit: 'supporting',
    evidenceLevel: 'high',
    coreIdeas: [
      'Regression is a baseline model-building tool, not proof of causality.',
      'Residual analysis, prediction intervals, and assumption checks are central to trustworthy inference.',
      'Multicollinearity and extrapolation can destroy apparent model quality.',
    ],
    definitions: ['least squares', 'residual', 'prediction interval', 'multicollinearity'],
    methods: ['fit baseline relation', 'validate with residuals', 'check assumption stability', 'avoid extrapolation abuse'],
    examples: ['prediction intervals and model adequacy checks around fitted lines'],
    visuals: ['scatterplots with fitted lines', 'residual plots', 'interval bands'],
    limitations: ['linear baseline only; misses nonlinear or state-dependent dynamics'],
    operationalUse: ['fair-value stretch checks', 'driver ranking', 'inefficiency baselines'],
  },
  {
    document: '9.10.pdf',
    topic: 'unresolved non-trading document',
    extractionQuality: 'metadata-only',
    fit: 'excluded',
    evidenceLevel: 'low',
    coreIdeas: ['No reliable trading content was recoverable from this file in the current extraction pass.'],
    definitions: [],
    methods: [],
    examples: [],
    visuals: ['PDF metadata only'],
    limitations: ['Excluded from operational knowledge because the text was not meaningfully recoverable.'],
    operationalUse: ['none'],
  },
  {
    document: 'A_Markov_Regime-Switching_Model_with_Time-Varying_.pdf',
    topic: 'regime-switching model with time-varying structure',
    extractionQuality: 'metadata-only',
    fit: 'supporting',
    evidenceLevel: 'low',
    coreIdeas: ['The title confirms a regime-switching research source, but the body text was not machine-recoverable in this pass.'],
    definitions: ['regime switching inferred from title only'],
    methods: ['time-varying Markov regime idea inferred from title only'],
    examples: [],
    visuals: ['metadata-only extraction'],
    limitations: ['Use only as category support for regime-switching models, not for precise formula claims.'],
    operationalUse: ['reinforces the need for latent-state routing rather than one-model-fits-all logic'],
  },
  {
    document: 'Babypips Forex ( PDFDrive ).pdf',
    topic: 'forex primer and market mechanics',
    extractionQuality: 'partial',
    fit: 'supporting',
    evidenceLevel: 'medium',
    coreIdeas: [
      'Forex trading is first explained as the exchange of one currency for another, which keeps pair mechanics grounded in relative value instead of isolated price lines.',
      'The primer frames successful trading as make pips, keep pips, repeat, which fits Vaultum\'s emphasis on discipline and post-analysis execution quality.',
      'Early pages focus on opportunity recognition, timing, profit-taking, and simple exchange-rate intuition before moving into deeper strategy work.',
    ],
    definitions: ['forex market', 'exchange rate', 'currency conversion', 'base-versus-quote intuition'],
    methods: ['learn how one currency is exchanged for another', 'identify trading opportunities', 'time the market', 'take profits or close the trade intentionally'],
    examples: ['airport USD-to-JPY exchange example used to explain how changing exchange rates create gain or loss'],
    visuals: ['book-style primer / curriculum format'],
    limitations: ['OCR recovery is partial and early-page heavy, so use it for operational forex basics rather than exact formula or chapter-by-chapter claims.'],
    operationalUse: ['operator onboarding for forex basics', 'base-versus-quote intuition', 'manual desk education for pair mechanics'],
  },
  {
    document: 'FULLTEXT01.pdf',
    topic: 'unresolved research article',
    extractionQuality: 'metadata-only',
    fit: 'limited',
    evidenceLevel: 'low',
    coreIdeas: ['The file could not be resolved into reliable trading text during this pass.'],
    definitions: [],
    methods: [],
    examples: [],
    visuals: ['title-page metadata only'],
    limitations: ['Excluded from exact rule-making because the extraction quality was too poor.'],
    operationalUse: ['none beyond metadata logging'],
  },
  {
    document: 'george-soros-general-theory-of-reflexivity-transcript.pdf',
    topic: 'reflexivity transcript',
    extractionQuality: 'full',
    fit: 'supporting',
    evidenceLevel: 'medium',
    coreIdeas: [
      'Markets are shaped by participant bias and fallibility rather than equilibrium perfection.',
      'Narratives and actions feed back into fundamentals and price behavior.',
    ],
    definitions: ['participant bias', 'fallibility', 'reflexive market feedback'],
    methods: ['observe prevailing narrative', 'monitor when action starts altering the underlying reality'],
    examples: ['reflexive boom-bust discussions in Soros framing'],
    visuals: ['transcript / lecture framing'],
    limitations: ['transcript extraction is noisy and less precise than a formal paper'],
    operationalUse: ['language calibration for reflexivity and bias-awareness'],
  },
  {
    document: 'Kalman_Filter_Estimation_and_Its_Implementation.pdf',
    topic: 'Kalman filter state estimation',
    extractionQuality: 'full',
    fit: 'core',
    evidenceLevel: 'high',
    coreIdeas: [
      'Kalman filtering recursively estimates hidden state by combining prior prediction with noisy measurement.',
      'Process noise and measurement noise must be modeled separately.',
      'The value of Kalman logic is live state estimation and smoothing, not clairvoyance.',
    ],
    definitions: ['state-space model', 'process noise', 'measurement noise', 'Kalman gain', 'Riccati equation'],
    methods: ['predict', 'update with measurement', 'tune Q/R noise assumptions', 'monitor convergence'],
    examples: ['temperature estimation and prediction with noisy sensors'],
    visuals: ['state-update equations', 'filtered versus raw signal traces'],
    limitations: ['Depends heavily on the assumed state model and noise calibration'],
    operationalUse: ['noise filtering', 'state smoothing', 'regime estimate stabilization'],
  },
  {
    document: 'Macrosynergy-Macro-Quantimental-Investment-Handbook.pdf',
    topic: 'macro-quantamental panel design',
    extractionQuality: 'partial',
    fit: 'supporting',
    evidenceLevel: 'medium',
    coreIdeas: [
      'Point-in-time macro information states are more useful than stale macro anecdotes.',
      'Macro trends can enhance trend-following when they are normalized and compared consistently across sections.',
      'Quantamental indicators describe the state of an economy or market in a form that can be tested and ranked.',
    ],
    definitions: ['macro trend', 'quantamental indicator', 'point-in-time information state'],
    methods: ['candidate indicator selection', 'panel normalization', 'state construction', 'backtest against traded returns'],
    examples: ['macro trend following and macro-enhanced cross-market signal design'],
    visuals: ['handbook sections and indicator workflows'],
    limitations: ['best for regime and signal panels, not precise 5m entry timing'],
    operationalUse: ['macro backdrop scoring', 'cross-country factor panels', 'research hygiene'],
  },
  {
    document: 'Market Structure And Powerful Setups [By Wade Fx Setups](1).pdf',
    topic: 'practical market-structure setups',
    extractionQuality: 'partial',
    fit: 'supporting',
    evidenceLevel: 'medium',
    coreIdeas: [
      'The manual organizes execution around structure, liquidity, sessions, order blocks, and setup confluence rather than one-off indicator signals.',
      'Its contents explicitly connect BSL, SSL, stop hunts, market-structure breaks, order blocks, and session behavior to practical setup families.',
      'HTF analysis with LTF entries is treated as the glue between idea quality and actual execution timing.',
    ],
    definitions: ['buy-side liquidity (BSL)', 'sell-side liquidity (SSL)', 'failure swing (SMS)', 'break in market structure', 'order block'],
    methods: ['start with expansion and retracement basics', 'map liquidity and sessions', 'use HTF analysis with LTF entries', 'stack confluence before choosing a setup family'],
    examples: ['table-of-contents evidence for Turtle Soup, SH + BMS + RTO, SMS + BMS + RTO, A.M.D, and marked-up chart workflows'],
    visuals: ['setup manual / contents page with structure, liquidity, session, and setup chapters'],
    limitations: ['Current OCR evidence is strongest on the front matter and contents pages; deeper chart-page extraction should still be regenerated for richer setup detail.'],
    operationalUse: ['setup taxonomy for structure-first execution', 'session and liquidity checklist design', 'HTF-to-LTF confluence mapping'],
  },
  {
    document: 'Market Structure Guidelines.pptx (1).pdf',
    topic: 'market structure checklist and trend-state simplification',
    extractionQuality: 'partial',
    fit: 'supporting',
    evidenceLevel: 'medium',
    coreIdeas: [
      'Do not overcomplicate structure: first classify the market as up, down, or sideways.',
      'Trend identification and cycle awareness should precede tactical setup selection.',
      'Consolidation is a separate state, not failed trend logic.',
    ],
    definitions: ['trending', 'consolidating', 'cycles'],
    methods: ['morning first question: up, down, or sideways', 'separate trend from range before trading'],
    examples: ['trend identification slides and cycle references'],
    visuals: ['slide deck / guideline presentation'],
    limitations: ['high-level and schematic; lacks deeper algorithmic detail'],
    operationalUse: ['major-state gate before setup logic', 'trend versus range routing'],
  },
  {
    document: 'ModellingandEstimatingofVolatilityusingARCHGARCHmodelsinJordansStockMarket.pdf',
    topic: 'ARCH/GARCH volatility modeling',
    extractionQuality: 'partial',
    fit: 'supporting',
    evidenceLevel: 'medium',
    coreIdeas: [
      'Volatility clusters and can be modeled separately from price direction.',
      'ARCH/GARCH logic is useful for risk envelope and stop-width design rather than direction selection.',
    ],
    definitions: ['ARCH', 'GARCH', 'volatility clustering'],
    methods: ['estimate conditional variance from recent variance behavior'],
    examples: ['volatility estimation in a stock-market context'],
    visuals: ['econometric volatility-model framing'],
    limitations: ['direction-neutral and only partially extracted here'],
    operationalUse: ['risk envelope sizing', 'volatility-state detection'],
  },
  {
    document: 'ReflexivityinFinancialMarketsATheoreticalFrameworkExtendingtheBlackScholesModel.pdf',
    topic: 'reflexivity in option-pricing and feedback risk',
    extractionQuality: 'full',
    fit: 'core',
    evidenceLevel: 'high',
    coreIdeas: [
      'Model-driven trading can change drift and volatility rather than merely observing them.',
      'Feedback loops can amplify volatility and systemic fragility.',
      'Heavy model dependence makes markets more endogenous and shock-sensitive.',
    ],
    definitions: ['endogenous volatility', 'feedback-amplified drift', 'systemic fragility'],
    methods: ['augment exogenous pricing logic with feedback terms and reflexive volatility'],
    examples: ['feedback from widespread model use raising instability'],
    visuals: ['extended stochastic-dynamics framing'],
    limitations: ['theory-heavy and not an intraday entry model on its own'],
    operationalUse: ['fragility labeling', 'late-stage feedback caution', 'option-flow interpretation'],
  },
  {
    document: 'Study_of_the_ARIMA_Model_in_Financial_Time_Series_.pdf',
    topic: 'ARIMA baseline time-series modeling',
    extractionQuality: 'metadata-only',
    fit: 'supporting',
    evidenceLevel: 'low',
    coreIdeas: ['The title confirms ARIMA/time-series coverage, but the text was not recoverable in this pass.'],
    definitions: ['ARIMA inferred from title only'],
    methods: ['autoregressive / differencing / moving-average baseline inferred from title only'],
    examples: [],
    visuals: ['metadata-only extraction'],
    limitations: ['Use only as category support; do not treat it as a fine-detail authority until manually reviewed.'],
    operationalUse: ['baseline forecasting category, mainly for benchmark routing'],
  },
  {
    document: 'Trading_Macro-Cycles_of_Foreign_Exchange_Markets_U.pdf',
    topic: 'hybrid FX macro-cycle forecasting',
    extractionQuality: 'full',
    fit: 'core',
    evidenceLevel: 'high',
    coreIdeas: [
      'Longer-term FX trends can be forecast as bull/bear macro-cycles rather than only next-bar moves.',
      'Hybrid models can combine macro variables, Markov-logit state persistence, and neural-network state identification.',
      'Early detection of state changes matters for hedging and directional positioning.',
    ],
    definitions: ['macro-cycle', 'bull state', 'bear state', 'state persistence'],
    methods: ['predict next bull/bear state probability', 'combine macro variables with state dependence', 'trade long on bull-state forecasts and short on bear-state forecasts'],
    examples: ['USDJPY and other FX pairs with persistent or rapidly switching regimes'],
    visuals: ['state probability maps', 'bull/bear cycle comparison charts'],
    limitations: ['cycle strength is stronger than exact intraday price precision'],
    operationalUse: ['FX regime routing', 'rates-aware cycle bias', 'state-change early warning'],
  },
];

const doctrineDerivedConcepts: KnowledgeConcept[] = [
  ...marketStructureOntology.map((term) => termToConcept(term, 'structure', ['XAUUSD', 'US30', 'GBPUSD', 'EURUSD', 'USDJPY', 'GBPJPY'], ['README.md', 'Market Structure Guidelines.pptx (1).pdf'], 'high')),
  ...macroOntology.map((term) => termToConcept(term, 'macro', ['XAUUSD', 'US30', 'GBPUSD', 'EURUSD', 'USDJPY', 'GBPJPY'], ['README.md', 'Macrosynergy-Macro-Quantimental-Investment-Handbook.pdf', 'Trading_Macro-Cycles_of_Foreign_Exchange_Markets_U.pdf'], 'high')),
  ...forexMechanics.map((term) => termToConcept(term, 'fx', ['GBPUSD', 'EURUSD', 'USDJPY', 'GBPJPY'], ['README2.md', 'Trading_Macro-Cycles_of_Foreign_Exchange_Markets_U.pdf', 'Babypips Forex ( PDFDrive ).pdf'], term.key === 'rates-differentials' ? 'high' : 'medium')),
];

export const knowledgeConcepts: KnowledgeConcept[] = [
  ...doctrineDerivedConcepts,
  {
    key: 'bos',
    label: 'Break Of Structure',
    group: 'structure',
    definition: 'A confirmed break through the prior swing level that proves the prior local structure has lost control.',
    operationalDefinition: 'Vaultum uses BOS as the key transition from phase-1 impulse into a valid pullback or continuation workflow.',
    detectionLogic: 'Look for a decisive close through the prior swing high/low with range expansion and non-trivial participation, not just a wick poke.',
    requiredInputs: ['minor or trigger timeframe candles', 'prior swing levels', 'range expansion', 'relative volume or participation proxy'],
    whenItMatters: 'Before trusting a continuation or reversal setup on the lower timeframe.',
    whenItDoesNot: 'When price only probes the swing and immediately falls back into the prior range.',
    failureCases: ['wick-only breaches with no close acceptance', 'news spikes with immediate mean reversion', 'thin-session fake breaks'],
    confidenceLogic: 'High when close-through, follow-through, and displacement agree; medium when only the high/low is taken.',
    relatedConcepts: ['major-structure', 'minor-structure', 'continuation', 'reversal', 'displacement'],
    markets: ['XAUUSD', 'US30', 'GBPUSD', 'EURUSD', 'USDJPY', 'GBPJPY'],
    sourceDocuments: ['Market Structure Guidelines.pptx (1).pdf', 'Market Structure And Powerful Setups [By Wade Fx Setups](1).pdf'],
    evidenceLevel: 'high',
  },
  {
    key: 'choch',
    label: 'Change Of Character',
    group: 'structure',
    definition: 'The first meaningful internal failure of the old trend sequence before full structure reversal is proven.',
    operationalDefinition: 'Vaultum uses CHOCH as an early-warning concept, not a standalone reversal order.',
    detectionLogic: 'Detect the first internal higher-low/lower-high failure, then check whether acceptance and macro context support a full handoff.',
    requiredInputs: ['minor structure sequence', 'internal swing failures', 'acceptance or rejection context', 'macro alignment'],
    whenItMatters: 'Near reversals, failed continuation, and liquidity sweeps.',
    whenItDoesNot: 'When the market is only printing a routine pullback inside an intact major trend.',
    failureCases: ['calling every pullback a CHOCH', 'ignoring the still-intact major structure', 'missing that the move was only a liquidity sweep'],
    confidenceLogic: 'Medium by default; high only after the new side earns acceptance beyond the first internal break.',
    relatedConcepts: ['reversal', 'liquidity-sweep', 'bos', 'regime-transition'],
    markets: ['XAUUSD', 'US30', 'GBPUSD', 'EURUSD', 'USDJPY', 'GBPJPY'],
    sourceDocuments: ['Market Structure And Powerful Setups [By Wade Fx Setups](1).pdf', 'Market Structure Guidelines.pptx (1).pdf'],
    evidenceLevel: 'medium',
  },
  {
    key: 'order-block',
    label: 'Order Block',
    group: 'execution',
    definition: 'The final opposing candle or micro-zone before forceful displacement that later acts as a defended institutional reference.',
    operationalDefinition: 'Vaultum treats order blocks as valid only when they originate from a liquidity sweep or defended key level, launch real displacement, and break structure with clear participation.',
    detectionLogic: 'Scan for an opposing candle at swept liquidity or a defended swing, then require displacement that breaks structure, expands volatility, and shows clear participation before the zone is allowed to survive.',
    requiredInputs: ['candle sequence', 'displacement', 'break of structure', 'fib or value pocket', 'relative volume'],
    whenItMatters: 'During phase-2 correction and phase-3 continuation setups.',
    whenItDoesNot: 'When the origin candle lacks real displacement or never gets defended on retest.',
    failureCases: ['forcing random last candles into order-block labels', 'using a block with no liquidity event or structure break', 'ignoring weak participation and slow overlapping follow-through'],
    confidenceLogic: 'High when sweep origin, displacement, structure break, participation, and execution-layer refinement all agree.',
    relatedConcepts: ['displacement', 'bos', 'premium-discount', 'continuation'],
    markets: ['XAUUSD', 'US30', 'GBPUSD', 'EURUSD', 'USDJPY', 'GBPJPY'],
    sourceDocuments: ['Market Structure And Powerful Setups [By Wade Fx Setups](1).pdf', 'Market Structure Guidelines.pptx (1).pdf'],
    evidenceLevel: 'medium',
  },
  {
    key: 'fair-value-gap',
    label: 'Fair Value Gap',
    group: 'execution',
    definition: 'An imbalance left by a forceful move where the market moved too quickly to fully trade through intervening prices.',
    operationalDefinition: 'Vaultum uses FVGs only when they come from strong displacement, minimal overlap, and a true structure break or liquidity take, then refines execution to the deepest valid fill inside the gap.',
    detectionLogic: 'Find a three-candle imbalance where the gap is clean, the displacement candles are forceful, volatility expands, and the move either breaks structure or takes liquidity before the gap is accepted.',
    requiredInputs: ['three-candle structure', 'displacement', 'range location', 'participation or volume proxy'],
    whenItMatters: 'When the market is pulling back after an impulse or confirmed continuation leg.',
    whenItDoesNot: 'When the imbalance formed in noisy churn or sits outside the relevant dealing range.',
    failureCases: ['treating every visual gap as tradable', 'using slow overlapping gaps with no volatility expansion', 'ignoring that price never broke structure or took liquidity before forming the gap'],
    confidenceLogic: 'High when the gap is born from true displacement, retains a clean execution layer, and is retested only after sweep/rejection confirmation.',
    relatedConcepts: ['displacement', 'continuation', 'premium-discount', 'order-block'],
    markets: ['XAUUSD', 'US30', 'GBPUSD', 'EURUSD', 'USDJPY', 'GBPJPY'],
    sourceDocuments: ['Market Structure And Powerful Setups [By Wade Fx Setups](1).pdf'],
    evidenceLevel: 'medium',
  },
  {
    key: 'mean-reversion',
    label: 'Mean Reversion Regime',
    group: 'quant',
    definition: 'A market state where deviations from local value or fair value tend to fade back rather than extend.',
    operationalDefinition: 'Vaultum uses mean-reversion logic mainly in correction phases or balanced regimes, not in reflexive expansion.',
    detectionLogic: 'Classify the state when directional persistence is weak, price keeps returning to value, and continuation attempts fail quickly.',
    requiredInputs: ['value area or fair-value anchor', 'directional persistence', 'volatility state', 'swing rejection behavior'],
    whenItMatters: 'In range conditions, slow corrective sessions, or post-event balance.',
    whenItDoesNot: 'During continuation, displacement, or regime transition volatility.',
    failureCases: ['fading a strong trend day', 'assuming balance when macro repricing is still live', 'using mean reversion through event spikes'],
    confidenceLogic: 'High when rejection frequency and value reversion are both persistent; low when the range is already breaking.',
    relatedConcepts: ['continuation', 'regime-transition', 'linear-regression', 'kalman-filter'],
    markets: ['XAUUSD', 'US30', 'GBPUSD', 'EURUSD', 'USDJPY', 'GBPJPY'],
    sourceDocuments: ['3--Introduction_to_Linear_Regression_Analysis__5th_ed._Douglas_C._Montgomery__Elizabeth_A._Peck__and_G._.pdf', 'Market Structure Guidelines.pptx (1).pdf'],
    evidenceLevel: 'high',
  },
  {
    key: 'unstable-noise',
    label: 'Unstable Noise Regime',
    group: 'quant',
    definition: 'A state where volatility is elevated, state boundaries are unclear, and predictive edge degrades faster than usual.',
    operationalDefinition: 'Vaultum switches to reactive mode here: lighter conviction, tighter gating, and more emphasis on invalidation than prediction.',
    detectionLogic: 'Flag when transition risk is high, event risk is active, volatility clusters are rising, and both trend and mean-reversion logic fail repeatedly.',
    requiredInputs: ['volatility state', 'calendar risk', 'phase state', 'failed setup count', 'macro disagreement'],
    whenItMatters: 'Around high-impact events, abrupt repricing, intervention risk, or regime handoff.',
    whenItDoesNot: 'Once the market has re-established clear continuation or stable balance.',
    failureCases: ['forcing predictions through event chaos', 'confusing fast movement with clean trend', 'adding leverage while inputs are degraded'],
    confidenceLogic: 'High when multiple risk filters agree that prediction quality is degraded.',
    relatedConcepts: ['regime-transition', 'garch', 'monte-carlo', 'kalman-filter'],
    markets: ['XAUUSD', 'US30', 'GBPUSD', 'EURUSD', 'USDJPY', 'GBPJPY'],
    sourceDocuments: ['ModellingandEstimatingofVolatilityusingARCHGARCHmodelsinJordansStockMarket.pdf', 'Trading_Macro-Cycles_of_Foreign_Exchange_Markets_U.pdf'],
    evidenceLevel: 'high',
  },
];

export const agentRulebooks: AgentRulebook[] = [
  {
    key: 'structure',
    label: 'Structure Agent',
    mission: 'Own the chart grammar first: major/minor structure, impulse, correction, continuation, reversal, BOS, CHOCH, sweeps, and displacement.',
    focusAreas: ['major structure privilege', 'minor structure confirmation', 'impulse vs correction vs continuation vs reversal', 'BOS versus wick-only breaks', 'structure-zone mapping before OB/FVG'],
    requiredInputs: ['higher-timeframe candles', 'lower-timeframe candles', 'swing map', 'volume profile or relative-volume proxy'],
    decisionRules: [
      'Decide major structure first, then minor structure; never collapse them into one label.',
      'Map the broad structure area from the major and minor framework before checking execution labels.',
      'Treat BOS as confirmed only after close-through and participation, not wick-only pokes.',
      'Use sweeps as context, then wait for reclaim, rejection, or acceptance.',
      'Only treat OB/FVG zones as actionable when they support the active dealing range and the current phase.',
    ],
    avoidRules: [
      'Do not call every pullback a reversal or every wick a sweep.',
      'Do not let generic ICT labels outrank the structure map.',
    ],
    handoffRules: [
      'If structure is clear, pass directional privilege and reference zone to the execution agent.',
      'If structure conflicts with macro or regime, flag the disagreement rather than forcing a setup.',
    ],
    preferredTools: ['analytics.get_entry_map', 'pivots.get_levels', 'volume.get_profile', 'orderflow.get_engine'],
  },
  {
    key: 'macro',
    label: 'Macro Agent',
    mission: 'Own rates, DXY, yields, oil, risk sentiment, event risk, and market-specific macro pressure.',
    focusAreas: ['policy divergence', 'rates differentials', 'dollar regime', 'real yields', 'risk-on/risk-off state', 'event repricing risk'],
    requiredInputs: ['macro signals', 'rates scoreboard', 'economic calendar', 'news intelligence', 'cross-asset regime'],
    decisionRules: [
      'Separate macro pressure from macro context: pressure is force, context is narrative frame.',
      'For FX, read base strength versus quote strength before talking about pair direction.',
      'For GBPUSD, EURUSD, USDJPY, and GBPJPY, gate continuation through the rates scoreboard.',
      'Around events, downgrade confidence before the tape proves the new state.',
    ],
    avoidRules: [
      'Do not override chart location with narrative alone.',
      'Do not ignore intervention or event-risk asymmetry on yen pairs.',
    ],
    handoffRules: [
      'Pass directional support or hostility to the quant and execution agents.',
      'If macro is mixed, explicitly tell execution to lower conviction or stand aside.',
    ],
    preferredTools: ['macro.get_macro_signals', 'macro.get_rates_differentials', 'calendar.get_economic_calendar', 'intelligence.get_news_intel'],
  },
  {
    key: 'quant',
    label: 'Quant Agent',
    mission: 'Classify the market as trend, mean reversion, or unstable noise and choose the right model family for the job.',
    focusAreas: ['regime routing', 'volatility clustering', 'state persistence', 'noise filtering', 'model-to-task matching'],
    requiredInputs: ['phase state', 'volatility state', 'directional persistence', 'macro disagreement flags', 'scenario distribution'],
    decisionRules: [
      'Use GARCH for volatility and risk, not direction.',
      'Use regime-switching when state changes matter more than next-bar fit.',
      'Use Kalman when feeds are noisy and the problem is hidden-state estimation.',
      'Use regression or ARIMA as baselines, not as universal truth.',
      'If the regime is unstable-noise, switch to reactive mode and avoid overconfident prediction.',
    ],
    avoidRules: [
      'Do not use neural nets or complex models without representative data and validation.',
      'Do not present baseline models as if they solved regime drift.',
    ],
    handoffRules: [
      'Tell execution which model family is appropriate and whether prediction quality is degraded.',
      'Tell macro when the state disagrees with the narrative and needs reassessment.',
    ],
    preferredTools: ['scenario.get_monte_carlo', 'analytics.get_entry_map', 'macro.get_macro_signals', 'orderflow.get_engine'],
  },
  {
    key: 'execution',
    label: 'Execution Agent',
    mission: 'Combine structure, flow, regime, and macro into a structure-first entry decision with explainability and risk gates.',
    focusAreas: ['structure-first zone mapping', 'execution-layer refinement', 'trigger quality', 'winner-only pyramiding', 'invalidation discipline'],
    requiredInputs: ['entry map', 'orderflow engine', 'volume profile', 'macro signals', 'news intelligence', 'scenario engine'],
    decisionRules: [
      'Follow the chain regime -> phase -> setup -> execution -> risk -> review.',
      'Only score entries after structure and macro have already been reconciled.',
      'Use the checklist: major structure, minor confirmation, sweep response, displacement, premium/discount, macro alignment, then orderflow confirmation.',
      'Treat orderflow, OB, and FVG as execution refinements, never as the base trade thesis.',
      'Pyramiding always means test, confirm, press winners only above invalidation.',
    ],
    avoidRules: [
      'Do not add below invalidation.',
      'Do not treat continuation as valid when event risk or unstable-noise gates are active.',
    ],
    handoffRules: [
      'Return explicit why-valid, what-is-missing, and what-invalidates outputs to the UI and AI layers.',
      'Push completed trade context to the review loop after the fact.',
    ],
    preferredTools: ['analytics.get_entry_map', 'orderflow.get_engine', 'intelligence.get_news_intel', 'scenario.get_monte_carlo'],
  },
];

export const checklistEngineTemplate = [
  { key: 'major-structure', label: 'Major structure bias', conceptKey: 'major-structure' },
  { key: 'minor-structure', label: 'Minor structure confirmation', conceptKey: 'minor-structure' },
  { key: 'liquidity-sweep', label: 'Liquidity sweep response', conceptKey: 'liquidity-sweep' },
  { key: 'displacement', label: 'Displacement strength', conceptKey: 'displacement' },
  { key: 'premium-discount', label: 'Premium/discount positioning', conceptKey: 'premium-discount' },
  { key: 'macro-alignment', label: 'Macro alignment', conceptKey: 'macro-pressure' },
  { key: 'orderflow-confirmation', label: 'Orderflow confirmation', conceptKey: 'orderflow-confirmation' },
] as const;

export const knowledgeGraphMap = {
  focusMarkets: marketPlaybooks,
  concepts: knowledgeConcepts,
  models: modelSelection,
  documents: knowledgeDocuments,
  agents: agentRulebooks,
  checklistTemplate: checklistEngineTemplate,
};

export function retrieveKnowledge(input: { question?: string; market?: string; topN?: number }): {
  market: string;
  question: string;
  concepts: KnowledgeMatch[];
  models: KnowledgeMatch[];
  documents: KnowledgeMatch[];
  agents: KnowledgeMatch[];
} {
  const market = normalizeTradingDoctrineMarket(input.market);
  const question = String(input.question || '').trim();
  const tokens = tokenize(`${market} ${question}`);
  const topN = Math.max(1, Math.min(Number(input.topN || 5), 8));

  const concepts = knowledgeConcepts
    .map((concept) => {
      const text = flattenText([
        concept.label,
        concept.definition,
        concept.operationalDefinition,
        concept.detectionLogic,
        concept.relatedConcepts,
        concept.markets,
      ]);
      return {
        key: concept.key,
        label: concept.label,
        score: scoreText(tokens, text) + (concept.markets.includes(market) ? 2 : 0),
        reason: concept.operationalDefinition,
      } satisfies KnowledgeMatch;
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, topN);

  const models = modelSelection
    .map((model) => {
      const text = flattenText([model.label, model.job, model.whenItMatters, model.limitations]);
      return {
        key: model.key,
        label: model.label,
        score: scoreText(tokens, text) + (findTradingDoctrineFocusMarket(market).preferredModels.includes(model.key) ? 1 : 0),
        reason: model.job,
      } satisfies KnowledgeMatch;
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, topN);

  const documents = knowledgeDocuments
    .map((document) => {
      const text = flattenText([
        document.document,
        document.topic,
        document.coreIdeas,
        document.methods,
        document.operationalUse,
      ]);
      return {
        key: document.document,
        label: document.document,
        score: scoreText(tokens, text) + (document.fit === 'core' ? 2 : document.fit === 'supporting' ? 1 : 0),
        reason: document.topic,
      } satisfies KnowledgeMatch;
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, topN);

  const agents = agentRulebooks
    .map((agent) => {
      const text = flattenText([agent.label, agent.mission, agent.focusAreas, agent.decisionRules, agent.requiredInputs]);
      return {
        key: agent.key,
        label: agent.label,
        score: scoreText(tokens, text),
        reason: agent.mission,
      } satisfies KnowledgeMatch;
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, topN);

  return { market, question, concepts, models, documents, agents };
}

export function buildKnowledgeCoverageReport(): {
  overallScore: number;
  conceptChecks: KnowledgeCoverageItem[];
  weakAreas: string[];
  gaps: string[];
  ontologyMap: Array<{ group: string; terms: string[] }>;
} {
  const conceptChecks = knowledgeConcepts.map((concept) => {
    const definitionReady = Boolean(concept.definition && concept.operationalDefinition);
    const detectionReady = Boolean(concept.detectionLogic && concept.requiredInputs.length);
    const contextReady = Boolean(concept.whenItMatters && concept.whenItDoesNot);
    const failureReady = concept.failureCases.length > 0;
    const score = Number(definitionReady) + Number(detectionReady) + Number(contextReady) + Number(failureReady);
    const status: KnowledgeCoverageItem['status'] =
      score === 4 && concept.evidenceLevel !== 'low'
        ? 'strong'
        : score >= 3
          ? 'building'
          : 'thin';

    return {
      key: concept.key,
      label: concept.label,
      group: concept.group,
      definitionReady,
      detectionReady,
      contextReady,
      failureReady,
      evidenceLevel: concept.evidenceLevel,
      status,
    };
  });

  const overallScore = Math.round((conceptChecks.reduce((sum, item) => sum + (item.status === 'strong' ? 1 : item.status === 'building' ? 0.7 : 0.35), 0) / Math.max(conceptChecks.length, 1)) * 100);

  return {
    overallScore,
    conceptChecks,
    weakAreas: [
      'Image-heavy market-structure PDFs still limit one-to-one document fidelity for some setup nuances.',
      'FX venue-depth and centralized tape remain absent, so forex flow logic must stay macro- and proxy-aware.',
      'The regime-switching and ARIMA source papers remain title-level support until manually reviewed.',
    ],
    gaps: [
      'Major versus minor structure is well defined, but CHOCH and some OB/FVG nuance still lean on operational heuristics plus code, not a clean text extract.',
      'Regime-transition logic is strong in the engine, but historical benchmark coverage for each concept remains a hook rather than a full research database.',
      'Macro context is strongest for GOLD and US30, while FX policy-gap nuance is medium-confidence and still benefits from more central-bank path detail.',
      'Model applicability is mapped, but neural-network usage intentionally stays restricted because the current data estate is not rich enough for safe deployment.',
    ],
    ontologyMap: [
      { group: 'structure', terms: knowledgeConcepts.filter((item) => item.group === 'structure' || item.group === 'execution').map((item) => item.label) },
      { group: 'macro', terms: knowledgeConcepts.filter((item) => item.group === 'macro' || item.group === 'fx').map((item) => item.label) },
      { group: 'quant', terms: knowledgeConcepts.filter((item) => item.group === 'quant').map((item) => item.label) },
    ],
  };
}

export function buildModelSelectionDecision(input: {
  market?: string;
  phase?: string;
  readiness?: string;
  confidence?: number;
  macroReflexivity?: string;
  eventRisk?: 'live' | 'soon' | 'clear';
}): ModelSelectionDecision {
  const market = normalizeTradingDoctrineMarket(input.market);
  const phase = String(input.phase || '').toLowerCase();
  const readiness = String(input.readiness || '').toLowerCase();
  const confidenceScore = Number.isFinite(input.confidence) ? Number(input.confidence) : 50;
  const macroReflexivity = String(input.macroReflexivity || '').toLowerCase();
  const eventRisk = input.eventRisk ?? 'clear';

  const regimeClass: ModelSelectionDecision['regimeClass'] =
    eventRisk === 'live' || phase === 'transition' || readiness === 'stand-aside' || confidenceScore < 48
      ? 'unstable-noise'
      : phase === 'correction'
        ? 'mean-reversion'
        : 'trend';

  const selectedKeys = new Set<TradingModelKey>();
  if (regimeClass === 'trend') {
    selectedKeys.add('regime-switching');
    selectedKeys.add('garch');
    selectedKeys.add('kalman-filter');
    selectedKeys.add('monte-carlo');
    if (/self-reinforcing/.test(macroReflexivity)) selectedKeys.add('reflexivity');
  } else if (regimeClass === 'mean-reversion') {
    selectedKeys.add('kalman-filter');
    selectedKeys.add('linear-regression');
    selectedKeys.add('arima');
    selectedKeys.add('garch');
  } else {
    selectedKeys.add('garch');
    selectedKeys.add('kalman-filter');
    selectedKeys.add('monte-carlo');
  }

  if (['GBPUSD', 'EURUSD', 'USDJPY', 'GBPJPY'].includes(market)) {
    selectedKeys.add('macro-cycle-hybrid');
    selectedKeys.add('quantamental-panel');
  }

  findTradingDoctrineFocusMarket(market).preferredModels.forEach((key) => {
    if (selectedKeys.size < 5) selectedKeys.add(key);
  });

  return {
    regimeClass,
    selectedModels: modelSelection.filter((item) => selectedKeys.has(item.key)).slice(0, 5),
    avoidPrediction: regimeClass === 'unstable-noise',
    reactiveMode: regimeClass === 'unstable-noise' || /exhaustion/.test(macroReflexivity),
    confidence: confidenceScore >= 72 ? 'high' : confidenceScore >= 52 ? 'medium' : 'low',
    reason:
      regimeClass === 'trend'
        ? 'Continuation or impulse conditions are dominant, so regime-routing, volatility, state estimation, and scenario models matter most.'
        : regimeClass === 'mean-reversion'
          ? 'The market is correcting or balancing, so smoothing, baseline fair-value tools, and volatility control fit better than pure momentum logic.'
          : 'Transition risk or live event pressure is too high, so prediction should be downgraded and the desk should stay reactive.',
    tradeStyle:
      regimeClass === 'trend'
        ? 'continuation / momentum with winner-only pyramiding'
        : regimeClass === 'mean-reversion'
          ? 'fade stretch back into value with tighter invalidation'
          : 'reactive-only; protect capital and wait for cleaner state definition',
  };
}

export {
  findTradingDoctrineFocusMarket,
  marketPlaybooks,
  normalizeTradingDoctrineMarket,
  sourceLedger,
};
