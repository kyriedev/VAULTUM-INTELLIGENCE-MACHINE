import { invokeVaultumRpc } from '@/services/rpc';

export interface OrderflowEngineResponse {
  market: string;
  sourceSymbol: string;
  timeframe: string;
  feedQuality: 'strong' | 'usable' | 'weak';
  mode: 'proxy' | 'estimated';
  sourceLabel: string;
  dominance: string;
  candlePressureScore: number;
  buySellPressure: number;
  aggregateVolumePressure: number;
  aggregateVolumeRelative: number | null;
  aggregateVolumeDominance: string;
  aggregateVolumeLatest: number | null;
  aggregateVolumeRolling: number | null;
  aggregateVolumeLastBarTime: string | null;
  aggregateVolumeSources: Array<{ provider: string; state: string; bars: number; latestVolume: number | null; rollingVolume: number | null; note: string }>;
  secondSourceActive: boolean;
  macroProxyPressure: number;
  macroProxyBias: string;
  bidAskPressureRatio: number;
  quoteImbalance: number;
  exhaustionSignal: string;
  absorptionSignal: string;
  structureState: string;
  price: number;
  sessionVwap: number;
  vwapDeviation: number;
  rangeExpansion: number;
  cumulativeDeltaProxy: number;
  priceDeltaDivergence: string;
  divergenceBias: 'bullish' | 'bearish' | 'neutral';
  divergenceDetail: string;
  priceTrend: 'rising' | 'falling' | 'flat';
  deltaTrend: 'rising' | 'falling' | 'flat';
  sessionLevels: Array<{ session: 'asia' | 'london' | 'new-york'; date: string; high: number; low: number; midpoint: number; range: number }>;
  stopClusterAbove: number | null;
  stopClusterBelow: number | null;
  stopClusterBias: string;
  liquiditySweepRisk: 'elevated' | 'contained';
  liquidityMapSummary: string;
  imbalanceLadder: Array<{ price: number; delta: number; intensity: number }>;
  recentBars: Array<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    delta: number;
    volume: number | null;
    relativeVolume: number;
    intensity: number;
    direction: 'buy' | 'sell' | 'neutral';
  }>;
  footprintBars: Array<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    delta: number;
    volume: number | null;
    relativeVolume: number;
    intensity: number;
    direction: 'buy' | 'sell' | 'neutral';
  }>;
  summary: string;
}

export async function fetchOrderflowEngine(market: string, timeframe: string): Promise<OrderflowEngineResponse | null> {
  return invokeVaultumRpc<OrderflowEngineResponse>('orderflow', 'get-engine', { market, timeframe });
}
