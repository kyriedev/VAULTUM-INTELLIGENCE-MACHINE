import { BasePanel } from '@/components/base/panel';
import { getMarketFocus, subscribeMarketFocus, type MarketFocus } from '@/services/market-focus';
import { fetchMarketBrief, type MarketBriefResponse } from '@/services/market-brief';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function fmtMove(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export class MarketBriefPanel extends BasePanel {
  private marketFocus: MarketFocus = getMarketFocus();
  private data: MarketBriefResponse | null = null;
  private loading = false;
  private error = '';
  private loadedKey = '';

  constructor() {
    super({ id: 'market-brief', title: 'Market Brief', kicker: 'Desk Open', tag: 'brief', tone: 'neutral' });
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
    const marketLabel = `${this.marketFocus.market} | ${this.marketFocus.timeframe.toUpperCase()}`;
    if (this.loading && !this.data) {
      return `<div class="vaultum-callout"><strong>Building market brief</strong><span>Loading the live desk note for ${escapeHtml(marketLabel)}.</span></div>`;
    }
    if (this.error && !this.data) {
      return `<div class="vaultum-callout"><strong>Market brief unavailable</strong><span>${escapeHtml(this.error)}</span></div>`;
    }
    if (!this.data) {
      return `<div class="vaultum-callout"><strong>Waiting for market brief</strong><span>The pre-session desk note will appear here.</span></div>`;
    }

    return `
      <div class="vaultum-brief-shell">
        <div class="vaultum-brief-hero">
          <div class="vaultum-callout">
            <strong>${escapeHtml(this.data.summary)}</strong>
            <span>${escapeHtml(this.data.sourceLabel)}</span>
          </div>
          <div class="vaultum-brief-stats">
            ${this.metricCard('Stance', this.data.stance)}
            ${this.metricCard('Confidence', this.data.confidence)}
            ${this.metricCard('Sentiment', this.data.metrics.sentiment != null ? `${this.data.metrics.sentiment.toFixed(1)} ${this.data.metrics.sentimentLabel}` : 'n/a')}
            ${this.metricCard('MC Target', this.data.metrics.targetHitProbability != null ? `${this.data.metrics.targetHitProbability.toFixed(1)}%` : 'n/a')}
          </div>
        </div>
        <div class="vaultum-brief-grid">
          <div class="vaultum-brief-card">
            <span>Action Plan</span>
            <strong>${escapeHtml(this.data.actionPlan)}</strong>
          </div>
          <div class="vaultum-brief-card">
            <span>Risk Watch</span>
            <strong>${escapeHtml(this.data.riskWatch)}</strong>
          </div>
        </div>
        <div class="vaultum-brief-watchlist">
          ${this.data.watchlist.map((item) => `
            <div class="vaultum-brief-row is-${item.stance}">
              <div>
                <strong>${escapeHtml(item.display)}</strong>
                <span>${escapeHtml(item.note)}</span>
              </div>
              <div class="vaultum-brief-price">
                <em>${item.price != null ? escapeHtml(item.price.toFixed(2)) : 'n/a'}</em>
                <strong>${escapeHtml(fmtMove(item.change))}</strong>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="vaultum-brief-checklist">
          ${this.data.confirmationChecklist.map((item) => `
            <div class="vaultum-brief-pill">${escapeHtml(item)}</div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private metricCard(label: string, value: string): string {
    return `
      <div class="vaultum-metric neutral">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
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
      this.data = await fetchMarketBrief(this.marketFocus.market, this.marketFocus.timeframe);
      this.loadedKey = key;
      if (!this.data) this.error = `No brief returned for ${this.marketFocus.market}.`;
    } catch (error) {
      this.data = null;
      this.loadedKey = key;
      this.error = error instanceof Error ? error.message : 'Market brief request failed.';
    }
    this.loading = false;
    redraw();
  }
}
