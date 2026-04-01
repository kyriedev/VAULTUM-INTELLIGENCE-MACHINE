type TradingViewWidgetConstructor = new (options: Record<string, unknown>) => unknown;

type TradingViewGlobal = {
  widget: TradingViewWidgetConstructor;
};

export interface TradingViewWidgetConfig {
  containerId: string;
  symbol: string;
  interval: string;
  theme?: 'dark' | 'light';
  toolbarBg?: string;
  allowSymbolChange?: boolean;
  hideTopToolbar?: boolean;
  hideLegend?: boolean;
  hideSideToolbar?: boolean;
  overrides?: Record<string, string | number | boolean>;
}

export interface TradingViewEmbedWidgetConfig {
  width?: string | number;
  height?: string | number;
  locale?: string;
  colorTheme?: 'dark' | 'light';
  tabs?: Array<{
    title: string;
    symbols: Array<{ s: string; d?: string }>;
  }>;
}

declare global {
  interface Window {
    TradingView?: TradingViewGlobal;
    __vaultumTradingViewLoader?: Promise<TradingViewGlobal>;
  }
}

const TRADINGVIEW_SCRIPT_ID = 'vaultum-tradingview-script';
const TRADINGVIEW_SCRIPT_SRC = 'https://s3.tradingview.com/tv.js';
const TRADINGVIEW_EMBED_WIDGET_SRC = 'https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js';

export async function ensureTradingView(): Promise<TradingViewGlobal> {
  if (window.TradingView?.widget) return window.TradingView;
  if (window.__vaultumTradingViewLoader) return window.__vaultumTradingViewLoader;

  window.__vaultumTradingViewLoader = new Promise<TradingViewGlobal>((resolve, reject) => {
    const existing = document.getElementById(TRADINGVIEW_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing && !window.TradingView?.widget) {
      existing.remove();
    }

    const script = document.createElement('script');
    script.id = TRADINGVIEW_SCRIPT_ID;
    script.async = true;
    script.src = TRADINGVIEW_SCRIPT_SRC;
    script.addEventListener('load', () => {
      if (window.TradingView?.widget) resolve(window.TradingView);
      else reject(new Error('TradingView loaded without widget constructor.'));
    }, { once: true });
    script.addEventListener('error', () => reject(new Error('Failed to load TradingView script.')), { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    window.__vaultumTradingViewLoader = undefined;
    throw error;
  });

  return window.__vaultumTradingViewLoader;
}

export function createTradingViewWidget(config: TradingViewWidgetConfig): void {
  if (!window.TradingView?.widget) {
    throw new Error('TradingView is not available.');
  }

  new window.TradingView.widget({
    container_id: config.containerId,
    autosize: true,
    symbol: config.symbol,
    interval: config.interval,
    timezone: 'Etc/UTC',
    theme: config.theme ?? 'dark',
    style: '1',
    locale: 'en',
    toolbar_bg: config.toolbarBg ?? '#101010',
    hide_top_toolbar: config.hideTopToolbar ?? false,
    hide_legend: config.hideLegend ?? false,
    hide_side_toolbar: config.hideSideToolbar ?? false,
    allow_symbol_change: config.allowSymbolChange ?? false,
    save_image: false,
    withdateranges: false,
    studies: [],
    overrides: config.overrides ?? {},
  });
}

export function mountTradingViewOverviewWidget(container: HTMLElement, config: TradingViewEmbedWidgetConfig): void {
  container.innerHTML = '';
  container.classList.add('tradingview-widget-container');

  const host = document.createElement('div');
  host.className = 'tradingview-widget-container__widget';

  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.async = true;
  script.src = TRADINGVIEW_EMBED_WIDGET_SRC;
  script.text = JSON.stringify({
    width: config.width ?? '100%',
    height: config.height ?? '100%',
    locale: config.locale ?? 'en',
    colorTheme: config.colorTheme ?? 'dark',
    showChart: true,
    chartOnly: false,
    showFloatingTooltip: false,
    tabs: config.tabs ?? [],
  });

  container.appendChild(host);
  container.appendChild(script);
}
