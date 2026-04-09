import { getOrRefreshRelaySnapshot } from './_cache.ts';
import { RELAY_CONFIG, resolveRequestedAsset } from './_config.ts';
import { buildLiquiditySnapshot } from './_fusion.ts';
import { getRelayMacroSnapshot } from './_macro.ts';
import { getTradingViewUnofficialSnapshot } from './_tradingview-unofficial.ts';
import { getRelayOrderflowSnapshot } from './get-orderflow.ts';
import type { RelayLiquiditySnapshot } from './_types.ts';

async function refreshLiquiditySnapshot(asset: string): Promise<RelayLiquiditySnapshot> {
  const [orderflow, macro, unofficialTechnical] = await Promise.all([
    getRelayOrderflowSnapshot({ asset, forceRefresh: true }),
    getRelayMacroSnapshot(),
    getTradingViewUnofficialSnapshot(asset),
  ]);

  return buildLiquiditySnapshot(orderflow, macro, unofficialTechnical, []);
}

export async function getRelayLiquiditySnapshot(input?: {
  asset?: string;
  forceRefresh?: boolean;
}): Promise<RelayLiquiditySnapshot> {
  const asset = resolveRequestedAsset(input?.asset);
  if (input?.forceRefresh) return refreshLiquiditySnapshot(asset);

  const result = await getOrRefreshRelaySnapshot(
    'liquidity',
    asset,
    () => refreshLiquiditySnapshot(asset),
    RELAY_CONFIG.cacheTtlSeconds,
    RELAY_CONFIG.staleTtlSeconds,
  );

  return {
    ...result.value,
    cacheState: result.cacheState,
    stale: result.stale,
  };
}
