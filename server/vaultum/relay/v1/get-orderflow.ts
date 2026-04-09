import { getOrRefreshRelaySnapshot } from './_cache.ts';
import { RELAY_CONFIG, resolveProxySymbols, resolveRequestedAsset } from './_config.ts';
import { getBinanceSymbolSnapshot, relayRuntimeActive, startBinanceRelayRuntime } from './_binance.ts';
import { buildOrderflowSnapshot } from './_fusion.ts';
import type { RelayOrderflowSnapshot } from './_types.ts';

async function refreshOrderflowSnapshot(asset: string): Promise<RelayOrderflowSnapshot> {
  const requestedAsset = resolveRequestedAsset(asset);
  const proxySymbols = resolveProxySymbols(requestedAsset);
  const warnings: string[] = [];

  if (RELAY_CONFIG.runtimeEnabled && !relayRuntimeActive()) {
    startBinanceRelayRuntime(RELAY_CONFIG.binanceSymbols);
  }

  const snapshots = await Promise.all(proxySymbols.map((symbol) => getBinanceSymbolSnapshot(symbol)));
  return buildOrderflowSnapshot(requestedAsset, proxySymbols, snapshots, 'live', false, warnings);
}

export async function getRelayOrderflowSnapshot(input?: {
  asset?: string;
  forceRefresh?: boolean;
}): Promise<RelayOrderflowSnapshot> {
  const asset = resolveRequestedAsset(input?.asset);
  if (input?.forceRefresh) {
    return refreshOrderflowSnapshot(asset);
  }

  const result = await getOrRefreshRelaySnapshot(
    'orderflow',
    asset,
    () => refreshOrderflowSnapshot(asset),
    RELAY_CONFIG.cacheTtlSeconds,
    RELAY_CONFIG.staleTtlSeconds,
  );

  return {
    ...result.value,
    cacheState: result.cacheState,
    stale: result.stale,
  };
}
