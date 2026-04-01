import { invokeVaultumRpc } from '@/services/rpc';

export interface MonteCarloScenarioResponse {
  market: string;
  timeframe: string;
  simulations: number;
  horizonLabel: string;
  pathMethod: string;
  scenarioQuality: 'high' | 'medium' | 'cautious';
  currentPrice: number;
  pathBias: string;
  driftScore: number;
  volatilityScore: number;
  targetLevel: number | null;
  invalidationLevel: number | null;
  supportLevel: number | null;
  supportHoldProbability: number;
  targetHitProbability: number;
  invalidationProbability: number;
  upsideExtensionProbability: number;
  targetFirstProbability: number;
  invalidationFirstProbability: number;
  breakEvenProbability: number;
  medianMaxDrawdownPct: number;
  tailLossPct: number;
  expectedMovePct: number;
  expectedClose: number;
  confidenceBand: string;
  regimeMix: {
    trend: number;
    meanReversion: number;
    shock: number;
  };
  scenarioBands: {
    p05: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
  };
  scenarioMap: Array<{
    name: string;
    probability: number;
    detail: string;
  }>;
  drivers: string[];
  sourceLabel: string;
  summary: string;
}

export async function fetchMonteCarloScenario(market: string, timeframe: string): Promise<MonteCarloScenarioResponse | null> {
  return invokeVaultumRpc<MonteCarloScenarioResponse>('scenario', 'get-monte-carlo', { market, timeframe });
}
