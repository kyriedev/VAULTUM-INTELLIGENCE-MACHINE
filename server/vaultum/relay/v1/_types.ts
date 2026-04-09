export type RelayUnifiedPoint = {
  timestamp: string;
  asset: string;
  price: number | null;
  volume: number | null;
  buy_volume: number | null;
  sell_volume: number | null;
  source: string;
};

export type RelayCacheState = 'live' | 'stale' | 'miss';

export type RelayProviderState = 'live' | 'rest-fallback' | 'stale' | 'inactive' | 'error' | 'disabled';

export type RelayProviderStatus = {
  provider: string;
  state: RelayProviderState;
  detail: string;
  updatedAt: string | null;
  source: string | null;
};

export type BinanceSymbolSnapshot = {
  symbol: string;
  timestamp: string;
  price: number | null;
  volume: number;
  buy_volume: number;
  sell_volume: number;
  source: 'binance-ws' | 'binance-rest' | 'binance-cache-stale';
  tradeCount: number;
  bidNotional: number;
  askNotional: number;
  liquidityImbalance: number;
  records: RelayUnifiedPoint[];
  provider: RelayProviderStatus;
};

export type RelayOrderflowSnapshot = {
  requestedAsset: string;
  proxySymbols: string[];
  timestamp: string;
  aggregate: RelayUnifiedPoint;
  normalized: RelayUnifiedPoint[];
  cacheState: RelayCacheState;
  stale: boolean;
  price: number | null;
  tradeCount: number;
  volumeDelta: number;
  liquidityImbalance: number;
  directionalBias: 'buyers-dominant' | 'sellers-dominant' | 'balanced';
  bidNotional: number;
  askNotional: number;
  providers: Record<string, RelayProviderStatus>;
  warnings: string[];
};

export type RelayVolumeSnapshot = {
  requestedAsset: string;
  proxySymbols: string[];
  timestamp: string;
  aggregate: RelayUnifiedPoint;
  normalized: RelayUnifiedPoint[];
  cacheState: RelayCacheState;
  stale: boolean;
  volumeDelta: number;
  relativeVolume: number | null;
  rollingVolume: number;
  providers: Record<string, RelayProviderStatus>;
  warnings: string[];
};

export type MacroIndicatorPoint = {
  asset: string;
  value: number | null;
  previous: number | null;
  change: number | null;
  timestamp: string | null;
  source: string;
};

export type RelayMacroSnapshot = {
  timestamp: string;
  normalized: RelayUnifiedPoint[];
  cacheState: RelayCacheState;
  stale: boolean;
  indicators: {
    fred: Record<string, MacroIndicatorPoint>;
    worldBank: Record<string, MacroIndicatorPoint>;
    imf: Record<string, MacroIndicatorPoint>;
    optional: Record<string, MacroIndicatorPoint>;
  };
  providers: Record<string, RelayProviderStatus>;
  warnings: string[];
};

export type TradingViewUnofficialSnapshot = {
  requestedAsset: string;
  matchedSymbolId: string | null;
  recommendation: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell' | 'unavailable';
  score: number | null;
  summary: string;
  source: string;
  warnings: string[];
  provider: RelayProviderStatus;
};

export type SyntheticFxFlowBreakdown = {
  cryptoVolumeScore: number;
  tickScore: number;
  macroWeight: number;
  liquidityScore: number;
  directionScore: number;
};

export type RelayLiquiditySnapshot = {
  requestedAsset: string;
  proxySymbols: string[];
  timestamp: string;
  aggregate: RelayUnifiedPoint;
  normalized: RelayUnifiedPoint[];
  cacheState: RelayCacheState;
  stale: boolean;
  volumeDelta: number;
  liquidityImbalance: number;
  syntheticFxVolumeScore: number;
  syntheticFxVolumeLabel: 'expanding' | 'stable' | 'contracting';
  syntheticFxDirection: 'bullish' | 'bearish' | 'neutral';
  macroSummary: string;
  unofficialTechnical: TradingViewUnofficialSnapshot | null;
  breakdown: SyntheticFxFlowBreakdown;
  providers: Record<string, RelayProviderStatus>;
  warnings: string[];
};
