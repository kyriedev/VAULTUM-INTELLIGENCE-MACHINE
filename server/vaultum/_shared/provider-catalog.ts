declare const process: { env: Record<string, string | undefined> };

import { sharedCacheConfigured, sharedCacheMode } from '../../_shared/redis';

export type ProviderState = 'active' | 'ready' | 'configured' | 'fallback' | 'inactive';

export type VaultumProviderCatalogItem = {
  id: string;
  provider: string;
  category: 'broker' | 'relay' | 'market-data' | 'macro' | 'calendar' | 'cache' | 'ai' | 'media' | 'chart-ui';
  role: string;
  state: ProviderState;
  sourceKind: 'direct' | 'relay' | 'api' | 'cache' | 'ui-only';
  primaryFor: string[];
  covers: string[];
  capabilities: string[];
  credentials: string[];
  detail: string;
  notes: string[];
};

export type VaultumProviderCatalog = {
  generatedAt: string;
  summary: string[];
  providers: VaultumProviderCatalogItem[];
};

function env(name: string): string {
  return (process.env[name] || '').trim();
}

function has(...names: string[]): boolean {
  return names.every((name) => Boolean(env(name)));
}

function any(...names: string[]): boolean {
  return names.some((name) => Boolean(env(name)));
}

function openRouterReady(): boolean {
  return has('OPENROUTER_API_KEY');
}

function groqReady(): boolean {
  return has('GROQ_API_KEY');
}

function ollamaReady(): boolean {
  return Boolean(env('OLLAMA_API_URL') || env('VITE_OLLAMA_API_URL'));
}

export function relayConfigured(): boolean {
  return any('WS_RELAY_URL', 'FXCM_RELAY_URL');
}

export function relaySecretPresent(): boolean {
  return has('RELAY_SHARED_SECRET');
}

export function fxcmRelayConfigured(): boolean {
  return any('FXCM_RELAY_URL', 'WS_RELAY_URL');
}

export function fxcmTokenPresent(): boolean {
  return has('FXCM_API_TOKEN');
}

export function oandaReady(): boolean {
  return has('OANDA_API_KEY', 'OANDA_ACCOUNT_ID');
}

export function finnhubReady(): boolean {
  return has('FINNHUB_API_KEY');
}

export function fredReady(): boolean {
  return has('FRED_API_KEY');
}

export function tradingEconomicsReady(): boolean {
  return has('TRADINGECONOMICS_API_KEY');
}

export function twelveDataReady(): boolean {
  return has('TWELVEDATA_API_KEY');
}

export function tdaReady(): boolean {
  return has('TDA_API_KEY');
}

