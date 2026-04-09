import { getCycleState } from '../benner/v1/get-cycle-state';
import { getEntryMap } from '../analytics/v1/get-entry-map';
import { getTraderReport } from '../analytics/v1/get-trader-report';
import { reflectTradeOutcome } from '../analytics/v1/reflect-trade-outcome';
import { getSetupPatrol } from '../analytics/v1/get-setup-patrol';
import { getEconomicCalendar } from '../calendar/v1/get-economic-calendar';
import { askVaultum } from '../ai/v1/ask-vaultum';
import { getMarketBrief } from '../intelligence/v1/get-market-brief';
import { getNewsIntel } from '../intelligence/v1/get-news-intel';
import { getXIntel } from '../intelligence/v1/get-x-intel';
import { searchNewsDocuments } from '../intelligence/v1/search-news-documents';
import { getRiskScores } from '../intelligence/v1/get-risk-scores';
import { getLiquidityStress } from '../liquidity/v1/get-liquidity-stress';
import { getMacroSignals } from '../macro/v1/get-macro-signals';
import { getRatesDifferentials } from '../macro/v1/get-rates-differentials';
import { getFearGreedIndex } from '../market/v1/get-fear-greed-index';
import { getTradingViewResearch } from '../market/v1/_tradingview';
import { getTwelveDataResearch } from '../market/v1/_twelvedata';
import { getYahooResearch } from '../market/v1/_yahoo-research';
import { getFinnhubResearch } from '../market/v1/_finnhub-research';
import { getFlowProxy } from '../options/v1/get-flow-proxy';
import { getGammaLevels } from '../options/v1/get-gamma-levels';
import { getDealerPressure } from '../options/v1/get-dealer-pressure';
import { getOrderflowEngine } from '../orderflow/v1/get-engine';
import { getLevels } from '../pivots/v1/get-levels';
import { getCotSummary } from '../positioning/v1/get-cot-summary';
import { getCryptoDerivativesContext } from '../positioning/v1/get-crypto-derivatives-context';
import { getBuyerSellerPressure } from '../pressure/v1/get-buyer-seller-pressure';
import { getMonteCarloScenario } from '../scenario/v1/get-monte-carlo';
import { getInstitutionalMonitor } from '../monitor/v1/get-institutional-monitor';
import { getReportOverview } from '../reports/v1/get-report-overview';
import { listPredictionMarkets } from '../prediction/v1/list-prediction-markets';
import { getProfile } from '../volume/v1/get-profile';
import { buildFeedStatus } from '../_shared/feed-status';
import { normalizeVaultumTimeframe, structuralTimeframeFor } from '../_shared/timeframes';
import { getProviderCatalog } from '../system/v1/get-provider-catalog';
import { getDataMoat } from '../system/v1/get-data-moat';
import { getTrustMoat } from '../system/v1/get-trust-moat';
import { getTradingDoctrine } from '../system/v1/get-trading-doctrine';
import { getKnowledgeGraph } from '../system/v1/get-knowledge-graph';
import { getKnowledgeCoverage } from '../system/v1/get-knowledge-coverage';
import { getDetectionEngine } from '../system/v1/get-detection-engine';
import { getModelSelectionEngine } from '../system/v1/get-model-selection-engine';
import { getAgentRulebooks } from '../system/v1/get-agent-rulebooks';
import { getConceptSimulation } from '../system/v1/get-concept-simulation';
import { getAnalystOs } from '../analyst/v1/get-os';

type JsonSchema = {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
};

type VaultumMcpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  handler: (input: any) => Promise<unknown>;
};

