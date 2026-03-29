export type MarketFocus = {
  market: string;
  timeframe: string;
};

const EVENT_NAME = 'vaultum:market-focus';

type MarketFocusWindow = Window & {
  __vaultumMarketFocus?: MarketFocus;
};

export function getMarketFocus(): MarketFocus {
  const fallbackAsset = ((import.meta as any).env?.VITE_DEFAULT_ASSET || 'XAUUSD') as string;
  const stored = (window as MarketFocusWindow).__vaultumMarketFocus;
  return stored ?? { market: fallbackAsset.toUpperCase(), timeframe: '1h' };
}

export function publishMarketFocus(focus: MarketFocus): void {
  const normalized = {
    market: String(focus.market || 'XAUUSD').toUpperCase(),
    timeframe: String(focus.timeframe || '1h').toLowerCase(),
  };
  (window as MarketFocusWindow).__vaultumMarketFocus = normalized;
  window.dispatchEvent(new CustomEvent<MarketFocus>(EVENT_NAME, { detail: normalized }));
}

export function subscribeMarketFocus(listener: (focus: MarketFocus) => void): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<MarketFocus>).detail;
    if (!detail) return;
    listener(detail);
  };
  window.addEventListener(EVENT_NAME, handler as EventListener);
  return () => window.removeEventListener(EVENT_NAME, handler as EventListener);
}
