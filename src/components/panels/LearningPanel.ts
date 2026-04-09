import { BasePanel } from '@/components/base/panel';
import { getMarketFocus, subscribeMarketFocus, type MarketFocus } from '@/services/market-focus';
import { fetchSetupPatrol } from '@/services/patrol';
import {
  confirmMissedSetupCandidate,
  dismissMissedSetupCandidate,
  exportLearningBundle,
  importLearningBundle,
  loadAdaptiveProposals,
  loadLearningDashboard,
  loadOperatorAdaptiveProfile,
  refreshMissedSetupCandidate,
  updateLearningProposalState,
} from '@/services/learning';
import type { LearningDashboardResponse, LearningRecommendationResponse } from '@/lib/learning/engine';

type LearningTab = 'summary' | 'edge' | 'conflicts' | 'regimes' | 'leaks' | 'opportunity' | 'proposals' | 'doctrine';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const PRIMARY_MARKETS = ['XAUUSD', 'US30'] as const;

function renderTable(columns: string[], rows: string[][], empty = 'Not enough data yet.'): string {
  return `
    <div class="vaultum-table-wrap">
      <table class="vaultum-table">
        <thead><tr>${columns.map((item) => `<th>${escapeHtml(item)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}">${escapeHtml(empty)}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

export class LearningPanel extends BasePanel {
  private marketFocus: MarketFocus = getMarketFocus();
  private selectedMarket: string = PRIMARY_MARKETS.includes(getMarketFocus().market as typeof PRIMARY_MARKETS[number])
    ? getMarketFocus().market
    : 'XAUUSD';
  private tab: LearningTab = 'summary';
  private dashboard: LearningDashboardResponse | null = null;
  private recommendations: LearningRecommendationResponse | null = null;
  private adaptiveProfile: LearningDashboardResponse['adaptiveProfile'] | null = null;
  private loading = false;
  private actionBusy = false;
  private error = '';
  private loadedKey = '';

  constructor() {
    super({ id: 'learning-panel', title: 'Learning Panel', kicker: 'Adaptive Intelligence', tag: 'learning', tone: 'neutral' });
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
      if (PRIMARY_MARKETS.includes(focus.market as typeof PRIMARY_MARKETS[number])) this.selectedMarket = focus.market;
      this.loadedKey = '';
      redraw();
    });

    redraw();
    return panel;
  }

  protected renderBody(): string {
    if (this.loading && !this.dashboard) {
      return `<div class="vaultum-callout"><strong>Loading adaptive layer</strong><span>Building conflicts, edge pressure, regime memory, and proposal queues for ${escapeHtml(this.selectedMarket)}.</span></div>`;
    }
    if (this.error && !this.dashboard) {
      return `<div class="vaultum-callout"><strong>Adaptive layer unavailable</strong><span>${escapeHtml(this.error)}</span></div>`;
    }
    if (!this.dashboard || !this.recommendations) {
      return `<div class="vaultum-callout"><strong>Waiting for adaptive layer</strong><span>The controlled self-evolving layer will surface here once the learning bundle is ready.</span></div>`;
    }

    const performance = this.dashboard.performance;
    const profile = this.adaptiveProfile ?? this.dashboard.adaptiveProfile ?? this.dashboard.overrides;
    const edgeLead = this.dashboard.edgePressure?.find((item) => item.regime === 'all');
    const conflictLead = this.dashboard.decisionConflicts?.find((item) => item.conflictType === 'vaultum_right_operator_wrong' || item.conflictType === 'operator_right_vaultum_wrong');
    const doctrineCount = this.dashboard.doctrineTension?.filter((item) => item.status === 'under_review').length ?? 0;

    return `
      <div class="vaultum-analyst-shell">
        <div class="vaultum-primary-card neutral">
          <div class="vaultum-primary-card-head">
            <span>Controlled self-evolving layer</span>
            <strong>${escapeHtml(`${this.selectedMarket} | ${this.marketFocus.timeframe.toUpperCase()}`)}</strong>
          </div>
          <div class="vaultum-primary-card-value">${escapeHtml(this.dashboard.summary)}</div>
          <div class="vaultum-primary-card-copy">${escapeHtml(this.recommendations.summary)}</div>
        </div>

        <div class="vaultum-analyst-query">
          <div class="vaultum-ai-prompt-wall">
            ${PRIMARY_MARKETS.map((market) => `<button class="vaultum-ai-prompt${market === this.selectedMarket ? ' is-active' : ''}" data-learning-market="${market}">${market}</button>`).join('')}
          </div>
          <div class="vaultum-analyst-actions">
            <span>Adaptive learning is bounded and reviewable. Core doctrine and structure logic stay untouched.</span>
            <div class="vaultum-ai-action-group">
              <button class="vaultum-btn" data-learning-export>Export JSON</button>
              <button class="vaultum-btn" data-learning-import-trigger>Import JSON</button>
              <button class="vaultum-btn vaultum-btn-primary" data-learning-refresh>${this.loading ? 'Refreshing...' : 'Refresh Adaptive Layer'}</button>
            </div>
          </div>
          <input type="file" id="vaultum-learning-import" accept="application/json" style="display:none" />
        </div>

        ${this.error ? `<div class="vaultum-brief-source-item is-warning">${escapeHtml(this.error)}</div>` : ''}

        <div class="vaultum-data-grid">
          <div class="vaultum-data-card">
            <span>Edge Pressure</span>
            <strong class="value">${edgeLead?.edgePressureScore ?? 'n/a'}</strong>
            <div class="detail">${escapeHtml(edgeLead ? `${edgeLead.family} | sample ${edgeLead.sampleCount}` : 'Waiting for enough family depth.')}</div>
          </div>
          <div class="vaultum-data-card">
            <span>Decision Conflicts</span>
            <strong class="value">${this.dashboard.decisionConflicts?.length ?? 0}</strong>
            <div class="detail">${escapeHtml(conflictLead ? `${conflictLead.conflictType.replaceAll('_', ' ')} | ${conflictLead.setupFamily}` : 'No strong operator-vs-Vaultum split yet.')}</div>
          </div>
          <div class="vaultum-data-card">
            <span>Regime Memory</span>
            <strong class="value">${this.dashboard.regimePerformance?.length ?? 0}</strong>
            <div class="detail">${escapeHtml(`Expectancy ${performance.expectancyR != null ? `${performance.expectancyR}R` : 'n/a'} | win ${performance.participationConfirmedWinRate.toFixed(1)}%`)}</div>
          </div>
          <div class="vaultum-data-card">
            <span>Adaptive Profile</span>
            <strong class="value">${escapeHtml(`${profile?.precisionThreshold ?? 60}/${profile?.participationThreshold ?? 60}`)}</strong>
            <div class="detail">${escapeHtml(`Doctrine review ${doctrineCount} | TP ${profile?.tpAggressiveness ?? 'balanced'}`)}</div>
          </div>
        </div>

        <div class="vaultum-ai-prompt-wall">
          ${[
            ['summary', 'Summary'],
            ['edge', 'Edge Pressure'],
            ['conflicts', 'Decision Conflicts'],
            ['regimes', 'Regime Memory'],
            ['leaks', 'Execution Leaks'],
            ['opportunity', 'Opportunity Cost'],
            ['proposals', 'Proposal Queue'],
            ['doctrine', 'Doctrine Tension'],
          ].map(([tab, label]) => `<button class="vaultum-ai-prompt${this.tab === tab ? ' is-active' : ''}" data-learning-tab="${tab}">${label}</button>`).join('')}
        </div>

        ${this.renderTabBody()}
      </div>
    `;
  }

  private renderTabBody(): string {
    const dashboard = this.dashboard!;
    const profile = this.adaptiveProfile ?? dashboard.adaptiveProfile ?? dashboard.overrides;

    if (this.tab === 'summary') {
      return `
        <div class="vaultum-responsive-card-grid" style="--vaultum-grid-min: 280px;">
          <div class="vaultum-module-card is-full">
            <div class="vaultum-module-card-header"><div class="vaultum-module-card-copy"><span>Adaptive summary</span><strong>What the machine is learning</strong></div></div>
            <div class="vaultum-module-card-body">
              <div class="vaultum-signal-list">
                ${dashboard.insights.map((item) => `<div class="vaultum-signal-row neutral"><span>${escapeHtml(item)}</span></div>`).join('')}
              </div>
            </div>
          </div>
          <div class="vaultum-module-card">
            <div class="vaultum-module-card-header"><div class="vaultum-module-card-copy"><span>Family analytics</span><strong>Current leaders</strong></div></div>
            <div class="vaultum-module-card-body">${renderTable(['Family', 'Sample', 'Expectancy', 'Entry'], (dashboard.familyStats ?? []).slice(0, 6).map((item) => [item.family, String(item.sampleCount), item.expectancyR != null ? `${item.expectancyR}R` : 'n/a', String(item.entryEfficiency ?? 'n/a')]))}</div>
          </div>
          <div class="vaultum-module-card is-alert">
            <div class="vaultum-module-card-header"><div class="vaultum-module-card-copy"><span>Missed queue</span><strong>Confirm before learning</strong></div></div>
            <div class="vaultum-module-card-body">
              <div class="vaultum-signal-list">
                ${(dashboard.missedCandidates ?? []).slice(0, 5).map((item) => `
                  <div class="vaultum-signal-row ${item.verdict === 'pending' ? 'alert' : 'neutral'}">
                    <span>${escapeHtml(`${item.market} ${item.timeframe} | ${item.summary}`)}</span>
                    <strong>${escapeHtml(`${item.zone} | ${item.verdict}`)}</strong>
                    ${item.verdict === 'pending' ? `<div class="vaultum-ai-action-group"><button class="vaultum-btn" data-missed-dismiss="${escapeHtml(item.id)}"${this.actionBusy ? ' disabled' : ''}>Dismiss</button><button class="vaultum-btn vaultum-btn-primary" data-missed-confirm="${escapeHtml(item.id)}"${this.actionBusy ? ' disabled' : ''}>Confirm</button></div>` : ''}
                  </div>
                `).join('') || `<div class="vaultum-signal-row neutral"><span>No pending missed setup for ${escapeHtml(this.selectedMarket)}.</span></div>`}
              </div>
            </div>
          </div>
          <div class="vaultum-module-card is-alert">
            <div class="vaultum-module-card-header"><div class="vaultum-module-card-copy"><span>Blindspots</span><strong>Why live logic stays stable</strong></div></div>
            <div class="vaultum-module-card-body">
              <div class="vaultum-signal-list">
                ${(dashboard.blindspots ?? []).map((item) => `<div class="vaultum-signal-row alert"><span>${escapeHtml(item)}</span></div>`).join('') || `<div class="vaultum-signal-row neutral"><span>No major blindspot surfaced yet.</span></div>`}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    if (this.tab === 'edge') {
      return `<div class="vaultum-module-card is-full"><div class="vaultum-module-card-header"><div class="vaultum-module-card-copy"><span>Edge Pressure Engine</span><strong>Setup family dominance by family and regime</strong></div></div><div class="vaultum-module-card-body">${renderTable(['Family', 'Regime', 'Score', 'Sample', 'Expectancy', 'Weakening'], (dashboard.edgePressure ?? []).slice(0, 16).map((item) => [item.family, item.regime, String(item.edgePressureScore), String(item.sampleCount), item.expectancyR != null ? `${item.expectancyR}R` : 'n/a', item.weakening ? 'yes' : 'no']))}</div></div>`;
    }

    if (this.tab === 'conflicts') {
      return `<div class="vaultum-module-card is-full"><div class="vaultum-module-card-header"><div class="vaultum-module-card-copy"><span>Decision Conflict Engine</span><strong>Operator vs Vaultum vs market outcome</strong></div></div><div class="vaultum-module-card-body">${renderTable(['Time', 'Family', 'Conflict', 'Operator', 'Vaultum', 'Outcome'], (dashboard.decisionConflicts ?? []).slice(0, 14).map((item) => [item.timestamp.slice(0, 16).replace('T', ' '), item.setupFamily, item.conflictType.replaceAll('_', ' '), item.operatorDecision, item.vaultumRecommendation, item.actualOutcome]))}</div></div>`;
    }

    if (this.tab === 'regimes') {
      return `<div class="vaultum-module-card is-full"><div class="vaultum-module-card-header"><div class="vaultum-module-card-copy"><span>Regime Memory</span><strong>Context-sensitive learning</strong></div></div><div class="vaultum-module-card-body">${renderTable(['Regime', 'Sample', 'Operator Win', 'Vaultum Take Win', 'True Edge', 'Leak'], (dashboard.regimePerformance ?? []).map((item) => [item.regime, String(item.sampleCount), `${item.operatorWinRate.toFixed(1)}%`, `${item.vaultumTakeWinRate.toFixed(1)}%`, String(item.avgTrueSetupEdge ?? 'n/a'), String(item.avgExecutionLeakScore ?? 'n/a')]))}</div></div>`;
    }

    if (this.tab === 'leaks') {
      return `<div class="vaultum-module-card is-full"><div class="vaultum-module-card-header"><div class="vaultum-module-card-copy"><span>Execution Leak Analyzer</span><strong>Where good ideas are leaking</strong></div></div><div class="vaultum-module-card-body">${renderTable(['Leak', 'Sample', 'True Edge', 'Net Edge', 'Families', 'Regimes'], (dashboard.executionLeaks ?? []).map((item) => [item.leakType.replaceAll('_', ' '), String(item.sampleCount), String(item.avgTrueSetupEdge ?? 'n/a'), String(item.avgNetRealizedEdge ?? 'n/a'), item.impactedFamilies.join(', '), item.impactedRegimes.join(', ')]))}</div></div>`;
    }

    if (this.tab === 'opportunity') {
      return `<div class="vaultum-module-card is-full"><div class="vaultum-module-card-header"><div class="vaultum-module-card-copy"><span>Opportunity Cost Engine</span><strong>What hesitation is costing</strong></div></div><div class="vaultum-module-card-body">${renderTable(['Session', 'Regime', 'Score', 'Potential MFE', 'High Edge Match', 'Families'], (dashboard.opportunityCost ?? []).map((item) => [item.session, item.regime, String(item.opportunityCostScore), String(item.estimatedPotentialMFE ?? 'n/a'), `${item.highEdgeMatchRate.toFixed(1)}%`, item.topFamilies.join(', ')]))}</div></div>`;
    }

    if (this.tab === 'proposals') {
      return `
        <div class="vaultum-responsive-card-grid" style="--vaultum-grid-min: 300px;">
          <div class="vaultum-module-card">
            <div class="vaultum-module-card-header"><div class="vaultum-module-card-copy"><span>Operator adaptive profile</span><strong>Approved, auditable preferences</strong></div></div>
            <div class="vaultum-module-card-body">
              <div class="vaultum-signal-list">
                <div class="vaultum-signal-row neutral"><span>${escapeHtml(`Precision ${profile?.precisionThreshold ?? 60} | Participation ${profile?.participationThreshold ?? 60} | TP ${profile?.tpAggressiveness ?? 'balanced'}`)}</span></div>
                <div class="vaultum-signal-row neutral"><span>${escapeHtml(`Preferred families: ${(profile?.preferredFamilies ?? []).join(', ') || 'none yet'}`)}</span></div>
                <div class="vaultum-signal-row neutral"><span>${escapeHtml(`Avoid families: ${(profile?.avoidFamilies ?? []).join(', ') || 'none yet'}`)}</span></div>
                ${(profile?.adaptiveNotes ?? []).map((item) => `<div class="vaultum-signal-row neutral"><span>${escapeHtml(item)}</span></div>`).join('')}
              </div>
            </div>
          </div>
          <div class="vaultum-module-card is-wide">
            <div class="vaultum-module-card-header"><div class="vaultum-module-card-copy"><span>Adaptive proposal queue</span><strong>Review before activation</strong></div></div>
            <div class="vaultum-module-card-body">
              <div class="vaultum-signal-list">
                ${(this.recommendations?.proposals ?? []).map((proposal) => `
                  <div class="vaultum-signal-row ${proposal.state === 'approved' ? 'bullish' : proposal.state === 'rejected' ? 'alert' : 'neutral'}">
                    <span>${escapeHtml(`${proposal.title} | ${proposal.category} | ${proposal.state}`)}</span>
                    <strong>${escapeHtml(proposal.explanation)}</strong>
                    <div>${escapeHtml(`From ${String(proposal.suggestedChange.from)} -> ${String(proposal.suggestedChange.to)} | sample ${proposal.sampleCount ?? 'n/a'} | confidence ${proposal.confidenceScore ?? 'n/a'} | upside ${proposal.expectedUpsidePct ?? 'n/a'}%`)}</div>
                    <div>${escapeHtml(proposal.evidenceSummary ?? proposal.evidence.join(' | '))}</div>
                    ${proposal.state === 'pending' ? `<div class="vaultum-ai-action-group"><button class="vaultum-btn" data-proposal-state="${escapeHtml(proposal.id)}:rejected"${this.actionBusy ? ' disabled' : ''}>Reject</button><button class="vaultum-btn vaultum-btn-primary" data-proposal-state="${escapeHtml(proposal.id)}:approved"${this.actionBusy ? ' disabled' : ''}>Approve</button></div>` : ''}
                  </div>
                `).join('') || `<div class="vaultum-signal-row neutral"><span>No bounded adaptive proposal is ready yet for ${escapeHtml(this.selectedMarket)}.</span></div>`}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    return `<div class="vaultum-module-card is-full"><div class="vaultum-module-card-header"><div class="vaultum-module-card-copy"><span>Doctrine Tension Monitor</span><strong>Doctrine stays respected, but testable</strong></div></div><div class="vaultum-module-card-body">${renderTable(['Slice', 'Sample', 'Confidence', 'Observed', 'Status'], (dashboard.doctrineTension ?? []).map((item) => [item.doctrineSlice, String(item.sampleCount), String(item.confidenceScore), item.observedOutcome, item.status]), 'No doctrine tension is under review yet.')}</div></div>`;
  }

  private bindEvents(root: HTMLElement, redraw: () => void): void {
    root.querySelectorAll<HTMLButtonElement>('[data-learning-market]').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectedMarket = button.dataset.learningMarket ?? 'XAUUSD';
        this.loadedKey = '';
        redraw();
      });
    });

    root.querySelectorAll<HTMLButtonElement>('[data-learning-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        this.tab = (button.dataset.learningTab as LearningTab) ?? 'summary';
        redraw();
      });
    });

    root.querySelector<HTMLButtonElement>('[data-learning-refresh]')?.addEventListener('click', () => {
      this.loadedKey = '';
      void this.ensureData(redraw, true);
    });

    root.querySelector<HTMLButtonElement>('[data-learning-export]')?.addEventListener('click', async () => {
      const bundle = await exportLearningBundle();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vaultum-learning-${this.selectedMarket.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });

    root.querySelector<HTMLButtonElement>('[data-learning-import-trigger]')?.addEventListener('click', () => {
      root.querySelector<HTMLInputElement>('#vaultum-learning-import')?.click();
    });

    root.querySelector<HTMLInputElement>('#vaultum-learning-import')?.addEventListener('change', async (event) => {
      const file = (event.currentTarget as HTMLInputElement).files?.[0];
      if (!file) return;
      this.actionBusy = true;
      redraw();
      try {
        await importLearningBundle(JSON.parse(await file.text()));
        this.loadedKey = '';
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Unable to import the learning bundle.';
      } finally {
        this.actionBusy = false;
        redraw();
      }
    });

    root.querySelectorAll<HTMLButtonElement>('[data-proposal-state]').forEach((button) => {
      button.addEventListener('click', async () => {
        const raw = button.dataset.proposalState;
        if (!raw) return;
        const [proposalId, state] = raw.split(':');
        if (!proposalId || (state !== 'approved' && state !== 'rejected')) return;
        this.actionBusy = true;
        redraw();
        try {
          await updateLearningProposalState({ proposalId, state, market: this.selectedMarket });
          this.loadedKey = '';
        } catch (error) {
          this.error = error instanceof Error ? error.message : 'Unable to update the proposal state.';
        } finally {
          this.actionBusy = false;
          redraw();
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>('[data-missed-confirm]').forEach((button) => {
      button.addEventListener('click', async () => {
        const candidateId = button.dataset.missedConfirm;
        if (!candidateId) return;
        this.actionBusy = true;
        redraw();
        try {
          await confirmMissedSetupCandidate(candidateId, 'Confirmed from the adaptive Learning Panel.');
          this.loadedKey = '';
        } catch (error) {
          this.error = error instanceof Error ? error.message : 'Unable to confirm the missed setup.';
        } finally {
          this.actionBusy = false;
          redraw();
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>('[data-missed-dismiss]').forEach((button) => {
      button.addEventListener('click', async () => {
        const candidateId = button.dataset.missedDismiss;
        if (!candidateId) return;
        this.actionBusy = true;
        redraw();
        try {
          await dismissMissedSetupCandidate(candidateId, 'Dismissed from the adaptive Learning Panel.');
          this.loadedKey = '';
        } catch (error) {
          this.error = error instanceof Error ? error.message : 'Unable to dismiss the missed setup.';
        } finally {
          this.actionBusy = false;
          redraw();
        }
      });
    });
  }

  private async ensureData(redraw: () => void, force = false): Promise<void> {
    const key = `${this.selectedMarket}:${this.marketFocus.timeframe}`;
    if (this.loading) return;
    if (!force && this.loadedKey === key && (this.dashboard || this.error)) return;
    this.loading = true;
    this.error = '';
    redraw();

    try {
      const patrol = await fetchSetupPatrol(this.selectedMarket, this.marketFocus.timeframe);
      await refreshMissedSetupCandidate({
        patrol,
        market: this.selectedMarket,
        timeframe: this.marketFocus.timeframe,
      });

      const [dashboard, recommendations, adaptiveProfile] = await Promise.all([
        loadLearningDashboard(this.selectedMarket),
        loadAdaptiveProposals(this.selectedMarket),
        loadOperatorAdaptiveProfile(this.selectedMarket),
      ]);

      this.dashboard = dashboard;
      this.recommendations = recommendations;
      this.adaptiveProfile = adaptiveProfile;
      this.loadedKey = key;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to load the adaptive Learning Panel.';
    } finally {
      this.loading = false;
      redraw();
    }
  }
}