export function buildProviderCatalog(): VaultumProviderCatalog {
  const relayState: ProviderState = relayConfigured()
    ? 'ready'
    : relaySecretPresent()
      ? 'configured'
      : 'inactive';
  const fxcmState: ProviderState = fxcmRelayConfigured()
    ? 'ready'
    : fxcmTokenPresent()
      ? 'configured'
      : 'inactive';
  const oandaState: ProviderState = oandaReady() ? 'active' : 'inactive';
  const finnhubState: ProviderState = finnhubReady() ? 'configured' : 'inactive';
  const fredState: ProviderState = fredReady() ? 'configured' : 'fallback';
  const teState: ProviderState = tradingEconomicsReady() ? 'configured' : 'fallback';
  const twelveDataState: ProviderState = twelveDataReady() ? 'configured' : 'inactive';
  const tdaState: ProviderState = tdaReady() ? 'configured' : 'inactive';
  const redisState: ProviderState = sharedCacheConfigured() ? 'active' : 'inactive';
  const openRouterState: ProviderState = openRouterReady() ? 'configured' : 'inactive';
  const groqState: ProviderState = groqReady() ? 'configured' : 'inactive';
  const ollamaState: ProviderState = ollamaReady() ? 'ready' : 'inactive';

  const providers: VaultumProviderCatalogItem[] = [
    {
      id: 'relay',
      provider: 'Relay',
      category: 'relay',
      role: 'live stream bridge',
      state: relayState,
      sourceKind: 'relay',
      primaryFor: ['broker normalization', 'stream-safe deployment', 'YouTube live detection'],
      covers: ['FX', 'broker streams', 'live media detection'],
      capabilities: ['normalized stream ingress', 'secret-safe routing', 'shared upstream fan-out'],
      credentials: ['WS_RELAY_URL', 'RELAY_SHARED_SECRET'],
      detail: relayConfigured()
        ? 'Server-side relay is configured for deployment-safe stream normalization.'
        : relaySecretPresent()
          ? 'Relay secret exists, but no relay URL is configured yet.'
          : 'No relay endpoint is configured yet.',
      notes: [
        'Relay is the right place to normalize broker/live sources before they hit Vaultum engines.',
        'Use relay for FXCM promotion and any future datacenter-sensitive stream integrations.',
      ],
    },
    {
      id: 'redis',
      provider: 'Upstash Redis',
      category: 'cache',
      role: 'shared cache',
      state: redisState,
      sourceKind: 'cache',
      primaryFor: ['cross-instance cache', 'stale fallback', 'shared runtime memory'],
      covers: ['all engines', 'API responses', 'AI context reuse'],
      capabilities: ['shared cache', 'stale-on-error fallback', 'cross-instance consistency'],
      credentials: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
      detail: sharedCacheConfigured()
        ? `Shared cache is active in ${sharedCacheMode()} mode with memory as the first layer.`
        : 'Shared Redis cache is not configured; Vaultum is using per-instance memory cache only.',
      notes: [
        'Redis is a major production-grade upgrade over memory-only caching.',
      ],
    },
    {
      id: 'fxcm',
      provider: 'FXCM',
      category: 'broker',
      role: 'preferred broker flow',
      state: fxcmState,
      sourceKind: fxcmRelayConfigured() ? 'relay' : 'direct',
      primaryFor: ['future broker-flow promotion', 'broker-side volume/orderflow'],
      covers: ['FX', 'broker volume context'],
      capabilities: ['broker token auth', 'relay-ready promotion path'],
      credentials: ['FXCM_API_TOKEN', 'FXCM_RELAY_URL', 'WS_RELAY_URL'],
      detail: fxcmRelayConfigured()
        ? 'FXCM relay path is configured and is eligible for the live OTC FX broker-volume composite when relay volume endpoints respond.'
        : fxcmTokenPresent()
          ? 'FXCM token is present, but Vaultum still needs the relay path for deployment-safe FX volume ingestion.'
          : 'No FXCM configuration detected.',
      notes: [
        'FXCM is broker-side flow, not centralized tape.',
        'Vaultum blends FXCM with OANDA for OTC FX volume when both broker paths are available.',
      ],
    },
    {
      id: 'oanda',
      provider: 'OANDA',
      category: 'broker',
      role: 'direct broker feed',
      state: oandaState,
      sourceKind: 'direct',
      primaryFor: ['supported FX quotes', 'supported FX candles', 'broker-aware structure'],
      covers: ['FX', 'broker-quoted spot symbols'],
      capabilities: ['pricing snapshot', 'candle history', 'direct broker auth'],
      credentials: ['OANDA_API_KEY', 'OANDA_ACCOUNT_ID', 'OANDA_API_URL'],
      detail: oandaReady()
        ? 'Direct broker pricing and candles are active for supported symbols, and OANDA can anchor the OTC FX broker-volume composite.'
        : 'No OANDA broker credentials detected.',
      notes: [
        'OANDA is useful broker context, not centralized market-wide tape.',
      ],
    },
    {
      id: 'finnhub',
      provider: 'Finnhub',
      category: 'market-data',
      role: 'equity and trading sidecar',
      state: finnhubState,
      sourceKind: 'api',
      primaryFor: ['cash equities', 'ETF quotes', 'technical sidecar', 'event timing'],
      covers: ['stocks', 'ETFs', 'technical scans', 'earnings timing', 'news sentiment'],
      capabilities: ['quote snapshots', 'equity symbol coverage', 'aggregate technical indicator scan', 'support-resistance scan', 'pattern recognition', 'news sentiment', 'earnings calendar'],
      credentials: ['FINNHUB_API_KEY'],
      detail: finnhubReady()
        ? 'Cash equity and ETF quote path is available, along with Finnhub technical, catalyst, and event-timing sidecars.'
        : 'Finnhub is not configured, so equities fall back where possible.',
      notes: [
        'Finnhub is the primary equity/ETF quote path in Vaultum.',
        'Vaultum also uses Finnhub as a labeled sidecar for technical aggregates, event timing, and news sentiment when that strengthens trading workflow.',
      ],
    },
    {
      id: 'yahoo',
      provider: 'Yahoo Finance',
      category: 'market-data',
      role: 'fallback / futures / indices',
      state: 'fallback',
      sourceKind: 'api',
      primaryFor: ['indices', 'futures', 'DXY', 'quote fallback', 'historical candles', 'symbol discovery', 'catalyst sidecar'],
      covers: ['indices', 'futures', 'FX proxies', 'commodities', 'headline search', 'equity boards'],
      capabilities: ['quote fallback', 'candle history', 'broad symbol coverage', 'search/news endpoint', 'predefined stock boards', 'price-repair normalization'],
      credentials: [],
      detail: 'Fallback and proxy source for indices, futures, DXY, and any missed broker/quote symbols, with supplemental Yahoo search/headline/board context.',
      notes: [
        'Broad coverage makes Yahoo structurally important even when it is not the premium path.',
        'Vaultum now applies yfinance-inspired resampling and repair rules on core Yahoo chart paths instead of taking raw Yahoo candles at face value.',
      ],
    },
    {
      id: 'twelvedata',
      provider: 'Twelve Data',
      category: 'market-data',
      role: 'technical sidecar',
      state: twelveDataState,
      sourceKind: 'api',
      primaryFor: ['technical indicators', 'market-state checks', 'symbol discovery'],
      covers: ['FX', 'indices', 'stocks', 'ETFs', 'technical studies'],
      capabilities: ['indicator endpoints', 'market-state checks', 'symbol search', 'quote/price access', 'options endpoint support'],
      credentials: ['TWELVEDATA_API_KEY'],
      detail: twelveDataReady()
        ? 'Twelve Data is configured as a direct technical-indicator and market-state sidecar.'
        : 'Twelve Data is not configured, so Vaultum technical sidecar reads come from internal engines and TradingView research only.',
      notes: [
        'Treat Twelve Data as supplemental institutional workflow context, not as the only market-data truth source.',
        'Its best use in Vaultum is technical confirmation, symbol discovery, and selective fallback coverage.',
      ],
    },
    {
      id: 'polymarket',
      provider: 'Polymarket',
      category: 'market-data',
      role: 'prediction venue',
      state: 'active',
      sourceKind: 'api',
      primaryFor: ['prediction crowd context', 'event probability reference', 'cross-venue belief checks'],
      covers: ['macro events', 'rates', 'stocks', 'crypto', 'geopolitical catalysts'],
      capabilities: ['public market listing', 'liquidity/volume context', 'finance event coverage'],
      credentials: [],
      detail: 'Polymarket public markets are used as a live crowd-belief and event-risk layer.',
      notes: [
        'Prediction markets are crowd context, not ground truth.',
      ],
    },
    {
      id: 'kalshi',
      provider: 'Kalshi',
      category: 'market-data',
      role: 'prediction venue',
      state: 'active',
      sourceKind: 'api',
      primaryFor: ['prediction crowd context', 'event probability reference', 'spread-cost proxy'],
      covers: ['macro events', 'Fed/CPI/payrolls', 'indices', 'FX', 'commodities'],
      capabilities: ['public market listing', 'open interest context', 'bid/ask spread context'],
      credentials: [],
      detail: 'Kalshi public markets are used as a live crowd-belief and microstructure-aware event layer.',
      notes: [
        'Kalshi adds spread and open-interest context that helps Vaultum grade crowd quality.',
      ],
    },
    {
      id: 'coinank',
      provider: 'CoinAnk',
      category: 'market-data',
      role: 'crypto derivatives context',
      state: 'active',
      sourceKind: 'api',
      primaryFor: ['crypto open interest', 'crypto liquidation context', 'crypto crowd positioning'],
      covers: ['crypto perpetuals', 'exchange-by-exchange OI', 'liquidations', 'net positioning'],
      capabilities: ['public OI aggregates', 'liquidation history', 'net long-short context'],
      credentials: [],
      detail: 'CoinAnk public endpoints are used as a crypto-only derivatives crowd sidecar when the selected market is a supported crypto asset.',
      notes: [
        'CoinAnk strengthens crypto positioning and liquidation context, but it is not used as quote truth for non-crypto markets.',
      ],
    },
    {
      id: 'tda',
      provider: 'TD Ameritrade Chain',
      category: 'market-data',
      role: 'listed options chain overlay',
      state: tdaState,
      sourceKind: 'api',
      primaryFor: ['optional options chain overlay', 'listed-options IV and OI context'],
      covers: ['equities', 'ETFs', 'proxy underlyings'],
      capabilities: ['option chain snapshots', 'IV/OI overlays', 'dealer-structure overlay'],
      credentials: ['TDA_API_KEY'],
      detail: tdaReady()
        ? 'TD Ameritrade-compatible option chain overlay is configured for supported proxy underlyings.'
        : 'No TD Ameritrade-compatible options chain key is configured.',
      notes: [
        'This is an optional overlay path for listed options, not Vaultum’s only options intelligence source.',
      ],
    },
    {
      id: 'fred',
      provider: 'FRED',
      category: 'macro',
      role: 'macro series',
      state: fredState,
      sourceKind: 'api',
      primaryFor: ['rates', 'macro series', 'curve context'],
      covers: ['Treasury yields', 'macro time series'],
      capabilities: ['series lookup', 'historical macro retrieval'],
      credentials: ['FRED_API_KEY'],
      detail: fredReady()
        ? 'FRED macro series are configured for live macro retrieval.'
        : 'FRED key is not configured yet; some macro series may degrade.',
      notes: [
        'FRED is foundational for macro regime and yield-context work.',
      ],
    },
    {
      id: 'tradingeconomics',
      provider: 'Trading Economics',
      category: 'calendar',
      role: 'economic calendar',
      state: teState,
      sourceKind: 'api',
      primaryFor: ['economic calendar', 'event risk'],
      covers: ['FX pairs', 'macro events', 'country releases'],
      capabilities: ['calendar events', 'pair-aware filtering'],
      credentials: ['TRADINGECONOMICS_API_KEY'],
      detail: tradingEconomicsReady()
        ? 'Live economic calendar is using the configured Trading Economics API key.'
        : 'Economic calendar is running in guest mode and may be more rate-limited.',
      notes: [
        'Calendar should be treated as live but more production-safe with a real API key.',
      ],
    },
    {
      id: 'cftc',
      provider: 'CFTC',
      category: 'market-data',
      role: 'official positioning',
      state: 'active',
      sourceKind: 'api',
      primaryFor: ['COT', 'positioning regime'],
      covers: ['futures positioning', 'commercial vs non-commercial data'],
      capabilities: ['official COT ingestion', 'positioning summary transforms'],
      credentials: [],
      detail: 'Official CFTC positioning data is used for live COT-style positioning context.',
      notes: [
        'Vaultum COT is official-data-based, not synthetic.',
      ],
    },
    {
      id: 'bis',
      provider: 'BIS',
      category: 'macro',
      role: 'institutional macro data',
      state: 'active',
      sourceKind: 'api',
      primaryFor: ['policy rates', 'exchange rates', 'credit'],
      covers: ['macro', 'rates', 'credit'],
      capabilities: ['SDMX retrieval', 'institutional macro context'],
      credentials: [],
      detail: 'BIS institutional macro feeds support rates, exchange, and credit context.',
      notes: [
        'BIS gives Vaultum more institutional macro depth than retail news-only stacks.',
      ],
    },
    {
      id: 'openrouter',
      provider: 'OpenRouter',
      category: 'ai',
      role: 'cloud AI fallback',
      state: openRouterState,
      sourceKind: 'api',
      primaryFor: ['cloud reasoning', 'AI fallback chain'],
      covers: ['AI analysis', 'desk-note responses'],
      capabilities: ['remote model access', 'provider fallback'],
      credentials: ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL'],
      detail: openRouterReady()
        ? 'OpenRouter is configured for Vaultum AI fallback.'
        : 'OpenRouter is not configured.',
      notes: [
        'Cloud AI should remain optional behind local or alternate fallbacks.',
      ],
    },
    {
      id: 'groq',
      provider: 'Groq',
      category: 'ai',
      role: 'cloud AI fallback',
      state: groqState,
      sourceKind: 'api',
      primaryFor: ['low-latency reasoning fallback'],
      covers: ['AI analysis'],
      capabilities: ['remote model access'],
      credentials: ['GROQ_API_KEY', 'GROQ_MODEL'],
      detail: groqReady()
        ? 'Groq is configured for Vaultum AI fallback.'
        : 'Groq is not configured.',
      notes: [
        'Groq is a fallback provider, not the only AI path.',
      ],
    },
    {
      id: 'ollama',
      provider: 'Ollama',
      category: 'ai',
      role: 'local AI',
      state: ollamaState,
      sourceKind: 'direct',
      primaryFor: ['local inference', 'desktop/private AI mode'],
      covers: ['AI analysis'],
      capabilities: ['local model runtime'],
      credentials: ['OLLAMA_API_URL'],
      detail: ollamaReady()
        ? 'Ollama endpoint is configured for local-model routing.'
        : 'No Ollama endpoint is configured.',
      notes: [
        'Ollama is the clean local-first path for desktop/private AI.',
      ],
    },
    {
      id: 'youtube',
      provider: 'YouTube Live',
      category: 'media',
      role: 'finance stream panel',
      state: relayConfigured() ? 'ready' : 'fallback',
      sourceKind: relayConfigured() ? 'relay' : 'api',
      primaryFor: ['finance live streams'],
      covers: ['news desk streams', 'market commentary'],
      capabilities: ['live video detection', 'embed-ready stream surfaces'],
      credentials: ['WS_RELAY_URL'],
      detail: relayConfigured()
        ? 'Relay-backed live detection is available for finance stream panels.'
        : 'Finance streams fall back to direct detection, which can be weaker from serverless IPs.',
      notes: [
        'This is media context, not a trading signal feed.',
      ],
    },
    {
      id: 'tradingview',
      provider: 'TradingView',
      category: 'chart-ui',
      role: 'chart rendering',
      state: 'active',
      sourceKind: 'ui-only',
      primaryFor: ['chart UI', 'watchlist widgets', 'screeners', 'supplemental TA research'],
      covers: ['chart rendering', 'screener visuals', 'symbol search', 'scanner consensus'],
      capabilities: ['chart widgets', 'screeners', 'symbol visualization', 'symbol search', 'scanner-based TA sidecar'],
      credentials: [],
      detail: 'TradingView is used as chart UI first and as a supplemental scanner/search sidecar second. It does not supply Vaultum quote truth.',
      notes: [
        'Vaultum’s intelligence comes from its own backend engines, not TradingView data transport.',
      ],
    },
  ];

  const summary = [
    'Vaultum now has a formal provider catalog so feeds, AI, MCP, and runtime UI share the same source-of-truth connector map.',
    'Primary trading flow is broker-aware where possible, API-backed where necessary, and explicit about fallback behavior.',
    'Supported OTC FX volume is strongest when OANDA and FXCM are both live, because Vaultum can blend them into one normalized broker composite.',
    'TradingView remains chart UI first; any symbol-search or scanner research from it is supplemental and never replaces Vaultum quote truth.',
  ];

  return {
    generatedAt: new Date().toISOString(),
    summary,
    providers,
  };
}
