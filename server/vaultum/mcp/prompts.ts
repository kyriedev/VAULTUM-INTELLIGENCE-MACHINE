type PromptArgument = {
  name: string;
  description: string;
  required?: boolean;
};

type VaultumMcpPrompt = {
  name: string;
  title: string;
  description: string;
  arguments: PromptArgument[];
  render: (args: Record<string, unknown>) => {
    description: string;
    messages: Array<{
      role: 'user' | 'assistant';
      content: { type: 'text'; text: string };
    }>;
  };
};

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

const prompts: VaultumMcpPrompt[] = [
  {
    name: 'vaultum.opening_brief',
    title: 'Vaultum Opening Brief',
    description: 'Prompt template for building a clean pre-session desk brief before looking for entries.',
    arguments: [
      { name: 'market', description: 'Primary market to anchor the opening brief to.', required: true },
      { name: 'timeframe', description: 'Timeframe for structure and scenario context.' },
    ],
    render: (args) => {
      const market = asString(args.market, 'XAUUSD');
      const timeframe = asString(args.timeframe, '1h');
      return {
        description: `Opening brief for ${market}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                `Build the opening desk brief for ${market} on ${timeframe}.`,
                'Use vaultum.feed_status first if feed quality matters.',
                'Use vaultum.provider_catalog if you need the exact connector roles or fallback map.',
                'Use vaultum.fear_greed for overall session sentiment.',
                'Use vaultum.tradingview_research if you want a supplemental scanner-style technical consensus check.',
                'Use vaultum.twelve_data_research if you want direct indicator values and market-state confirmation.',
                'Use vaultum.yahoo_research if you want Yahoo catalyst headlines, symbol discovery, and equity/ETF board context.',
                'Use vaultum.finnhub_research if you want Finnhub technical aggregates, support-resistance scans, earnings timing, and news sentiment.',
                'Use vaultum.prediction_intel if crowd-event pricing matters for the setup.',
                'Use vaultum.trader_report for the shared desk report object.',
                'Use vaultum.market_brief for the market-specific plan.',
                'Use vaultum.chart_context if the trade location needs to be explained.',
                'Return: session bias, best action, major risk watch, and what confirms or invalidates the current read.',
              ].join('\n'),
            },
          },
        ],
      };
    },
  },
  {
    name: 'vaultum.trade_decision',
    title: 'Vaultum Trade Decision',
    description: 'Prompt template for deciding whether a market is offering an entry, exit, trim, or no-trade condition.',
    arguments: [
      { name: 'market', description: 'Primary market or symbol to analyze.', required: true },
      { name: 'timeframe', description: 'Timeframe to anchor structure and orderflow analysis.' },
      { name: 'level', description: 'Specific level under review for entry or exit.' },
    ],
    render: (args) => {
      const market = asString(args.market, 'XAUUSD');
      const timeframe = asString(args.timeframe, '1h');
      const level = asString(args.level, 'not specified');
      return {
        description: `Trade decision workflow for ${market}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                `Analyze ${market} on ${timeframe}.`,
                `Level under review: ${level}.`,
                'Read vaultum.feed_status first if feed quality is uncertain.',
                'Use vaultum.provider_catalog if you need to confirm which source powers the current market context.',
                'Use vaultum.tradingview_research for a secondary scanner-style consensus check when chart structure looks mixed.',
                'Use vaultum.twelve_data_research for direct indicator values, trend-strength checks, and market-state context.',
                'Use vaultum.yahoo_research for catalyst headlines, symbol discovery, and equity/ETF board context.',
                'Use vaultum.finnhub_research for Finnhub technical aggregates, support-resistance scans, earnings timing, and news sentiment.',
                'Use vaultum.chart_context for structure, gamma, pressure, orderflow, and Benner context.',
                'Use vaultum.market_monitor for regime, risk, and liquidity context.',
                'Use vaultum.prediction_intel if event-pricing or crowd conviction could reinforce or weaken the trade idea.',
                'If catalyst context matters, use vaultum.news_search.',
                'Conclude with entry/exit/trim/no-trade, why, what confirms it, what invalidates it, and what would change the view.',
              ].join('\n'),
            },
          },
        ],
      };
    },
  },
  {
    name: 'vaultum.regime_brief',
    title: 'Vaultum Regime Brief',
    description: 'Prompt template for generating a clean desk-note style regime summary before execution decisions are made.',
    arguments: [
      { name: 'market', description: 'Primary market to anchor the brief to.', required: true },
    ],
    render: (args) => {
      const market = asString(args.market, 'XAUUSD');
      return {
        description: `Regime brief for ${market}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                `Build a concise regime brief for ${market}.`,
                'Use vaultum.market_monitor first.',
                'Use vaultum.tradingview_research if you want a secondary technical-consensus sidecar.',
                'Use vaultum.twelve_data_research if you want direct indicator values and session-state confirmation.',
                'Use vaultum.yahoo_research if you want a catalyst and symbol-discovery sidecar from Yahoo.',
                'Use vaultum.finnhub_research if you want Finnhub technical aggregates, earnings timing, and news-sentiment context.',
                'Use vaultum.prediction_intel if event-pricing or crowd conviction could shape the regime read.',
                'Use vaultum.trader_report for the desk summary and execution framing.',
                'Use vaultum.cot_summary if positioning matters for the current thesis.',
                'Use vaultum.chart_context if structure and execution state should be included.',
                'Return: regime, strongest confirming signals, largest caveats, and what the desk should watch next.',
              ].join('\n'),
            },
          },
        ],
      };
    },
  },
  {
    name: 'vaultum.news_catalyst_scan',
    title: 'Vaultum News Catalyst Scan',
    description: 'Prompt template for scanning news and internal intelligence context around a market or theme.',
    arguments: [
      { name: 'query', description: 'Theme, market, or event to scan for.', required: true },
    ],
    render: (args) => {
      const query = asString(args.query, 'gold dollar yields');
      return {
        description: `Catalyst scan for ${query}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                `Search for catalysts around: ${query}.`,
                'Use vaultum.news_search for document/news context.',
                'Cross-check with vaultum.market_monitor so the catalyst scan is tied back to regime and risk.',
                'Return the likely market impact, what is confirmed vs inferred, and whether the catalyst strengthens or weakens the current thesis.',
              ].join('\n'),
            },
          },
        ],
      };
    },
  },
];

const promptMap = new Map(prompts.map((prompt) => [prompt.name, prompt]));

export function listVaultumMcpPrompts(): Array<{ name: string; title: string; description: string; arguments: PromptArgument[] }> {
  return prompts.map(({ name, title, description, arguments: args }) => ({ name, title, description, arguments: args }));
}

export function getVaultumMcpPrompt(name: string, args: Record<string, unknown>): { description: string; messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }> } {
  const prompt = promptMap.get(name);
  if (!prompt) throw new Error(`Unknown Vaultum MCP prompt: ${name}`);
  return prompt.render(args ?? {});
}
