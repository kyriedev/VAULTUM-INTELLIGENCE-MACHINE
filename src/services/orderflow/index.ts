import { invokeVaultumRpc } from '@/services/rpc';

export interface OrderflowEngineResponse {
  market: string;
  sourceSymbol: string;
  timeframe: string;
  feedQuality: 'strong' | 'usable' | 'weak';
  mode: 'proxy' | 'estimated';
  sourceLabel: string;
  dominance: string;
  buySellPressure: number;
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
  imbalanceLadder: Array<{ price: number; delta: number; intensity: number }>;
  recentBars: Array<{ close: number; delta: number; volume: number | null }>;
  summary: string;
}

export async function fetchOrderflowEngine(market: string, timeframe: string): Promise<OrderflowEngineResponse | null> {
  return invokeVaultumRpc<OrderflowEngineResponse>('orderflow', 'get-engine', { market, timeframe });
}
