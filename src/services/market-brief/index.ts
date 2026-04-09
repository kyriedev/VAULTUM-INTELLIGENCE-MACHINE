import { invokeVaultumRpc } from '@/services/rpc';

export type MarketBriefWatchItem = {
  symbol: string;
  display: string;
  price: number | null;
  change: number | null;
  stance: 'bullish' | 'neutral' | 'defensive';
  note: string;
};

export type MarketBriefResponse = {
  generatedAt: string;
  market: string;
  timeframe: string;
  structuralTimeframe?: string;
  requestId?: string;
  reportStyle?: 'desk' | 'execution';
  stance: string;
  confidence: string;
  sourceLabel: string;
  sourceTrace?: string[];
  summary: string;
  actionPlan: string;
  riskWatch: string;
  warnings?: string[];
  signalDiagnostics?: Array<{
    key: string;
    label: string;
    confidenceScore: number;
    confidence: 'low' | 'medium' | 'high';
    status: 'confirmed' | 'derived' | 'estimated';
    summary: string;
    sources: string[];
  }>;
  deskRecommendation?: {
    bias: string;
    biasScore: number;
    biasConfidence: 'low' | 'medium' | 'high';
    institutionalSummary: string;
    entrySuggestion: string;
    reEntrySuggestion: string;
    exitSuggestion: string;
    monteCarloSummary: string;
    optionsMathSummary: string;
    quotedEvidence: Array<{
      label: string;
      quote: string;
      source: string;
      status: 'confirmed' | 'derived' | 'estimated';
    }>;
  };
  reportMeasures?: Array<{
    key: string;
    label: string;
    value: string;
    status: 'confirmed' | 'derived' | 'estimated';
    detail: string;
  }>;
  decisionStages?: Array<{
    key: 'analyst-team' | 'technical-committee' | 'bull-case' | 'bear-case' | 'risk-envelope' | 'risk-team' | 'portfolio-manager';
    title: string;
    body: string;
    tone: 'neutral' | 'bullish' | 'bearish' | 'alert';
  }>;
  executionCommittee?: {
    action: 'lean-long' | 'lean-short' | 'wait' | 'stand-down';
    ensembleScore: number;
    summary: string;
    votes: Array<{
      key: string;
      label: string;
      signal: 'bullish' | 'neutral' | 'bearish';
      confidence: number;
      weight: number;
    }>;
  };
  riskEnvelope?: {
    actionMode: 'aggressive' | 'standard' | 'cautious' | 'suppressed';
    sizeBand: 'full' | 'standard' | 'reduced' | 'small' | 'stand-down';
    riskBudgetPct: number;
    riskScore: number;
    tradeSuppression: boolean;
    eventRiskScore: number;
    qualityScore: number;
    volatilityPercentile: number;
    reasons: string[];
    body: string;
  };
  memoryMatches?: Array<{
    createdAt: string;
    outcome: 'win' | 'loss' | 'flat' | 'open' | null;
    similarityScore: number;
    recommendation: string;
  }>;
  sections?: {
    opening: { title: string; body: string; tone: 'neutral' | 'bullish' | 'bearish' | 'alert' };
    structure: { title: string; body: string; tone: 'neutral' | 'bullish' | 'bearish' | 'alert' };
    flow: { title: string; body: string; tone: 'neutral' | 'bullish' | 'bearish' | 'alert' };
    scenario: { title: string; body: string; tone: 'neutral' | 'bullish' | 'bearish' | 'alert' };
    risk: { title: string; body: string; tone: 'neutral' | 'bullish' | 'bearish' | 'alert' };
    execution: { title: string; body: string; tone: 'neutral' | 'bullish' | 'bearish' | 'alert' };
  };
  watchlist: MarketBriefWatchItem[];
  confirmationChecklist: string[];
  invalidationChecklist?: string[];
  metrics: {
    sentiment: number | null;
    sentimentLabel: string;
    macro: string;
    pressure: string;
    orderflow: string;
    targetHitProbability: number | null;
    invalidationProbability: number | null;
  };
};

export async function fetchMarketBrief(market: string, timeframe: string): Promise<MarketBriefResponse | null> {
  return invokeVaultumRpc<MarketBriefResponse>('intelligence', 'get-market-brief', { market, timeframe });
}
