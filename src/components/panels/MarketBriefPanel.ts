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
        <div class="vaultum-primary-card neutral">
          <div class="vaultum-primary-card-head">
            <span>Desk Stance</span>
            <strong>${escapeHtml(this.data.confidence)}</strong>
          </div>
          <div class="vaultum-primary-card-value">${escapeHtml(this.data.stance)}</div>
          <div class="vaultum-primary-card-copy">${escapeHtml(this.data.summary)}</div>
        </div>
        <div class="vaultum-metric-grid">
          ${this.metricCard('Source', this.data.sourceLabel)}
          ${this.metricCard('Sentiment', this.data.metrics.sentiment != null ? `${this.data.metrics.sentiment.toFixed(1)} ${this.data.metrics.sentimentLabel}` : 'n/a')}
          ${this.metricCard('Pressure', this.data.metrics.pressure)}
          ${this.metricCard('Orderflow', this.data.metrics.orderflow)}
          ${this.metricCard('MC Target', this.data.metrics.targetHitProbability != null ? `${this.data.metrics.targetHitProbability.toFixed(1)}%` : 'n/a')}
          ${this.metricCard('MC Invalidation', this.data.metrics.invalidationProbability != null ? `${this.data.metrics.invalidationProbability.toFixed(1)}%` : 'n/a')}
        </div>
        <div class="vaultum-data-grid vaultum-data-grid--halves">
          <div class="vaultum-data-card">
            <span>Action Plan</span>
            <strong class="value">${escapeHtml(this.data.actionPlan)}</strong>
            <div class="detail">${escapeHtml(this.data.sourceLabel)}</div>
          </div>
          <div class="vaultum-data-card">
            <span>Risk Watch</span>
            <strong class="value">${escapeHtml(this.data.riskWatch)}</strong>
            <div class="detail">${escapeHtml(`${this.data.market} | ${this.data.timeframe.toUpperCase()}`)}</div>
          </div>
        </div>
        ${this.data.deskRecommendation ? `
          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head">
              <span>Desk Recommendation</span>
              <strong>${escapeHtml(`${this.data.deskRecommendation.bias} | ${this.data.deskRecommendation.biasScore}`)}</strong>
            </div>
            <div class="vaultum-data-grid">
              <div class="vaultum-data-card">
                <span>Institutional Bias</span>
                <strong class="value">${escapeHtml(this.data.deskRecommendation.institutionalSummary)}</strong>
              </div>
              <div class="vaultum-data-card">
                <span>Entry</span>
                <strong class="value">${escapeHtml(this.data.deskRecommendation.entrySuggestion)}</strong>
              </div>
              <div class="vaultum-data-card">
                <span>Re-entry</span>
                <strong class="value">${escapeHtml(this.data.deskRecommendation.reEntrySuggestion)}</strong>
              </div>
              <div class="vaultum-data-card">
                <span>Exit</span>
                <strong class="value">${escapeHtml(this.data.deskRecommendation.exitSuggestion)}</strong>
              </div>
              <div class="vaultum-data-card">
                <span>Monte Carlo</span>
                <strong class="value">${escapeHtml(this.data.deskRecommendation.monteCarloSummary)}</strong>
              </div>
              <div class="vaultum-data-card">
                <span>Options Math</span>
                <strong class="value">${escapeHtml(this.data.deskRecommendation.optionsMathSummary)}</strong>
              </div>
            </div>
          </div>
        ` : ''}
        ${this.data.reportMeasures?.length ? `
          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head">
              <span>Desk Measures</span>
              <strong>${this.data.reportMeasures.length}</strong>
            </div>
            <div class="vaultum-data-grid">
            ${this.data.reportMeasures.map((measure) => `
              <div class="vaultum-data-card is-${measure.status}">
                <span>${escapeHtml(measure.label)}</span>
                <strong class="value">${escapeHtml(measure.value)}</strong>
                <div class="detail">${escapeHtml(measure.detail)}</div>
              </div>
            `).join('')}
            </div>
          </div>
        ` : ''}
        ${this.data.signalDiagnostics?.length ? `
          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head">
              <span>Signal Diagnostics</span>
              <strong>${this.data.signalDiagnostics.length}</strong>
            </div>
            <div class="vaultum-data-grid">
            ${this.data.signalDiagnostics.slice(0, 8).map((signal) => `
              <div class="vaultum-data-card is-${signal.status}">
                <span>${escapeHtml(signal.label)}</span>
                <strong class="value">${escapeHtml(`${signal.confidence} ${signal.confidenceScore}`)}</strong>
                <div class="detail">${escapeHtml(signal.summary)}</div>
                <div class="meta">${escapeHtml(signal.sources.join(' | '))}</div>
              </div>
            `).join('')}
            </div>
          </div>
        ` : ''}
        ${(this.data.executionCommittee || this.data.riskEnvelope) ? `
          <div class="vaultum-data-grid vaultum-data-grid--halves">
            ${this.data.executionCommittee ? `
              <div class="vaultum-data-card">
                <span>Execution Committee</span>
                <strong class="value">${escapeHtml(`${this.data.executionCommittee.action} | ${this.data.executionCommittee.ensembleScore}`)}</strong>
                <div class="detail">${escapeHtml(this.data.executionCommittee.summary)}</div>
              </div>
            ` : ''}
            ${this.data.riskEnvelope ? `
              <div class="vaultum-data-card">
                <span>Risk Envelope</span>
                <strong class="value">${escapeHtml(`${this.data.riskEnvelope.sizeBand} | ${(this.data.riskEnvelope.riskBudgetPct * 100).toFixed(0)}% normal risk`)}</strong>
                <div class="detail">${escapeHtml(this.data.riskEnvelope.body)}</div>
              </div>
            ` : ''}
          </div>
        ` : ''}
        ${this.data.sections ? `
          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head">
              <span>Desk Sections</span>
              <strong>${Object.values(this.data.sections).length}</strong>
            </div>
            <div class="vaultum-data-grid">
            ${Object.values(this.data.sections).map((section) => `
              <div class="vaultum-data-card is-${section.tone}">
                <span>${escapeHtml(section.title)}</span>
                <strong class="value">${escapeHtml(section.body)}</strong>
              </div>
            `).join('')}
            </div>
          </div>
        ` : ''}
        ${this.data.decisionStages?.length ? `
          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head">
              <span>Decision Flow</span>
              <strong>${this.data.decisionStages.length}</strong>
            </div>
            <div class="vaultum-data-grid">
            ${this.data.decisionStages.map((stage) => `
              <div class="vaultum-data-card is-${stage.tone}">
                <span>${escapeHtml(stage.title)}</span>
                <strong class="value">${escapeHtml(stage.body)}</strong>
              </div>
            `).join('')}
            </div>
          </div>
        ` : ''}
        <div class="vaultum-data-block">
          <div class="vaultum-data-block-head">
            <span>Watchlist</span>
            <strong>${this.data.watchlist.length}</strong>
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
        </div>
        <div class="vaultum-data-block">
          <div class="vaultum-data-block-head">
            <span>Confirmation</span>
            <strong>${this.data.confirmationChecklist.length}</strong>
          </div>
          <div class="vaultum-brief-checklist">
          ${this.data.confirmationChecklist.map((item) => `
            <div class="vaultum-brief-pill">${escapeHtml(item)}</div>
          `).join('')}
          </div>
        </div>
        ${this.data.invalidationChecklist?.length ? `
          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head">
              <span>Invalidation</span>
              <strong>${this.data.invalidationChecklist.length}</strong>
            </div>
            <div class="vaultum-brief-checklist">
            ${this.data.invalidationChecklist.map((item) => `
              <div class="vaultum-brief-pill is-alert">${escapeHtml(item)}</div>
            `).join('')}
            </div>
          </div>
        ` : ''}
        ${this.data.warnings?.length ? `
          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head">
              <span>Warnings</span>
              <strong>${this.data.warnings.length}</strong>
            </div>
            <div class="vaultum-signal-list">
              ${this.data.warnings.map((item) => `<div class="vaultum-signal-row alert"><span>${escapeHtml(item)}</span></div>`).join('')}
            </div>
          </div>
        ` : ''}
        ${this.data.memoryMatches?.length ? `
          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head">
              <span>Situation Memory</span>
              <strong>${this.data.memoryMatches.length}</strong>
            </div>
            <div class="vaultum-signal-list">
              ${this.data.memoryMatches.map((item) => `<div class="vaultum-signal-row"><span>${escapeHtml(`Memory ${Math.round(item.similarityScore * 100)}% | ${item.outcome ?? 'open'} | ${item.recommendation}`)}</span></div>`).join('')}
            </div>
          </div>
        ` : ''}
        ${this.data.deskRecommendation?.quotedEvidence?.length ? `
          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head">
              <span>Quoted Evidence</span>
              <strong>${this.data.deskRecommendation.quotedEvidence.length}</strong>
            </div>
            <div class="vaultum-signal-list">
              ${this.data.deskRecommendation.quotedEvidence.map((item) => `<div class="vaultum-signal-row"><span>${escapeHtml(`[${item.status}] ${item.label} | ${item.source} | ${item.quote}`)}</span></div>`).join('')}
            </div>
          </div>
        ` : ''}
        ${this.data.sourceTrace?.length ? `
          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head">
              <span>Source Trace</span>
              <strong>${Math.min(this.data.sourceTrace.length, 6)}</strong>
            </div>
            <div class="vaultum-signal-list">
              ${this.data.sourceTrace.slice(0, 6).map((item) => `<div class="vaultum-signal-row"><span>${escapeHtml(item)}</span></div>`).join('')}
            </div>
          </div>
        ` : ''}
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
