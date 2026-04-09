import { BasePanel } from '@/components/base/panel';
import { getMarketFocus, subscribeMarketFocus, type MarketFocus } from '@/services/market-focus';
import { fetchDataMoat, fetchFeedHealth, fetchTrustMoat, type DataMoatResponse, type FeedHealthResponse, type TrustMoatResponse } from '@/services/system-moats';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export class DataTrustPanel extends BasePanel {
  private marketFocus: MarketFocus = getMarketFocus();
  private dataMoat: DataMoatResponse | null = null;
  private trustMoat: TrustMoatResponse | null = null;
  private feedHealth: FeedHealthResponse | null = null;
  private loading = false;
  private error = '';
  private loadedKey = '';

  constructor() {
    super({ id: 'data-trust', title: 'Data And Trust', kicker: 'Source Discipline', tag: 'trust', tone: 'neutral' });
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
      this.dataMoat = null;
      this.trustMoat = null;
      this.feedHealth = null;
      this.error = '';
      this.loadedKey = '';
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
    if (this.loading && !this.dataMoat && !this.trustMoat && !this.feedHealth) {
      return `<div class="vaultum-callout"><strong>Loading data and trust moat</strong><span>Checking source coverage, fallback discipline, and blindspots for ${escapeHtml(this.marketFocus.market)}.</span></div>`;
    }
    if (this.error && !this.dataMoat && !this.trustMoat && !this.feedHealth) {
      return `<div class="vaultum-callout"><strong>Data and trust moat unavailable</strong><span>${escapeHtml(this.error)}</span></div>`;
    }
    if (!this.dataMoat || !this.trustMoat || !this.feedHealth) {
      return `<div class="vaultum-callout"><strong>Waiting for source discipline layer</strong><span>Coverage, trust, and steering tracks will load here.</span></div>`;
    }

    return `
      <div class="vaultum-trust-shell">
        <div class="vaultum-data-grid">
          <div class="vaultum-primary-card neutral">
            <div class="vaultum-primary-card-head">
              <span>Data moat</span>
              <strong>${escapeHtml(this.dataMoat.status)}</strong>
            </div>
            <div class="vaultum-primary-card-value">${escapeHtml(`${this.dataMoat.moatScore}/100`)}</div>
            <div class="vaultum-primary-card-copy">${escapeHtml(this.dataMoat.summary)}</div>
          </div>
          <div class="vaultum-primary-card neutral">
            <div class="vaultum-primary-card-head">
              <span>Trust moat</span>
              <strong>${escapeHtml(this.trustMoat.status)}</strong>
            </div>
            <div class="vaultum-primary-card-value">${escapeHtml(`${this.trustMoat.trustScore}/100`)}</div>
            <div class="vaultum-primary-card-copy">${escapeHtml(this.trustMoat.summary)}</div>
          </div>
          <div class="vaultum-primary-card neutral">
            <div class="vaultum-primary-card-head">
              <span>Feed health</span>
              <strong>${escapeHtml(this.feedHealth.overallStatus)}</strong>
            </div>
            <div class="vaultum-primary-card-value">${escapeHtml(`${Math.round(this.feedHealth.overallTrustHaircut * 100)}%`)}</div>
            <div class="vaultum-primary-card-copy">${escapeHtml(this.feedHealth.summary)}</div>
          </div>
        </div>

        <div class="vaultum-responsive-card-grid" style="--vaultum-grid-min: 260px;">
          <div class="vaultum-module-card is-full">
            <div class="vaultum-module-card-header">
              <div class="vaultum-module-card-copy">
                <span>Feed Health</span>
                <strong>Freshness and trust haircuts</strong>
              </div>
            </div>
            <div class="vaultum-module-card-body">
              <div class="vaultum-table-wrap">
                <table class="vaultum-table">
                  <thead>
                    <tr><th>Feed</th><th>Status</th><th>Mode</th><th>Haircut</th><th>Age</th><th>Detail</th></tr>
                  </thead>
                  <tbody>
                    ${this.feedHealth.feeds.map((feed) => `
                      <tr>
                        <td>${escapeHtml(feed.label)}</td>
                        <td>${escapeHtml(feed.status)}</td>
                        <td>${escapeHtml(feed.sourceMode)}</td>
                        <td>${escapeHtml(`${Math.round(feed.trustHaircut * 100)}%`)}</td>
                        <td>${escapeHtml(feed.ageMinutes == null ? 'live snapshot' : `${Math.round(feed.ageMinutes)}m / ${feed.staleAfterMinutes}m`)}</td>
                        <td>${escapeHtml(feed.detail)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="vaultum-module-card is-full">
            <div class="vaultum-module-card-header">
              <div class="vaultum-module-card-copy">
                <span>Coverage lenses</span>
                <strong>Where the moat is strong or thin</strong>
              </div>
            </div>
            <div class="vaultum-module-card-body">
              <div class="vaultum-table-wrap">
                <table class="vaultum-table">
                  <thead>
                    <tr><th>Lens</th><th>Score</th><th>Status</th><th>Source</th><th>Summary</th></tr>
                  </thead>
                  <tbody>
                    ${this.dataMoat.lenses.map((lens) => `
                      <tr>
                        <td>${escapeHtml(lens.label)}</td>
                        <td>${escapeHtml(String(lens.score))}</td>
                        <td>${escapeHtml(lens.status)}</td>
                        <td>${escapeHtml(lens.sourceMode)}</td>
                        <td>${escapeHtml(lens.summary)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="vaultum-module-card is-full">
            <div class="vaultum-module-card-header">
              <div class="vaultum-module-card-copy">
                <span>Source ledger</span>
                <strong>How Vaultum should trust itself</strong>
              </div>
            </div>
            <div class="vaultum-module-card-body">
              <div class="vaultum-table-wrap">
                <table class="vaultum-table">
                  <thead>
                    <tr><th>Workflow</th><th>Type</th><th>Quality</th><th>Detail</th></tr>
                  </thead>
                  <tbody>
                    ${this.trustMoat.sourceLedger.map((item) => `
                      <tr>
                        <td>${escapeHtml(item.label)}</td>
                        <td>${escapeHtml(item.sourceType)}</td>
                        <td>${escapeHtml(item.quality)}</td>
                        <td>${escapeHtml(item.detail)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="vaultum-module-card">
            <div class="vaultum-module-card-header">
              <div class="vaultum-module-card-copy">
                <span>Strengths</span>
                <strong>What is already working</strong>
              </div>
            </div>
            <div class="vaultum-module-card-body">
              <div class="vaultum-signal-list">
                ${this.dataMoat.strengths.map((item) => `<div class="vaultum-signal-row neutral"><span>${escapeHtml(item)}</span></div>`).join('')}
              </div>
            </div>
          </div>

          <div class="vaultum-module-card is-alert">
            <div class="vaultum-module-card-header">
              <div class="vaultum-module-card-copy">
                <span>Warnings</span>
                <strong>Trust gaps</strong>
              </div>
            </div>
            <div class="vaultum-module-card-body">
              <div class="vaultum-signal-list">
                ${this.trustMoat.warnings.map((item) => `<div class="vaultum-signal-row alert"><span>${escapeHtml(item)}</span></div>`).join('')}
              </div>
            </div>
          </div>

          <div class="vaultum-module-card">
            <div class="vaultum-module-card-header">
              <div class="vaultum-module-card-copy">
                <span>Safeguards</span>
                <strong>Rules the product should follow</strong>
              </div>
            </div>
            <div class="vaultum-module-card-body">
              <div class="vaultum-signal-list">
                ${this.trustMoat.safeguards.map((item) => `<div class="vaultum-signal-row neutral"><span>${escapeHtml(item)}</span></div>`).join('')}
              </div>
            </div>
          </div>

          <div class="vaultum-module-card is-wide">
            <div class="vaultum-module-card-header">
              <div class="vaultum-module-card-copy">
                <span>Steering tracks</span>
                <strong>The five build tracks</strong>
              </div>
            </div>
            <div class="vaultum-module-card-body">
              <div class="vaultum-signal-list">
                ${this.dataMoat.roadmap.map((track) => `
                  <div class="vaultum-signal-row ${track.status === 'missing' ? 'alert' : 'neutral'}">
                    <span>${escapeHtml(`${track.title} | ${track.priority.toUpperCase()} | ${track.status}`)}</span>
                    <strong>${escapeHtml(track.summary)}</strong>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private async ensureData(redraw: () => void): Promise<void> {
    const key = `${this.marketFocus.market}:${this.marketFocus.timeframe}`;
    if (this.loading) return;
    if (this.loadedKey === key && (this.feedHealth || this.dataMoat || this.trustMoat || this.error)) return;
    this.loading = true;
    this.error = '';
    redraw();

    try {
      const [feedHealth, dataMoat, trustMoat] = await Promise.all([
        fetchFeedHealth(this.marketFocus.market, this.marketFocus.timeframe),
        fetchDataMoat(this.marketFocus.market, this.marketFocus.timeframe),
        fetchTrustMoat(this.marketFocus.market, this.marketFocus.timeframe),
      ]);
      this.feedHealth = feedHealth;
      this.dataMoat = dataMoat;
      this.trustMoat = trustMoat;
      if (!this.feedHealth || !this.dataMoat || !this.trustMoat) {
        this.error = 'One or more moat layers did not return data for the current market focus.';
      } else {
        this.loadedKey = key;
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to load data and trust moat.';
    } finally {
      this.loading = false;
      redraw();
    }
  }
}
