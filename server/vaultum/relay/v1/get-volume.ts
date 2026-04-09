import { getOrRefreshRelaySnapshot, readRelaySnapshot, setRelaySnapshot } from './_cache.ts';
import { RELAY_CONFIG, resolveRequestedAsset } from './_config.ts';
import { getRelayOrderflowSnapshot } from './get-orderflow.ts';
import type { RelayVolumeSnapshot } from './_types.ts';

type VolumeHistory = {
  values: number[];
};

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

async function loadHistory(asset: string): Promise<number[]> {
  const history = await readRelaySnapshot<VolumeHistory>('volume-history', asset);
  return history?.value?.values ?? [];
}

async function storeHistory(asset: string, values: number[]): Promise<void> {
  await setRelaySnapshot('volume-history', asset, { values: values.slice(-12) }, RELAY_CONFIG.macroStaleTtlSeconds, RELAY_CONFIG.macroStaleTtlSeconds);
}

async function refreshVolumeSnapshot(asset: string): Promise<RelayVolumeSnapshot> {
  const orderflow = await getRelayOrderflowSnapshot({ asset, forceRefresh: true });
  const rollingVolume = orderflow.aggregate.volume ?? 0;
  const history = await loadHistory(asset);
  const baseline = average(history);
  const relativeVolume = baseline > 0 ? rollingVolume / baseline : null;
  await storeHistory(asset, [...history, rollingVolume]);

  return {
    requestedAsset: orderflow.requestedAsset,
    proxySymbols: orderflow.proxySymbols,
    timestamp: orderflow.timestamp,
    aggregate: orderflow.aggregate,
    normalized: orderflow.normalized,
    cacheState: orderflow.cacheState,
    stale: orderflow.stale,
    volumeDelta: orderflow.volumeDelta,
    relativeVolume: relativeVolume != null ? Number(relativeVolume.toFixed(2)) : null,
    rollingVolume: Number(rollingVolume.toFixed(4)),
    providers: orderflow.providers,
    warnings: orderflow.warnings,
  };
}

export async function getRelayVolumeSnapshot(input?: {
  asset?: string;
  forceRefresh?: boolean;
}): Promise<RelayVolumeSnapshot> {
  const asset = resolveRequestedAsset(input?.asset);
  if (input?.forceRefresh) return refreshVolumeSnapshot(asset);

  const result = await getOrRefreshRelaySnapshot(
    'volume',
    asset,
    () => refreshVolumeSnapshot(asset),
    RELAY_CONFIG.cacheTtlSeconds,
    RELAY_CONFIG.staleTtlSeconds,
  );

  return {
    ...result.value,
    cacheState: result.cacheState,
    stale: result.stale,
  };
}
