import { invokeVaultumRpc } from '@/services/rpc';

export interface EntryMapResponse {
  market: string;
  chartTimeframe: string;
  price: number;
  timeframes: {
    major: string;
    minor: string;
    trigger: string;
  };
  biasLabel: string;
  biasTone: 'bullish' | 'bearish' | 'neutral' | 'alert';
  direction: 'long' | 'short' | 'neutral';
  phase: 'impulse' | 'correction' | 'continuation' | 'reversal' | 'transition';
  readiness: 'ready' | 'watch' | 'stand-aside';
  confidence: number;
  confidenceLabel: 'low' | 'medium' | 'high';
  entryZone: string;
  fibZone: string;
  minorFibZone?: string;
  structureZone?: string;
  trimZone: string;
  noTradeZone: string;
  invalidationLevel: string;
  targetLogic: string;
  tradeThesisSummary: string;
  feedQuality: string;
  orderflowSummary: string;
  executionChecklist: string[];
  alertConditions: string[];
  sessionTimingNotes: string[];
  doNotExecute: boolean;
  executionRead: string;
  chartDirective?: string;
  triggerPattern: string;
  phaseSummary: string;
  biasContext: string;
  macroContext: string;
  macroReflexivity: string;
  macroBlindspots: string[];
  operatorChecklist: Array<{
    key: string;
    label: string;
    status: 'pass' | 'watch' | 'fail';
    detail: string;
  }>;
  explainability: {
    whyValid: string[];
    whatIsMissing: string[];
    whatInvalidates: string[];
  };
  modelSelection: {
    regimeClass: 'trend' | 'mean-reversion' | 'unstable-noise';
    selectedModels: Array<{
      key: string;
      label: string;
      job: string;
      whenItMatters: string;
      whenItDoesNot: string;
      limitations: string[];
    }>;
    avoidPrediction: boolean;
    reactiveMode: boolean;
    confidence: 'low' | 'medium' | 'high';
    reason: string;
    tradeStyle: string;
  };
  precisionEntryPlan: string;
  pyramidingPlan: string;
  preferredEntryLevel: string;
  entryLadder: Array<{
    label: string;
    level: string;
    note: string;
  }>;
  executionLayer: {
    broadZone: string;
    displacementOrigin: string;
    deepestFill: string;
    liquiditySweepLevel: string;
    trueLiquidityLevel: string;
    microShiftLevel: string;
    rankingSummary: string;
    rankedLevels: Array<{
      label: string;
      level: string;
      score: number;
      reason: string;
    }>;
  };
  stopLogic: string;
  majorStructure?: string;
  minorStructure?: string;
  breakOfStructure: string;
  institutionalReference: string;
  institutionalReferenceZone: string;
  premiumDiscountState: string;
  modelTwoConfluenceScore: number;
  modelTwoConfluenceLabel: 'weak' | 'building' | 'strong' | 'sniper-ready';
  modelTwoConfluenceSummary: string;
  footprintConfluence: string;
  absorptionContext: string;
  liquidityTargetContext: string;
  dealerContext: string;
  volumeContext: string;
  structureContext: string;
  contextLines: string[];
  supportingSignals: string[];
  noTradeReasons: string[];
  sourceLabel: string;
  scores: {
    major: number;
    minor: number;
    trigger: number;
    flow: number;
    composite: number;
  };
}

export async function fetchEntryMap(market: string, chartTimeframe: string): Promise<EntryMapResponse | null> {
  return invokeVaultumRpc<EntryMapResponse>('analytics', 'get-entry-map', {
    market,
    chartTimeframe,
    majorTimeframe: '4h',
    minorTimeframe: '15m',
    triggerTimeframe: '5m',
  });
}

export async function fetchEntryMapWithAdaptiveProfile(
  market: string,
  chartTimeframe: string,
  operatorAdaptiveProfile: {
    precisionThreshold?: number;
    participationThreshold?: number;
    preferredFamilies?: string[];
    avoidFamilies?: string[];
  },
): Promise<EntryMapResponse | null> {
  return invokeVaultumRpc<EntryMapResponse>('analytics', 'get-entry-map', {
    market,
    chartTimeframe,
    majorTimeframe: '4h',
    minorTimeframe: '15m',
    triggerTimeframe: '5m',
    operatorAdaptiveProfile,
  });
}
