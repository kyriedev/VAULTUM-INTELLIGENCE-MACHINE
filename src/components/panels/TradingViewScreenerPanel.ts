import { BasePanel } from '@/components/base/panel';
import { getMarketFocus, subscribeMarketFocus, type MarketFocus } from '@/services/market-focus';
import { mountTradingViewOverviewWidget } from '@/services/tradingview';

type ScreenerPreset = {
  key: string;
  label: string;
  description: string;
  tabs: Array<{
    title: string;
    symbols: Array<{ s: string; d?: string }>;
  }>;
};

const PRESETS: Record<string, ScreenerPreset> = {
  forex: {
    key: 'forex',
    label: 'FX',
    description: 'Major FX pairs and dollar filters.',
    tabs: [
      {
        title: 'Majors',
        symbols: [
          { s: 'FX:EURUSD', d: 'EURUSD' },
          { s: 'FX:GBPUSD', d: 'GBPUSD' },
          { s: 'FX:USDJPY', d: 'USDJPY' },
          { s: 'FX:USDCHF', d: 'USDCHF' },
          { s: 'FX:AUDUSD', d: 'AUDUSD' },
          { s: 'TVC:DXY', d: 'DXY' },
        ],
      },
      {
        title: 'JPY / Carry',
        symbols: [
          { s: 'FX:USDJPY', d: 'USDJPY' },
          { s: 'FX:EURJPY', d: 'EURJPY' },
          { s: 'FX:GBPJPY', d: 'GBPJPY' },
          { s: 'FX:AUDJPY', d: 'AUDJPY' },
          { s: 'CBOE:VIX', d: 'VIX' },
          { s: 'TVC:US10Y', d: 'US10Y' },
        ],
      },
    ],
  },
  futures: {
    key: 'futures',
    label: 'Futures',
    description: 'Core macro futures and commodity contracts.',
    tabs: [
      {
        title: 'Macro',
        symbols: [
          { s: 'COMEX:GC1!', d: 'Gold' },
          { s: 'NYMEX:CL1!', d: 'WTI' },
          { s: 'CBOT:ZN1!', d: '10Y Note' },
          { s: 'CME_MINI:ES1!', d: 'ES' },
          { s: 'CME_MINI:NQ1!', d: 'NQ' },
          { s: 'TVC:DXY', d: 'DXY' },
        ],
      },
      {
        title: 'Metals / Energy',
        symbols: [
          { s: 'COMEX:GC1!', d: 'Gold' },
          { s: 'COMEX:SI1!', d: 'Silver' },
          { s: 'COMEX:HG1!', d: 'Copper' },
          { s: 'NYMEX:CL1!', d: 'WTI' },
          { s: 'NYMEX:NG1!', d: 'NatGas' },
          { s: 'ICEUS:B1!', d: 'Brent' },
        ],
      },
    ],
  },
  stocks: {
    key: 'stocks',
    label: 'Stocks',
    description: 'Index leaders, breadth proxies, and rates filters.',
    tabs: [
      {
        title: 'Indices',
        symbols: [
          { s: 'SP:SPX', d: 'SPX' },
          { s: 'NASDAQ:NDX', d: 'NDX' },
          { s: 'AMEX:SPY', d: 'SPY' },
          { s: 'NASDAQ:QQQ', d: 'QQQ' },
          { s: 'CBOE:VIX', d: 'VIX' },
          { s: 'TVC:US10Y', d: 'US10Y' },
        ],
      },
      {
        title: 'Risk / Defense',
        symbols: [
          { s: 'AMEX:XLK', d: 'XLK' },
          { s: 'AMEX:XLF', d: 'XLF' },
          { s: 'AMEX:XLE', d: 'XLE' },
          { s: 'AMEX:XLP', d: 'XLP' },
          { s: 'AMEX:HYG', d: 'HYG' },
          { s: 'NASDAQ:TLT', d: 'TLT' },
        ],
      },
    ],
  },
};

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function presetForMarket(market: string): ScreenerPreset {
  if (/^(EUR|GBP|USD|JPY|AUD|NZD|CAD|CHF)/.test(market)) return PRESETS.forex;
  if (/(WTI|XAU|GOLD|BTC)/.test(market)) return PRESETS.futures;
  if (/(SPX|NDX|VIX)/.test(market)) return PRESETS.stocks;
  return PRESETS.futures;
}

export class TradingViewScreenerPanel extends BasePanel {
  private marketFocus: MarketFocus = getMarketFocus();
  private selectedPresetKey = presetForMarket(this.marketFocus.market).key;
  private readonly containerId = 'vaultum-screener-widget';
  private renderVersion = 0;

  constructor() {
    super({ id: 'tv-screener', title: 'TradingView Screener', kicker: 'Watchlist Matrix', tag: 'screener', tone: 'neutral' });
  }

  render(): HTMLElement {
    const panel = document.createElement('section');
    panel.className = `vaultum-panel ${this.definition.tone ?? 'neutral'}`;
    panel.dataset.panelId = this.definition.id;
    panel.innerHTML = `
      <div class="vaultum-panel-header">
        <div>
          <div class="vaultum-panel-kicker">${this.definition.kicker}</div>
          <h2>${this.definition.title}</h2>
        </div>
        <div class="vaultum-panel-tag">${this.definition.tag}</div>
      </div>
      <div class="vaultum-panel-body"></div>
    `;

    const body = panel.querySelector('.vaultum-panel-body') as HTMLElement;
    const redraw = () => {
      body.innerHTML = this.renderBody();
      this.bindEvents(body, redraw);
      this.mountWidget(body, ++this.renderVersion);
    };

    subscribeMarketFocus((focus) => {
      this.marketFocus = focus;
      this.selectedPresetKey = presetForMarket(focus.market).key;
      redraw();
    });

    redraw();
    return panel;
  }

  protected renderBody(): string {
    const preset = PRESETS[this.selectedPresetKey] ?? presetForMarket(this.marketFocus.market);
    return `
      <div class="vaultum-screener-shell">
        <div class="vaultum-screener-toolbar">
          ${Object.values(PRESETS).map((candidate) => `
            <button class="vaultum-tv-chip ${candidate.key === preset.key ? 'is-active' : ''}" data-screener-preset="${escapeHtml(candidate.key)}">
              ${escapeHtml(candidate.label)}
            </button>
          `).join('')}
        </div>
        <div class="vaultum-screener-meta">
          <strong>${escapeHtml(preset.description)}</strong>
          <span>Chart focus: ${escapeHtml(this.marketFocus.market)} | ${escapeHtml(this.marketFocus.timeframe.toUpperCase())}</span>
        </div>
        <div id="${this.containerId}" class="vaultum-screener-stage">
          <div class="vaultum-tv-loading">Loading TradingView screener...</div>
        </div>
      </div>
    `;
  }

  private bindEvents(root: HTMLElement, redraw: () => void): void {
    root.querySelectorAll<HTMLButtonElement>('[data-screener-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        const presetKey = button.dataset.screenerPreset;
        if (!presetKey || presetKey === this.selectedPresetKey) return;
        this.selectedPresetKey = presetKey;
        redraw();
      });
    });
  }

  private mountWidget(root: HTMLElement, version: number): void {
    const target = root.querySelector(`#${this.containerId}`) as HTMLElement | null;
    if (!target) return;
    const preset = PRESETS[this.selectedPresetKey] ?? presetForMarket(this.marketFocus.market);
    queueMicrotask(() => {
      if (version !== this.renderVersion) return;
      mountTradingViewOverviewWidget(target, {
        height: 520,
        colorTheme: 'dark',
        tabs: preset.tabs,
      });
    });
  }
}
