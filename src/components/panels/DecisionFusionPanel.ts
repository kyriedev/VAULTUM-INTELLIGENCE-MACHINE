import { BasePanel } from '@/components/base/panel';
import { renderPanelSummaryBlock } from '@/components/panels/_panel-summary';
import { getMarketFocus, subscribeMarketFocus, type MarketFocus } from '@/services/market-focus';
import { fetchMarketDecisionEngine, type MarketDecisionEngineResponse } from '@/services/intelligence/market-decision';

function escapeHtml(value: string): string {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function toneForBias(value: string | null | undefined): 'neutral' | 'bullish' | 'bearish' | 'alert' {
  const lower = String(value || '').toLowerCase();
  if (lower.includes('bull')) return 'bullish';
  if (lower.includes('bear')) return 'bearish';
  if (lower.includes('mixed')) return 'alert';
  return 'neutral';
}

function fmtPercent(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return `${(value * 100).toFixed(digits)}%`;
}

function fmtConfidence(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return `${Math.round(value * 100)}%`;
}

function fmtNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function levelList(levels: number[] | undefined): string {
  return levels?.length ? levels.map((value) => fmtNumber(value)).join(' / ') : 'n/a';
}

export class DecisionFusionPanel extends BasePanel {
  private marketFocus: MarketFocus = getMarketFocus();
  private data: MarketDecisionEngineResponse | null = null;
  private loading = false;
  private error = '';
  private loadedKey = '';

  constructor() {
    super({ id: 'decision-fusion', title: 'Decision Fusion', kicker: 'Intelligence Layer', tag: 'fusion', tone: 'neutral' });
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
    const label = `${this.marketFocus.market} | ${this.marketFocus.timeframe.toUpperCase()}`;
    if (this.loading && !this.data) {
      return `<div class="vaultum-callout"><strong>Building intelligence fusion</strong><span>Fusing news, hedgers, options, and Monte Carlo context for ${escapeHtml(label)}.</span></div>`;
    }
    if (this.error && !this.data) {
      return `<div class="vaultum-callout"><strong>Decision fusion unavailable</strong><span>${escapeHtml(this.error)}</span></div>`;
    }
    if (!this.data) {
      return `<div class="vaultum-callout"><strong>Waiting for intelligence layer</strong><span>The market decision engine will populate when the multi-source fusion completes.</span></div>`;
    }

    const confluence = this.data.confluence;
    const supportLevels = confluence.derivedMetrics.keyLevels.support;
    const resistanceLevels = confluence.derivedMetrics.keyLevels.resistance;
    const strikePressure = this.data.options?.derivedMetrics?.strikePressure ?? null;
    const dealerLogic = this.data.options?.derivedMetrics?.dealerLogic ?? null;

    return `
      <div class="vaultum-brief-shell">
        ${this.data.sampleMode ? `
          <div class="vaultum-callout">
            <strong>Demo mode</strong>
            <span>This view is running on deterministic mocked intelligence inputs so the fusion logic can be reviewed without depending on live feeds.</span>
          </div>
        ` : ''}

        <div class="vaultum-primary-card ${toneForBias(confluence.bias)}">
          <div class="vaultum-primary-card-head">
            <span>Overall Bias</span>
            <strong>${escapeHtml(`${confluence.strength} | ${fmtConfidence(confluence.confidence)}`)}</strong>
          </div>
          <div class="vaultum-primary-card-value">${escapeHtml(confluence.bias)}</div>
          <div class="vaultum-primary-card-copy">${escapeHtml(confluence.summary)}</div>
        </div>

        ${renderPanelSummaryBlock({
          headline: this.data.uiSummary.headline,
          bullets: this.data.uiSummary.bullets.slice(0, 4),
          tone: toneForBias(confluence.bias),
          statusLabel: `${this.data.market} ${this.data.timeframe.toUpperCase()}`,
        })}

        <div class="vaultum-metric-grid">
          <div class="vaultum-metric ${toneForBias(confluence.bias)}"><span>Bias</span><strong>${escapeHtml(confluence.bias)}</strong></div>
          <div class="vaultum-metric neutral"><span>Strength</span><strong>${escapeHtml(confluence.strength)}</strong></div>
          <div class="vaultum-metric neutral"><span>Confidence</span><strong>${escapeHtml(fmtConfidence(confluence.confidence))}</strong></div>
          <div class="vaultum-metric neutral"><span>Alignment</span><strong>${escapeHtml(fmtConfidence(confluence.derivedMetrics.alignmentScore))}</strong></div>
          <div class="vaultum-metric neutral"><span>Trust Haircut</span><strong>${escapeHtml(`${Math.round(((confluence.derivedMetrics.trustHaircuts ?? []).reduce((sum, item) => sum + (item.haircut ?? 0), 0)) * 100)}%`)}</strong></div>
          <div class="vaultum-metric ${toneForBias(this.data.news?.bias)}"><span>News</span><strong>${escapeHtml(this.data.news?.bias ?? 'n/a')}</strong></div>
          <div class="vaultum-metric ${toneForBias(this.data.cot?.bias)}"><span>Hedgers</span><strong>${escapeHtml(this.data.cot?.derivedMetrics?.posture ?? 'n/a')}</strong></div>
          <div class="vaultum-metric ${toneForBias(this.data.options?.bias)}"><span>Strike Pressure</span><strong>${escapeHtml(strikePressure?.pressureRead ?? 'n/a')}</strong></div>
          <div class="vaultum-metric neutral"><span>Risk Regime</span><strong>${escapeHtml(this.data.monteCarloRisk?.derivedMetrics?.riskLabel ?? 'n/a')}</strong></div>
        </div>

        <div class="vaultum-data-grid">
          <div class="vaultum-data-card is-${toneForBias(this.data.news?.bias)}">
            <span>News Intelligence</span>
            <strong class="value">${escapeHtml(this.data.news?.derivedMetrics?.narrative ?? 'unavailable')}</strong>
            <div class="detail">${escapeHtml(this.data.news?.uiSummary ?? 'News intelligence unavailable.')}</div>
          </div>
          <div class="vaultum-data-card is-${toneForBias(this.data.cot?.bias)}">
            <span>COT Intelligence</span>
            <strong class="value">${escapeHtml(this.data.cot?.derivedMetrics?.posture ?? 'unavailable')}</strong>
            <div class="detail">${escapeHtml(this.data.cot?.uiSummary ?? 'Hedger posture unavailable.')}</div>
          </div>
          <div class="vaultum-data-card is-${toneForBias(this.data.options?.bias)}">
            <span>Options Intelligence</span>
            <strong class="value">${escapeHtml(strikePressure?.levelRole ?? 'unavailable')}</strong>
            <div class="detail">${escapeHtml(this.data.options?.uiSummary ?? 'Options pressure unavailable.')}</div>
          </div>
          <div class="vaultum-data-card is-${toneForBias(this.data.monteCarloRisk?.bias)}">
            <span>Monte Carlo Risk</span>
            <strong class="value">${escapeHtml(this.data.monteCarloRisk?.derivedMetrics?.riskLabel ?? 'unavailable')}</strong>
            <div class="detail">${escapeHtml(this.data.monteCarloRisk?.uiSummary ?? 'Risk distribution unavailable.')}</div>
          </div>
        </div>

        <div class="vaultum-data-grid vaultum-data-grid--halves">
          <div class="vaultum-data-card">
            <span>Scenario A</span>
            <strong class="value">${escapeHtml(confluence.derivedMetrics.scenarioA)}</strong>
            <div class="detail">${escapeHtml(`Macro posture: ${confluence.derivedMetrics.macroPosture}`)}</div>
          </div>
          <div class="vaultum-data-card">
            <span>Scenario B</span>
            <strong class="value">${escapeHtml(confluence.derivedMetrics.scenarioB)}</strong>
            <div class="detail">${escapeHtml(`Invalidation: ${confluence.derivedMetrics.invalidation}`)}</div>
          </div>
        </div>

        <div class="vaultum-data-grid">
          <div class="vaultum-data-card">
            <span>Support Map</span>
            <strong class="value">${escapeHtml(levelList(supportLevels))}</strong>
            <div class="detail">${escapeHtml(this.data.options?.derivedMetrics?.supportCandidates?.[0]?.explanation ?? 'No strong support candidate was resolved.')}</div>
          </div>
          <div class="vaultum-data-card">
            <span>Resistance Map</span>
            <strong class="value">${escapeHtml(levelList(resistanceLevels))}</strong>
            <div class="detail">${escapeHtml(this.data.options?.derivedMetrics?.resistanceCandidates?.[0]?.explanation ?? 'No strong resistance candidate was resolved.')}</div>
          </div>
          <div class="vaultum-data-card">
            <span>Focus Strike</span>
            <strong class="value">${escapeHtml(strikePressure?.focusStrike != null ? fmtNumber(strikePressure.focusStrike) : 'n/a')}</strong>
            <div class="detail">${escapeHtml(strikePressure?.summary ?? 'Strike pressure did not resolve a focus level.')}</div>
          </div>
          <div class="vaultum-data-card">
            <span>Dealer Lens</span>
            <strong class="value">${escapeHtml(dealerLogic?.label ?? 'n/a')}</strong>
            <div class="detail">${escapeHtml([
              dealerLogic?.gammaRegime,
              dealerLogic?.hedgePressure,
              dealerLogic?.tendency,
            ].filter((item): item is string => Boolean(item)).join(' | ') || 'Dealer logic unavailable.')}</div>
          </div>
        </div>

        <div class="vaultum-data-block">
          <div class="vaultum-data-block-head">
            <span>Decision Notes</span>
            <strong>${escapeHtml(this.data.market)}</strong>
          </div>
          <div class="vaultum-signal-list">
            <div class="vaultum-signal-row ${toneForBias(confluence.bias)}"><span>${escapeHtml(`Risk regime: ${confluence.derivedMetrics.riskRegime}`)}</span></div>
            <div class="vaultum-signal-row neutral"><span>${escapeHtml(`News confidence ${fmtConfidence(this.data.news?.confidence)} | dominant assets ${(this.data.news?.derivedMetrics?.dominantAssets ?? []).slice(0, 3).map((item) => item.asset).join(' / ') || 'n/a'}.`)}</span></div>
            <div class="vaultum-signal-row neutral"><span>${escapeHtml(`Hedger percentile ${this.data.cot?.derivedMetrics?.hedgerPercentile != null ? this.data.cot.derivedMetrics.hedgerPercentile.toFixed(1) : 'n/a'} | divergence ${this.data.cot?.derivedMetrics?.divergenceScore != null ? fmtConfidence(this.data.cot.derivedMetrics.divergenceScore) : 'n/a'}.`)}</span></div>
            <div class="vaultum-signal-row neutral"><span>${escapeHtml(`Monte Carlo survival ${fmtPercent(this.data.monteCarloRisk?.derivedMetrics?.survivalProbability)} | drawdown >10% ${fmtPercent(this.data.monteCarloRisk?.derivedMetrics?.probabilityDrawdownGt10)}.`)}</span></div>
            <div class="vaultum-signal-row neutral"><span>${escapeHtml(`Options source ${this.data.options?.rawInputs?.sourceMode ?? 'n/a'} | strike confidence ${strikePressure?.confidence != null ? `${strikePressure.confidence}` : 'n/a'}.`)}</span></div>
            ${(this.data.confluence.derivedMetrics.trustHaircuts ?? []).slice(0, 2).map((item) => `<div class="vaultum-signal-row alert"><span>${escapeHtml(`${item.label}: ${item.reason}`)}</span></div>`).join('')}
          </div>
        </div>
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
      this.data = await fetchMarketDecisionEngine(this.marketFocus.market, this.marketFocus.timeframe);
      this.loadedKey = key;
      if (!this.data) this.error = `No decision-fusion data returned for ${this.marketFocus.market}.`;
    } catch (error) {
      this.data = null;
      this.loadedKey = key;
      this.error = error instanceof Error ? error.message : 'Decision-fusion request failed.';
    } finally {
      this.loading = false;
      redraw();
    }
  }
}
