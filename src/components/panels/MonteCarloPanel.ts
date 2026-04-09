import { BasePanel } from '@/components/base/panel';
import { renderPanelSummaryBlock } from '@/components/panels/_panel-summary';
import { getMarketFocus, subscribeMarketFocus, type MarketFocus } from '@/services/market-focus';
import { fetchMonteCarloScenario, type MonteCarloScenarioResponse } from '@/services/scenario';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function toneForProbability(probability: number): 'bullish' | 'bearish' | 'neutral' {
  if (probability >= 60) return 'bullish';
  if (probability <= 40) return 'bearish';
  return 'neutral';
}

function toneForEdge(value: number | null | undefined): 'bullish' | 'bearish' | 'neutral' {
  if (value == null) return 'neutral';
  if (value >= 5) return 'bullish';
  if (value <= -5) return 'bearish';
  return 'neutral';
}

function formatProbability(value: number | null | undefined): string {
  return value == null ? 'n/a' : `${value.toFixed(1)}%`;
}

function formatSignedPoints(value: number | null | undefined): string {
  if (value == null) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)} pts`;
}

export class MonteCarloPanel extends BasePanel {
  private marketFocus: MarketFocus = getMarketFocus();
  private data: MonteCarloScenarioResponse | null = null;
  private loading = false;
  private error = '';
  private loadedKey = '';

  constructor() {
    super({ id: 'monte-carlo', title: 'Monte Carlo', kicker: 'Scenario Engine', tag: 'scenario', tone: 'neutral' });
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
      redraw();
    });

    redraw();
    return panel;
  }

  protected renderBody(): string {
    const marketLabel = `${this.marketFocus.market} | ${this.marketFocus.timeframe.toUpperCase()}`;
    if (this.loading && !this.data) {
      return `<div class="vaultum-callout"><strong>Running scenario engine</strong><span>Building Monte Carlo distribution for ${escapeHtml(marketLabel)}.</span></div>`;
    }
    if (this.error && !this.data) {
      return `<div class="vaultum-callout"><strong>Scenario engine unavailable</strong><span>${escapeHtml(this.error)}</span></div>`;
    }
    if (!this.data) {
      return `<div class="vaultum-callout"><strong>Waiting for scenario data</strong><span>Monte Carlo path probabilities will appear here.</span></div>`;
    }

    return `
      <div class="vaultum-mc-shell">
        <div class="vaultum-callout">
          <strong>${escapeHtml(this.data.summary)}</strong>
          <span>${escapeHtml(this.data.sourceLabel)}</span>
        </div>
        <div class="vaultum-mc-grid">
          ${this.metricCard('Bias', this.data.pathBias, toneForProbability(this.data.targetHitProbability))}
          ${this.metricCard('Target First', `${this.data.targetFirstProbability.toFixed(1)}%`, toneForProbability(this.data.targetFirstProbability))}
          ${this.metricCard('Invalidation First', `${this.data.invalidationFirstProbability.toFixed(1)}%`, toneForProbability(100 - this.data.invalidationFirstProbability))}
          ${this.metricCard('Break Even', `${this.data.breakEvenProbability.toFixed(1)}%`, toneForProbability(this.data.breakEvenProbability))}
          ${this.metricCard('Median Max DD', `${this.data.medianMaxDrawdownPct.toFixed(2)}%`, this.data.medianMaxDrawdownPct <= 2.5 ? 'bullish' : this.data.medianMaxDrawdownPct >= 4.5 ? 'bearish' : 'neutral')}
          ${this.metricCard('Engine', this.data.pathMethod.includes('qmc') ? 'QMC antithetic' : this.data.pathMethod, this.data.scenarioQuality === 'high' ? 'bullish' : this.data.scenarioQuality === 'cautious' ? 'bearish' : 'neutral')}
        </div>
        <div class="vaultum-callout">
          <strong>Neutral benchmark</strong>
          <span>${escapeHtml(this.data.benchmark.summary)}</span>
        </div>
        ${renderPanelSummaryBlock({
          headline: `${this.data.pathBias} bias with ${this.data.targetFirstProbability.toFixed(1)}% target-first versus ${this.data.invalidationFirstProbability.toFixed(1)}% invalidation-first.`,
          bullets: [
            this.data.targetFirstProbability > this.data.invalidationFirstProbability
              ? 'Path odds still favor the thesis more than failure.'
              : 'Failure odds are not clearly subordinate to the thesis yet.',
            `Neutral benchmark: ${this.data.benchmark.summary}`,
            `Regime mix T${this.data.regimeMix.trend}% / MR${this.data.regimeMix.meanReversion}% / S${this.data.regimeMix.shock}%.`,
          ],
          tone: toneForProbability(this.data.targetFirstProbability),
          statusLabel: this.data.scenarioQuality,
        })}
        <div class="vaultum-mc-grid">
          ${this.metricCard('Neutral Vol', `${this.data.benchmark.annualizedVolPct.toFixed(1)}%`, 'neutral')}
          ${this.metricCard('1 Sigma Move', `${this.data.benchmark.expectedMove.toFixed(2)} | ${this.data.benchmark.expectedMovePct.toFixed(2)}%`, 'neutral')}
          ${this.metricCard('Above Target', formatProbability(this.data.benchmark.terminalAboveTargetProbability), toneForProbability(this.data.benchmark.terminalAboveTargetProbability ?? 50))}
          ${this.metricCard('Below Invalid.', formatProbability(this.data.benchmark.terminalBelowInvalidationProbability), toneForProbability(100 - (this.data.benchmark.terminalBelowInvalidationProbability ?? 50)))}
          ${this.metricCard('Upside Gap', formatSignedPoints(this.data.benchmark.targetHitVsNeutralTerminalDiff), toneForEdge(this.data.benchmark.targetHitVsNeutralTerminalDiff))}
          ${this.metricCard('Downside Gap', formatSignedPoints(this.data.benchmark.invalidationVsNeutralTerminalDiff), toneForEdge(this.data.benchmark.invalidationVsNeutralTerminalDiff))}
        </div>
        <div class="vaultum-mc-bands">
          ${['p05', 'p25', 'p50', 'p75', 'p95'].map((key) => `
            <div class="vaultum-mc-band">
              <span>${escapeHtml(key.toUpperCase())}</span>
              <strong>${escapeHtml(this.data!.scenarioBands[key as keyof MonteCarloScenarioResponse['scenarioBands']].toFixed(2))}</strong>
            </div>
          `).join('')}
        </div>
        <div class="vaultum-mc-scenarios">
          ${this.data.scenarioMap.map((scenario) => `
            <div class="vaultum-mc-row">
              <div>
                <strong>${escapeHtml(scenario.name)}</strong>
                <span>${escapeHtml(scenario.detail)}</span>
              </div>
              <em>${escapeHtml(scenario.probability.toFixed(1))}%</em>
            </div>
          `).join('')}
        </div>
        <div class="vaultum-mc-footer">
          <span>${escapeHtml(`${this.data.market} over ${this.data.horizonLabel} with ${this.data.simulations} simulations | quality ${this.data.scenarioQuality}.`)}</span>
          <strong>${escapeHtml(`regime mix T${this.data.regimeMix.trend}% / MR${this.data.regimeMix.meanReversion}% / S${this.data.regimeMix.shock}% | drivers: ${this.data.drivers.slice(0, 3).join(' | ')}`)}</strong>
        </div>
      </div>
    `;
  }

  private metricCard(label: string, value: string, tone: 'bullish' | 'bearish' | 'neutral'): string {
    return `
      <div class="vaultum-metric ${tone}">
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
      this.data = await fetchMonteCarloScenario(this.marketFocus.market, this.marketFocus.timeframe);
      this.loadedKey = key;
      if (!this.data) this.error = `No scenario data returned for ${this.marketFocus.market}.`;
    } catch (error) {
      this.data = null;
      this.loadedKey = key;
      this.error = error instanceof Error ? error.message : 'Monte Carlo scenario request failed.';
    }
    this.loading = false;
    redraw();
  }
}
