import { getCycleState } from '../benner/v1/get-cycle-state';
import { getEconomicCalendar } from '../calendar/v1/get-economic-calendar';
import { askVaultum } from '../ai/v1/ask-vaultum';
import { getMarketBrief } from '../intelligence/v1/get-market-brief';
import { searchNewsDocuments } from '../intelligence/v1/search-news-documents';
import { getRiskScores } from '../intelligence/v1/get-risk-scores';
import { getLiquidityStress } from '../liquidity/v1/get-liquidity-stress';
import { getMacroSignals } from '../macro/v1/get-macro-signals';
import { getFearGreedIndex } from '../market/v1/get-fear-greed-index';
import { getFlowProxy } from '../options/v1/get-flow-proxy';
import { getGammaLevels } from '../options/v1/get-gamma-levels';
import { getDealerPressure } from '../options/v1/get-dealer-pressure';
import { getOrderflowEngine } from '../orderflow/v1/get-engine';
import { getLevels } from '../pivots/v1/get-levels';
import { getCotSummary } from '../positioning/v1/get-cot-summary';
import { getBuyerSellerPressure } from '../pressure/v1/get-buyer-seller-pressure';
import { getMonteCarloScenario } from '../scenario/v1/get-monte-carlo';
import { listPredictionMarkets } from '../prediction/v1/list-prediction-markets';
import { getProfile } from '../volume/v1/get-profile';
import { buildFeedStatus } from '../_shared/feed-status';

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
    name: 'vaultum.market_brief',
    title: 'Vaultum Market Brief',
    description: 'Returns the live trader-facing desk brief for the selected market with action plan, risk watch, and watchlist context.',
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
    description: 'Returns the core market-monitor stack used by Vaultum: macro regime, risk, liquidity, prediction, and Benner context.',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string', description: 'Primary market to anchor context to. Defaults to XAUUSD.' },
      },
      additionalProperties: false,
    },
    handler: async (input) => {
      const market = String(input?.market || 'XAUUSD').toUpperCase();
      const [macro, risk, liquidity, prediction, benner] = await Promise.all([
        getMacroSignals(),
        getRiskScores(),
        getLiquidityStress(),
        listPredictionMarkets({ query: market.toLowerCase(), mode: 'markets' }),
        getCycleState({ market }),
      ]);

      return {
        generatedAt: new Date().toISOString(),
        market,
        macro,
        risk,
        liquidity,
        prediction,
        benner,
      };
    },
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
      const timeframe = String(input?.timeframe || '1h').toLowerCase();
      const structuralTimeframe = timeframe === '1d' ? '1d' : '1h';

      const [profile, pivots, pressure, orderflow, gamma, dealer, flow, benner] = await Promise.all([
        getProfile({ market, timeframe: structuralTimeframe }),
        getLevels({ market, timeframe: structuralTimeframe }),
        getBuyerSellerPressure({ market, mode: 'auto' }),
        getOrderflowEngine({ market, timeframe }),
        getGammaLevels({ symbol: market }),
        getDealerPressure({ symbol: market }),
        getFlowProxy({ symbol: market }),
        getCycleState({ market }),
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
      };
    },
  },
  {
    name: 'vaultum.news_search',
    title: 'Vaultum News Search',
    description: 'Searches Vaultum news and document intelligence for catalyst context.',
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
    name: 'vaultum.ai.ask',
    title: 'Vaultum Ask AI',
    description: 'Runs the full Vaultum AI stack, including internal tool selection, and returns a structured execution-aware answer.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Natural-language question for the Vaultum AI analyst.' },
      },
      required: ['question'],
      additionalProperties: false,
    },
    handler: async (input) => askVaultum({ question: String(input?.question || '') }),
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
