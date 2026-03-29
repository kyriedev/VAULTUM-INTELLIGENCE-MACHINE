import { invokeVaultumRpc } from '@/services/rpc';

export type FearGreedCategory = {
  key: string;
  label: string;
  score: number;
  weight: number;
  contribution: number;
  detail: string;
};

export type FearGreedResponse = {
  generatedAt: string;
  compositeScore: number;
  compositeLabel: string;
  stance: string;
  sourceLabel: string;
  summary: string;
  categories: FearGreedCategory[];
  headerMetrics: Record<string, number>;
  warnings: string[];
  regimes: {
    macro: string;
    liquidity: string;
    crossAsset: string;
  };
  marketSnapshot: Record<string, number>;
};

export async function fetchFearGreed(): Promise<FearGreedResponse | null> {
  return invokeVaultumRpc<FearGreedResponse>('market', 'get-fear-greed-index', {});
}
