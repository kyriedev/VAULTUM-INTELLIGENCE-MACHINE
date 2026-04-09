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
  mappedSupport: { price: number; touches: number; role: string; power: number; buyersPct?: number; sellersPct?: number; totalVolume?: number; isPoc?: boolean } | null;
  mappedResistance: { price: number; touches: number; role: string; power: number; buyersPct?: number; sellersPct?: number; totalVolume?: number; isPoc?: boolean } | null;
  signalMap: {
    buySignal: boolean;
    sellSignal: boolean;
    bullSweep: boolean;
    bearSweep: boolean;
    bias: string;
    referenceLevel: number | null;
    referenceRole: string | null;
    entrySide?: 'long' | 'short' | 'neutral';
    exitSignal?: boolean;
    reentrySignal?: boolean;
    concentrationPct?: number | null;
  };
  institutionalLevels: Array<{
    price: number;
    touches: number;
    role: string;
    power: number;
    barsSinceLastHit: number;
    buyersPct?: number;
    sellersPct?: number;
    totalVolume?: number;
    isPoc?: boolean;
  }>;
  pocLine?: { price: number; keepPast: boolean } | null;
  dominantVolumeBias?: 'buyers' | 'sellers' | 'balanced';
  valueAreaHigh?: number | null;
  valueAreaLow?: number | null;
  analysisSettings?: {
    mode: 'pivots';
    analyzeBars: number;
    rowCount: number;
    swingLength: number;
    keepPoc: true;
    showPreviousSessions: false;
    volumeWeighting: 'recent';
    rowHeightModel: 'atr-adaptive';
  };
  alerts?: string[];
  volumeRequired?: boolean;
  volumeBacked?: boolean;
  boxes?: {
    short: { upper: number | null; lower: number | null };
    mid: { upper: number | null; lower: number | null };
    long: { upper: number | null; lower: number | null };
  };
  regime?: {
    sourceLabel: string;
    emaAlignment: 'bullish' | 'bearish' | 'mixed';
    regimeLevel: 'narrow' | 'standard' | 'wide' | 'volatile' | 'trending';
    primaryCode: 'TREND_UP' | 'TREND_DOWN' | 'RANGE' | 'TRANSITION' | 'BREAKOUT';
    primaryLabel: string;
    secondaryCode: string;
    secondaryLabel: string;
    adx: number;
    atr14: number;
    atrPct: number;
    bollWidthPct: number;
    rsi14: number;
    macdHistogram: number;
    volatilityState: 'extreme-low' | 'low' | 'normal' | 'high' | 'extreme-high';
    rangePosition: 'upper' | 'middle' | 'lower' | 'squeeze' | 'expand';
    breakout: {
      level: 'none' | 'short' | 'mid' | 'long';
      direction: 'up' | 'down' | 'none';
      state: 'inside' | 'watching' | 'confirmed';
      guidance: 'neutral' | 'long_bias' | 'short_bias' | 'long' | 'short';
    };
    summary: string;
  };
}

export async function fetchPivotLevels(market: string, timeframe: string): Promise<PivotLevelResponse | null> {
  return invokeVaultumRpc<PivotLevelResponse>('pivots', 'get-levels', { market, timeframe });
}
