import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { getCrossAssetRegime } from './get-cross-asset-regime';

export async function getSafeHavenPressure(): Promise<any> {
  return getCachedOrCompute(cacheKey('liquidity', 'safe-haven'), async () => {
    const crossAsset = await getCrossAssetRegime();
    const gold = Number(crossAsset?.supporting?.gold ?? 0);
    const vix = Number(crossAsset?.supporting?.vix ?? 0);
    const dxy = Number(crossAsset?.supporting?.dxy ?? 0);
    const us10y = Number(crossAsset?.supporting?.us10y ?? 0);
    const defensiveTone =
      (gold * 1.2)
      + (vix * 0.9)
      + (dxy * 0.7)
      + (us10y * 0.4)
      + (crossAsset?.classification === 'RISK_OFF' ? 8 : 0)
      - (crossAsset?.classification === 'RISK_ON' ? 8 : 0);
    const score = Math.max(0, Math.min(100, 50 + defensiveTone * 3));

    return {
      conclusion:
        score >= 62
          ? 'safe-haven demand active'
          : score >= 48
            ? 'safe-haven demand mixed but visible'
            : 'safe-haven demand contained',
      score: Number(score.toFixed(1)),
      drivers: {
        gold: crossAsset?.supporting?.gold ?? null,
        vix: crossAsset?.supporting?.vix ?? null,
        dxy: crossAsset?.supporting?.dxy ?? null,
        us10y: crossAsset?.supporting?.us10y ?? null,
      },
      sourceLabel: 'Safe-haven pressure is now derived from the broker-independent cross-asset regime engine.',
    };
  }, 300);
}
