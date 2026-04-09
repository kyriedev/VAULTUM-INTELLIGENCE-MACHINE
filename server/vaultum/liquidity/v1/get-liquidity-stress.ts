import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { getCrossAssetRegime } from './get-cross-asset-regime';

export async function getLiquidityStress(): Promise<any> {
  return getCachedOrCompute(cacheKey('liquidity', 'stress'), async () => {
    const crossAsset = await getCrossAssetRegime();
    const liquidityScore = Number(crossAsset?.componentScores?.liquidityScore ?? 50);
    const confidence = Number(crossAsset?.componentScores?.confidenceScore ?? 50);
    const stressScore = Math.max(0, Math.min(100, 100 - ((liquidityScore * 0.65) + (confidence * 0.35))));
    const conclusion =
      crossAsset?.classification === 'RISK_OFF' || stressScore >= 66
        ? 'liquidity stress elevated'
        : crossAsset?.classification === 'TRANSITION' || stressScore >= 48
          ? 'liquidity stress elevated enough for a watch posture'
          : 'liquidity stress contained-to-moderate';

    return {
      conclusion,
      score: Number(stressScore.toFixed(1)),
      drivers: {
        dxy: crossAsset?.supporting?.dxy ?? null,
        vix: crossAsset?.supporting?.vix ?? null,
        us10y: crossAsset?.supporting?.us10y ?? null,
        jpy: crossAsset?.supporting?.jpy ?? null,
        gold: crossAsset?.supporting?.gold ?? null,
      },
      regime: crossAsset?.classification ?? 'TRANSITION',
      warnings: crossAsset?.warnings ?? [],
    };
  }, 300);
}