const tools: VaultumMcpTool[] = [
  {
    name: 'vaultum.economic_calendar',
    title: 'Vaultum Economic Calendar',
    description: 'Returns the live day calendar for the selected FX pair or market, filtered to the relevant currencies.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Market such as GBPUSD, EURUSD, USDJPY, XAUUSD, or SPX.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getEconomicCalendar({ market: String(input?.market || 'XAUUSD').toUpperCase() }),
  },
  {
    name: 'vaultum.rates_differentials',
    title: 'Vaultum Rates Differential Scoreboard',
    description: 'Returns the BOE/ECB/BOJ/Fed policy-gap scoreboard for EURUSD, GBPUSD, USDJPY, and GBPJPY with alignment and repricing-risk context.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Optional FX pair such as EURUSD, GBPUSD, USDJPY, or GBPJPY to focus the scoreboard.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getRatesDifferentials({
      market: typeof input?.market === 'string' ? input.market : undefined,
    }),
  },
  {
    name: 'vaultum.fear_greed',
    title: 'Vaultum Fear And Greed',
    description: 'Returns Vaultum live market sentiment and risk appetite composite for the current trading session.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: async () => getFearGreedIndex(),
  },
  {
    name: 'vaultum.tradingview_research',
    title: 'Vaultum TradingView Research',
    description: 'Returns supplemental TradingView symbol discovery and scanner-style technical consensus for the selected market. This is a sidecar, not quote truth.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Market such as XAUUSD, GBPUSD, EURUSD, SPX, or WTI.' },
        timeframe: { type: 'string', description: 'Timeframe such as 15m, 1h, 4h, or 1d.' },
        query: { type: 'string', description: 'Optional explicit TradingView symbol search query or full id like OANDA:XAUUSD.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getTradingViewResearch({
      market: String(input?.market || 'XAUUSD').toUpperCase(),
      timeframe: String(input?.timeframe || '1h').toLowerCase(),
      query: typeof input?.query === 'string' ? input.query : undefined,
    }),
  },
  {
    name: 'vaultum.twelve_data_research',
    title: 'Vaultum Twelve Data Research',
    description: 'Returns supplemental Twelve Data indicator, market-state, and symbol-match context for the selected market. This is a technical sidecar, not quote truth.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Market such as XAUUSD, GBPUSD, EURUSD, SPX, or WTI.' },
        timeframe: { type: 'string', description: 'Timeframe such as 15m, 1h, 4h, or 1d.' },
        query: { type: 'string', description: 'Optional explicit Twelve Data symbol query.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getTwelveDataResearch({
      market: String(input?.market || 'XAUUSD').toUpperCase(),
      timeframe: String(input?.timeframe || '1h').toLowerCase(),
      query: typeof input?.query === 'string' ? input.query : undefined,
    }),
  },
  {
    name: 'vaultum.yahoo_research',
    title: 'Vaultum Yahoo Research',
    description: 'Returns supplemental Yahoo symbol discovery, catalyst headlines, repaired quote context, and selective stock-board reads for the selected market.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Market such as XAUUSD, GBPUSD, EURUSD, SPX, or WTI.' },
        timeframe: { type: 'string', description: 'Timeframe such as 15m, 1h, 4h, or 1d.' },
        query: { type: 'string', description: 'Optional explicit Yahoo search query.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getYahooResearch({
      market: String(input?.market || 'XAUUSD').toUpperCase(),
      timeframe: String(input?.timeframe || '1h').toLowerCase(),
      query: typeof input?.query === 'string' ? input.query : undefined,
    }),
  },
  {
    name: 'vaultum.finnhub_research',
    title: 'Vaultum Finnhub Research',
    description: 'Returns supplemental Finnhub technical aggregates, support-resistance scans, news sentiment, session state, and earnings timing for the selected market or its mapped proxy.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Market such as XAUUSD, GBPUSD, EURUSD, SPX, WTI, or an equity ticker.' },
        timeframe: { type: 'string', description: 'Timeframe such as 15m, 1h, 4h, or 1d.' },
        query: { type: 'string', description: 'Optional explicit Finnhub symbol query.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getFinnhubResearch({
      market: String(input?.market || 'XAUUSD').toUpperCase(),
      timeframe: String(input?.timeframe || '1h').toLowerCase(),
      query: typeof input?.query === 'string' ? input.query : undefined,
    }),
  },
  {
    name: 'vaultum.feed_status',
    title: 'Vaultum Feed Status',
    description: 'Returns relay, Redis, broker, and fallback feed health for the running Vaultum deployment.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: async () => ({
      generatedAt: new Date().toISOString(),
      feedStatus: buildFeedStatus(),
    }),
  },
  {
    name: 'vaultum.provider_catalog',
    title: 'Vaultum Provider Catalog',
    description: 'Returns the formal Vaultum connector registry with provider coverage, capabilities, and runtime state.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: async () => getProviderCatalog(),
  },
  {
    name: 'vaultum.trading_doctrine',
    title: 'Vaultum Trading Doctrine',
    description: 'Returns Vaultum operational market-structure definitions, macro/FX mechanics, model-selection rules, and source-quality ledger from the MACRO TRENDS knowledge layer.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Optional market focus such as XAUUSD, US30, GBPUSD, EURUSD, USDJPY, or GBPJPY.' },
        question: { type: 'string', description: 'Optional question so Vaultum can highlight the most relevant model family and market playbook.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getTradingDoctrine({
      market: typeof input?.market === 'string' ? input.market : undefined,
      question: typeof input?.question === 'string' ? input.question : undefined,
    }),
  },
  {
    name: 'vaultum.knowledge_graph',
    title: 'Vaultum Knowledge Graph',
    description: 'Returns the unified ontology map, document evidence ledger, retrieval matches, and agent map for the MACRO TRENDS knowledge layer.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Optional market focus such as XAUUSD, US30, GBPUSD, EURUSD, USDJPY, or GBPJPY.' },
        question: { type: 'string', description: 'Optional operator question for relevance-ranked retrieval.' },
        topN: { type: 'number', description: 'Optional retrieval depth. Defaults to 5.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getKnowledgeGraph({
      market: typeof input?.market === 'string' ? input.market : undefined,
      question: typeof input?.question === 'string' ? input.question : undefined,
      topN: typeof input?.topN === 'number' ? input.topN : undefined,
    }),
  },
  {
    name: 'vaultum.knowledge_coverage',
    title: 'Vaultum Knowledge Coverage',
    description: 'Returns the validation report that checks whether definitions, detection logic, context rules, and failure cases are present across the knowledge graph.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: async () => getKnowledgeCoverage(),
  },
  {
    name: 'vaultum.concept_simulation',
    title: 'Vaultum Concept Simulation',
    description: 'Replays recent candle history to validate checklist concepts and model routing on the selected market and timeframe.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Optional market focus such as XAUUSD, US30, GBPUSD, EURUSD, USDJPY, or GBPJPY.' },
        timeframe: { type: 'string', description: 'Optional replay timeframe such as 15m, 1h, 4h, or 1d.' },
        lookbackBars: { type: 'number', description: 'Optional number of recent bars to replay. Defaults to 180.' },
        horizonBars: { type: 'number', description: 'Optional forward horizon in bars for evaluation. Defaults to 6.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getConceptSimulation({
      market: typeof input?.market === 'string' ? input.market : undefined,
      timeframe: typeof input?.timeframe === 'string' ? input.timeframe : undefined,
      lookbackBars: typeof input?.lookbackBars === 'number' ? input.lookbackBars : undefined,
      horizonBars: typeof input?.horizonBars === 'number' ? input.horizonBars : undefined,
    }),
  },
  {
    name: 'vaultum.detection_engine',
    title: 'Vaultum Detection Engine',
    description: 'Returns the concept-to-input, heuristic, confidence, and failure-case map that powers Vaultum structure and macro detection.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Optional market focus such as XAUUSD or US30.' },
        question: { type: 'string', description: 'Optional operator question for retrieval narrowing.' },
        topN: { type: 'number', description: 'Optional retrieval depth. Defaults to 8.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getDetectionEngine({
      market: typeof input?.market === 'string' ? input.market : undefined,
      question: typeof input?.question === 'string' ? input.question : undefined,
      topN: typeof input?.topN === 'number' ? input.topN : undefined,
    }),
  },
  {
    name: 'vaultum.model_selection_engine',
    title: 'Vaultum Model Selection Engine',
    description: 'Returns regime-based model routing so Vaultum can choose continuation, mean-reversion, or reactive logic with the right model family.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Optional market focus such as XAUUSD, US30, GBPUSD, EURUSD, USDJPY, or GBPJPY.' },
        question: { type: 'string', description: 'Optional operator question for model retrieval.' },
        phase: { type: 'string', description: 'Optional phase such as impulse, correction, continuation, or transition.' },
        readiness: { type: 'string', description: 'Optional readiness such as ready, watch, or stand-aside.' },
        confidence: { type: 'number', description: 'Optional live confidence score.' },
        macroReflexivity: { type: 'string', description: 'Optional reflexivity state.' },
        eventRisk: { type: 'string', description: 'Optional event-risk flag: live, soon, or clear.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getModelSelectionEngine({
      market: typeof input?.market === 'string' ? input.market : undefined,
      question: typeof input?.question === 'string' ? input.question : undefined,
      phase: typeof input?.phase === 'string' ? input.phase : undefined,
      readiness: typeof input?.readiness === 'string' ? input.readiness : undefined,
      confidence: typeof input?.confidence === 'number' ? input.confidence : undefined,
      macroReflexivity: typeof input?.macroReflexivity === 'string' ? input.macroReflexivity : undefined,
      eventRisk: typeof input?.eventRisk === 'string' ? input.eventRisk as 'live' | 'soon' | 'clear' : undefined,
    }),
  },
  {
    name: 'vaultum.agent_rulebooks',
    title: 'Vaultum Agent Rulebooks',
    description: 'Returns the structure, macro, quant, and execution agent rulebooks so multi-agent analysis stays consistent with Vaultum doctrine.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Optional market focus such as XAUUSD or US30.' },
        question: { type: 'string', description: 'Optional operator question for relevance-ranking the rulebooks.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getAgentRulebooks({
      market: typeof input?.market === 'string' ? input.market : undefined,
      question: typeof input?.question === 'string' ? input.question : undefined,
    }),
  },
  {
    name: 'vaultum.data_moat',
    title: 'Vaultum Data Moat',
    description: 'Returns Vaultum data-depth assessment, blindspots, and steering tracks for the selected market workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Primary market such as XAUUSD, US30, EURUSD, or WTI.' },
        timeframe: { type: 'string', description: 'Workflow timeframe such as 15m, 1h, or 4h.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getDataMoat({
      market: String(input?.market || 'XAUUSD').toUpperCase(),
      timeframe: String(input?.timeframe || '1h').toLowerCase(),
    }),
  },
  {
    name: 'vaultum.trust_moat',
    title: 'Vaultum Trust Moat',
    description: 'Returns source-lineage, fallback-discipline, and blindspot warnings for the selected market workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Primary market such as XAUUSD, US30, EURUSD, or WTI.' },
        timeframe: { type: 'string', description: 'Workflow timeframe such as 15m, 1h, or 4h.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getTrustMoat({
      market: String(input?.market || 'XAUUSD').toUpperCase(),
      timeframe: String(input?.timeframe || '1h').toLowerCase(),
    }),
  },
  {
    name: 'vaultum.analyst_os',
    title: 'Vaultum Analyst OS',
    description: 'Returns the regime-to-review decision chain, blindspots, and operator workflow for the selected market.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Primary market such as XAUUSD, US30, EURUSD, or WTI.' },
        timeframe: { type: 'string', description: 'Workflow timeframe such as 15m, 1h, or 4h.' },
        question: { type: 'string', description: 'Optional operator question to shift the workspace focus.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getAnalystOs({
      market: String(input?.market || 'XAUUSD').toUpperCase(),
      timeframe: String(input?.timeframe || '1h').toLowerCase(),
      question: typeof input?.question === 'string' ? input.question : undefined,
    }),
  },
  {
    name: 'vaultum.monte_carlo',
    title: 'Vaultum Monte Carlo',
    description: 'Runs Vaultum scenario analysis for the selected market using live structure, flow, and macro features.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Instrument or market symbol. Defaults to XAUUSD.' },
        timeframe: { type: 'string', description: 'Scenario timeframe. Defaults to 1h.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getMonteCarloScenario({
      market: String(input?.market || 'XAUUSD').toUpperCase(),
      timeframe: String(input?.timeframe || '1h').toLowerCase(),
    }),
  },
  {
    name: 'vaultum.trader_report',
    title: 'Vaultum Trader Report',
    description: 'Returns the shared trader report object that powers the desk brief, AI context, technical committee, and risk-gated execution summary.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Primary market to anchor the report to. Defaults to XAUUSD.' },
        timeframe: { type: 'string', description: 'Timeframe to use for execution and scenario context. Defaults to 1h.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getTraderReport({
      market: String(input?.market || 'XAUUSD').toUpperCase(),
      timeframe: String(input?.timeframe || '1h').toLowerCase(),
      reportStyle: 'desk',
    }),
  },
  {
    name: 'vaultum.entry_map',
    title: 'Vaultum Entry Map',
    description: 'Returns the live multi-timeframe execution map that blends 4H structure, 15m refinement, 5m trigger logic, volume profile, dealer posture, and invalidation logic.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Primary market to anchor the execution map to. Defaults to XAUUSD.' },
        timeframe: { type: 'string', description: 'Chart focus timeframe such as 5m, 15m, 30m, 1h, 4h, or 1d. Defaults to 1h.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getEntryMap({
      market: String(input?.market || 'XAUUSD').toUpperCase(),
      chartTimeframe: normalizeVaultumTimeframe(input?.timeframe),
    }),
  },
  {
    name: 'vaultum.setup_patrol',
    title: 'Vaultum Setup Patrol',
    description: 'Returns the live setup patrol state so the chart can actively monitor high-probability trade emergence without pretending it has hard chart-camera control.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Primary market to patrol. Defaults to XAUUSD.' },
        timeframe: { type: 'string', description: 'Patrol timeframe such as 15m, 1h, or 4h.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getSetupPatrol({
      market: String(input?.market || 'XAUUSD').toUpperCase(),
      timeframe: typeof input?.timeframe === 'string' ? input.timeframe : undefined,
    }),
  },
  {
    name: 'vaultum.reflect_trade_outcome',
    title: 'Vaultum Reflect Trade Outcome',
    description: 'Stores a post-trade reflection so future Vaultum AI/report runs can recall similar setups and lessons.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Primary market to anchor the reflection to. Defaults to XAUUSD.' },
        timeframe: { type: 'string', description: 'Timeframe used by the reflected trade. Defaults to 1h.' },
        outcome: { type: 'string', description: 'Outcome label: win, loss, flat, or open.' },
        returnPct: { type: 'number', description: 'Optional realized return percentage for the trade.' },
        notes: { type: 'string', description: 'Optional operator notes to append to the reflection.' },
        decisionSummary: { type: 'string', description: 'Optional manual summary of the trade or desk note.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => reflectTradeOutcome({
      market: String(input?.market || 'XAUUSD').toUpperCase(),
      timeframe: String(input?.timeframe || '1h').toLowerCase(),
      outcome: input?.outcome,
      returnPct: typeof input?.returnPct === 'number' ? input.returnPct : undefined,
      notes: typeof input?.notes === 'string' ? input.notes : undefined,
      decisionSummary: typeof input?.decisionSummary === 'string' ? input.decisionSummary : undefined,
    }),
  },
  {
    name: 'vaultum.market_brief',
    title: 'Vaultum Market Brief',
    description: 'Returns the live trader-facing desk brief for the selected market with action plan, technical committee, risk envelope, and watchlist context.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Primary market to anchor the brief to. Defaults to XAUUSD.' },
        timeframe: { type: 'string', description: 'Timeframe to use for structure and orderflow context. Defaults to 1h.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getMarketBrief({
      market: String(input?.market || 'XAUUSD').toUpperCase(),
      timeframe: String(input?.timeframe || '1h').toLowerCase(),
    }),
  },
  {
    name: 'vaultum.market_monitor',
    title: 'Vaultum Market Monitor',
    description: 'Returns Vaultum institutional monitoring across rates, dollar regime, dealers/gamma, COT, liquidity map, policy divergence, and geopolitical cross-asset stress.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Primary market to anchor context to. Defaults to XAUUSD.' },
        timeframe: { type: 'string', description: 'Execution timeframe used by the liquidity and orderflow monitor. Defaults to 1h.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getInstitutionalMonitor({
      market: String(input?.market || 'XAUUSD').toUpperCase(),
      timeframe: String(input?.timeframe || '1h').toLowerCase(),
    }),
  },
  {
    name: 'vaultum.report_overview',
    title: 'Vaultum Report Overview',
    description: 'Returns the daily, weekly, and quarterly PDF report schedule and download model for the selected market.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Primary market to anchor the report desk to. Defaults to XAUUSD.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getReportOverview({
      market: String(input?.market || 'XAUUSD').toUpperCase(),
    }),
  },
  {
    name: 'vaultum.prediction_intel',
    title: 'Vaultum Prediction Intel',
    description: 'Returns the live multi-venue prediction-market crowd layer with conviction, longshot/favorite share, spreads, execution cost, fill quality, and venue breakdown.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Primary market to anchor the crowd context to. Defaults to XAUUSD.' },
        query: { type: 'string', description: 'Optional extra query text to narrow the theme.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => listPredictionMarkets({
      market: String(input?.market || 'XAUUSD').toUpperCase(),
      query: typeof input?.query === 'string' ? input.query : undefined,
      mode: 'markets',
    }),
  },
  {
    name: 'vaultum.chart_context',
    title: 'Vaultum Chart Context',
    description: 'Returns the live structure stack behind the chart: pivots, profile, pressure, orderflow, gamma, dealer posture, and Benner context.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Instrument or market symbol. Defaults to XAUUSD.' },
        timeframe: { type: 'string', description: 'Timeframe used by pressure/orderflow/structure tools. Defaults to 1h.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => {
      const market = String(input?.market || 'XAUUSD').toUpperCase();
      const timeframe = normalizeVaultumTimeframe(input?.timeframe);
      const structuralTimeframe = structuralTimeframeFor(timeframe);

      const [profile, pivots, pressure, orderflow, gamma, dealer, flow, benner, entryMap] = await Promise.all([
        getProfile({ market, timeframe: structuralTimeframe }),
        getLevels({ market, timeframe: structuralTimeframe }),
        getBuyerSellerPressure({ market, timeframe, mode: 'auto' }),
        getOrderflowEngine({ market, timeframe }),
        getGammaLevels({ symbol: market }),
        getDealerPressure({ symbol: market }),
        getFlowProxy({ symbol: market }),
        getCycleState({ market }),
        getEntryMap({ market, chartTimeframe: timeframe }),
      ]);

      return {
        generatedAt: new Date().toISOString(),
        market,
        timeframe,
        profile,
        pivots,
        pressure,
        orderflow,
        gamma,
        dealer,
        flow,
        benner,
        entryMap,
      };
    },
  },
  {
    name: 'vaultum.x_intel',
    title: 'Vaultum X Intelligence',
    description: 'Returns the dedicated tracked-account X/Twitter layer with market-aware relevance, bias, engagement, and impact scoring for fast finance headlines.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Primary market such as XAUUSD, US30, GBPUSD, EURUSD, USDJPY, or GBPJPY.' },
        timeframe: { type: 'string', description: 'Workflow timeframe such as 15m, 1h, or 4h.' },
        limit: { type: 'number', description: 'Optional number of posts to request from the tracked-account layer.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getXIntel({
      market: String(input?.market || 'XAUUSD').toUpperCase(),
      timeframe: String(input?.timeframe || '1h').toLowerCase(),
      limit: typeof input?.limit === 'number' ? input.limit : undefined,
    }),
  },
  {
    name: 'vaultum.news_intel',
    title: 'Vaultum News Intelligence',
    description: 'Returns structured catalyst sentiment, released-event patterns, smart analysis, and a prediction checklist tied to the selected market without replacing the existing economic calendar.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Primary market such as XAUUSD, US30, GBPUSD, EURUSD, USDJPY, or GBPJPY.' },
        timeframe: { type: 'string', description: 'Workflow timeframe such as 15m, 1h, or 4h.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => getNewsIntel({
      market: String(input?.market || 'XAUUSD').toUpperCase(),
      timeframe: String(input?.timeframe || '1h').toLowerCase(),
    }),
  },
  {
    name: 'vaultum.news_search',
    title: 'Vaultum News Search',
    description: 'Searches Vaultum raw news and document intelligence for headline lookup and supporting catalyst context.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query to run against the intelligence/news layer.' },
        maxRecords: { type: 'number', description: 'Maximum number of records to return. Defaults to 5.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    handler: async (input) => searchNewsDocuments({
      query: String(input?.query || ''),
      maxRecords: Number(input?.maxRecords || 5),
    }),
  },
  {
    name: 'vaultum.cot_summary',
    title: 'Vaultum COT Summary',
    description: 'Returns live official CFTC positioning summary for the requested market.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'COT market key such as GOLD, SILVER, or WTI.' },
      },
      required: ['market'],
      additionalProperties: false,
    },
    handler: async (input) => getCotSummary({ market: String(input?.market || 'GOLD').toUpperCase() }),
  },
  {
    name: 'vaultum.crypto_derivatives',
    title: 'Vaultum Crypto Derivatives Context',
    description: 'Returns CoinAnk-backed crypto derivatives crowd context for supported crypto markets: open interest, liquidations, and net positioning.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Crypto market such as BTCUSD, ETHUSD, SOLUSD, or BTCUSDT.' },
      },
      required: ['market'],
      additionalProperties: false,
    },
    handler: async (input) => getCryptoDerivativesContext({ market: String(input?.market || 'BTCUSD').toUpperCase() }),
  },
  {
    name: 'vaultum.ai.ask',
    title: 'Vaultum Ask AI',
    description: 'Runs the full Vaultum AI stack, including internal tool selection, and returns a structured execution-aware answer.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Natural-language question for the Vaultum AI analyst.' },
        market: { type: 'string', description: 'Optional market focus such as XAUUSD, EURUSD, SPX, or WTI.' },
        timeframe: { type: 'string', description: 'Optional timeframe focus such as 5m, 15m, 1h, 4h, or 1d.' },
      },
      required: ['question'],
      additionalProperties: false,
    },
    handler: async (input) => askVaultum({
      question: String(input?.question || ''),
      market: typeof input?.market === 'string' ? input.market : undefined,
      timeframe: typeof input?.timeframe === 'string' ? input.timeframe : undefined,
    }),
  },
];

const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

export function listVaultumMcpTools(): Array<{ name: string; title: string; description: string; inputSchema: JsonSchema }> {
  return tools.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

export async function callVaultumMcpTool(name: string, input: any): Promise<unknown> {
  const tool = toolMap.get(name);
  if (!tool) throw new Error(`Unknown Vaultum MCP tool: ${name}`);
  return tool.handler(input ?? {});
}
