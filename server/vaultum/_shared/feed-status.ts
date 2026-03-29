declare const process: { env: Record<string, string | undefined> };

import { sharedCacheConfigured, sharedCacheMode } from '../../_shared/redis';

type FeedState = 'active' | 'ready' | 'configured' | 'fallback' | 'inactive';

export type FeedStatusItem = {
  provider: string;
  role: string;
  state: FeedState;
  detail: string;
};

function env(name: string): string {
  return (process.env[name] || '').trim();
}

export function relayConfigured(): boolean {
  return Boolean(env('WS_RELAY_URL') || env('FXCM_RELAY_URL'));
}

export function relaySecretPresent(): boolean {
  return Boolean(env('RELAY_SHARED_SECRET'));
}

export function fxcmRelayConfigured(): boolean {
  return relayConfigured();
}

export function fxcmTokenPresent(): boolean {
  return Boolean(env('FXCM_API_TOKEN'));
}

export function oandaReady(): boolean {
  return Boolean(env('OANDA_API_KEY') && env('OANDA_ACCOUNT_ID'));
}

export function finnhubReady(): boolean {
  return Boolean(env('FINNHUB_API_KEY'));
}

export function tradingEconomicsReady(): boolean {
  return Boolean(env('TRADINGECONOMICS_API_KEY'));
}

export function describeBrokerStack(): string[] {
  return [
    relayConfigured()
      ? 'The live relay tier is configured for broker-safe stream normalization.'
      : 'No live relay tier is configured yet, so Vaultum relies on direct broker/API calls and cached pull-based fallbacks.',
    fxcmRelayConfigured()
      ? 'FXCM relay is configured and can be used as the preferred broker-flow layer when the relay is live.'
      : fxcmTokenPresent()
        ? 'FXCM token is present, but a deployment-safe relay path is not configured yet, so Vaultum does not promote FXCM to the active broker feed.'
        : 'FXCM relay is not configured yet.',
    oandaReady()
      ? 'OANDA is active as the direct broker feed for supported FX and broker-quoted spot symbols.'
      : 'OANDA direct broker feed is not configured.',
  ];
}

export function buildFeedStatus(): FeedStatusItem[] {
  const relayState: FeedState = relayConfigured()
    ? 'ready'
    : relaySecretPresent()
      ? 'configured'
      : 'inactive';
  const fxcmState: FeedState = fxcmRelayConfigured()
    ? 'ready'
    : fxcmTokenPresent()
      ? 'configured'
      : 'inactive';
  const oandaState: FeedState = oandaReady() ? 'active' : 'inactive';
  const finnhubState: FeedState = finnhubReady() ? 'configured' : 'inactive';
  const redisState: FeedState = sharedCacheConfigured() ? 'active' : 'inactive';

  return [
    {
      provider: 'Relay',
      role: 'live stream bridge',
      state: relayState,
      detail: relayConfigured()
        ? 'Server-side relay URL is configured for normalized broker/live stream ingestion.'
        : relaySecretPresent()
          ? 'Relay secret exists, but no relay URL is configured yet.'
          : 'No relay endpoint is configured; Vaultum is running without the shared stream bridge.',
    },
    {
      provider: 'Upstash Redis',
      role: 'shared cache',
      state: redisState,
      detail: sharedCacheConfigured()
        ? `Shared cache is active in ${sharedCacheMode()} mode with memory as the first layer.`
        : 'Shared Redis cache is not configured, so Vaultum is running on per-instance memory cache only.',
    },
    {
      provider: 'FXCM',
      role: 'preferred broker flow',
      state: fxcmState,
      detail: fxcmRelayConfigured()
        ? 'Relay endpoint configured; broker-flow routing can promote FXCM when relay ingestion is available.'
        : fxcmTokenPresent()
          ? 'Token present, but relay not configured for deployment-safe ingestion.'
          : 'No FXCM relay/config detected.',
    },
    {
      provider: 'OANDA',
      role: 'direct broker feed',
      state: oandaState,
      detail: oandaReady()
        ? 'Direct broker pricing and candle path is active for supported symbols.'
        : 'No OANDA account/API credentials detected.',
    },
    {
      provider: 'Finnhub',
      role: 'cash equity feed',
      state: finnhubState,
      detail: finnhubReady()
        ? 'Cash equity and ETF quote path available.'
        : 'Equity/ETF path falls back where possible because Finnhub is not configured.',
    },
    {
      provider: 'Trading Economics',
      role: 'economic calendar',
      state: tradingEconomicsReady() ? 'configured' : 'fallback',
      detail: tradingEconomicsReady()
        ? 'Live economic calendar is using the configured Trading Economics API key.'
        : 'Economic calendar is running in guest-access mode; useful, but more rate-limited than a configured key.',
    },
    {
      provider: 'YouTube Live',
      role: 'finance stream relay',
      state: relayConfigured() ? 'ready' : 'fallback',
      detail: relayConfigured()
        ? 'Relay-backed live detection is available for finance stream panels.'
        : 'Finance streams fall back to direct YouTube live detection, which can be weaker from serverless/datacenter IPs.',
    },
    {
      provider: 'Yahoo',
      role: 'fallback / futures / indices',
      state: 'fallback',
      detail: 'Fallback and proxy source for indices, futures, DXY, and any missed broker/quote symbols.',
    },
  ];
}
