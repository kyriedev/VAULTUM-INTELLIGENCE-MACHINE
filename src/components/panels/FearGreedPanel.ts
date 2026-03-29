import { BasePanel } from '@/components/base/panel';
import { fetchFearGreed, type FearGreedResponse } from '@/services/fear-greed';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function scoreColor(score: number): string {
  if (score <= 20) return '#f05d5e';
  if (score <= 40) return '#f5a65b';
  if (score <= 60) return '#f0d264';
  if (score <= 80) return '#77dd77';
  return '#4fd18b';
}

export class FearGreedPanel extends BasePanel {
  private data: FearGreedResponse | null = null;
  private loading = false;
  private loaded = false;
  private error = '';

  constructor() {
    super({ id: 'fear-greed', title: 'Fear & Greed', kicker: 'Sentiment Composite', tag: 'sentiment', tone: 'neutral' });
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

    redraw();
    window.addEventListener('vaultum:snapshot-updated', () => {
      this.loaded = false;
      void this.ensureData(redraw);
    });
    return panel;
  }

  protected renderBody(): string {
    if (this.loading && !this.data) {
      return `<div class="vaultum-callout"><strong>Building sentiment composite</strong><span>Pulling the live fear and greed stack from the current market session.</span></div>`;
    }
    if (this.error && !this.data) {
      return `<div class="vaultum-callout"><strong>Fear &amp; Greed unavailable</strong><span>${escapeHtml(this.error)}</span></div>`;
    }
    if (!this.data) {
      return `<div class="vaultum-callout"><strong>Waiting for sentiment data</strong><span>The live composite will appear here.</span></div>`;
    }

    const color = scoreColor(this.data.compositeScore);

    return `
      <div class="vaultum-fg-shell">
        <div class="vaultum-fg-hero">
          <div class="vaultum-fg-gauge" style="--fg-color:${color};--fg-score:${this.data.compositeScore};">
            <div class="vaultum-fg-ring">
              <div class="vaultum-fg-score">${Math.round(this.data.compositeScore)}</div>
              <span>${escapeHtml(this.data.compositeLabel)}</span>
            </div>
          </div>
          <div class="vaultum-fg-copy">
            <strong>${escapeHtml(this.data.summary)}</strong>
            <span>${escapeHtml(this.data.sourceLabel)}</span>
            <div class="vaultum-fg-regimes">
              <div><em>Macro</em><strong>${escapeHtml(this.data.regimes.macro)}</strong></div>
              <div><em>Liquidity</em><strong>${escapeHtml(this.data.regimes.liquidity)}</strong></div>
              <div><em>Cross-Asset</em><strong>${escapeHtml(this.data.regimes.crossAsset)}</strong></div>
            </div>
          </div>
        </div>
        <div class="vaultum-fg-grid">
          ${this.data.categories.map((category) => `
            <div class="vaultum-fg-card">
              <div class="vaultum-fg-card-head">
                <strong>${escapeHtml(category.label)}</strong>
                <span style="color:${scoreColor(category.score)}">${category.score.toFixed(0)}</span>
              </div>
              <div class="vaultum-fg-bar">
                <i style="width:${Math.max(category.score, 8)}%;background:${scoreColor(category.score)}"></i>
              </div>
              <p>${escapeHtml(category.detail)}</p>
            </div>
          `).join('')}
        </div>
        ${this.data.warnings.length ? `
          <div class="vaultum-alert-stack">
            ${this.data.warnings.map((warning) => `<div class="vaultum-alert-row">${escapeHtml(warning)}</div>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  private async ensureData(redraw: () => void): Promise<void> {
    if (this.loading || this.loaded) return;
    this.loading = true;
    this.error = '';
    redraw();
    try {
      this.data = await fetchFearGreed();
      this.loaded = true;
      if (!this.data) this.error = 'No sentiment payload returned.';
    } catch (error) {
      this.data = null;
      this.loaded = true;
      this.error = error instanceof Error ? error.message : 'Fear and greed request failed.';
    }
    this.loading = false;
    redraw();
  }
}
