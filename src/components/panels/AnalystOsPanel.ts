import { BasePanel } from '@/components/base/panel';
import { getMarketFocus, subscribeMarketFocus, type MarketFocus } from '@/services/market-focus';
import { fetchAnalystOs, type AnalystOsResponse } from '@/services/analyst-os';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const QUICK_QUERIES = [
  'Run the full desk chain and surface the biggest blindspot.',
  'Show me the execution workflow and what is still missing.',
  'Shift to macro focus and tell me what can break the setup.',
  'Show the risk lens and trust gap first.',
  'Show the portfolio and hedge view first.',
] as const;

export class AnalystOsPanel extends BasePanel {
  private marketFocus: MarketFocus = getMarketFocus();
  private data: AnalystOsResponse | null = null;
  private loading = false;
  private error = '';
  private loadedKey = '';
  private question = '';

  constructor() {
    super({ id: 'analyst-os', title: 'Analyst OS', kicker: 'Decision Chain', tag: 'analyst', tone: 'neutral' });
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
      void this.ensureData(redraw);
    };

    subscribeMarketFocus((focus) => {
      this.marketFocus = focus;
      this.data = null;
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
    if (this.loading && !this.data) {
      return `<div class="vaultum-callout"><strong>Loading Analyst OS</strong><span>Running the regime to review chain for ${escapeHtml(this.marketFocus.market)}.</span></div>`;
    }
    if (this.error && !this.data) {
      return `<div class="vaultum-callout"><strong>Analyst OS unavailable</strong><span>${escapeHtml(this.error)}</span></div>`;
    }
    if (!this.data) {
      return `<div class="vaultum-callout"><strong>Waiting for Analyst OS</strong><span>The terminal will assemble the decision chain, blindspots, and operator workflow here.</span></div>`;
    }

    return `
      <div class="vaultum-analyst-shell">
        <div class="vaultum-primary-card neutral">
          <div class="vaultum-primary-card-head">
            <span>${escapeHtml(this.data.focus)} focus</span>
            <strong>${escapeHtml(`${this.data.market} | ${this.data.timeframe.toUpperCase()}`)}</strong>
          </div>
          <div class="vaultum-primary-card-value">${escapeHtml(this.data.mission)}</div>
          <div class="vaultum-primary-card-copy">${escapeHtml(this.data.summary)}</div>
        </div>

        <div class="vaultum-data-grid">
          <div class="vaultum-data-card">
            <span>Data Moat</span>
            <strong class="value">${escapeHtml(`${this.data.dataMoatScore}/100`)}</strong>
            <div class="detail">${escapeHtml(this.data.dataSummary)}</div>
          </div>
          <div class="vaultum-data-card">
            <span>Trust Moat</span>
            <strong class="value">${escapeHtml(`${this.data.trustScore}/100`)}</strong>
            <div class="detail">${escapeHtml(this.data.trustSummary)}</div>
          </div>
          <div class="vaultum-data-card">
            <span>Blindspots</span>
            <strong class="value">${this.data.blindspots.length}</strong>
            <div class="detail">${escapeHtml(this.data.blindspots[0] ?? 'No major blindspot surfaced on the latest run.')}</div>
          </div>
        </div>

        <div class="vaultum-analyst-query">
          <label class="vaultum-journal-field vaultum-journal-field-wide">
            <span>Workflow Query</span>
            <input id="vaultum-analyst-question" type="text" value="${escapeHtml(this.question)}" placeholder="Ask for macro, execution, risk, portfolio, or blindspot focus" />
          </label>
          <div class="vaultum-analyst-prompt-row">
            ${QUICK_QUERIES.map((prompt) => `<button class="vaultum-btn" data-analyst-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join('')}
          </div>
          <div class="vaultum-analyst-actions">
            <span>Vaultum now runs the chain as: regime -> phase -> setup -> execution -> risk -> review.</span>
            <button id="vaultum-analyst-run" class="vaultum-btn vaultum-btn-primary">${this.loading ? 'Running...' : 'Run Analyst OS'}</button>
          </div>
        </div>

        <div class="vaultum-responsive-card-grid" style="--vaultum-grid-min: 260px;">
          <div class="vaultum-module-card is-full">
            <div class="vaultum-module-card-header">
              <div class="vaultum-module-card-copy">
                <span>Decision chain</span>
                <strong>Regime to review</strong>
                <em>Every step must explain both the reason and the operator action.</em>
              </div>
            </div>
            <div class="vaultum-module-card-body">
              <div class="vaultum-table-wrap">
                <table class="vaultum-table">
                  <thead>
                    <tr><th>Stage</th><th>State</th><th>Confidence</th><th>Reason</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    ${this.data.decisionChain.map((item) => `
                      <tr>
                        <td>${escapeHtml(item.label)}</td>
                        <td>${escapeHtml(item.state)}</td>
                        <td>${escapeHtml(item.confidence)}</td>
                        <td>${escapeHtml(item.reason)}</td>
                        <td>${escapeHtml(item.action)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="vaultum-module-card is-alert">
            <div class="vaultum-module-card-header">
              <div class="vaultum-module-card-copy">
                <span>Blindspots</span>
                <strong>Meaningful gaps</strong>
              </div>
            </div>
            <div class="vaultum-module-card-body">
              <div class="vaultum-signal-list">
                ${(this.data.blindspots.length ? this.data.blindspots : ['No major blindspot surfaced.']).map((item) => `
                  <div class="vaultum-signal-row alert"><span>${escapeHtml(item)}</span></div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="vaultum-module-card">
            <div class="vaultum-module-card-header">
              <div class="vaultum-module-card-copy">
                <span>Operator plan</span>
                <strong>How to work the stack</strong>
              </div>
            </div>
            <div class="vaultum-module-card-body">
              <div class="vaultum-signal-list">
                ${this.data.operatorPlan.map((item) => `
                  <div class="vaultum-signal-row neutral"><span>${escapeHtml(item)}</span></div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="vaultum-module-card">
            <div class="vaultum-module-card-header">
              <div class="vaultum-module-card-copy">
                <span>Next queries</span>
                <strong>Analyst prompts</strong>
              </div>
            </div>
            <div class="vaultum-module-card-body">
              <div class="vaultum-signal-list">
                ${this.data.nextQueries.map((item) => `
                  <div class="vaultum-signal-row neutral"><span>${escapeHtml(item)}</span></div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="vaultum-module-card is-wide">
            <div class="vaultum-module-card-header">
              <div class="vaultum-module-card-copy">
                <span>Steering tracks</span>
                <strong>Build plan inside the product</strong>
              </div>
            </div>
            <div class="vaultum-module-card-body">
              <div class="vaultum-signal-list">
                ${this.data.steeringTracks.map((track) => `
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

  private bindEvents(root: HTMLElement, redraw: () => void): void {
    root.querySelector<HTMLInputElement>('#vaultum-analyst-question')?.addEventListener('input', (event) => {
      this.question = (event.currentTarget as HTMLInputElement).value;
    });

    root.querySelectorAll<HTMLButtonElement>('[data-analyst-prompt]').forEach((button) => {
      button.addEventListener('click', () => {
        this.question = button.dataset.analystPrompt ?? '';
        this.loadedKey = '';
        void this.ensureData(redraw, true);
      });
    });

    root.querySelector<HTMLButtonElement>('#vaultum-analyst-run')?.addEventListener('click', () => {
      this.loadedKey = '';
      void this.ensureData(redraw, true);
    });
  }

  private async ensureData(redraw: () => void, force = false): Promise<void> {
    const key = `${this.marketFocus.market}:${this.marketFocus.timeframe}:${this.question.trim()}`;
    if (this.loading) return;
    if (!force && this.loadedKey === key && (this.data || this.error)) return;
    this.loading = true;
    this.error = '';
    redraw();

    try {
      this.data = await fetchAnalystOs(this.marketFocus.market, this.marketFocus.timeframe, this.question);
      if (!this.data) {
        this.error = 'Analyst OS did not return data for the current market focus.';
      } else {
        this.loadedKey = key;
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to load Analyst OS.';
    } finally {
      this.loading = false;
      redraw();
    }
  }
}

