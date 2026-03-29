import { invokeVaultumRpc } from '@/services/rpc';

export interface PivotLevelResponse {
  market: string;
  symbol: string;
  timeframe: string;
  pivot: number | null;
  supports: number[];
  resistances: number[];
  price: number | null;
  pivotDistance: number | null;
  structure: string;
  sourceLabel?: string;
  dynamicLevel: number | null;
  dynamicState: string;
  confluenceSummary: string;
  mappedSupport: { price: number; touches: number; role: string; power: number } | null;
  mappedResistance: { price: number; touches: number; role: string; power: number } | null;
  signalMap: {
    buySignal: boolean;
    sellSignal: boolean;
    bullSweep: boolean;
    bearSweep: boolean;
    bias: string;
    referenceLevel: number | null;
    referenceRole: string | null;
  };
  institutionalLevels: Array<{
    price: number;
    touches: number;
    role: string;
    power: number;
    barsSinceLastHit: number;
  }>;
}

export async function fetchPivotLevels(market: string, timeframe: string): Promise<PivotLevelResponse | null> {
  return invokeVaultumRpc<PivotLevelResponse>('pivots', 'get-levels', { market, timeframe });
}
