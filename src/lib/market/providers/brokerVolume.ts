declare const process: { env: Record<string, string | undefined> };

import type { BrokerVolumeEnhancement } from '../types.ts';
import { getFxVolumeAggregate } from '../../../../server/vaultum/orderflow/v1/get-fx-volume-aggregate.ts';

function env(name: string): string {
  return (process.env[name] || '').trim();
}

function supportedMarket(market?: string): boolean {
  const value = String(market || '').trim().toUpperCase();
  return ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'GBPJPY', 'EURJPY'].includes(value);
}

export async function getBrokerVolumeEnhancement(market?: string): Promise<BrokerVolumeEnhancement> {
  const normalizedMarket = String(market || '').trim().toUpperCase();
  const relayConfigured = Boolean(env('FXCM_RELAY_URL') || env('WS_RELAY_URL'));
  const brokerConfigured = Boolean(env('OANDA_API_KEY') || relayConfigured);

  if (!normalizedMarket || !supportedMarket(normalizedMarket)) {
    return {
      available: false,
      state: 'inactive',
      source: 'broker-volume',
      relativeVolume: null,
      flowScore: null,
      timestamp: null,
      warning: 'Broker volume enhancement only applies to supported OTC/broker markets and is not required for the core regime model.',
    };
  }

  if (!brokerConfigured) {
    return {
      available: false,
      state: 'inactive',
      source: 'broker-volume',
      relativeVolume: null,
      flowScore: null,
      timestamp: null,
      warning: 'Broker volume enhancement is not configured, so the regime engine stays on synthetic flow only.',
    };
  }

  try {
    const aggregate = await getFxVolumeAggregate({ market: normalizedMarket });
    if (aggregate?.volumeScore == null) {
      return {
        available: false,
        state: 'degraded',
        source: 'broker-volume',
        relativeVolume: null,
        flowScore: null,
        timestamp: aggregate?.sampledAt ?? null,
        warning: aggregate?.sourceLabel ?? 'Broker volume was configured but did not return a usable enhancement.',
      };
    }

    return {
      available: true,
      state: aggregate?.sourceMode === 'multi-broker' || aggregate?.sourceMode === 'synthetic-relay' ? 'active' : 'degraded',
      source: 'broker-volume',
      relativeVolume: aggregate?.relativeVolume ?? null,
      flowScore: aggregate?.volumeScore ?? null,
      timestamp: aggregate?.sampledAt ?? new Date().toISOString(),
      warning: aggregate?.sourceMode === 'multi-broker'
        ? null
        : aggregate?.sourceMode === 'synthetic-relay'
          ? 'Broker-restricted markets are using a synthetic relay flow enhancement instead of direct broker tape volume.'
          : 'Broker volume is running in single-source mode, so it is treated as an optional enhancement only.',
    };
  } catch (error) {
    return {
      available: false,
      state: 'down',
      source: 'broker-volume',
      relativeVolume: null,
      flowScore: null,
      timestamp: null,
      warning: error instanceof Error ? error.message : 'Broker volume enhancement failed and was ignored.',
    };
  }
}
