import {
  buildProviderCatalog,
  finnhubReady,
  fxcmRelayConfigured,
  fxcmTokenPresent,
  oandaReady,
  relayConfigured,
  relaySecretPresent,
  twelveDataReady,
  tradingEconomicsReady,
  type ProviderState,
} from './provider-catalog';

export type FeedState = ProviderState;

export type FeedStatusItem = {
  provider: string;
  role: string;
  state: FeedState;
  detail: string;
};

export {
  relayConfigured,
  relaySecretPresent,
  fxcmRelayConfigured,
  fxcmTokenPresent,
  oandaReady,
  finnhubReady,
  twelveDataReady,
  tradingEconomicsReady,
};

export function describeBrokerStack(): string[] {
  const catalog = buildProviderCatalog();
  return catalog.providers
    .filter((provider) => provider.category === 'relay' || provider.category === 'broker')
    .map((provider) => provider.detail);
}

export function buildFeedStatus(): FeedStatusItem[] {
  const catalog = buildProviderCatalog();
  return catalog.providers
    .filter((provider) => provider.category !== 'ai')
    .map((provider) => ({
    provider: provider.provider,
    role: provider.role,
    state: provider.state,
    detail: provider.detail,
  }));
}
