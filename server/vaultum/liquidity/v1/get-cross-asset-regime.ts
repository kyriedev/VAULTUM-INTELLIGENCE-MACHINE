import { REGIME_PROXY_ORDER, REGIME_CONFIG } from '../../../../src/config/regime.ts';
import { getBrokerVolumeEnhancement } from '../../../../src/lib/market/providers/brokerVolume.ts';
import { getNormalizedProxyBasket } from '../../../../src/lib/market/providers/index.ts';
import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { buildCrossAssetRegimeSnapshot, type CrossAssetRegimeSnapshot } from './_cross-asset-regime-engine';

export async function getCrossAssetRegime(input: {
  market?: string;
} = {}): Promise<CrossAssetRegimeSnapshot> {
  const market = String(input.market || '').trim().toUpperCase() || 'XAUUSD';

  return getCachedOrCompute(cacheKey('liquidity', `cross-asset-regime:${market}`), async () => {
    const [proxyBasket, brokerVolume] = await Promise.all([
      getNormalizedProxyBasket(REGIME_PROXY_ORDER),
      getBrokerVolumeEnhancement(market),
    ]);

    return buildCrossAssetRegimeSnapshot({
      seriesMap: proxyBasket.series,
      providerHealth: proxyBasket.providerHealth,
      brokerVolume,
    });
  }, REGIME_CONFIG.cache.engineTtlSeconds);
}
