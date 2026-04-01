import { invokeVaultumRpc } from '@/services/rpc';

export type LiveCotSummary = {
  market?: string;
  zScore?: number;
  summary?: string;
  nonCommercialLong?: number;
  nonCommercialShort?: number;
  commercialLong?: number;
  commercialShort?: number;
  nonReportableLong?: number;
  nonReportableShort?: number;
  spreading?: number;
  netPosition?: number;
  commercialNetPosition?: number;
  crowdedRisk?: string;
  longShortRatio?: number;
  reportDate?: string;
  source?: string;
  change?: number;
  commercialChange?: number;
  primaryLens?: 'commercials' | 'speculative-crowding';
  commercialSummary?: string;
  marketImpact?: string;
} | null;

export type LiveCotRegime = {
  market?: string;
  regime?: string;
  bias?: string;
  source?: string;
} | null;

export async function fetchCotPositioning(market: string): Promise<{ cot: LiveCotSummary; regime: LiveCotRegime }> {
  const [cot, regime] = await Promise.all([
    invokeVaultumRpc<LiveCotSummary>('positioning', 'get-cot-summary', { market }),
    invokeVaultumRpc<LiveCotRegime>('positioning', 'get-positioning-regime', { market }),
  ]);

  return { cot, regime };
}
