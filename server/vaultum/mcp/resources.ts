import { buildFeedStatus } from '../_shared/feed-status';
import { getFearGreedIndex } from '../market/v1/get-fear-greed-index';

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
    uri: 'vaultum://market/sentiment',
    name: 'Vaultum Market Sentiment',
    description: 'Live Fear & Greed style composite for the current session.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(await getFearGreedIndex(), null, 2),
  },
  {
    uri: 'vaultum://system/tooling-guide',
    name: 'Vaultum Tooling Guide',
    description: 'How tools, resources, and prompts are intended to be used together by AI clients.',
    mimeType: 'text/plain',
    read: async () => [
      'Use vaultum.feed_status before trusting degraded feeds.',
      'Use vaultum.fear_greed for a fast sentiment/risk-appetite read.',
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
