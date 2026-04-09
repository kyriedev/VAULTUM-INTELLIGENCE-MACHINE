import { buildFeedStatus } from '../_shared/feed-status';
import { getFearGreedIndex } from '../market/v1/get-fear-greed-index';
import { getTradingViewResearch } from '../market/v1/_tradingview';
import { getTwelveDataResearch } from '../market/v1/_twelvedata';
import { getYahooResearch } from '../market/v1/_yahoo-research';
import { getFinnhubResearch } from '../market/v1/_finnhub-research';
import { getNewsIntel } from '../intelligence/v1/get-news-intel';
import { getXIntel } from '../intelligence/v1/get-x-intel';
import { listPredictionMarkets } from '../prediction/v1/list-prediction-markets';
import { getProviderCatalog } from '../system/v1/get-provider-catalog';
import { getDataMoat } from '../system/v1/get-data-moat';
import { getTrustMoat } from '../system/v1/get-trust-moat';
import { getTradingDoctrine } from '../system/v1/get-trading-doctrine';
import { getKnowledgeGraph } from '../system/v1/get-knowledge-graph';
import { getKnowledgeCoverage } from '../system/v1/get-knowledge-coverage';
import { getAgentRulebooks } from '../system/v1/get-agent-rulebooks';
import { getConceptSimulation } from '../system/v1/get-concept-simulation';
import { getAnalystOs } from '../analyst/v1/get-os';

type VaultumMcpResource = {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  read: () => Promise<string>;
};

