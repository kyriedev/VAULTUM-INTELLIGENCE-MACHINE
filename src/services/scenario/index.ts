import { invokeVaultumRpc } from '@/services/rpc';

export interface MonteCarloScenarioResponse {
  market: string;
  timeframe: string;
  simulations: number;
  horizonLabel: string;
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
  expectedMovePct: number;
  expectedClose: number;
  confidenceBand: string;
  scenarioBands: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
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
