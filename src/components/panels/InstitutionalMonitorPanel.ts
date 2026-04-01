import { BasePanel } from '@/components/base/panel';
import { getMarketFocus, subscribeMarketFocus, type MarketFocus } from '@/services/market-focus';
import { fetchInstitutionalMonitor, type InstitutionalMonitorResponse } from '@/services/institutional-monitor';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export class InstitutionalMonitorPanel extends BasePanel {
  private marketFocus: MarketFocus = getMarketFocus();
  private data: InstitutionalMonitorResponse | null = null;
  private loading = false;
  private error = '';
  private loadedKey = '';

  constructor() {
    super({ id: 'institutional-monitor', title: 'Institutional Monitor', kicker: 'Seven Stack', tag: 'monitor', tone: 'neutral' });
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
      void this.ensureData(redraw);
    };

    subscribeMarketFocus((focus) => {
      this.marketFocus = focus;
      this.data = null;
      this.error = '';
      redraw();
    });

    window.addEventListener('vaultum:snapshot-updated', () => {
      this.loadedKey = '';
      void this.ensureData(redraw);
    });

    redraw();
    return panel;
  }

  protected renderBody(): string {
    if (this.loading && !this.data) {
      return `<div class="vaultum-callout"><strong>Loading institutional monitor</strong><span>Reading the live seven-stack monitor for ${escapeHtml(this.marketFocus.market)}.</span></div>`;
    }
    if (this.error && !this.data) {
      return `<div class="vaultum-callout"><strong>Institutional monitor unavailable</strong><span>${escapeHtml(this.error)}</span></div>`;
    }
    if (!this.data) {
      return `<div class="vaultum-callout"><strong>Waiting for institutional monitor</strong><span>Rates, dollar, dealers, COT, liquidity, policy, and stress will load here.</span></div>`;
    }

    return `
      <div class="vaultum-monitor-shell">
        <div class="vaultum-primary-card neutral">
          <div class="vaultum-primary-card-head">
            <span>Seven Stack</span>
            <strong>${escapeHtml(this.data.sourceLabel)}</strong>
          </div>
          <div class="vaultum-primary-card-value">${escapeHtml(this.data.summary)}</div>
          <div class="vaultum-primary-card-copy">${escapeHtml(`${this.data.market} | ${this.data.timeframe.toUpperCase()}`)}</div>
        </div>
        <div class="vaultum-data-grid">
          ${this.data.items.map((item) => `
            <div class="vaultum-data-card is-${item.status}">
              <span>${escapeHtml(item.label)}</span>
              <strong class="value">${escapeHtml(item.state)}</strong>
              <div class="meta">${escapeHtml(`${item.confidence} ${item.confidenceScore}`)}</div>
              <div class="detail">${escapeHtml(item.summary)}</div>
            </div>
          `).join('')}
        </div>
        ${this.data.alerts?.length ? `
          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head">
              <span>Alerts</span>
              <strong>${this.data.alerts.length}</strong>
            </div>
            <div class="vaultum-signal-list">
              ${this.data.alerts.map((alert) => `<div class="vaultum-signal-row alert"><span>${escapeHtml(alert)}</span></div>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  private async ensureData(redraw: () => void): Promise<void> {
    const key = `${this.marketFocus.market}:${this.marketFocus.timeframe}`;
    if (this.loading) return;
    if (this.loadedKey === key && (this.data || this.error)) return;
    this.loading = true;
    this.error = '';
    redraw();

    try {
      this.data = await fetchInstitutionalMonitor(this.marketFocus.market, this.marketFocus.timeframe);
      this.loadedKey = key;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to load institutional monitor.';
    } finally {
      this.loading = false;
      redraw();
    }
  }
}
