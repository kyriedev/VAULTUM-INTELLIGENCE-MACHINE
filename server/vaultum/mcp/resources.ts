import { buildFeedStatus } from '../_shared/feed-status';
import { getFearGreedIndex } from '../market/v1/get-fear-greed-index';
import { getTradingViewResearch } from '../market/v1/_tradingview';
import { getTwelveDataResearch } from '../market/v1/_twelvedata';
import { getYahooResearch } from '../market/v1/_yahoo-research';
import { getFinnhubResearch } from '../market/v1/_finnhub-research';
import { listPredictionMarkets } from '../prediction/v1/list-prediction-markets';
import { getProviderCatalog } from '../system/v1/get-provider-catalog';

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
    uri: 'vaultum://system/tooling-guide',
    name: 'Vaultum Tooling Guide',
    description: 'How tools, resources, and prompts are intended to be used together by AI clients.',
    mimeType: 'text/plain',
    read: async () => [
      'Use vaultum.feed_status before trusting degraded feeds.',
      'Use vaultum.provider_catalog when you need the complete connector map, not just short feed health rows.',
      'Use vaultum.fear_greed for a fast sentiment/risk-appetite read.',
      'Use vaultum.tradingview_research for supplemental symbol discovery and scanner-style technical consensus, but never as quote truth.',
      'Use vaultum.twelve_data_research for direct indicator values, market-state context, and an extra technical confirmation layer.',
      'Use vaultum.yahoo_research for Yahoo symbol discovery, catalyst headlines, repaired quote context, and equity/ETF board checks.',
      'Use vaultum.finnhub_research for Finnhub technical aggregates, support-resistance scans, earnings timing, and news sentiment, especially on stocks or mapped ETF proxies.',
      'Use vaultum.prediction_intel when you want live crowd structure, conviction, spreads, and longshot/favorite distribution.',
      'Use vaultum.trader_report for the shared desk-note object that also powers the UI and AI layers.',
      'Use vaultum.reflect_trade_outcome to store what actually happened so similar future setups can recall lessons.',
      'Use vaultum.market_brief for the desk-note style action summary tied to a market.',
      'Use vaultum.market_monitor for broad regime/risk context.',
      'Use vaultum.chart_context for live structure, gamma, pressure, and orderflow context.',
      'Use vaultum.news_search when catalyst context matters.',
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
