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
  invalidationLevel: string;
  targetLogic: string;
  tradeThesisSummary: string;
  executionChecklist: string[];
  alertConditions: string[];
  sessionTimingNotes: string[];
  doNotExecute: boolean;
}

export interface BootstrapSnapshot {
  generatedAt: string;
  intent: TerminalIntent;
  primaryAsset: string;
  runtime: {
    mode: string;
    refreshIntervalMs: number;
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
  panels: Record<string, PanelSnapshot>;
  searchIndex: SearchIndexItem[];
}
