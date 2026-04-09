import { BasePanel } from '@/components/base/panel';
import { renderPanelShell, renderResponsiveCardGrid, renderSectionStack } from '@/components/layout/primitives';
import { getMarketFocus, subscribeMarketFocus, type MarketFocus } from '@/services/market-focus';
import { fetchTwelveDataResearch, type TwelveDataResearchResponse } from '@/services/twelve-data-research';
import { fetchYahooResearch, type YahooResearchResponse } from '@/services/yahoo-research';
import { fetchFinnhubResearch, type FinnhubResearchResponse } from '@/services/finnhub-research';
import { fetchFinvizResearch, type FinvizResearchResponse } from '@/services/finviz-research';
import { fetchTradingViewResearch, type TradingViewResearchResponse } from '@/services/tradingview-research';
import { mountTradingViewOverviewWidget, mountTradingViewScreenerWidget } from '@/services/tradingview';

type ScreenerPreset = {
  key: string;
  label: string;
  description: string;
  tabs: Array<{
    title: string;
    symbols: Array<{ s: string; d?: string }>;
  }>;
};

type TradingViewWidgetMode = {
  kind: 'screener' | 'overview';
  label: string;
  note: string;
  market?: string;
  defaultScreen?: string;
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
          { s: 'AMEX:UUP', d: 'DXY' },
        ],
      },
      {
        title: 'JPY / Carry',
        symbols: [
          { s: 'FX:USDJPY', d: 'USDJPY' },
          { s: 'FX:EURJPY', d: 'EURJPY' },
          { s: 'FX:GBPJPY', d: 'GBPJPY' },
          { s: 'FX:AUDJPY', d: 'AUDJPY' },
          { s: 'AMEX:VIXY', d: 'VIX' },
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
          { s: 'AMEX:UUP', d: 'DXY' },
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
          { s: 'AMEX:SPY', d: 'SPX' },
          { s: 'NASDAQ:QQQ', d: 'NDX' },
          { s: 'AMEX:DIA', d: 'US30' },
          { s: 'AMEX:UUP', d: 'DXY' },
          { s: 'AMEX:VIXY', d: 'VIX' },
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
  if (/(SPX|NDX|VIX|US30|DJI|DIA)/.test(market)) return PRESETS.stocks;
  return PRESETS.futures;
}

function widgetModeForPreset(preset: ScreenerPreset): TradingViewWidgetMode {
  if (preset.key === 'stocks') {
    return {
      kind: 'screener',
      label: 'Stocks screener',
      market: 'us',
      defaultScreen: 'most_capitalized',
      note: 'Live TradingView stock screener with sortable market-wide rows.',
    };
  }
  if (preset.key === 'forex') {
    return {
      kind: 'screener',
      label: 'Forex screener',
      market: 'forex',
      defaultScreen: 'top_gainers',
      note: 'Live TradingView forex screener with the standard currency-market table.',
    };
  }
  return {
    kind: 'overview',
    label: 'Futures overview',
    note: 'TradingView does not expose a dedicated futures screener embed here, so Vaultum uses a live multi-symbol overview grid for futures.',
  };
}

function recommendationTone(recommendation: string): string {
  if (recommendation === 'strong-buy' || recommendation === 'buy') return 'bullish';
  if (recommendation === 'strong-sell' || recommendation === 'sell') return 'bearish';
  if (recommendation === 'unavailable') return 'mixed';
  return 'neutral';
}

export class TradingViewScreenerPanel extends BasePanel {
  private marketFocus: MarketFocus = getMarketFocus();
  private selectedPresetKey = presetForMarket(this.marketFocus.market).key;
  private readonly containerId = 'vaultum-screener-widget';
  private renderVersion = 0;
  private research: TradingViewResearchResponse | null = null;
  private researchLoading = false;
  private researchError = '';
  private loadedResearchKey = '';
  private twelveDataResearch: TwelveDataResearchResponse | null = null;
  private twelveDataLoading = false;
  private twelveDataError = '';
  private loadedTwelveDataKey = '';
  private yahooResearch: YahooResearchResponse | null = null;
  private yahooLoading = false;
  private yahooError = '';
  private loadedYahooKey = '';
  private finnhubResearch: FinnhubResearchResponse | null = null;
  private finnhubLoading = false;
  private finnhubError = '';
  private loadedFinnhubKey = '';
  private finvizResearch: FinvizResearchResponse | null = null;
  private finvizLoading = false;
  private finvizError = '';
  private loadedFinvizKey = '';

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
      void this.ensureResearch(redraw);
      this.mountWidget(body, ++this.renderVersion);
    };

    subscribeMarketFocus((focus) => {
      this.marketFocus = focus;
      this.selectedPresetKey = presetForMarket(focus.market).key;
      this.research = null;
      this.researchError = '';
      this.loadedResearchKey = '';
      this.twelveDataResearch = null;
      this.twelveDataError = '';
      this.loadedTwelveDataKey = '';
      this.yahooResearch = null;
      this.yahooError = '';
      this.loadedYahooKey = '';
      this.finnhubResearch = null;
      this.finnhubError = '';
      this.loadedFinnhubKey = '';
      this.finvizResearch = null;
      this.finvizError = '';
      this.loadedFinvizKey = '';
      redraw();
    });

    redraw();
    return panel;
  }

  protected renderBody(): string {
    const preset = PRESETS[this.selectedPresetKey] ?? presetForMarket(this.marketFocus.market);
    const widgetMode = widgetModeForPreset(preset);
    return renderPanelShell({
      className: 'vaultum-screener-shell',
      content: `
        <div class="vaultum-screener-toolbar">
          ${Object.values(PRESETS).map((candidate) => `
            <button class="vaultum-tv-chip ${candidate.key === preset.key ? 'is-active' : ''}" data-screener-preset="${escapeHtml(candidate.key)}">
              ${escapeHtml(candidate.label)}
            </button>
          `).join('')}
        </div>
        <div class="vaultum-screener-meta">
          <strong>${escapeHtml(preset.description)}</strong>
          <span>Chart focus: ${escapeHtml(this.marketFocus.market)} | ${escapeHtml(this.marketFocus.timeframe.toUpperCase())} | ${escapeHtml(widgetMode.label)}</span>
          <span>${escapeHtml(widgetMode.note)}</span>
        </div>
        ${this.renderResearch()}
        <div id="${this.containerId}" class="vaultum-screener-stage">
          <div class="vaultum-tv-loading">Loading TradingView screener...</div>
        </div>
      `,
    });
  }

  private renderResearch(): string {
    return renderSectionStack({
      className: 'vaultum-screener-sidecar-stack',
      title: 'Screener sidecars',
      description: 'Each research source stays in its own bounded card and scrolls internally when content runs long.',
      content: renderResponsiveCardGrid({
        className: 'vaultum-screener-research-stack-grid',
        minWidth: '220px',
        content: `
          ${this.renderTradingViewResearch()}
          ${this.renderTwelveDataResearch()}
          ${this.renderYahooResearch()}
          ${this.renderFinnhubResearch()}
          ${this.renderFinvizResearch()}
        `,
      }),
    });
  }

  private renderTradingViewResearch(): string {
    if (this.researchLoading && !this.research) {
      return `
        <div class="vaultum-screener-research vaultum-screener-research-block">
          <div class="vaultum-screener-research-hero is-neutral">
            <div>
              <span>TV Research</span>
              <strong>Building supplemental scanner read...</strong>
              <em>Matching the current chart focus to a TradingView symbol and consensus matrix.</em>
            </div>
          </div>
        </div>
      `;
    }

    if (this.researchError && !this.research) {
      return `
        <div class="vaultum-screener-research vaultum-screener-research-block">
          <div class="vaultum-screener-research-hero is-mixed">
            <div>
              <span>TV Research</span>
              <strong>Supplemental scanner read unavailable</strong>
              <em>${escapeHtml(this.researchError)}</em>
            </div>
          </div>
        </div>
      `;
    }

    if (!this.research) {
      return `
        <div class="vaultum-screener-research vaultum-screener-research-block">
          <div class="vaultum-screener-research-hero is-neutral">
            <div>
              <span>TV Research</span>
              <strong>Waiting for the scanner sidecar</strong>
              <em>TradingView research will appear here once the current chart focus is mapped.</em>
            </div>
          </div>
        </div>
      `;
    }

    const tone = this.research.consensus === 'bullish'
      ? 'bullish'
      : this.research.consensus === 'bearish'
        ? 'bearish'
        : this.research.consensus === 'mixed'
          ? 'mixed'
          : 'neutral';

    return `
      <div class="vaultum-screener-research vaultum-screener-research-block">
        <div class="vaultum-screener-research-hero is-${tone}">
          <div>
            <span>TV Research</span>
            <strong>${escapeHtml(this.research.summary)}</strong>
            <em>${escapeHtml(this.research.matchedSymbolId ?? 'symbol unavailable')} | ${escapeHtml(this.research.matchedDescription ?? 'no description')}</em>
          </div>
          <div class="vaultum-screener-research-stack">
            <div class="vaultum-screener-research-chip">
              <span>Selected</span>
              <strong>${escapeHtml(`${this.research.selectedTimeframe} ${this.research.selectedRecommendation}`)}</strong>
            </div>
            <div class="vaultum-screener-research-chip">
              <span>Consensus</span>
              <strong>${escapeHtml(this.research.consensus)}</strong>
            </div>
            <div class="vaultum-screener-research-chip">
              <span>Confidence</span>
              <strong>${escapeHtml(this.research.confidence)}</strong>
            </div>
          </div>
        </div>
        <div class="vaultum-screener-research-grid">
          ${this.research.intervals.map((interval) => `
            <div class="vaultum-screener-research-card is-${recommendationTone(interval.recommendation)}">
              <span>${escapeHtml(interval.label)}</span>
              <strong>${escapeHtml(interval.recommendation)}</strong>
              <em>MA ${escapeHtml(interval.movingAverageRecommendation)} | OSC ${escapeHtml(interval.oscillatorRecommendation)}</em>
            </div>
          `).join('')}
        </div>
        ${this.research.alternatives.length ? `
          <div class="vaultum-screener-research-alts">
            ${this.research.alternatives.slice(0, 5).map((item) => `
              <div class="vaultum-screener-research-alt">
                <strong>${escapeHtml(item.id)}</strong>
                <span>${escapeHtml(item.description)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${this.research.warnings.length ? `
          <div class="vaultum-screener-research-warnings">
            ${this.research.warnings.map((warning) => `<div class="vaultum-screener-research-warning">${escapeHtml(warning)}</div>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderTwelveDataResearch(): string {
    if (this.twelveDataLoading && !this.twelveDataResearch) {
      return `
        <div class="vaultum-screener-research vaultum-screener-research-block">
          <div class="vaultum-screener-research-hero is-neutral">
            <div>
              <span>12D Research</span>
              <strong>Building direct indicator read...</strong>
              <em>Fetching Twelve Data symbol match, indicator values, and market-state context for the active chart focus.</em>
            </div>
          </div>
        </div>
      `;
    }

    if (this.twelveDataError && !this.twelveDataResearch) {
      return `
        <div class="vaultum-screener-research vaultum-screener-research-block">
          <div class="vaultum-screener-research-hero is-mixed">
            <div>
              <span>12D Research</span>
              <strong>Direct indicator read unavailable</strong>
              <em>${escapeHtml(this.twelveDataError)}</em>
            </div>
          </div>
        </div>
      `;
    }

    if (!this.twelveDataResearch) {
      return `
        <div class="vaultum-screener-research vaultum-screener-research-block">
          <div class="vaultum-screener-research-hero is-neutral">
            <div>
              <span>12D Research</span>
              <strong>Waiting for direct indicator data</strong>
              <em>Twelve Data research will appear here once the current chart focus is mapped.</em>
            </div>
          </div>
        </div>
      `;
    }

    const tone = this.twelveDataResearch.consensus === 'bullish'
      ? 'bullish'
      : this.twelveDataResearch.consensus === 'bearish'
        ? 'bearish'
        : this.twelveDataResearch.consensus === 'mixed'
          ? 'mixed'
          : 'neutral';

    return `
      <div class="vaultum-screener-research vaultum-screener-research-block">
        <div class="vaultum-screener-research-hero is-${tone}">
          <div>
            <span>12D Research</span>
            <strong>${escapeHtml(this.twelveDataResearch.summary)}</strong>
            <em>${escapeHtml(this.twelveDataResearch.matchedSymbolId ?? 'symbol unavailable')} | ${escapeHtml(this.twelveDataResearch.matchedDescription ?? 'no description')}</em>
          </div>
          <div class="vaultum-screener-research-stack">
            <div class="vaultum-screener-research-chip">
              <span>Selected</span>
              <strong>${escapeHtml(`${this.twelveDataResearch.selectedInterval} ${this.twelveDataResearch.selectedRecommendation}`)}</strong>
            </div>
            <div class="vaultum-screener-research-chip">
              <span>Session</span>
              <strong>${escapeHtml(this.twelveDataResearch.marketStateLabel ?? 'unknown')}</strong>
            </div>
            <div class="vaultum-screener-research-chip">
              <span>Confidence</span>
              <strong>${escapeHtml(this.twelveDataResearch.confidence)}</strong>
            </div>
          </div>
        </div>
        <div class="vaultum-screener-research-grid">
          ${this.twelveDataResearch.cards.map((card) => `
            <div class="vaultum-screener-research-card is-${escapeHtml(card.tone)}">
              <span>${escapeHtml(card.label)}</span>
              <strong>${escapeHtml(card.value)}</strong>
              <em>${escapeHtml(card.detail)}</em>
            </div>
          `).join('')}
        </div>
        <div class="vaultum-screener-research-alts vaultum-screener-research-alts--compact">
          <div class="vaultum-screener-research-alt">
            <strong>Price / Change</strong>
            <span>${escapeHtml(this.twelveDataResearch.price != null ? this.twelveDataResearch.price.toFixed(2) : 'n/a')} | ${escapeHtml(this.twelveDataResearch.percentChange != null ? `${this.twelveDataResearch.percentChange >= 0 ? '+' : ''}${this.twelveDataResearch.percentChange.toFixed(2)}%` : 'n/a')}</span>
          </div>
          <div class="vaultum-screener-research-alt">
            <strong>RSI / ADX</strong>
            <span>${escapeHtml(this.twelveDataResearch.indicators.rsi != null ? this.twelveDataResearch.indicators.rsi.toFixed(1) : 'n/a')} | ${escapeHtml(this.twelveDataResearch.indicators.adx != null ? this.twelveDataResearch.indicators.adx.toFixed(1) : 'n/a')}</span>
          </div>
          <div class="vaultum-screener-research-alt">
            <strong>MACD Hist</strong>
            <span>${escapeHtml(this.twelveDataResearch.indicators.macdHist != null ? this.twelveDataResearch.indicators.macdHist.toFixed(3) : 'n/a')}</span>
          </div>
          <div class="vaultum-screener-research-alt">
            <strong>EMA50 / EMA200</strong>
            <span>${escapeHtml(this.twelveDataResearch.indicators.ema50 != null ? this.twelveDataResearch.indicators.ema50.toFixed(2) : 'n/a')} | ${escapeHtml(this.twelveDataResearch.indicators.ema200 != null ? this.twelveDataResearch.indicators.ema200.toFixed(2) : 'n/a')}</span>
          </div>
        </div>
        ${this.twelveDataResearch.warnings.length ? `
          <div class="vaultum-screener-research-warnings">
            ${this.twelveDataResearch.warnings.map((warning) => `<div class="vaultum-screener-research-warning">${escapeHtml(warning)}</div>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderYahooResearch(): string {
    if (this.yahooLoading && !this.yahooResearch) {
      return `
        <div class="vaultum-screener-research vaultum-screener-research-block">
          <div class="vaultum-screener-research-hero is-neutral">
            <div>
              <span>Yahoo Research</span>
              <strong>Building catalyst and symbol sidecar...</strong>
              <em>Fetching Yahoo symbol discovery, repaired quote context, fresh headlines, and stock-board reads where relevant.</em>
            </div>
          </div>
        </div>
      `;
    }

    if (this.yahooError && !this.yahooResearch) {
      return `
        <div class="vaultum-screener-research vaultum-screener-research-block">
          <div class="vaultum-screener-research-hero is-mixed">
            <div>
              <span>Yahoo Research</span>
              <strong>Catalyst sidecar unavailable</strong>
              <em>${escapeHtml(this.yahooError)}</em>
            </div>
          </div>
        </div>
      `;
    }

    if (!this.yahooResearch) {
      return `
        <div class="vaultum-screener-research vaultum-screener-research-block">
          <div class="vaultum-screener-research-hero is-neutral">
            <div>
              <span>Yahoo Research</span>
              <strong>Waiting for symbol and catalyst context</strong>
              <em>Yahoo search, headlines, and board reads will appear here once the current chart focus is mapped.</em>
            </div>
          </div>
        </div>
      `;
    }

    const tone = this.yahooResearch.sentiment === 'bullish'
      ? 'bullish'
      : this.yahooResearch.sentiment === 'bearish'
        ? 'bearish'
        : this.yahooResearch.sentiment === 'mixed'
          ? 'mixed'
          : 'neutral';

    return `
      <div class="vaultum-screener-research vaultum-screener-research-block">
        <div class="vaultum-screener-research-hero is-${tone}">
          <div>
            <span>Yahoo Research</span>
            <strong>${escapeHtml(this.yahooResearch.summary)}</strong>
            <em>${escapeHtml(this.yahooResearch.matchedSymbolId ?? 'symbol unavailable')} | ${escapeHtml(this.yahooResearch.matchedDescription ?? 'no description')}</em>
          </div>
          <div class="vaultum-screener-research-stack">
            <div class="vaultum-screener-research-chip">
              <span>Sentiment</span>
              <strong>${escapeHtml(this.yahooResearch.sentiment)}</strong>
            </div>
            <div class="vaultum-screener-research-chip">
              <span>Confidence</span>
              <strong>${escapeHtml(this.yahooResearch.confidence)}</strong>
            </div>
            <div class="vaultum-screener-research-chip">
              <span>Headlines</span>
              <strong>${escapeHtml(String(this.yahooResearch.headlines.length))}</strong>
            </div>
          </div>
        </div>
        <div class="vaultum-screener-research-grid">
          ${this.yahooResearch.cards.map((card) => `
            <div class="vaultum-screener-research-card is-${escapeHtml(card.tone)}">
              <span>${escapeHtml(card.label)}</span>
              <strong>${escapeHtml(card.value)}</strong>
              <em>${escapeHtml(card.detail)}</em>
            </div>
          `).join('')}
        </div>
        <div class="vaultum-screener-research-alts vaultum-screener-research-alts--compact">
          ${(this.yahooResearch.headlines.slice(0, 2)).map((headline) => `
            <div class="vaultum-screener-research-alt">
              <strong>${escapeHtml(headline.publisher ?? 'Yahoo')}</strong>
              <span>${escapeHtml(headline.title)}</span>
            </div>
          `).join('')}
          ${(this.yahooResearch.related.slice(0, 2)).map((item) => `
            <div class="vaultum-screener-research-alt">
              <strong>${escapeHtml(item.symbol)}</strong>
              <span>${escapeHtml(item.name)}</span>
            </div>
          `).join('')}
          ${(this.yahooResearch.boards.slice(0, 1)).map((board) => `
            <div class="vaultum-screener-research-alt">
              <strong>${escapeHtml(board.label)}</strong>
              <span>${escapeHtml(board.items.slice(0, 3).map((item) => item.symbol).join(', '))}</span>
            </div>
          `).join('')}
        </div>
        ${this.yahooResearch.warnings.length ? `
          <div class="vaultum-screener-research-warnings">
            ${this.yahooResearch.warnings.map((warning) => `<div class="vaultum-screener-research-warning">${escapeHtml(warning)}</div>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderFinnhubResearch(): string {
    if (this.finnhubLoading && !this.finnhubResearch) {
      return `
        <div class="vaultum-screener-research vaultum-screener-research-block">
          <div class="vaultum-screener-research-hero is-neutral">
            <div>
              <span>Finnhub Research</span>
              <strong>Building equity and catalyst sidecar...</strong>
              <em>Fetching Finnhub technical aggregates, support/resistance, news sentiment, and event timing for the active market or its mapped proxy.</em>
            </div>
          </div>
        </div>
      `;
    }

    if (this.finnhubError && !this.finnhubResearch) {
      return `
        <div class="vaultum-screener-research vaultum-screener-research-block">
          <div class="vaultum-screener-research-hero is-mixed">
            <div>
              <span>Finnhub Research</span>
              <strong>Equity and catalyst sidecar unavailable</strong>
              <em>${escapeHtml(this.finnhubError)}</em>
            </div>
          </div>
        </div>
      `;
    }

    if (!this.finnhubResearch) {
      return `
        <div class="vaultum-screener-research vaultum-screener-research-block">
          <div class="vaultum-screener-research-hero is-neutral">
            <div>
              <span>Finnhub Research</span>
              <strong>Waiting for technical aggregate and catalyst context</strong>
              <em>Finnhub proxy or direct equity context will appear here once the current chart focus is mapped.</em>
            </div>
          </div>
        </div>
      `;
    }

    const tone = this.finnhubResearch.technicalBias === 'bullish'
      ? 'bullish'
      : this.finnhubResearch.technicalBias === 'bearish'
        ? 'bearish'
        : this.finnhubResearch.technicalBias === 'mixed'
          ? 'mixed'
          : 'neutral';

    return `
      <div class="vaultum-screener-research vaultum-screener-research-block">
        <div class="vaultum-screener-research-hero is-${tone}">
          <div>
            <span>Finnhub Research</span>
            <strong>${escapeHtml(this.finnhubResearch.summary)}</strong>
            <em>${escapeHtml(this.finnhubResearch.matchedSymbolId ?? 'symbol unavailable')} | ${escapeHtml(this.finnhubResearch.proxyLabel ?? this.finnhubResearch.matchedDescription ?? 'no description')}</em>
          </div>
          <div class="vaultum-screener-research-stack">
            <div class="vaultum-screener-research-chip">
              <span>Selected</span>
              <strong>${escapeHtml(`${this.finnhubResearch.selectedResolution} ${this.finnhubResearch.technicalSignal}`)}</strong>
            </div>
            <div class="vaultum-screener-research-chip">
              <span>Session</span>
              <strong>${escapeHtml(this.finnhubResearch.sessionLabel ?? 'unknown')}</strong>
            </div>
            <div class="vaultum-screener-research-chip">
              <span>Confidence</span>
              <strong>${escapeHtml(this.finnhubResearch.confidence)}</strong>
            </div>
          </div>
        </div>
        <div class="vaultum-screener-research-grid">
          ${this.finnhubResearch.cards.map((card) => `
            <div class="vaultum-screener-research-card is-${escapeHtml(card.tone)}">
              <span>${escapeHtml(card.label)}</span>
              <strong>${escapeHtml(card.value)}</strong>
              <em>${escapeHtml(card.detail)}</em>
            </div>
          `).join('')}
        </div>
        <div class="vaultum-screener-research-alts vaultum-screener-research-alts--compact">
          <div class="vaultum-screener-research-alt">
            <strong>Support / Resistance</strong>
            <span>${escapeHtml(this.finnhubResearch.levels.support != null ? this.finnhubResearch.levels.support.toFixed(2) : 'n/a')} | ${escapeHtml(this.finnhubResearch.levels.resistance != null ? this.finnhubResearch.levels.resistance.toFixed(2) : 'n/a')}</span>
          </div>
          <div class="vaultum-screener-research-alt">
            <strong>Sentiment</strong>
            <span>${escapeHtml(this.finnhubResearch.sentiment.bullishPercent != null ? `${this.finnhubResearch.sentiment.bullishPercent.toFixed(1)}% bull` : 'n/a')} | ${escapeHtml(this.finnhubResearch.sentiment.bearishPercent != null ? `${this.finnhubResearch.sentiment.bearishPercent.toFixed(1)}% bear` : 'n/a')}</span>
          </div>
          <div class="vaultum-screener-research-alt">
            <strong>Pattern</strong>
            <span>${escapeHtml(this.finnhubResearch.pattern.name ?? this.finnhubResearch.pattern.bias)}</span>
          </div>
          <div class="vaultum-screener-research-alt">
            <strong>Event</strong>
            <span>${escapeHtml(this.finnhubResearch.upcomingEvent ? `${this.finnhubResearch.upcomingEvent.label} ${this.finnhubResearch.upcomingEvent.date}` : 'none')}</span>
          </div>
        </div>
        ${this.finnhubResearch.warnings.length ? `
          <div class="vaultum-screener-research-warnings">
            ${this.finnhubResearch.warnings.map((warning) => `<div class="vaultum-screener-research-warning">${escapeHtml(warning)}</div>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderFinvizResearch(): string {
    if (this.finvizLoading && !this.finvizResearch) {
      return `
        <div class="vaultum-screener-research vaultum-screener-research-block">
          <div class="vaultum-screener-research-hero is-neutral">
            <div>
              <span>Finviz Research</span>
              <strong>Building Finviz sidecar...</strong>
              <em>Loading public-news/blog rows, quote fundamentals, insider tape, forex performance, and broad screener boards.</em>
            </div>
          </div>
        </div>
      `;
    }

    if (this.finvizError && !this.finvizResearch) {
      return `
        <div class="vaultum-screener-research vaultum-screener-research-block">
          <div class="vaultum-screener-research-hero is-mixed">
            <div>
              <span>Finviz Research</span>
              <strong>Finviz sidecar unavailable</strong>
              <em>${escapeHtml(this.finvizError)}</em>
            </div>
          </div>
        </div>
      `;
    }

    if (!this.finvizResearch) {
      return `
        <div class="vaultum-screener-research vaultum-screener-research-block">
          <div class="vaultum-screener-research-hero is-neutral">
            <div>
              <span>Finviz Research</span>
              <strong>Waiting for Finviz workflow context</strong>
              <em>Public Finviz catalysts, quote metrics, insider rows, forex board context, and screener boards will appear here.</em>
            </div>
          </div>
        </div>
      `;
    }

    const tone = this.finvizResearch.sentiment === 'bullish'
      ? 'bullish'
      : this.finvizResearch.sentiment === 'bearish'
        ? 'bearish'
        : this.finvizResearch.sentiment === 'mixed'
          ? 'mixed'
          : 'neutral';

    return `
      <div class="vaultum-screener-research vaultum-screener-research-block">
        <div class="vaultum-screener-research-hero is-${tone}">
          <div>
            <span>Finviz Research</span>
            <strong>${escapeHtml(this.finvizResearch.summary)}</strong>
            <em>${escapeHtml(this.finvizResearch.matchedSymbolId ?? 'symbol unavailable')} | ${escapeHtml(this.finvizResearch.proxyLabel ?? this.finvizResearch.matchedDescription ?? 'no description')}</em>
          </div>
          <div class="vaultum-screener-research-stack">
            <div class="vaultum-screener-research-chip">
              <span>Mode</span>
              <strong>${escapeHtml(this.finvizResearch.proxyMode)}</strong>
            </div>
            <div class="vaultum-screener-research-chip">
              <span>Confidence</span>
              <strong>${escapeHtml(this.finvizResearch.confidence)}</strong>
            </div>
            <div class="vaultum-screener-research-chip">
              <span>Catalysts</span>
              <strong>${escapeHtml(String(this.finvizResearch.quoteNews.length + this.finvizResearch.headlines.length + this.finvizResearch.blogs.length))}</strong>
            </div>
          </div>
        </div>
        <div class="vaultum-screener-research-grid">
          ${this.finvizResearch.cards.map((card) => `
            <div class="vaultum-screener-research-card is-${escapeHtml(card.tone)}">
              <span>${escapeHtml(card.label)}</span>
              <strong>${escapeHtml(card.value)}</strong>
              <em>${escapeHtml(card.detail)}</em>
            </div>
          `).join('')}
        </div>
        <div class="vaultum-screener-research-alts vaultum-screener-research-alts--compact">
          ${(this.finvizResearch.quoteNews.slice(0, 1)).map((headline) => `
            <div class="vaultum-screener-research-alt">
              <strong>${escapeHtml(headline.source || 'Finviz')}</strong>
              <span>${escapeHtml(headline.title)}</span>
            </div>
          `).join('')}
          ${(this.finvizResearch.headlines.slice(0, 1)).map((headline) => `
            <div class="vaultum-screener-research-alt">
              <strong>${escapeHtml(headline.source || 'Finviz News')}</strong>
              <span>${escapeHtml(headline.title)}</span>
            </div>
          `).join('')}
          ${(this.finvizResearch.blogs.slice(0, 1)).map((headline) => `
            <div class="vaultum-screener-research-alt">
              <strong>${escapeHtml(headline.source || 'Finviz Blogs')}</strong>
              <span>${escapeHtml(headline.title)}</span>
            </div>
          `).join('')}
          ${(this.finvizResearch.insider.slice(0, 1)).map((row) => `
            <div class="vaultum-screener-research-alt">
              <strong>${escapeHtml(`${row.ticker} ${row.relationship}`)}</strong>
              <span>${escapeHtml(`${row.transaction} ${row.value}`)}</span>
            </div>
          `).join('')}
          ${(this.finvizResearch.forex.slice(0, 1)).map((row) => `
            <div class="vaultum-screener-research-alt">
              <strong>${escapeHtml(row.pair)}</strong>
              <span>${escapeHtml(`Day ${row.perfDay != null ? `${row.perfDay >= 0 ? '+' : ''}${row.perfDay.toFixed(2)}%` : 'n/a'} | Week ${row.perfWeek != null ? `${row.perfWeek >= 0 ? '+' : ''}${row.perfWeek.toFixed(2)}%` : 'n/a'}`)}</span>
            </div>
          `).join('')}
          ${(this.finvizResearch.screeners.slice(0, 2)).map((board) => `
            <div class="vaultum-screener-research-alt">
              <strong>${escapeHtml(board.label)}</strong>
              <span>${escapeHtml(board.items.slice(0, 3).map((item) => item.ticker).join(', '))}</span>
            </div>
          `).join('')}
        </div>
        ${this.finvizResearch.warnings.length ? `
          <div class="vaultum-screener-research-warnings">
            ${this.finvizResearch.warnings.map((warning) => `<div class="vaultum-screener-research-warning">${escapeHtml(warning)}</div>`).join('')}
          </div>
        ` : ''}
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
    const widgetMode = widgetModeForPreset(preset);
    queueMicrotask(() => {
      if (version !== this.renderVersion) return;
      if (widgetMode.kind === 'screener' && widgetMode.market) {
        mountTradingViewScreenerWidget(target, {
          height: 520,
          colorTheme: 'dark',
          market: widgetMode.market,
          defaultColumn: 'overview',
          defaultScreen: widgetMode.defaultScreen,
          showToolbar: true,
        });
        return;
      }
      mountTradingViewOverviewWidget(target, {
        height: 520,
        colorTheme: 'dark',
        tabs: preset.tabs,
      });
    });
  }

  private async ensureResearch(redraw: () => void): Promise<void> {
    const key = `${this.marketFocus.market}:${this.marketFocus.timeframe}`;
    const tvReady = this.loadedResearchKey === key && (this.research || this.researchError);
    const tdReady = this.loadedTwelveDataKey === key && (this.twelveDataResearch || this.twelveDataError);
    const yahooReady = this.loadedYahooKey === key && (this.yahooResearch || this.yahooError);
    const finnhubReady = this.loadedFinnhubKey === key && (this.finnhubResearch || this.finnhubError);
    const finvizReady = this.loadedFinvizKey === key && (this.finvizResearch || this.finvizError);
    if (this.researchLoading || this.twelveDataLoading || this.yahooLoading || this.finnhubLoading || this.finvizLoading) return;
    if (tvReady && tdReady && yahooReady && finnhubReady && finvizReady) return;

    this.researchLoading = !tvReady;
    this.twelveDataLoading = !tdReady;
    this.yahooLoading = !yahooReady;
    this.finnhubLoading = !finnhubReady;
    this.finvizLoading = !finvizReady;
    if (!tvReady) this.researchError = '';
    if (!tdReady) this.twelveDataError = '';
    if (!yahooReady) this.yahooError = '';
    if (!finnhubReady) this.finnhubError = '';
    if (!finvizReady) this.finvizError = '';
    redraw();

    const tasks: Array<Promise<void>> = [];

    if (!tvReady) {
      tasks.push((async () => {
        try {
          this.research = await fetchTradingViewResearch(this.marketFocus.market, this.marketFocus.timeframe);
          this.loadedResearchKey = key;
          if (!this.research) {
            this.researchError = `No TradingView research returned for ${this.marketFocus.market}.`;
          }
        } catch (error) {
          this.research = null;
          this.loadedResearchKey = key;
          this.researchError = error instanceof Error ? error.message : 'TradingView research request failed.';
        } finally {
          this.researchLoading = false;
        }
      })());
    }

    if (!tdReady) {
      tasks.push((async () => {
        try {
          this.twelveDataResearch = await fetchTwelveDataResearch(this.marketFocus.market, this.marketFocus.timeframe);
          this.loadedTwelveDataKey = key;
          if (!this.twelveDataResearch) {
            this.twelveDataError = `No Twelve Data research returned for ${this.marketFocus.market}.`;
          }
        } catch (error) {
          this.twelveDataResearch = null;
          this.loadedTwelveDataKey = key;
          this.twelveDataError = error instanceof Error ? error.message : 'Twelve Data research request failed.';
        } finally {
          this.twelveDataLoading = false;
        }
      })());
    }

    if (!yahooReady) {
      tasks.push((async () => {
        try {
          this.yahooResearch = await fetchYahooResearch(this.marketFocus.market, this.marketFocus.timeframe);
          this.loadedYahooKey = key;
          if (!this.yahooResearch) {
            this.yahooError = `No Yahoo research returned for ${this.marketFocus.market}.`;
          }
        } catch (error) {
          this.yahooResearch = null;
          this.loadedYahooKey = key;
          this.yahooError = error instanceof Error ? error.message : 'Yahoo research request failed.';
        } finally {
          this.yahooLoading = false;
        }
      })());
    }

    if (!finnhubReady) {
      tasks.push((async () => {
        try {
          this.finnhubResearch = await fetchFinnhubResearch(this.marketFocus.market, this.marketFocus.timeframe);
          this.loadedFinnhubKey = key;
          if (!this.finnhubResearch) {
            this.finnhubError = `No Finnhub research returned for ${this.marketFocus.market}.`;
          }
        } catch (error) {
          this.finnhubResearch = null;
          this.loadedFinnhubKey = key;
          this.finnhubError = error instanceof Error ? error.message : 'Finnhub research request failed.';
        } finally {
          this.finnhubLoading = false;
        }
      })());
    }

    if (!finvizReady) {
      tasks.push((async () => {
        try {
          this.finvizResearch = await fetchFinvizResearch(this.marketFocus.market, this.marketFocus.timeframe);
          this.loadedFinvizKey = key;
          if (!this.finvizResearch) {
            this.finvizError = `No Finviz research returned for ${this.marketFocus.market}.`;
          }
        } catch (error) {
          this.finvizResearch = null;
          this.loadedFinvizKey = key;
          this.finvizError = error instanceof Error ? error.message : 'Finviz research request failed.';
        } finally {
          this.finvizLoading = false;
        }
      })());
    }

    await Promise.all(tasks);
    redraw();
  }
}