const resources: VaultumMcpResource[] = [
  {
    uri: 'vaultum://system/overview',
    name: 'Vaultum System Overview',
    description: 'High-level description of the Vaultum terminal stack and how its engines should be interpreted.',
    mimeType: 'text/plain',
    read: async () => [
      'Vaultum is a market-intelligence terminal built around layered context rather than one-shot prediction.',
      'Read the chart and market radar first, then macro drivers, then structure and positioning, then catalyst context, then runtime health.',
      'Orderflow, footprint, and options-flow layers are capability-aware: they should be treated as broker-aware or synthetic when centralized tape is unavailable.',
      'Benner cycle is an educational temporal overlay and must not be treated as a standalone trigger.',
      'AI outputs should be grounded in feed status, structure, pressure, macro regime, positioning, and risk suppression state.',
    ].join('\n'),
  },
  {
    uri: 'vaultum://system/feed-status',
    name: 'Vaultum Feed Status',
    description: 'Live feed, relay, Redis, broker, and fallback status for the running Vaultum deployment.',
    mimeType: 'application/json',
    read: async () => JSON.stringify({
      generatedAt: new Date().toISOString(),
      feedStatus: buildFeedStatus(),
    }, null, 2),
  },
  {
    uri: 'vaultum://system/provider-catalog',
    name: 'Vaultum Provider Catalog',
    description: 'Formal connector registry describing provider roles, runtime state, coverage, and capabilities.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(await getProviderCatalog(), null, 2),
  },
  {
    uri: 'vaultum://system/trading-doctrine',
    name: 'Vaultum Trading Doctrine',
    description: 'Operational market-structure language, macro/FX mechanics, model-selection rules, and MACRO TRENDS source-quality ledger for the default trading anchor.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(await getTradingDoctrine({ market: 'XAUUSD' }), null, 2),
  },
  {
    uri: 'vaultum://system/knowledge-graph',
    name: 'Vaultum Knowledge Graph',
    description: 'Unified ontology map, document evidence ledger, retrieval layer, and agent map for the default trading anchor.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(await getKnowledgeGraph({ market: 'XAUUSD', topN: 6 }), null, 2),
  },
  {
    uri: 'vaultum://system/knowledge-coverage',
    name: 'Vaultum Knowledge Coverage',
    description: 'Validation report for definitions, detection logic, context rules, and failure cases across the default knowledge graph.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(await getKnowledgeCoverage(), null, 2),
  },
  {
    uri: 'vaultum://system/concept-simulation',
    name: 'Vaultum Concept Simulation',
    description: 'Recent-history replay that scores concept stability and model-routing behavior for the default trading anchor.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(await getConceptSimulation({ market: 'XAUUSD', timeframe: '1h' }), null, 2),
  },
  {
    uri: 'vaultum://system/agent-rulebooks',
    name: 'Vaultum Agent Rulebooks',
    description: 'Structure, macro, quant, and execution agent rulebooks for the default trading anchor.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(await getAgentRulebooks({ market: 'XAUUSD' }), null, 2),
  },
  {
    uri: 'vaultum://system/data-moat',
    name: 'Vaultum Data Moat',
    description: 'Data-depth assessment, blindspots, and steering tracks for the default trading anchor.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(await getDataMoat({ market: 'XAUUSD', timeframe: '1h' }), null, 2),
  },
  {
    uri: 'vaultum://system/trust-moat',
    name: 'Vaultum Trust Moat',
    description: 'Source-lineage and fallback-discipline assessment for the default trading anchor.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(await getTrustMoat({ market: 'XAUUSD', timeframe: '1h' }), null, 2),
  },
  {
    uri: 'vaultum://analyst/os',
    name: 'Vaultum Analyst OS',
    description: 'Decision chain, blindspots, and operator workflow for the default trading anchor.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(await getAnalystOs({ market: 'XAUUSD', timeframe: '1h' }), null, 2),
  },
  {
    uri: 'vaultum://market/sentiment',
    name: 'Vaultum Market Sentiment',
    description: 'Live Fear & Greed style composite for the current session.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(await getFearGreedIndex(), null, 2),
  },
  {
    uri: 'vaultum://market/prediction-crowd',
    name: 'Vaultum Prediction Crowd',
    description: 'Live multi-venue prediction-market crowd structure for the default trading anchor.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(await listPredictionMarkets({ market: 'XAUUSD', mode: 'markets' }), null, 2),
  },
  {
    uri: 'vaultum://market/tradingview-research',
    name: 'Vaultum TradingView Research',
    description: 'Supplemental TradingView symbol match and scanner-style technical consensus for the default trading anchor.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(await getTradingViewResearch({ market: 'XAUUSD', timeframe: '1h' }), null, 2),
  },
  {
    uri: 'vaultum://market/twelve-data-research',
    name: 'Vaultum Twelve Data Research',
    description: 'Supplemental Twelve Data indicator, market-state, and symbol-match context for the default trading anchor.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(await getTwelveDataResearch({ market: 'XAUUSD', timeframe: '1h' }), null, 2),
  },
  {
    uri: 'vaultum://market/yahoo-research',
    name: 'Vaultum Yahoo Research',
    description: 'Supplemental Yahoo symbol discovery, catalyst headlines, repaired quote context, and selective stock-board reads for the default trading anchor.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(await getYahooResearch({ market: 'XAUUSD', timeframe: '1h' }), null, 2),
  },
  {
    uri: 'vaultum://market/finnhub-research',
    name: 'Vaultum Finnhub Research',
    description: 'Supplemental Finnhub technical aggregates, support-resistance scans, news sentiment, and event timing for the default trading anchor.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(await getFinnhubResearch({ market: 'XAUUSD', timeframe: '1h' }), null, 2),
  },
  {
    uri: 'vaultum://market/x-intel',
    name: 'Vaultum X Intelligence',
    description: 'Dedicated tracked-account X/Twitter layer for fast finance headlines, policy remarks, and market-moving posts for the default trading anchor.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(await getXIntel({ market: 'XAUUSD', timeframe: '1h' }), null, 2),
  },
  {
    uri: 'vaultum://market/news-intel',
    name: 'Vaultum News Intelligence',
    description: 'Structured catalyst sentiment, released-event patterns, checklist logic, and smart analysis for the default trading anchor.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(await getNewsIntel({ market: 'XAUUSD', timeframe: '1h' }), null, 2),
  },
  {
    uri: 'vaultum://system/tooling-guide',
    name: 'Vaultum Tooling Guide',
    description: 'How tools, resources, and prompts are intended to be used together by AI clients.',
    mimeType: 'text/plain',
    read: async () => [
      'Use vaultum.feed_status before trusting degraded feeds.',
      'Use vaultum.provider_catalog when you need the complete connector map, not just short feed health rows.',
      'Use vaultum.trading_doctrine when you need Vaultum house definitions for market structure, macro pressure/context, forex mechanics, or model-selection rules.',
      'Use vaultum.knowledge_graph when you need the unified ontology map, document evidence ledger, retrieval matches, and agent map.',
      'Use vaultum.knowledge_coverage when you need the validation report across definitions, detection logic, context rules, and failure cases.',
      'Use vaultum.concept_simulation when you need recent historical validation of checklist concepts or model-routing behavior.',
      'Use vaultum.detection_engine when you need concept-to-input and heuristic bindings, not just definitions.',
      'Use vaultum.model_selection_engine when you need regime-based model routing rather than static model preferences.',
      'Use vaultum.agent_rulebooks when you want the structure, macro, quant, and execution agent responsibilities spelled out.',
      'Use vaultum.data_moat when you need the current coverage depth, blindspots, and steering-track view for a workflow.',
      'Use vaultum.trust_moat when source quality, fallback labeling, and truth discipline matter to the answer.',
      'Use vaultum.analyst_os when you want the desk chain reduced to regime, phase, setup, execution, risk, and review.',
      'Use vaultum.fear_greed for a fast sentiment/risk-appetite read.',
      'Use vaultum.tradingview_research for supplemental symbol discovery and scanner-style technical consensus, but never as quote truth.',
      'Use vaultum.twelve_data_research for direct indicator values, market-state context, and an extra technical confirmation layer.',
      'Use vaultum.yahoo_research for Yahoo symbol discovery, catalyst headlines, repaired quote context, and equity/ETF board checks.',
      'Use vaultum.finnhub_research for Finnhub technical aggregates, support-resistance scans, earnings timing, and news sentiment, especially on stocks or mapped ETF proxies.',
      'Use vaultum.x_intel for the dedicated tracked-account X/Twitter layer when fast policy/headline posts can move the market before the calendar catches up.',
      'Use vaultum.news_intel for structured market-aware catalyst sentiment, released-event patterns, and checklist context tied back to the economic calendar.',
      'Use vaultum.prediction_intel when you want live crowd structure, conviction, spreads, and longshot/favorite distribution.',
      'Use vaultum.trader_report for the shared desk-note object that also powers the UI and AI layers.',
      'Use vaultum.reflect_trade_outcome to store what actually happened so similar future setups can recall lessons.',
      'Use vaultum.market_brief for the desk-note style action summary tied to a market.',
      'Use vaultum.market_monitor for broad regime/risk context.',
      'Use vaultum.chart_context for live structure, gamma, pressure, and orderflow context.',
      'Use vaultum.setup_patrol when you need live setup monitoring and an honest chart scan versus auto-pan capability read.',
      'Use vaultum.news_search when you want raw headline/document lookup after reading the structured news-intel layer.',
      'Use vaultum.cot_summary for official positioning context.',
      'Use vaultum.ai.ask when you want Vaultum to run its own internal analyst stack.',
      'Read resources for house rules and terminal interpretation before making trade recommendations.',
    ].join('\n'),
  },
  {
    uri: 'vaultum://benner/guide',
    name: 'Benner Guide',
    description: 'Educational note explaining how to interpret the Benner cycle map inside Vaultum.',
    mimeType: 'text/plain',
    read: async () => [
      'A = Panic years',
      'B = Good times / Sell years',
      'C = Hard times / Buy-Accumulate years',
      'Overlap priority follows A > C > B.',
      'Use Benner as timing context only. It should confirm or warn around macro and structure, not replace them.',
    ].join('\n'),
  },
];

const resourceMap = new Map(resources.map((resource) => [resource.uri, resource]));

export function listVaultumMcpResources(): Array<{ uri: string; name: string; description: string; mimeType: string }> {
  return resources.map(({ uri, name, description, mimeType }) => ({ uri, name, description, mimeType }));
}

export async function readVaultumMcpResource(uri: string): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  const resource = resourceMap.get(uri);
  if (!resource) throw new Error(`Unknown Vaultum MCP resource: ${uri}`);
  return {
    contents: [
      {
        uri: resource.uri,
        mimeType: resource.mimeType,
        text: await resource.read(),
      },
    ],
  };
}
