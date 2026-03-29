import { BasePanel } from '@/components/base/panel';
import { publishMarketFocus } from '@/services/market-focus';
import { fetchOrderflowEngine, type OrderflowEngineResponse } from '@/services/orderflow';
import { fetchPivotLevels, type PivotLevelResponse } from '@/services/pivots';
import { createTradingViewWidget, ensureTradingView } from '@/services/tradingview';

type ChartPreset = {
  key: string;
  label: string;
  subtitle: string;
  tvSymbol: string;
};

const CHART_PRESETS: Record<string, ChartPreset> = {
  XAUUSD: { key: 'XAUUSD', label: 'Gold Spot', subtitle: 'Primary asset chart', tvSymbol: 'OANDA:XAUUSD' },
  DXY: { key: 'DXY', label: 'Dollar Index', subtitle: 'Macro funding filter', tvSymbol: 'TVC:DXY' },
  EURUSD: { key: 'EURUSD', label: 'EUR / USD', subtitle: 'Major FX pair', tvSymbol: 'FX:EURUSD' },
  GBPUSD: { key: 'GBPUSD', label: 'GBP / USD', subtitle: 'Sterling dollar pair', tvSymbol: 'FX:GBPUSD' },
  USDJPY: { key: 'USDJPY', label: 'USD / JPY', subtitle: 'Carry stress proxy', tvSymbol: 'FX:USDJPY' },
  SPX: { key: 'SPX', label: 'S&P 500', subtitle: 'Risk appetite index', tvSymbol: 'SP:SPX' },
  NDX: { key: 'NDX', label: 'Nasdaq 100', subtitle: 'Growth beta index', tvSymbol: 'NASDAQ:NDX' },
  VIX: { key: 'VIX', label: 'Volatility Index', subtitle: 'Risk stress gauge', tvSymbol: 'CBOE:VIX' },
  WTI: { key: 'WTI', label: 'WTI Crude', subtitle: 'Oil shock proxy', tvSymbol: 'TVC:USOIL' },
  BTCUSD: { key: 'BTCUSD', label: 'BTC / USD', subtitle: 'Crypto risk proxy', tvSymbol: 'BINANCE:BTCUSDT' },
};

