import { renderChartDock, renderModuleCard, renderPanelShell, escapeHtml, type LayoutTone } from '@/components/layout/primitives';
import { BasePanel } from '@/components/base/panel';
import { fetchEntryMap, type EntryMapResponse } from '@/services/entry-map';
import { publishMarketFocus } from '@/services/market-focus';
import { fetchOrderflowEngine, type OrderflowEngineResponse } from '@/services/orderflow';
import { fetchPivotLevels, type PivotLevelResponse } from '@/services/pivots';
import { createTradingViewWidget, ensureTradingView } from '@/services/tradingview';
import type { BootstrapSnapshot } from '@/types';

type ChartPreset = {
  key: string;
  label: string;
  subtitle: string;
  tvSymbol: string;
};

type VolumeRailRow = {
  label: string;
  price: number;
  detail: string;
  tone: 'support' | 'resistance' | 'pivot' | 'dynamic';
};

const CHART_PRESETS: Record<string, ChartPreset> = {
  XAUUSD: { key: 'XAUUSD', label: 'Gold Spot', subtitle: 'Primary asset chart', tvSymbol: 'OANDA:XAUUSD' },
  US30: { key: 'US30', label: 'US 30', subtitle: 'Dow Jones CFD via BlackBull', tvSymbol: 'BLACKBULL:US30' },
  DXY: { key: 'DXY', label: 'Dollar Index', subtitle: 'Macro funding ETF proxy', tvSymbol: 'AMEX:UUP' },
  EURUSD: { key: 'EURUSD', label: 'EUR / USD', subtitle: 'Major FX pair', tvSymbol: 'FX:EURUSD' },
  GBPUSD: { key: 'GBPUSD', label: 'GBP / USD', subtitle: 'Sterling dollar pair', tvSymbol: 'FX:GBPUSD' },
  USDJPY: { key: 'USDJPY', label: 'USD / JPY', subtitle: 'Carry stress proxy', tvSymbol: 'FX:USDJPY' },
  SPX: { key: 'SPX', label: 'S&P 500', subtitle: 'Risk appetite ETF proxy', tvSymbol: 'AMEX:SPY' },
  NDX: { key: 'NDX', label: 'Nasdaq 100', subtitle: 'Growth beta ETF proxy', tvSymbol: 'NASDAQ:QQQ' },
  VIX: { key: 'VIX', label: 'Volatility Index', subtitle: 'Volatility ETP proxy', tvSymbol: 'AMEX:VIXY' },
  WTI: { key: 'WTI', label: 'WTI Crude', subtitle: 'Oil shock proxy', tvSymbol: 'TVC:USOIL' },
  BTCUSD: { key: 'BTCUSD', label: 'BTC / USD', subtitle: 'Crypto risk proxy', tvSymbol: 'BINANCE:BTCUSDT' },
};

const INTERVALS = [
  { key: '5m', tvInterval: '5' },
  { key: '15m', tvInterval: '15' },
  { key: '30m', tvInterval: '30' },
  { key: '1h', tvInterval: '60' },
  { key: '4h', tvInterval: '240' },
  { key: '1d', tvInterval: 'D' },
] as const;

type IntervalKey = typeof INTERVALS[number]['key'];
type ChartMode = 'chart' | 'footprint';

export class LiveChartPanel extends BasePanel {
  private selectedPresetKey: string | null = null;
  private selectedInterval: IntervalKey = '1h';
  private selectedMode: ChartMode = 'chart';
  private widgetError = '';
  private renderVersion = 0;
  private widgetContainerId = 'vaultum-live-chart-widget-0';
  private readonly collapsedDockCards = new Set<string>();
  private orderflowData: OrderflowEngineResponse | null = null;
  private orderflowLoading = false;
  private orderflowError = '';
  private loadedOrderflowKey = '';
  private pivotData: PivotLevelResponse | null = null;
  private pivotLoading = false;
  private pivotError = '';
  private loadedPivotKey = '';
  private entryMapData: EntryMapResponse | null = null;
  private entryMapLoading = false;
  private entryMapError = '';
  private loadedEntryMapKey = '';
  private lastPublishedFocus = '';

  constructor() {
    super({ id: 'live-chart', title: 'Live Chart', kicker: 'TradingView + Footprint Proxy', tag: 'chart', tone: 'neutral' });
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
      const version = ++this.renderVersion;
      this.widgetContainerId = `vaultum-live-chart-widget-${version}`;
      this.publishFocus();
      body.innerHTML = this.renderChartBody();
      this.bindEvents(body, redraw);
      void this.ensurePivots(redraw);
      void this.ensureOrderflow(redraw);
      void this.ensureEntryMap(redraw);
      void this.mountWidget(body, version);
    };

