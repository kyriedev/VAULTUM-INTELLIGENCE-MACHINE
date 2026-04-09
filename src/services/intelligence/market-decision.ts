import { invokeVaultumRpc } from '@/services/rpc';

export type MarketDecisionEngineResponse = {
  generatedAt: string;
  market: string;
  timeframe: string;
  sampleMode?: boolean;
  news: {
    bias: string;
    strength: string;
    confidence: number;
    uiSummary: string;
    derivedMetrics?: {
      narrative?: string;
      dominantAssets?: Array<{ asset: string; score: number }>;
      contradictions?: string[];
      confirmsCurrentMove?: string;
    };
  } | null;
  cot: {
    bias: string;
    strength: string;
    confidence: number;
    uiSummary: string;
    derivedMetrics?: {
      posture?: string;
      hedgerPercentile?: number;
      divergenceScore?: number;
    };
  } | null;
  monteCarloRisk: {
    bias: string;
    strength: string;
    confidence: number;
    uiSummary: string;
    derivedMetrics?: {
      riskLabel?: string;
      survivalProbability?: number;
      probabilityDrawdownGt10?: number;
    };
  } | null;
  options: {
    bias: string;
    strength: string;
    confidence: number;
    uiSummary: string;
    rawInputs?: {
      sourceMode?: string;
      focusStrike?: number | null;
    };
    derivedMetrics?: {
      supportCandidates?: Array<{ strike: number; score: number; role: string; explanation: string }>;
      resistanceCandidates?: Array<{ strike: number; score: number; role: string; explanation: string }>;
      strikePressure?: {
        focusStrike?: number | null;
        pressureRead?: string;
        levelRole?: string;
        confidence?: number;
        summary?: string;
        notes?: string[];
      } | null;
      dealerLogic?: {
        gammaRegime?: string;
        hedgePressure?: string;
        tendency?: string;
        pinRisk?: string;
        confidence?: number;
        label?: string;
      } | null;
    };
  } | null;
  confluence: {
    bias: string;
    strength: string;
    confidence: number;
    summary: string;
    uiSummary: string;
    derivedMetrics: {
      overallBias: string;
      biasStrength: string;
      macroPosture: string;
      riskRegime: string;
      keyLevels: {
        support: number[];
        resistance: number[];
      };
      scenarioA: string;
      scenarioB: string;
      invalidation: string;
      alignmentScore: number;
      effectiveConfidence?: number;
      trustHaircuts?: Array<{
        label: string;
        haircut: number;
        reason: string;
      }>;
    };
  };
  uiSummary: {
    headline: string;
    bullets: string[];
  };
};

export async function fetchMarketDecisionEngine(market: string, timeframe: string): Promise<MarketDecisionEngineResponse | null> {
  return invokeVaultumRpc<MarketDecisionEngineResponse>('intelligence', 'get-market-decision-engine', { market, timeframe });
}

export async function fetchMarketDecisionDemo(scenario?: 'gold' | 'usd' | 'options-screenshot' | 'all'): Promise<any> {
  return invokeVaultumRpc<any>('intelligence', 'get-market-decision-demo', { scenario });
}
