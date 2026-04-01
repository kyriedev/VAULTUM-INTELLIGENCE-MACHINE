import { BasePanel } from '@/components/base/panel';
import { fetchInstitutionalMonitor, type InstitutionalMonitorResponse } from '@/services/institutional-monitor';
import { getMarketFocus, subscribeMarketFocus, type MarketFocus } from '@/services/market-focus';
import { fetchMarketBrief, type MarketBriefResponse } from '@/services/market-brief';
import {
  loadTradeJournal,
  removeTradeJournalEntry,
  saveManualTradeJournalEntry,
  summarizeTradeJournal,
  type ManualTradeDraft,
} from '@/services/trade-journal';
import type { StoredTradeJournalEntry } from '@/services/vault-store';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function asNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export class TradeJournalPanel extends BasePanel {
  private marketFocus: MarketFocus = getMarketFocus();
  private entries: StoredTradeJournalEntry[] = [];
  private brief: MarketBriefResponse | null = null;
  private monitor: InstitutionalMonitorResponse | null = null;
  private loading = false;
  private saving = false;
  private error = '';
  private loaded = false;

  constructor() {
    super({ id: 'trade-journal', title: 'Trade Journal', kicker: 'Manual Log', tag: 'journal', tone: 'neutral' });
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
      this.brief = null;
      this.monitor = null;
      this.loaded = false;
      redraw();
    });

    redraw();
    return panel;
  }

  protected renderBody(): string {
    const stats = summarizeTradeJournal(this.entries);
    return `
      <div class="vaultum-journal-shell">
        <div class="vaultum-primary-card neutral">
          <div class="vaultum-primary-card-head">
            <span>Manual Journal</span>
            <strong>${escapeHtml(`${this.marketFocus.market} | ${this.marketFocus.timeframe.toUpperCase()}`)}</strong>
          </div>
          <div class="vaultum-primary-card-value">${escapeHtml(this.brief?.summary ?? `Manual journal for ${this.marketFocus.market}`)}</div>
          <div class="vaultum-primary-card-copy">${escapeHtml(this.monitor?.summary ?? 'Completed trades reflect into Vaultum memory while the full journal stays local.')}</div>
        </div>
        ${this.error ? `<div class="vaultum-brief-source-item is-warning">${escapeHtml(this.error)}</div>` : ''}
        <div class="vaultum-report-grid">
          <div class="vaultum-data-card">
            <div class="vaultum-report-card-head"><div><span>Total</span><strong class="value">${stats.total}</strong></div><em>journal</em></div>
            <div class="detail">${escapeHtml(`Closed ${stats.closed} | Wins ${stats.wins} | Losses ${stats.losses} | Flats ${stats.flats}`)}</div>
          </div>
          <div class="vaultum-data-card">
            <div class="vaultum-report-card-head"><div><span>Win Rate</span><strong class="value">${stats.winRate.toFixed(1)}%</strong></div><em>performance</em></div>
            <div class="detail">${escapeHtml(`Average R ${stats.averageR != null ? stats.averageR.toFixed(2) : 'n/a'} | Average PnL ${stats.averagePnlPct != null ? `${stats.averagePnlPct.toFixed(2)}%` : 'n/a'}`)}</div>
          </div>
          <div class="vaultum-data-card">
            <div class="vaultum-report-card-head"><div><span>Weaknesses</span><strong class="value">${escapeHtml(stats.topWeaknesses[0]?.tag ?? 'none yet')}</strong></div><em>execution</em></div>
            <div class="detail">${escapeHtml(stats.topWeaknesses.map((item) => `${item.tag} ${item.count}`).join(' | ') || 'Tag mistakes as you journal and Vaultum will surface patterns here.')}</div>
          </div>
        </div>
        <form class="vaultum-journal-form">
          <div class="vaultum-monitor-grid">
            <label class="vaultum-journal-field"><span>Direction</span><select name="direction"><option value="long">Long</option><option value="short">Short</option></select></label>
            <label class="vaultum-journal-field"><span>Status</span><select name="status"><option value="planned">Planned</option><option value="open">Open</option><option value="closed">Closed</option></select></label>
            <label class="vaultum-journal-field"><span>Outcome</span><select name="outcome"><option value="open">Open</option><option value="win">Win</option><option value="loss">Loss</option><option value="flat">Flat</option></select></label>
            <label class="vaultum-journal-field"><span>Execution Grade</span><select name="executionGrade"><option value="clean">Clean</option><option value="mixed">Mixed</option><option value="poor">Poor</option></select></label>
          </div>
          <div class="vaultum-monitor-grid">
            <label class="vaultum-journal-field"><span>Entry</span><input name="entry" type="number" step="0.01" /></label>
            <label class="vaultum-journal-field"><span>Stop</span><input name="stop" type="number" step="0.01" /></label>
            <label class="vaultum-journal-field"><span>Target</span><input name="target" type="number" step="0.01" /></label>
            <label class="vaultum-journal-field"><span>Exit</span><input name="exit" type="number" step="0.01" /></label>
          </div>
          <div class="vaultum-monitor-grid">
            <label class="vaultum-journal-field"><span>PnL %</span><input name="pnlPct" type="number" step="0.01" /></label>
            <label class="vaultum-journal-field"><span>R Multiple</span><input name="rMultiple" type="number" step="0.01" /></label>
            <label class="vaultum-journal-field vaultum-journal-field-wide"><span>Mistakes</span><input name="mistakes" type="text" placeholder="late entry, ignored DXY, no confirmation" /></label>
          </div>
          <label class="vaultum-journal-field vaultum-journal-field-wide"><span>Trade Thesis</span><input name="thesis" type="text" placeholder="Why you took the trade based on Vaultum output" /></label>
          <label class="vaultum-journal-field vaultum-journal-field-wide"><span>Notes</span><textarea name="notes" rows="4" placeholder="What happened, what you did well, what broke the execution plan"></textarea></label>
          <button type="submit" class="vaultum-btn vaultum-btn-primary"${this.saving ? ' disabled' : ''}>${this.saving ? 'Saving...' : 'Save Journal Entry'}</button>
        </form>
        <div class="vaultum-data-block">
          <div class="vaultum-data-block-head">
            <span>Recent Entries</span>
            <strong>${Math.min(this.entries.length, 6)}</strong>
          </div>
          <div class="vaultum-brief-source-list">
          ${this.entries.slice(0, 6).map((entry) => `
            <div class="vaultum-brief-source-item">
              <div><strong>${escapeHtml(`${entry.market} ${entry.direction.toUpperCase()} ${entry.outcome}`)}</strong><span>${escapeHtml(`${entry.createdAt.slice(0, 16).replace('T', ' ')} | grade ${entry.executionGrade}`)}</span></div>
              <div>${escapeHtml(`${entry.thesis || 'No thesis saved.'} | mistakes: ${entry.mistakes.join(', ') || 'none'}`)}</div>
              <button class="vaultum-btn" data-delete-entry="${escapeHtml(entry.id)}">Remove</button>
            </div>
          `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(root: HTMLElement, redraw: () => void): void {
    root.querySelector<HTMLFormElement>('.vaultum-journal-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (this.saving) return;
      this.saving = true;
      this.error = '';
      redraw();

      try {
        const form = event.currentTarget as HTMLFormElement;
        const data = new FormData(form);
        const draft: ManualTradeDraft = {
          market: this.marketFocus.market,
          timeframe: this.marketFocus.timeframe,
          direction: String(data.get('direction') || 'long') as 'long' | 'short',
          status: String(data.get('status') || 'planned') as 'planned' | 'open' | 'closed',
          outcome: String(data.get('outcome') || 'open') as 'win' | 'loss' | 'flat' | 'open',
          entry: asNumber(String(data.get('entry') || '')),
          stop: asNumber(String(data.get('stop') || '')),
          target: asNumber(String(data.get('target') || '')),
          exit: asNumber(String(data.get('exit') || '')),
          pnlPct: asNumber(String(data.get('pnlPct') || '')),
          rMultiple: asNumber(String(data.get('rMultiple') || '')),
          executionGrade: String(data.get('executionGrade') || 'mixed') as 'clean' | 'mixed' | 'poor',
          thesis: String(data.get('thesis') || '').trim(),
          notes: String(data.get('notes') || '').trim(),
          mistakes: String(data.get('mistakes') || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          vaultumSummary: this.brief?.summary ?? '',
          monitorSummary: this.monitor?.summary ?? '',
        };
        await saveManualTradeJournalEntry(draft);
        this.entries = await loadTradeJournal();
        form.reset();
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Unable to save journal entry.';
      } finally {
        this.saving = false;
        redraw();
      }
    });

    root.querySelectorAll<HTMLButtonElement>('[data-delete-entry]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.deleteEntry;
        if (!id) return;
        await removeTradeJournalEntry(id);
        this.entries = await loadTradeJournal();
        redraw();
      });
    });
  }

  private async ensureData(redraw: () => void): Promise<void> {
    if (this.loading) return;
    if (this.loaded) return;
    this.loading = true;
    this.error = '';
    try {
      const [entriesResult, briefResult, monitorResult] = await Promise.allSettled([
        loadTradeJournal(),
        fetchMarketBrief(this.marketFocus.market, this.marketFocus.timeframe),
        fetchInstitutionalMonitor(this.marketFocus.market, this.marketFocus.timeframe),
      ]);
      this.entries = entriesResult.status === 'fulfilled' ? entriesResult.value : [];
      this.brief = briefResult.status === 'fulfilled' ? briefResult.value : null;
      this.monitor = monitorResult.status === 'fulfilled' ? monitorResult.value : null;
      if (briefResult.status === 'rejected' || monitorResult.status === 'rejected') {
        this.error = 'Journal context is partly degraded, but your local trade log is still available.';
      }
      this.loaded = true;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to load trade journal context.';
    } finally {
      this.loading = false;
      redraw();
    }
  }
}