    redraw();
    window.addEventListener('vaultum:snapshot-updated', () => redraw());
    return panel;
  }

  protected renderBody(): string {
    return '';
  }

  private renderChartBody(): string {
    const selectedPreset = this.resolvePreset();
    const dockTitle = `${selectedPreset.label} execution and structure modules`;

    return renderPanelShell({
      className: 'vaultum-tv-shell',
      content: `
        <div class="vaultum-tv-toolbar">
          <div class="vaultum-tv-market-group">
            ${this.availablePresets().map((preset) => `
              <button class="vaultum-tv-chip ${preset.key === selectedPreset.key ? 'is-active' : ''}" data-chart-preset="${preset.key}">
                ${preset.label}
              </button>
            `).join('')}
          </div>
          <div class="vaultum-tv-tf-group">
            ${INTERVALS.map((interval) => `
              <button class="vaultum-tv-chip ${interval.key === this.selectedInterval ? 'is-active' : ''}" data-chart-interval="${interval.key}">
                ${interval.key.toUpperCase()}
              </button>
            `).join('')}
          </div>
          <div class="vaultum-tv-view-group">
            <button class="vaultum-tv-chip ${this.selectedMode === 'chart' ? 'is-active' : ''}" data-chart-mode="chart">Chart</button>
            <button class="vaultum-tv-chip ${this.selectedMode === 'footprint' ? 'is-active' : ''}" data-chart-mode="footprint">Footprint Proxy</button>
          </div>
        </div>
        <div class="vaultum-tv-meta">
          <div>
            <strong>${escapeHtml(selectedPreset.label)}</strong>
            <span>${escapeHtml(selectedPreset.subtitle)}</span>
          </div>
          <div class="vaultum-tv-meta-stack">
            <div class="vaultum-tv-symbol">${escapeHtml(selectedPreset.tvSymbol)} | ${this.selectedInterval.toUpperCase()}</div>
            <div class="vaultum-tv-feed">${escapeHtml(this.feedSummary())}</div>
          </div>
        </div>
        ${this.renderStageBadges(selectedPreset)}
        <div class="vaultum-tv-stage ${this.selectedMode === 'footprint' ? 'is-footprint' : ''}">
          <div id="${this.widgetContainerId}" class="vaultum-tv-widget">
            <div class="vaultum-tv-loading">${this.selectedMode === 'footprint' ? 'Loading live footprint proxy...' : 'Loading TradingView chart...'}</div>
          </div>
        </div>
        ${renderChartDock({
          title: dockTitle,
          description: 'Docked modules stay below the chart, scroll inside their own cards, and can collapse without blocking the tape.',
          cards: this.renderDockCards(selectedPreset),
        })}
      `,
    });
  }

  private renderStageBadges(selectedPreset: ChartPreset): string {
    const aiState = this.aiDockState();
    const chartBias = this.entryMapData?.biasLabel ?? this.pivotData?.signalMap?.bias ?? aiState.biasLabel;
    const feedTone: LayoutTone = this.widgetError || this.pivotError || this.orderflowError
      ? 'alert'
      : this.orderflowData?.feedQuality === 'strong'
        ? 'bullish'
        : this.orderflowData?.feedQuality === 'weak'
          ? 'bearish'
          : 'neutral';

    return `
      <div class="vaultum-tv-badges">
        <div class="vaultum-tv-badge-group">
          ${this.renderStageBadge('symbol', selectedPreset.key)}
          ${this.renderStageBadge('timeframe', this.selectedInterval.toUpperCase())}
          ${this.renderStageBadge('mode', this.selectedMode === 'footprint' ? 'footprint proxy' : 'chart')}
        </div>
        <div class="vaultum-tv-badge-group is-right">
          ${this.renderStageBadge('feed', this.shortFeedStatus(), feedTone)}
          ${this.renderStageBadge('bias', chartBias, aiState.biasTone)}
        </div>
      </div>
    `;
  }

  private renderFootprintStage(): string {
    if (this.orderflowLoading && !this.orderflowData) {
      return `
        <div class="vaultum-tv-footprint">
          <div class="vaultum-tv-loading">Building live footprint proxy...</div>
        </div>
      `;
    }

    if (this.orderflowError && !this.orderflowData) {
      return `
        <div class="vaultum-tv-footprint">
          <div class="vaultum-callout">
            <strong>Footprint proxy unavailable</strong>
            <span>${escapeHtml(this.orderflowError)}</span>
          </div>
        </div>
      `;
    }

    if (!this.orderflowData) {
      return `
        <div class="vaultum-tv-footprint">
          <div class="vaultum-callout">
            <strong>Waiting for live footprint bars</strong>
            <span>The footprint stage will populate as soon as the orderflow engine returns the current bar ladder.</span>
          </div>
        </div>
      `;
    }

    const bars = this.orderflowData.footprintBars.length ? this.orderflowData.footprintBars : this.orderflowData.recentBars;
    const entryMap = this.entryMapData;

    return `
      <div class="vaultum-tv-footprint">
        <div class="vaultum-tv-footprint-head">
          <div>
            <strong>Live footprint proxy</strong>
            <span>${escapeHtml(this.orderflowData.summary)}</span>
          </div>
          <div class="vaultum-tv-footprint-stack">
            <span>${escapeHtml(this.orderflowData.timeframe.toUpperCase())}</span>
            <strong>${escapeHtml(entryMap?.phaseSummary ?? this.orderflowData.structureState)}</strong>
          </div>
        </div>
        <div class="vaultum-tv-footprint-metrics">
          ${this.renderOverlayMetric('Pressure', String(this.orderflowData.buySellPressure))}
          ${this.renderOverlayMetric('Quote Imb', String(this.orderflowData.quoteImbalance))}
          ${this.renderOverlayMetric('VWAP Dev', `${this.orderflowData.vwapDeviation >= 0 ? '+' : ''}${this.orderflowData.vwapDeviation.toFixed(2)}%`)}
          ${this.renderOverlayMetric('Trigger', entryMap?.triggerPattern ?? 'forming')}
          ${this.renderOverlayMetric('Entry', entryMap?.entryZone ?? 'pending')}
          ${this.renderOverlayMetric('Invalidation', entryMap?.invalidationLevel ?? 'pending')}
        </div>
        <div class="vaultum-tv-footprint-grid">
          ${bars.map((bar) => `
            <article class="vaultum-tv-footprint-bar is-${bar.direction}">
              <div class="vaultum-tv-footprint-bar-head">
                <span>${escapeHtml(this.formatFootprintTime(bar.time))}</span>
                <strong>${escapeHtml(bar.close.toFixed(2))}</strong>
              </div>
              <div class="vaultum-tv-footprint-prices">
                <span>H ${escapeHtml(bar.high.toFixed(2))}</span>
                <span>L ${escapeHtml(bar.low.toFixed(2))}</span>
              </div>
              <div class="vaultum-tv-footprint-cells">
                <div class="vaultum-tv-footprint-cell is-buy">${escapeHtml(Math.max(bar.delta, 0).toFixed(2))}</div>
                <div class="vaultum-tv-footprint-cell is-sell">${escapeHtml(Math.max(-bar.delta, 0).toFixed(2))}</div>
              </div>
              <div class="vaultum-tv-footprint-meter">
                <i class="is-${bar.direction}" style="height:${Math.max(bar.intensity, 10)}%"></i>
              </div>
              <div class="vaultum-tv-footprint-bar-foot">
                <span>Vol ${escapeHtml(bar.volume != null ? `${Math.round(bar.volume)}` : 'n/a')}</span>
                <strong>${escapeHtml(`${bar.relativeVolume.toFixed(2)}x`)}</strong>
              </div>
            </article>
          `).join('')}
        </div>
      </div>
    `;
  }

  private renderStageBadge(label: string, value: string, tone: LayoutTone = 'neutral'): string {
    return `
      <div class="vaultum-tv-badge is-${tone}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `;
  }

  private renderDockCards(selectedPreset: ChartPreset): string[] {
    const cards = [
      this.renderStructureMapCard(),
      this.renderVolumeConcentrationCard(),
      this.renderFootprintProxyCard(),
      ...this.renderGuidanceCards(selectedPreset),
      this.renderAiExecutionCard(),
      this.renderAiBiasCard(),
      this.renderAiContextCard(),
    ];

    return cards.filter((card): card is string => Boolean(card));
  }

  private renderStructureMapCard(): string {
    if (this.pivotLoading && !this.pivotData) {
      return renderModuleCard({
        id: 'structure-map',
        label: 'Structure Map',
        title: 'Building live institutional levels',
        description: 'Waiting for the pivot engine to map confluence.',
        content: this.renderSignalList(['Loading pivot, POC, and regime structure.']),
        tone: 'neutral',
        size: 'wide',
      });
    }

    if (this.pivotError && !this.pivotData) {
      return renderModuleCard({
        id: 'structure-map',
        label: 'Structure Map',
        title: 'Structure map unavailable',
        description: this.pivotError,
        content: this.renderSignalList(['The chart remains active while the structure sidecar retries.'], 'alert'),
        tone: 'alert',
        size: 'wide',
      });
    }

    if (!this.pivotData) {
      return renderModuleCard({
        id: 'structure-map',
        label: 'Structure Map',
        title: 'Waiting for structure data',
        description: 'Dock will populate as soon as the pivot response returns.',
        content: this.renderSignalList(['No pivot response has been attached yet.']),
        tone: 'neutral',
        size: 'wide',
      });
    }

    const divergence = this.orderflowData?.priceDeltaDivergence ?? 'none';
    const regime = this.pivotData.regime;
    const tone = this.structureTone();
    const detectorBadges = [
      this.renderDetector(this.pivotData.signalMap.bias, tone),
      this.renderDetector(this.orderflowData?.divergenceDetail ?? 'delta alignment pending', this.orderflowTone()),
      this.orderflowData?.secondSourceActive ? this.renderDetector('2nd volume source active', 'alert') : '',
      regime ? this.renderDetector(`${regime.breakout.level} breakout ${regime.breakout.state}`, regime.breakout.state === 'confirmed' ? 'alert' : 'neutral') : '',
      this.orderflowData?.absorptionSignal && this.orderflowData.absorptionSignal !== 'none' ? this.renderDetector(this.orderflowData.absorptionSignal, 'alert') : '',
      ...(this.pivotData.alerts ?? []).slice(0, 2).map((alert) => this.renderDetector(alert, 'alert')),
    ].filter(Boolean).join('');

    return renderModuleCard({
      id: 'structure-map',
      label: 'Structure Map',
      title: this.pivotData.confluenceSummary,
      description: regime ? `${regime.primaryLabel} / ${regime.secondaryLabel}` : this.pivotData.structure,
      tone,
      size: 'wide',
      content: `
        <div class="vaultum-tv-overlay-metrics">
          ${this.renderOverlayMetric('Pivot', this.formatPrice(this.pivotData.pivot))}
          ${this.renderOverlayMetric('POC', this.formatPrice(this.pivotData.dynamicLevel))}
          ${this.renderOverlayMetric('Signal', this.pivotData.signalMap.bias)}
          ${this.renderOverlayMetric('Delta', divergence)}
          ${this.renderOverlayMetric('Buyer %', this.percentValue(this.pivotData.mappedSupport?.buyersPct))}
          ${this.renderOverlayMetric('Seller %', this.percentValue(this.pivotData.mappedResistance?.sellersPct))}
          ${this.renderOverlayMetric('Regime', regime?.regimeLevel ?? 'pending')}
          ${this.renderOverlayMetric('Breakout', regime ? `${regime.breakout.level} / ${regime.breakout.state}` : 'pending')}
          ${this.renderOverlayMetric('ADX', regime ? regime.adx.toFixed(1) : 'n/a')}
        </div>
        ${detectorBadges ? `<div class="vaultum-tv-detector-row">${detectorBadges}</div>` : ''}
        ${regime ? `<div class="vaultum-module-note">${escapeHtml(regime.summary)}</div>` : ''}
      `,
    });
  }

  private renderVolumeConcentrationCard(): string {
    if (this.pivotLoading && !this.pivotData) {
      return renderModuleCard({
        id: 'volume-concentration',
        label: 'Volume Concentration',
        title: 'Building concentration rail',
        description: 'Spot nodes will appear once the structure map resolves.',
        content: this.renderSignalList(['Waiting for buyer and seller concentrations.']),
        tone: 'neutral',
        collapsible: true,
        collapsed: this.collapsedDockCards.has('volume-concentration'),
      });
    }

    if (this.pivotError && !this.pivotData) {
      return renderModuleCard({
        id: 'volume-concentration',
        label: 'Volume Concentration',
        title: 'Concentration rail unavailable',
        description: this.pivotError,
        content: this.renderSignalList(['No volume concentration nodes are available right now.'], 'alert'),
        tone: 'alert',
        collapsible: true,
        collapsed: this.collapsedDockCards.has('volume-concentration'),
      });
    }

    const rows = this.volumeRailRows();
    const primaryContent = rows.length
      ? `
        <div class="vaultum-tv-rail-list">
          ${rows.map((row) => `
            <div class="vaultum-tv-rail-row is-${row.tone}">
              <div class="vaultum-tv-rail-tag">${escapeHtml(row.label)}</div>
              <div class="vaultum-tv-rail-price">${escapeHtml(row.price.toFixed(2))}</div>
              <div class="vaultum-tv-rail-note">${escapeHtml(row.detail)}</div>
            </div>
          `).join('')}
        </div>
      `
      : this.renderSignalList(['No concentration rail is available yet.']);

    return renderModuleCard({
      id: 'volume-concentration',
      label: 'Volume Concentration',
      title: this.pivotData?.price != null ? `Spot ${this.pivotData.price.toFixed(2)}` : 'Spot pending',
      description: this.pivotData?.dominantVolumeBias ? `${this.pivotData.dominantVolumeBias} dominant volume` : 'Buyer and seller concentration map',
      tone: this.structureTone(),
      collapsible: true,
      collapsed: this.collapsedDockCards.has('volume-concentration'),
      scrollable: true,
      content: primaryContent,
    });
  }

  private renderFootprintProxyCard(): string {
    if (this.orderflowLoading && !this.orderflowData) {
      return renderModuleCard({
        id: 'footprint-proxy',
        label: 'Footprint Proxy',
        title: 'Building orderflow ladder',
        description: 'The proxy feed is stitching the latest imbalance view.',
        content: this.renderSignalList(['Waiting for imbalance ladder and detector state.']),
        tone: 'neutral',
        size: 'wide',
        collapsible: true,
        collapsed: this.collapsedDockCards.has('footprint-proxy'),
      });
    }

    if (this.orderflowError && !this.orderflowData) {
      return renderModuleCard({
        id: 'footprint-proxy',
        label: 'Footprint Proxy',
        title: 'Orderflow sidecar unavailable',
        description: this.orderflowError,
        content: this.renderSignalList(['The chart is still usable while the proxy engine retries.'], 'alert'),
        tone: 'alert',
        size: 'wide',
        collapsible: true,
        collapsed: this.collapsedDockCards.has('footprint-proxy'),
      });
    }

    if (!this.orderflowData) {
      return renderModuleCard({
        id: 'footprint-proxy',
        label: 'Footprint Proxy',
        title: 'Waiting for orderflow context',
        description: 'No orderflow response has been attached yet.',
        content: this.renderSignalList(['Switch to another preset or wait for the live proxy feed.']),
        tone: 'neutral',
        size: 'wide',
        collapsible: true,
        collapsed: this.collapsedDockCards.has('footprint-proxy'),
      });
    }

    return renderModuleCard({
      id: 'footprint-proxy',
      label: 'Footprint Proxy',
      title: this.orderflowData.summary,
      description: `${this.orderflowData.feedQuality} feed | ${this.orderflowData.mode} mode | ${this.orderflowData.sourceSymbol}`,
      tone: this.orderflowTone(),
      size: 'wide',
      collapsible: true,
      collapsed: this.collapsedDockCards.has('footprint-proxy'),
      scrollable: true,
      content: `
        <div class="vaultum-tv-overlay-metrics">
          ${this.renderOverlayMetric('Pressure', String(this.orderflowData.buySellPressure))}
          ${this.renderOverlayMetric('2nd Vol', this.orderflowData.aggregateVolumePressure >= 0 ? `+${this.orderflowData.aggregateVolumePressure.toFixed(1)}` : this.orderflowData.aggregateVolumePressure.toFixed(1))}
          ${this.renderOverlayMetric('B/A', this.orderflowData.bidAskPressureRatio.toFixed(2))}
          ${this.renderOverlayMetric('Imb', String(this.orderflowData.quoteImbalance))}
          ${this.renderOverlayMetric('Delta', this.orderflowData.priceDeltaDivergence)}
          ${this.renderOverlayMetric('VWAP', `${this.orderflowData.vwapDeviation >= 0 ? '+' : ''}${this.orderflowData.vwapDeviation.toFixed(2)}%`)}
        </div>
        <div class="vaultum-tv-detector-row">
          ${this.renderDetector(this.orderflowData.absorptionSignal, this.orderflowData.absorptionSignal === 'none' ? 'neutral' : 'alert')}
          ${this.renderDetector(this.orderflowData.exhaustionSignal, this.orderflowData.exhaustionSignal === 'none' ? 'neutral' : 'alert')}
          ${this.renderDetector(this.orderflowData.structureState)}
          ${this.renderDetector(this.orderflowData.divergenceDetail, this.orderflowTone())}
          ${this.pivotData?.signalMap?.buySignal ? this.renderDetector('buyer node active', 'bullish') : ''}
          ${this.pivotData?.signalMap?.sellSignal ? this.renderDetector('seller node active', 'bearish') : ''}
          ${this.pivotData?.signalMap?.bullSweep ? this.renderDetector('bull sweep', 'bullish') : ''}
          ${this.pivotData?.signalMap?.bearSweep ? this.renderDetector('bear sweep', 'bearish') : ''}
        </div>
        <div class="vaultum-tv-ladder">
          ${this.orderflowData.imbalanceLadder.slice(0, 10).map((level) => `
            <div class="vaultum-tv-ladder-row">
              <span>${escapeHtml(level.price.toFixed(2))}</span>
              <div class="vaultum-tv-ladder-bar">
                <i class="${level.delta >= 0 ? 'is-buy' : 'is-sell'}" style="width:${Math.max(level.intensity, 8)}%"></i>
              </div>
              <strong>${escapeHtml(level.delta.toFixed(2))}</strong>
            </div>
          `).join('')}
        </div>
        <div class="vaultum-tv-footer-flow">
          ${this.orderflowData.recentBars.slice(-8).map((bar) => `
            <div class="vaultum-tv-flow-bar ${bar.delta >= 0 ? 'is-buy' : 'is-sell'}">
              <span>${escapeHtml(bar.close.toFixed(2))}</span>
              <strong>${escapeHtml(bar.delta.toFixed(2))}</strong>
            </div>
          `).join('')}
        </div>
      `,
    });
  }

  private renderGuidanceCards(selectedPreset: ChartPreset): string[] {
    const execution = this.snapshot()?.execution;
    const liveExecution = this.isPrimaryPreset(selectedPreset.key) ? this.entryMapData : null;
    const entryZone = liveExecution?.entryZone ?? execution?.entryZone ?? 'structure unavailable';
    const trimZone = liveExecution?.trimZone ?? execution?.trimZone ?? 'await resistance cluster';
    const noTradeZone = liveExecution?.noTradeZone ?? execution?.noTradeZone ?? 'avoid mid-value chop';
    const invalidationLevel = liveExecution?.invalidationLevel ?? execution?.invalidationLevel ?? 'n/a';
    const thesisSummary = liveExecution?.tradeThesisSummary ?? execution?.tradeThesisSummary ?? 'Primary participation zone for the active asset.';
    const targetLogic = liveExecution?.targetLogic ?? execution?.targetLogic ?? 'Scale risk where the thesis is expected to mature.';
    const feedQuality = liveExecution?.feedQuality ?? execution?.feedQuality ?? 'Risk line that voids the current trade thesis.';
    const executionChecklist = liveExecution?.executionChecklist ?? execution?.executionChecklist ?? ['Wait for structure confirmation before entering.'];
    const alertConditions = liveExecution?.alertConditions ?? execution?.alertConditions ?? ['Avoid entries while the tape remains indecisive.'];
    const sessionTimingNotes = liveExecution?.sessionTimingNotes ?? execution?.sessionTimingNotes ?? ['Trim into extension, not into noise.'];
    const doNotExecute = liveExecution?.doNotExecute ?? execution?.doNotExecute ?? false;
    const cards = this.isPrimaryPreset(selectedPreset.key)
      ? [
        {
          id: 'execution-zone',
          label: 'Execution Zone',
          title: entryZone,
          description: thesisSummary,
          detail: this.renderSignalList(executionChecklist.slice(0, 4)),
          tone: doNotExecute ? 'alert' : (liveExecution?.biasTone ?? 'neutral'),
          collapsible: false,
        },
        {
          id: 'trim-zone',
          label: 'Trim Zone',
          title: trimZone,
          description: targetLogic,
          detail: this.renderSignalList(sessionTimingNotes.slice(0, 3)),
          tone: 'neutral',
          collapsible: true,
        },
        {
          id: 'no-trade',
          label: 'No Trade',
          title: noTradeZone,
          description: doNotExecute ? 'Execution caution is elevated.' : (liveExecution?.phaseSummary ?? 'Conditions that suppress clean participation.'),
          detail: this.renderSignalList(alertConditions.slice(0, 4), 'alert'),
          tone: doNotExecute ? 'alert' : 'bearish',
          collapsible: true,
        },
        {
          id: 'invalidation',
          label: 'Invalidation',
          title: invalidationLevel,
          description: feedQuality,
          detail: this.renderSignalList([
            thesisSummary,
            ...(liveExecution?.noTradeReasons?.slice(0, 2) ?? sessionTimingNotes.slice(0, 2)),
          ]),
          tone: 'alert',
          collapsible: true,
        },
      ]
      : [
        {
          id: 'execution-zone',
          label: 'Execution Zone',
          title: this.pivotData?.mappedSupport?.price != null
            ? `${this.pivotData.mappedSupport.price.toFixed(2)} / ${this.percentValue(this.pivotData.mappedSupport.buyersPct)}`
            : 'pending structure',
          description: 'Mapped buyer node for the selected side asset.',
          detail: this.renderSignalList([this.pivotData?.mappedSupport ? `Buyer touches ${this.pivotData.mappedSupport.touches}` : 'Buyer node pending.']),
          tone: 'bullish',
          collapsible: false,
        },
        {
          id: 'trim-zone',
          label: 'Trim Zone',
          title: this.pivotData?.mappedResistance?.price != null
            ? `${this.pivotData.mappedResistance.price.toFixed(2)} / ${this.percentValue(this.pivotData.mappedResistance.sellersPct)}`
            : 'pending structure',
          description: 'Mapped seller node for partial de-risking.',
          detail: this.renderSignalList([this.pivotData?.mappedResistance ? `Seller touches ${this.pivotData.mappedResistance.touches}` : 'Seller node pending.']),
          tone: 'bearish',
          collapsible: true,
        },
        {
          id: 'no-trade',
          label: 'No Trade',
          title: this.pivotData?.regime ? `${this.pivotData.regime.primaryCode} / ${this.pivotData.regime.regimeLevel}` : 'pending regime',
          description: 'Avoid mid-value compression and unresolved regime shifts.',
          detail: this.renderSignalList([this.pivotData?.regime?.summary ?? 'Regime summary pending.'], 'alert'),
          tone: 'alert',
          collapsible: true,
        },
        {
          id: 'invalidation',
          label: 'Invalidation',
          title: this.pivotData?.regime
            ? `${this.formatPrice(this.pivotData.dynamicLevel)} / ${this.pivotData.regime.breakout.state}`
            : 'pending structure',
          description: 'Use the POC or breakout state as the failure line for the current read.',
          detail: this.renderSignalList([
            this.pivotData?.dynamicState ?? 'Dynamic structure pending.',
            this.pivotData?.structure ?? 'Structure pending.',
          ]),
          tone: 'alert',
          collapsible: true,
        },
      ];

    return cards.map((card) => renderModuleCard({
      id: card.id,
      label: card.label,
      title: card.title,
      description: card.description,
      content: card.detail,
      tone: card.tone as LayoutTone,
      collapsible: card.collapsible,
      collapsed: this.collapsedDockCards.has(card.id),
    }));
  }

  private renderAiExecutionCard(): string {
    const aiState = this.aiDockState();

    return renderModuleCard({
      id: 'ai-execution-read',
      label: 'AI Execution Read',
      title: this.entryMapData?.executionRead ?? aiState.executionRead,
      description: this.entryMapData
        ? `${this.resolvePreset().key} | ${this.entryMapData.timeframes.major}/${this.entryMapData.timeframes.minor}/${this.entryMapData.timeframes.trigger}`
        : `${this.resolvePreset().key} | ${this.selectedInterval.toUpperCase()}`,
      tone: aiState.biasTone,
      size: 'wide',
      content: `
        <div class="vaultum-module-note">${escapeHtml(this.entryMapData?.tradeThesisSummary ?? aiState.primaryReason)}</div>
        ${this.renderSignalList(this.entryMapData?.supportingSignals?.length ? this.entryMapData.supportingSignals : (aiState.supportingSignals.length ? aiState.supportingSignals : ['AI supporting signals will appear here after the bootstrap completes.']))}
      `,
    });
  }

  private renderAiBiasCard(): string {
    const aiState = this.aiDockState();

    return renderModuleCard({
      id: 'ai-bias',
      label: 'AI Bias',
      title: this.entryMapData?.biasLabel ?? aiState.biasLabel,
      description: this.entryMapData?.phaseSummary ?? aiState.supportingSignals[0] ?? 'Bias is derived from the current desk note.',
      tone: this.entryMapData?.biasTone ?? aiState.biasTone,
      collapsible: true,
      collapsed: this.collapsedDockCards.has('ai-bias'),
      content: `
        <div class="vaultum-tv-detector-row">
          ${this.renderDetector(this.entryMapData?.biasLabel ?? aiState.biasLabel, this.entryMapData?.biasTone ?? aiState.biasTone)}
          ${this.renderDetector(this.feedSummary())}
          ${this.entryMapData ? this.renderDetector(`${this.entryMapData.phase} | ${this.entryMapData.readiness}`, this.entryMapData.biasTone) : ''}
          ${this.renderDetector(this.selectedMode === 'footprint' ? 'footprint dock active' : 'chart dock active')}
        </div>
      `,
    });
  }

  private renderAiContextCard(): string {
    const aiState = this.aiDockState();

    return renderModuleCard({
      id: 'ai-context',
      label: 'AI Context',
      title: 'Docked context trace',
      description: 'Signals and caveats are contained inside this card to avoid chart obstruction.',
      tone: aiState.contextTone,
      collapsible: true,
      collapsed: this.collapsedDockCards.has('ai-context'),
      scrollable: true,
      content: this.renderSignalList(
        this.entryMapData?.contextLines?.length ? this.entryMapData.contextLines : (aiState.contextLines.length ? aiState.contextLines : ['Context trace will populate once the snapshot or AI panel updates.']),
        (this.entryMapData?.doNotExecute || aiState.contextTone === 'alert') ? 'alert' : 'neutral',
      ),
    });
  }

  private renderOverlayMetric(label: string, value: string): string {
    return `
      <div class="vaultum-tv-overlay-metric">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `;
  }

  private renderSignalList(items: string[], tone: 'neutral' | 'bullish' | 'bearish' | 'alert' = 'neutral'): string {
    return `
      <div class="vaultum-signal-list">
        ${items.map((item) => `
          <div class="vaultum-signal-row ${tone}">
            <span>${escapeHtml(item)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  private renderDetector(label: string, tone: LayoutTone = 'neutral'): string {
    return `<span class="vaultum-tv-detector is-${tone}">${escapeHtml(label)}</span>`;
  }

  private bindEvents(root: HTMLElement, redraw: () => void): void {
    root.querySelectorAll<HTMLButtonElement>('[data-chart-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        const presetKey = button.dataset.chartPreset;
        if (!presetKey || presetKey === this.selectedPresetKey) return;
        this.selectedPresetKey = presetKey;
        this.widgetError = '';
        this.orderflowData = null;
        this.orderflowError = '';
        this.pivotData = null;
        this.pivotError = '';
        this.entryMapData = null;
        this.entryMapError = '';
        this.loadedOrderflowKey = '';
        this.loadedPivotKey = '';
        this.loadedEntryMapKey = '';
        redraw();
      });
    });

    root.querySelectorAll<HTMLButtonElement>('[data-chart-interval]').forEach((button) => {
      button.addEventListener('click', () => {
        const interval = button.dataset.chartInterval as IntervalKey | undefined;
        if (!interval || interval === this.selectedInterval) return;
        this.selectedInterval = interval;
        this.widgetError = '';
        this.orderflowData = null;
        this.orderflowError = '';
        this.pivotData = null;
        this.pivotError = '';
        this.entryMapData = null;
        this.entryMapError = '';
        this.loadedOrderflowKey = '';
        this.loadedPivotKey = '';
        this.loadedEntryMapKey = '';
        redraw();
      });
    });

    root.querySelectorAll<HTMLButtonElement>('[data-chart-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.chartMode as ChartMode | undefined;
        if (!mode || mode === this.selectedMode) return;
        this.selectedMode = mode;
        redraw();
      });
    });

    root.querySelectorAll<HTMLButtonElement>('[data-module-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const cardId = button.dataset.moduleToggle;
        if (!cardId) return;
        const card = root.querySelector<HTMLElement>(`[data-module-card="${cardId}"]`);
        if (!card) return;
        const isCollapsed = card.classList.toggle('is-collapsed');
        if (isCollapsed) this.collapsedDockCards.add(cardId);
        else this.collapsedDockCards.delete(cardId);
        button.textContent = isCollapsed ? 'Expand' : 'Collapse';
        button.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      });
    });
  }

  private async mountWidget(root: HTMLElement, version: number): Promise<void> {
    const host = root.querySelector<HTMLElement>(`#${this.widgetContainerId}`);
    if (!host) return;

    if (this.selectedMode === 'footprint') {
      this.widgetError = '';
      host.innerHTML = this.renderFootprintStage();
      return;
    }

    const preset = this.resolvePreset();
    const interval = INTERVALS.find((item) => item.key === this.selectedInterval)?.tvInterval ?? '60';

    host.innerHTML = '<div class="vaultum-tv-loading">Loading TradingView chart...</div>';

    try {
      await ensureTradingView();
      if (version !== this.renderVersion) return;

      this.widgetError = '';
      host.innerHTML = '';
      createTradingViewWidget({
        containerId: this.widgetContainerId,
        symbol: preset.tvSymbol,
        interval,
        toolbarBg: '#101010',
        overrides: {
          'mainSeriesProperties.candleStyle.upColor': '#96f2b8',
          'mainSeriesProperties.candleStyle.downColor': '#ff9b9b',
          'mainSeriesProperties.candleStyle.borderUpColor': '#96f2b8',
          'mainSeriesProperties.candleStyle.borderDownColor': '#ff9b9b',
          'mainSeriesProperties.candleStyle.wickUpColor': '#96f2b8',
          'mainSeriesProperties.candleStyle.wickDownColor': '#ff9b9b',
          'paneProperties.background': '#101010',
          'paneProperties.backgroundType': 'solid',
          'paneProperties.vertGridProperties.color': 'rgba(255,255,255,0.06)',
          'paneProperties.horzGridProperties.color': 'rgba(255,255,255,0.06)',
          'scalesProperties.textColor': '#8c8c8c',
        },
      });
    } catch (error) {
      if (version !== this.renderVersion) return;
      const reason = error instanceof Error ? error.message : 'Unknown TradingView error.';
      this.widgetError = `TradingView failed to load for ${preset.label}: ${reason}`;
      host.innerHTML = `
        <div class="vaultum-callout">
          <strong>Chart unavailable</strong>
          <span>${escapeHtml(reason)} (${escapeHtml(preset.tvSymbol)}).</span>
        </div>
      `;
    }
  }

  private async ensureEntryMap(redraw: () => void): Promise<void> {
    const key = `${this.resolvePreset().key}:${this.selectedInterval}`;
    if (this.entryMapLoading) return;
    if (this.loadedEntryMapKey === key && (this.entryMapData || this.entryMapError)) return;

    this.entryMapLoading = true;
    this.entryMapError = '';
    redraw();

    try {
      this.entryMapData = await fetchEntryMap(this.resolvePreset().key, this.selectedInterval);
      this.loadedEntryMapKey = key;
      if (!this.entryMapData) {
        this.entryMapError = `Entry map did not return data for ${this.resolvePreset().key}.`;
      }
    } catch (error) {
      this.entryMapData = null;
      this.loadedEntryMapKey = key;
      this.entryMapError = error instanceof Error ? error.message : 'Unable to load entry map.';
    }

    this.entryMapLoading = false;
    redraw();
  }

  private async ensureOrderflow(redraw: () => void): Promise<void> {
    const key = `${this.resolvePreset().key}:${this.orderflowTimeframe()}`;
    if (this.orderflowLoading) return;
    if (this.loadedOrderflowKey === key && (this.orderflowData || this.orderflowError)) return;

    this.orderflowLoading = true;
    this.orderflowError = '';
    redraw();

    try {
      this.orderflowData = await fetchOrderflowEngine(this.resolvePreset().key, this.orderflowTimeframe());
      this.loadedOrderflowKey = key;
      if (!this.orderflowData) {
        this.orderflowError = `Orderflow engine did not return data for ${this.resolvePreset().key}.`;
      }
    } catch (error) {
      this.orderflowData = null;
      this.loadedOrderflowKey = key;
      this.orderflowError = error instanceof Error ? error.message : 'Unable to load orderflow engine.';
    }

    this.orderflowLoading = false;
    redraw();
  }

  private async ensurePivots(redraw: () => void): Promise<void> {
    const key = `${this.resolvePreset().key}:${this.structureTimeframe()}`;
    if (this.pivotLoading) return;
    if (this.loadedPivotKey === key && (this.pivotData || this.pivotError)) return;

    this.pivotLoading = true;
    this.pivotError = '';
    redraw();

    try {
      this.pivotData = await fetchPivotLevels(this.resolvePreset().key, this.structureTimeframe());
      this.loadedPivotKey = key;
      if (!this.pivotData) {
        this.pivotError = `Pivot engine did not return data for ${this.resolvePreset().key}.`;
      }
    } catch (error) {
      this.pivotData = null;
      this.loadedPivotKey = key;
      this.pivotError = error instanceof Error ? error.message : 'Unable to load pivot map.';
    }

    this.pivotLoading = false;
    redraw();
  }

  private orderflowTimeframe(): string {
    if (this.selectedInterval === '5m') return '5m';
    if (this.selectedInterval === '15m') return '15m';
    if (this.selectedInterval === '30m') return '30m';
    if (this.selectedInterval === '4h') return '4h';
    return '1h';
  }

  private structureTimeframe(): string {
    if (this.selectedInterval === '4h') return '4h';
    if (this.selectedInterval === '5m' || this.selectedInterval === '15m' || this.selectedInterval === '30m') return '15m';
    return this.selectedInterval === '1d' ? '1d' : '1h';
  }

  private feedSummary(): string {
    if (this.widgetError) return this.widgetError;
    if (this.pivotLoading) return 'Building structure map...';
    if (this.pivotError && !this.orderflowData) return 'Pivot engine unavailable';
    if (this.orderflowLoading) return 'Checking feed quality...';
    if (this.orderflowError) return 'Orderflow engine unavailable';
    if (!this.orderflowData && this.pivotData) return this.pivotData.sourceLabel ?? 'Live structure map active';
    if (!this.orderflowData) return 'Live proxy feed pending';
    return `Feed ${this.orderflowData.feedQuality} | ${this.orderflowData.mode} | ${this.orderflowData.sourceSymbol}`;
  }

  private shortFeedStatus(): string {
    if (this.widgetError) return 'chart issue';
    if (this.pivotLoading || this.orderflowLoading) return 'loading';
    if (this.pivotError || this.orderflowError) return 'degraded';
    if (this.orderflowData) return this.orderflowData.feedQuality;
    return 'pending';
  }

  private availablePresets(): ChartPreset[] {
    const primaryPresetKey = this.resolvePrimaryPresetKey();
    const orderedKeys = [primaryPresetKey, 'US30', 'DXY', 'EURUSD', 'GBPUSD', 'USDJPY', 'SPX', 'NDX', 'VIX', 'WTI', 'BTCUSD'];
    return [...new Set(orderedKeys)]
      .map((key) => CHART_PRESETS[key])
      .filter((preset): preset is ChartPreset => Boolean(preset));
  }

  private resolvePreset(): ChartPreset {
    const fallback = CHART_PRESETS[this.resolvePrimaryPresetKey()] ?? CHART_PRESETS.XAUUSD;
    if (!this.selectedPresetKey || !CHART_PRESETS[this.selectedPresetKey]) {
      this.selectedPresetKey = fallback.key;
    }
    return CHART_PRESETS[this.selectedPresetKey] ?? fallback;
  }

  private resolvePrimaryPresetKey(): string {
    const primaryAsset = this.snapshot()?.primaryAsset?.toUpperCase() ?? 'XAUUSD';
    const aliases: Record<string, string> = {
      'GC=F': 'XAUUSD',
      SPY: 'SPX',
      QQQ: 'NDX',
      UUP: 'DXY',
      VIXY: 'VIX',
      DIA: 'US30',
      '^DJI': 'US30',
      'YM=F': 'US30',
    };
    const resolved = aliases[primaryAsset] ?? primaryAsset;
    if (CHART_PRESETS[resolved]) return resolved;
    return 'XAUUSD';
  }

  private isPrimaryPreset(presetKey: string): boolean {
    return presetKey === this.resolvePrimaryPresetKey();
  }

  private publishFocus(): void {
    const preset = this.resolvePreset();
    const publishedTimeframe = this.publishedFocusTimeframe();
    const focusKey = `${preset.key}:${publishedTimeframe}`;
    if (focusKey === this.lastPublishedFocus) return;
    this.lastPublishedFocus = focusKey;
    publishMarketFocus({ market: preset.key, timeframe: publishedTimeframe });
  }

  private publishedFocusTimeframe(): string {
    if (this.selectedInterval === '5m' || this.selectedInterval === '30m') return '15m';
    return this.selectedInterval;
  }

  private aiDockState(): {
    biasLabel: string;
    biasTone: LayoutTone;
    executionRead: string;
    supportingSignals: string[];
    primaryReason: string;
    contextLines: string[];
    contextTone: LayoutTone;
  } {
    const snapshot = this.snapshot();
    const bootstrapEntryMap = snapshot?.entryMap;
    const aiPanel = snapshot?.panels?.['ai-insights'];
    const executionRead = this.entryMapData?.executionRead ?? bootstrapEntryMap?.executionRead ?? aiPanel?.conclusion ?? snapshot?.conclusion ?? 'AI reasoning layer idle.';
    const supportingSignals = this.entryMapData?.supportingSignals?.length
      ? this.entryMapData.supportingSignals
      : bootstrapEntryMap?.supportingSignals?.length
        ? bootstrapEntryMap.supportingSignals
      : aiPanel?.bullets?.length
        ? aiPanel.bullets
        : snapshot?.supportingSignals ?? [];
    const caveats = snapshot?.caveats ?? [];
    const primaryReason = this.entryMapData?.tradeThesisSummary ?? bootstrapEntryMap?.tradeThesisSummary ?? supportingSignals[0] ?? snapshot?.execution?.tradeThesisSummary ?? 'Waiting for the next structured AI run.';
    const haystack = [executionRead, primaryReason, ...supportingSignals].join(' ').toLowerCase();
    const biasTone: LayoutTone = this.entryMapData?.biasTone ?? bootstrapEntryMap?.biasTone ?? (/(lean-short|short bias|short|bearish|sell|sellers dominant|downside)/.test(haystack)
      ? 'bearish'
      : /(lean-long|long bias|long|bullish|buy|buyers dominant|upside)/.test(haystack)
        ? 'bullish'
        : 'neutral');
    const biasLabel = this.entryMapData?.biasLabel ?? bootstrapEntryMap?.biasLabel ?? (biasTone === 'bearish'
      ? 'Short Bias'
      : biasTone === 'bullish'
        ? 'Long Bias'
        : 'Context Pending');
    const contextLines = [
      ...((this.entryMapData?.contextLines ?? []).slice(0, 4)),
      ...((bootstrapEntryMap?.contextLines ?? []).slice(0, 4)),
      snapshot?.execution?.tradeThesisSummary,
      ...supportingSignals,
      ...caveats.map((item) => `Caveat: ${item}`),
    ].filter((value): value is string => Boolean(value)).slice(0, 8);

    return {
      biasLabel,
      biasTone,
      executionRead,
      supportingSignals,
      primaryReason,
      contextLines,
      contextTone: caveats.length ? 'alert' : biasTone,
    };
  }

  private structureTone(): LayoutTone {
    if (!this.pivotData) return 'neutral';
    if (this.pivotData.signalMap.buySignal || this.pivotData.signalMap.bullSweep) return 'bullish';
    if (this.pivotData.signalMap.sellSignal || this.pivotData.signalMap.bearSweep) return 'bearish';
    if (this.pivotData.regime?.breakout.state === 'confirmed') return 'alert';
    return 'neutral';
  }

  private orderflowTone(): LayoutTone {
    if (!this.orderflowData) return 'neutral';
    if (this.orderflowData.divergenceBias === 'bullish' || this.orderflowData.buySellPressure > 0) return 'bullish';
    if (this.orderflowData.divergenceBias === 'bearish' || this.orderflowData.buySellPressure < 0) return 'bearish';
    return 'neutral';
  }

  private volumeRailRows(): VolumeRailRow[] {
    if (!this.pivotData) return [];

    const rows: VolumeRailRow[] = [];
    const pushRow = (label: string, price: number | null | undefined, detail: string, tone: VolumeRailRow['tone']) => {
      if (price == null) return;
      const duplicate = rows.some((row) => Math.abs(row.price - price) <= Math.max(Math.abs(price) * 0.0008, 0.15));
      if (duplicate) return;
      rows.push({ label, price, detail, tone });
    };

    pushRow(
      'Seller',
      this.pivotData.mappedResistance?.price,
      this.pivotData.mappedResistance?.sellersPct != null
        ? `${this.pivotData.mappedResistance.sellersPct.toFixed(1)}% sellers`
        : this.pivotData.mappedResistance
          ? `seller x${this.pivotData.mappedResistance.touches}`
          : 'seller node',
      'resistance',
    );
    pushRow('R1', this.pivotData.resistances[0], 'classic resistance', 'resistance');
    pushRow('Pivot', this.pivotData.pivot, this.pivotData.structure, 'pivot');
    pushRow('POC', this.pivotData.dynamicLevel, this.pivotData.dynamicState, 'dynamic');
    pushRow('S1', this.pivotData.supports[0], 'classic support', 'support');
    pushRow(
      'Buyer',
      this.pivotData.mappedSupport?.price,
      this.pivotData.mappedSupport?.buyersPct != null
        ? `${this.pivotData.mappedSupport.buyersPct.toFixed(1)}% buyers`
        : this.pivotData.mappedSupport
          ? `buyer x${this.pivotData.mappedSupport.touches}`
          : 'buyer node',
      'support',
    );

    rows.sort((left, right) => right.price - left.price);
    return rows;
  }

  private formatPrice(value: number | null | undefined): string {
    return value == null ? 'n/a' : value.toFixed(2);
  }

  private percentValue(value: number | null | undefined): string {
    return value == null ? 'n/a' : `${value.toFixed(1)}%`;
  }

  private formatFootprintTime(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toISOString().slice(11, 16);
  }

  private snapshot(): BootstrapSnapshot | null {
    return (window as Window & { __vaultumSnapshot?: BootstrapSnapshot }).__vaultumSnapshot ?? null;
  }
}
