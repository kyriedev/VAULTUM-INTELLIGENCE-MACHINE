export type TerminalIntent =
  | 'asset-bias'
  | 'macro-regime'
  | 'geopolitical-impact'
  | 'trade-policy-impact'
  | 'prediction-market-context'
  | 'signal-explanation'
  | 'country-brief'
  | 'options-gamma-positioning'
  | 'dealer-pressure'
  | 'cot-positioning'
  | 'liquidity-stress'
  | 'benner-cycle-interpretation'
  | 'volume-profile-interpretation'
  | 'pivot-interpretation'
  | 'buyer-seller-pressure-interpretation'
  | 'cross-asset-correlation'
  | 'execution-guidance'
  | 'document-news-search';

export interface PanelDefinition {
  id: string;
  title: string;
  kicker: string;
  tag: string;
  tone?: 'neutral' | 'bullish' | 'bearish' | 'alert';
}

export interface SearchIndexItem {
  label: string;
  kind: string;
  tags: string[];
}

export interface PanelSnapshot {
  conclusion: string;
  bullets: string[];
  status: 'confirmed' | 'inferred' | 'mixed' | 'stale';
  metrics?: Array<{
    label: string;
    value: string;
    tone?: 'neutral' | 'bullish' | 'bearish' | 'alert';
  }>;
  table?: {
    columns: string[];
    rows: string[][];
  };
  charts?: Array<{
    label: string;
    points: number[];
    tone?: 'neutral' | 'bullish' | 'bearish' | 'alert';
  }>;
  alerts?: string[];
}

export interface EngineOutput {
  score: number;
  state: string;
  bias: string;
  confidence: 'low' | 'medium' | 'high';
  supportingFeatures: string[];
  invalidationConditions: string[];
  freshnessWarnings: string[];
}

export interface MarketContext {
  marketRegime: string;
  goldBias: string;
  fxBiasMap: Record<string, string>;
  volatilityState: string;
  geopoliticalPressureState: string;
  positioningState: string;
  optionsState: string;
  executionCautionState: string;
}

export interface DecisionGuidance {
  directionalBias: string;
  regimeFit: string;
  setupQuality: string;
  confirmationChecklist: string[];
  invalidationChecklist: string[];
  bestConditionsForEntry: string[];
  avoidTradeConditions: string[];
  confidenceBand: string;
}

export interface RiskAssessment {
  riskScore: number;
  cautionLevel: 'low' | 'moderate' | 'high' | 'extreme';
  sizeAdjustmentHint: string;
  tradeSuppressionFlag: boolean;
  reasonCodes: string[];
}

export interface ExecutionSupportPlan {
  entryZone: string;
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
}

export interface BennerCycleMap {
  market: string;
  year: number;
  regimeCode: string;
  regimeLabel: string;
  activeRegimes: Array<{
    code: string;
    title: string;
    phase: string;
    tone: 'neutral' | 'bullish' | 'bearish' | 'alert';
  }>;
  overlapCount: number;
  overlapLabel: string;
  phase: string;
  bias: string;
  turnWindow: string;
  confidence: string;
  compatibility: string;
  backgroundPriority: string;
  legend: Array<{
    code: string;
    title: string;
    phase: string;
    tone: 'neutral' | 'bullish' | 'bearish' | 'alert';
  }>;
  timeline: Array<{
    year: number;
    label: string;
    isCurrent: boolean;
    regimes: Array<{
      code: string;
      title: string;
      tone: 'neutral' | 'bullish' | 'bearish' | 'alert';
    }>;
  }>;
  macroEvents: Array<{
    date: string;
    title: string;
    tag: string;
    year: number;
    yearsFromCurrent: number;
  }>;
  upcomingRegimes: Array<{
    year: number;
    code: string;
    title: string;
    phase: string;
    yearsAhead: number;
  }>;
  educationalNotice: string;
  notes: string[];
}

export interface BootstrapSnapshot {
  generatedAt: string;
  intent: TerminalIntent;
  primaryAsset: string;
  runtime: {
    mode: string;
    refreshIntervalMs: number;
    feedStatus: Array<{
      provider: string;
      role: string;
      state: string;
      detail: string;
    }>;
  };
  freshness: {
    summary: string;
    warnings: string[];
  };
  conclusion: string;
  supportingSignals: string[];
  caveats: string[];
  confirmationMap: {
    confirm: string[];
    invalidate: string[];
  };
  marketContext?: MarketContext;
  decision?: DecisionGuidance;
  risk?: RiskAssessment;
  execution?: ExecutionSupportPlan;
  bennerCycleMap?: BennerCycleMap;
  panels: Record<string, PanelSnapshot>;
  searchIndex: SearchIndexItem[];
}
