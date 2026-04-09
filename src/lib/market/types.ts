export type MarketProviderName = 'finnhub' | 'alphavantage' | 'yahooRelay' | 'brokerVolume';
export type ProviderState = 'active' | 'degraded' | 'stale' | 'inactive' | 'down';
export type NormalizedTimeframe = '1d';
export type AssetClass = 'equity' | 'fx' | 'commodity' | 'rates' | 'crypto' | 'volatility';

export type NormalizedMarketCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type NormalizedMarketSeries = {
  proxyId: string;
  label: string;
  symbol: string;
  sourceSymbol: string;
  assetClass: AssetClass;
  timeframe: NormalizedTimeframe;
  last: number;
  changePct: number | null;
  high: number | null;
  low: number | null;
  rangePct: number | null;
  atr: number | null;
  timestamp: string;
  source: MarketProviderName;
  freshnessMs: number;
  returns: Record<string, number | null>;
  derived: {
    atrExpansion: number | null;
    rangeExpansion: number | null;
    velocity: number | null;
    persistence: number | null;
    reversalPressure: number | null;
  };
  candles: NormalizedMarketCandle[];
  warnings: string[];
};

export type ProviderHealthSnapshot = {
  provider: MarketProviderName;
  state: ProviderState;
  detail: string;
  successes: number;
  failures: number;
  staleHits: number;
  symbols: string[];
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastLatencyMs: number | null;
};

export type ProviderFetchResult = {
  series: NormalizedMarketSeries | null;
  providerHealth: ProviderHealthSnapshot;
};

export type RegimeProxyDefinition = {
  id: string;
  label: string;
  assetClass: AssetClass;
  providerSymbols: Record<Exclude<MarketProviderName, 'brokerVolume'>, string>;
};

export type BrokerVolumeEnhancement = {
  available: boolean;
  state: ProviderState;
  source: string;
  relativeVolume: number | null;
  flowScore: number | null;
  timestamp: string | null;
  warning: string | null;
};