const INTERVALS = [
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
  private readonly widgetContainerId = 'vaultum-live-chart-widget';
  private orderflowData: OrderflowEngineResponse | null = null;
  private orderflowLoading = false;
  private orderflowError = '';
  private loadedOrderflowKey = '';
  private pivotData: PivotLevelResponse | null = null;
  private pivotLoading = false;
  private pivotError = '';
  private loadedPivotKey = '';
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
      this.publishFocus();
      body.innerHTML = this.renderChartBody();
      this.bindEvents(body, redraw);
      void this.ensurePivots(redraw);
      void this.ensureOrderflow(redraw);
      void this.mountWidget(body, ++this.renderVersion);
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
    const execution = this.snapshot()?.execution;
    const guidanceCards = this.isPrimaryPreset(selectedPreset.key)
      ? [
        this.renderGuidanceCard('Execution Zone', execution?.entryZone ?? 'structure unavailable'),
        this.renderGuidanceCard('Trim Zone', execution?.trimZone ?? 'await resistance cluster'),
        this.renderGuidanceCard('No Trade', execution?.noTradeZone ?? 'avoid mid-value chop'),
        this.renderGuidanceCard('Invalidation', execution?.invalidationLevel ?? 'n/a'),
      ]
      : [
        this.renderGuidanceCard('Mapped Support', this.pivotData?.mappedSupport?.price != null ? this.pivotData.mappedSupport.price.toFixed(2) : 'pending'),
        this.renderGuidanceCard('Mapped Resist', this.pivotData?.mappedResistance?.price != null ? this.pivotData.mappedResistance.price.toFixed(2) : 'pending'),
        this.renderGuidanceCard('Signal Map', this.pivotData?.signalMap?.bias ?? 'pending'),
        this.renderGuidanceCard('Dynamic', this.pivotData?.dynamicLevel != null ? `${this.pivotData.dynamicLevel.toFixed(2)} / ${this.pivotData.dynamicState}` : 'pending'),
      ];

    return `
      <div class="vaultum-tv-shell">
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
            <strong>${this.escape(selectedPreset.label)}</strong>
            <span>${this.escape(selectedPreset.subtitle)}</span>
          </div>
          <div class="vaultum-tv-meta-stack">
            <div class="vaultum-tv-symbol">${this.escape(selectedPreset.tvSymbol)} | ${this.selectedInterval.toUpperCase()}</div>
            <div class="vaultum-tv-feed">${this.escape(this.feedSummary())}</div>
          </div>
        </div>
        <div class="vaultum-tv-stage ${this.selectedMode === 'footprint' ? 'is-footprint' : ''}">
          <div id="${this.widgetContainerId}" class="vaultum-tv-widget">
            <div class="vaultum-tv-loading">Loading TradingView chart...</div>
          </div>
          ${this.renderChartOverlay()}
        </div>
        <div class="vaultum-tv-guidance">
          ${guidanceCards.join('')}
        </div>
      </div>
    `;
  }

  private renderChartOverlay(): string {
    if (this.selectedMode === 'footprint') return this.renderFootprintOverlay();
    if (this.pivotLoading) {
      return `<div class="vaultum-tv-overlay"><div class="vaultum-tv-overlay-card"><strong>Loading structure map...</strong><span>Building live institutional levels from current candles.</span></div></div>`;
    }
    if (this.pivotError) {
      return `<div class="vaultum-tv-overlay"><div class="vaultum-tv-overlay-card"><strong>Structure map unavailable</strong><span>${this.escape(this.pivotError)}</span></div></div>`;
    }
    if (!this.pivotData) return '';
    const divergence = this.orderflowData?.priceDeltaDivergence ?? 'none';
    const divergenceDetail = this.orderflowData?.divergenceDetail ?? 'delta alignment pending';

    return `
      <div class="vaultum-tv-overlay is-chart">
        <div class="vaultum-tv-chart-head">
          <div class="vaultum-tv-overlay-card vaultum-tv-overlay-card--wide">
            <div class="vaultum-tv-overlay-label">Structure Map</div>
            <strong>${this.escape(this.pivotData.confluenceSummary)}</strong>
            <div class="vaultum-tv-overlay-metrics">
              ${this.renderOverlayMetric('Pivot', this.pivotData.pivot != null ? this.pivotData.pivot.toFixed(2) : 'n/a')}
              ${this.renderOverlayMetric('Dynamic', this.pivotData.dynamicLevel != null ? this.pivotData.dynamicLevel.toFixed(2) : 'n/a')}
              ${this.renderOverlayMetric('Signal', this.pivotData.signalMap.bias)}
              ${this.renderOverlayMetric('Delta', divergence)}
              ${this.renderOverlayMetric('Mapped S', this.pivotData.mappedSupport?.price != null ? this.pivotData.mappedSupport.price.toFixed(2) : 'n/a')}
              ${this.renderOverlayMetric('Mapped R', this.pivotData.mappedResistance?.price != null ? this.pivotData.mappedResistance.price.toFixed(2) : 'n/a')}
            </div>
            <div class="vaultum-tv-detector-row">
              <span class="vaultum-tv-detector ${this.detectorTone(this.pivotData.signalMap.buySignal || this.pivotData.signalMap.bullSweep, this.pivotData.signalMap.sellSignal || this.pivotData.signalMap.bearSweep)}">${this.escape(this.pivotData.signalMap.bias)}</span>
              <span class="vaultum-tv-detector ${this.detectorTone(this.orderflowData?.divergenceBias === 'bullish', this.orderflowData?.divergenceBias === 'bearish')}">${this.escape(divergenceDetail)}</span>
              ${this.orderflowData?.absorptionSignal && this.orderflowData.absorptionSignal !== 'none' ? `<span class="vaultum-tv-detector is-alert">${this.escape(this.orderflowData.absorptionSignal)}</span>` : ''}
            </div>
          </div>
        </div>
        ${this.renderStructureRail()}
      </div>
    `;
  }

  private renderFootprintOverlay(): string {
    if (this.selectedMode !== 'footprint') return '';
    if (this.orderflowLoading || this.pivotLoading) {
      return `<div class="vaultum-tv-overlay"><div class="vaultum-tv-overlay-card"><strong>Loading footprint proxy...</strong><span>Building orderflow ladder and detector state from live candles.</span></div></div>`;
    }
    if (this.orderflowError) {
      return `<div class="vaultum-tv-overlay"><div class="vaultum-tv-overlay-card"><strong>Footprint proxy unavailable</strong><span>${this.escape(this.orderflowError)}</span></div></div>`;
    }
    if (this.pivotError) {
      return `<div class="vaultum-tv-overlay"><div class="vaultum-tv-overlay-card"><strong>Footprint structure unavailable</strong><span>${this.escape(this.pivotError)}</span></div></div>`;
    }
    if (!this.orderflowData) return '';

    return `
      <div class="vaultum-tv-overlay">
        <div class="vaultum-tv-overlay-grid">
          <div class="vaultum-tv-overlay-card">
            <div class="vaultum-tv-overlay-label">Orderflow Engine</div>
            <strong>${this.escape(this.orderflowData.summary)}</strong>
            <div class="vaultum-tv-overlay-metrics">
              ${this.renderOverlayMetric('Feed', this.orderflowData.feedQuality)}
              ${this.renderOverlayMetric('Mode', this.orderflowData.mode)}
              ${this.renderOverlayMetric('Pressure', String(this.orderflowData.buySellPressure))}
              ${this.renderOverlayMetric('B/A', this.orderflowData.bidAskPressureRatio.toFixed(2))}
              ${this.renderOverlayMetric('Imb', String(this.orderflowData.quoteImbalance))}
              ${this.renderOverlayMetric('Delta', this.orderflowData.priceDeltaDivergence)}
              ${this.renderOverlayMetric('VWAP', `${this.orderflowData.vwapDeviation >= 0 ? '+' : ''}${this.orderflowData.vwapDeviation.toFixed(2)}%`)}
            </div>
          </div>
          <div class="vaultum-tv-overlay-card">
            <div class="vaultum-tv-overlay-label">Detectors</div>
            <div class="vaultum-tv-detector-row">
              <span class="vaultum-tv-detector ${this.orderflowData.absorptionSignal === 'none' ? '' : 'is-alert'}">${this.escape(this.orderflowData.absorptionSignal)}</span>
              <span class="vaultum-tv-detector ${this.orderflowData.exhaustionSignal === 'none' ? '' : 'is-alert'}">${this.escape(this.orderflowData.exhaustionSignal)}</span>
              <span class="vaultum-tv-detector">${this.escape(this.orderflowData.structureState)}</span>
              <span class="vaultum-tv-detector ${this.detectorTone(this.orderflowData.divergenceBias === 'bullish', this.orderflowData.divergenceBias === 'bearish')}">${this.escape(this.orderflowData.divergenceDetail)}</span>
              ${this.pivotData?.signalMap?.buySignal ? '<span class="vaultum-tv-detector is-alert">buy reject</span>' : ''}
              ${this.pivotData?.signalMap?.sellSignal ? '<span class="vaultum-tv-detector is-alert">sell reject</span>' : ''}
              ${this.pivotData?.signalMap?.bullSweep ? '<span class="vaultum-tv-detector is-alert">bull sweep</span>' : ''}
              ${this.pivotData?.signalMap?.bearSweep ? '<span class="vaultum-tv-detector is-alert">bear sweep</span>' : ''}
            </div>
            <div class="vaultum-tv-overlay-label">Imbalance Ladder</div>
            <div class="vaultum-tv-ladder">
              ${this.orderflowData.imbalanceLadder.slice(0, 10).map((level) => `
                <div class="vaultum-tv-ladder-row">
                  <span>${this.escape(level.price.toFixed(2))}</span>
                  <div class="vaultum-tv-ladder-bar">
                    <i class="${level.delta >= 0 ? 'is-buy' : 'is-sell'}" style="width:${Math.max(level.intensity, 8)}%"></i>
                  </div>
                  <strong>${this.escape(level.delta.toFixed(2))}</strong>
                </div>
              `).join('')}
            </div>
            ${this.pivotData ? `
              <div class="vaultum-tv-overlay-label">Mapped Structure</div>
              <div class="vaultum-tv-ladder">
                ${this.renderLevelRows(this.pivotData.institutionalLevels.slice(0, 4))}
              </div>
            ` : ''}
          </div>
        </div>
        <div class="vaultum-tv-footer-flow">
          ${this.orderflowData.recentBars.slice(-8).map((bar) => `
            <div class="vaultum-tv-flow-bar ${bar.delta >= 0 ? 'is-buy' : 'is-sell'}">
              <span>${this.escape(bar.close.toFixed(2))}</span>
              <strong>${this.escape(bar.delta.toFixed(2))}</strong>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private renderStructureRail(): string {
    if (!this.pivotData) return '';
    const rows: Array<{ label: string; price: number; detail: string; tone: 'support' | 'resistance' | 'pivot' | 'dynamic' }> = [];
    const pushRow = (label: string, price: number | null | undefined, detail: string, tone: 'support' | 'resistance' | 'pivot' | 'dynamic') => {
      if (price == null) return;
      const duplicate = rows.some((row) => Math.abs(row.price - price) <= Math.max(Math.abs(price) * 0.0008, 0.15));
      if (duplicate) return;
      rows.push({ label, price, detail, tone });
    };

    pushRow('Mapped R', this.pivotData.mappedResistance?.price, this.pivotData.mappedResistance ? `mapped x${this.pivotData.mappedResistance.touches}` : 'mapped', 'resistance');
    pushRow('R1', this.pivotData.resistances[0], 'classic resistance', 'resistance');
    pushRow('Pivot', this.pivotData.pivot, this.pivotData.structure, 'pivot');
    pushRow('Dynamic', this.pivotData.dynamicLevel, this.pivotData.dynamicState, 'dynamic');
    pushRow('S1', this.pivotData.supports[0], 'classic support', 'support');
    pushRow('Mapped S', this.pivotData.mappedSupport?.price, this.pivotData.mappedSupport ? `mapped x${this.pivotData.mappedSupport.touches}` : 'mapped', 'support');

    rows.sort((left, right) => right.price - left.price);

    return `
      <aside class="vaultum-tv-rail">
        <div class="vaultum-tv-rail-card">
          <div class="vaultum-tv-rail-head">
            <div>
              <span>Right Rail</span>
              <strong>Mapped structure</strong>
            </div>
            <em>${this.pivotData.price != null ? `spot ${this.pivotData.price.toFixed(2)}` : 'spot pending'}</em>
          </div>
          <div class="vaultum-tv-rail-list">
            ${rows.map((row) => `
              <div class="vaultum-tv-rail-row is-${row.tone}">
                <div class="vaultum-tv-rail-tag">${this.escape(row.label)}</div>
                <div class="vaultum-tv-rail-price">${this.escape(row.price.toFixed(2))}</div>
                <div class="vaultum-tv-rail-note">${this.escape(row.detail)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </aside>
    `;
  }

  private renderLevelRows(levels: Array<{ price: number; touches: number; role: string; power: number }>): string {
    if (!levels.length) {
      return '<div class="vaultum-tv-ladder-row"><span>n/a</span><div class="vaultum-tv-ladder-bar"><i class="is-buy" style="width:8%"></i></div><strong>waiting</strong></div>';
    }
    return levels.map((level) => `
      <div class="vaultum-tv-ladder-row">
        <span>${this.escape(level.price.toFixed(2))}</span>
        <div class="vaultum-tv-ladder-bar">
          <i class="${level.role === 'support' ? 'is-buy' : 'is-sell'}" style="width:${Math.max(level.power * 18, 12)}%"></i>
        </div>
        <strong>${this.escape(`${level.role[0]?.toUpperCase() ?? 'L'} x${level.touches}`)}</strong>
      </div>
    `).join('');
  }

  private renderGuidanceCard(label: string, value: string): string {
    return `
      <div class="vaultum-tv-guidance-card">
        <span>${this.escape(label)}</span>
        <strong>${this.escape(value)}</strong>
      </div>
    `;
  }

  private renderOverlayMetric(label: string, value: string): string {
    return `
      <div class="vaultum-tv-overlay-metric">
        <span>${this.escape(label)}</span>
        <strong>${this.escape(value)}</strong>
      </div>
    `;
  }

  private bindEvents(root: HTMLElement, redraw: () => void): void {
    root.querySelectorAll<HTMLButtonElement>('[data-chart-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        const presetKey = button.dataset.chartPreset;
        if (!presetKey || presetKey === this.selectedPresetKey) return;
        this.selectedPresetKey = presetKey;
        this.widgetError = '';
        this.loadedOrderflowKey = '';
        this.loadedPivotKey = '';
        redraw();
      });
    });

    root.querySelectorAll<HTMLButtonElement>('[data-chart-interval]').forEach((button) => {
      button.addEventListener('click', () => {
        const interval = button.dataset.chartInterval as IntervalKey | undefined;
        if (!interval || interval === this.selectedInterval) return;
        this.selectedInterval = interval;
        this.widgetError = '';
        this.loadedOrderflowKey = '';
        this.loadedPivotKey = '';
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
  }

  private async mountWidget(root: HTMLElement, version: number): Promise<void> {
    const host = root.querySelector<HTMLElement>(`#${this.widgetContainerId}`);
    if (!host) return;

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
    } catch {
      if (version !== this.renderVersion) return;
      this.widgetError = `TradingView failed to load for ${preset.label}.`;
      host.innerHTML = `
        <div class="vaultum-callout">
          <strong>Chart unavailable</strong>
          <span>TradingView script did not initialize for ${this.escape(preset.tvSymbol)}.</span>
        </div>
      `;
    }
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
    if (this.selectedInterval === '15m') return '15m';
    if (this.selectedInterval === '30m') return '30m';
    if (this.selectedInterval === '4h') return '4h';
    return '1h';
  }

  private structureTimeframe(): string {
    return this.selectedInterval === '1d' ? '1d' : '1h';
  }

  private feedSummary(): string {
    if (this.pivotLoading) return 'Building structure map...';
    if (this.pivotError && !this.orderflowData) return 'Pivot engine unavailable';
    if (this.orderflowLoading) return 'Checking feed quality...';
    if (this.orderflowError) return 'Orderflow engine unavailable';
    if (!this.orderflowData && this.pivotData) return this.pivotData.sourceLabel ?? 'Live structure map active';
    if (!this.orderflowData) return 'Live proxy feed pending';
    return `Feed ${this.orderflowData.feedQuality} | ${this.orderflowData.mode} | ${this.orderflowData.sourceSymbol}`;
  }

  private availablePresets(): ChartPreset[] {
    const primaryPresetKey = this.resolvePrimaryPresetKey();
    const orderedKeys = [primaryPresetKey, 'DXY', 'EURUSD', 'GBPUSD', 'USDJPY', 'SPX', 'NDX', 'VIX', 'WTI', 'BTCUSD'];
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
    if (CHART_PRESETS[primaryAsset]) return primaryAsset;
    if (primaryAsset === 'GC=F') return 'XAUUSD';
    return 'XAUUSD';
  }

  private isPrimaryPreset(presetKey: string): boolean {
    return presetKey === this.resolvePrimaryPresetKey();
  }

  private publishFocus(): void {
    const preset = this.resolvePreset();
    const focusKey = `${preset.key}:${this.selectedInterval}`;
    if (focusKey === this.lastPublishedFocus) return;
    this.lastPublishedFocus = focusKey;
    publishMarketFocus({ market: preset.key, timeframe: this.selectedInterval });
  }

  private detectorTone(isBullish: boolean | undefined, isBearish: boolean | undefined): string {
    if (isBullish) return 'is-bullish';
    if (isBearish) return 'is-bearish';
    return '';
  }

  private snapshot(): { primaryAsset?: string; execution?: { entryZone?: string; trimZone?: string; noTradeZone?: string; invalidationLevel?: string } } | null {
    return (window as Window & { __vaultumSnapshot?: any }).__vaultumSnapshot ?? null;
  }

  private escape(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
}
