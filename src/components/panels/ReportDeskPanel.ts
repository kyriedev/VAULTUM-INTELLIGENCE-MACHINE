import { BasePanel } from '@/components/base/panel';
import { getMarketFocus, subscribeMarketFocus, type MarketFocus } from '@/services/market-focus';
import { buildReportDownloadUrl, fetchReportOverview, type VaultumReportOverview } from '@/services/reports';
import {
  deleteArchivedReport,
  getArchivedReport,
  listArchivedReports,
  saveArchivedReport,
  type StoredReportArchiveEntry,
} from '@/services/vault-store';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function parseFilename(contentDisposition: string | null, fallback: string): string {
  const match = contentDisposition?.match(/filename="?([^"]+)"?/i);
  return match?.[1] ? match[1] : fallback;
}

export class ReportDeskPanel extends BasePanel {
  private marketFocus: MarketFocus = getMarketFocus();
  private data: VaultumReportOverview | null = null;
  private archives: StoredReportArchiveEntry[] = [];
  private loading = false;
  private downloadingId = '';
  private error = '';
  private loadedKey = '';

  constructor() {
    super({ id: 'report-desk', title: 'Report Desk', kicker: 'PDF Notes', tag: 'reports', tone: 'neutral' });
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
    const label = this.marketFocus.market;
    if (this.loading && !this.data) {
      return `<div class="vaultum-callout"><strong>Preparing report desk</strong><span>Loading the close-window report schedule for ${escapeHtml(label)}.</span></div>`;
    }
    if (this.error && !this.data) {
      return `<div class="vaultum-callout"><strong>Report desk unavailable</strong><span>${escapeHtml(this.error)}</span></div>`;
    }
    if (!this.data) {
      return `<div class="vaultum-callout"><strong>Waiting for report schedule</strong><span>Daily, weekly, and quarterly PDF notes will appear here.</span></div>`;
    }

    return `
      <div class="vaultum-report-desk">
        <div class="vaultum-primary-card neutral">
          <div class="vaultum-primary-card-head">
            <span>Close Reports</span>
            <strong>${escapeHtml(this.data.timezone)}</strong>
          </div>
          <div class="vaultum-primary-card-value">${escapeHtml(this.data.summary)}</div>
          <div class="vaultum-primary-card-copy">Generated from the live institutional stack and archived locally on this device.</div>
        </div>
        <div class="vaultum-report-grid">
          ${this.data.reports.map((report) => `
            <div class="vaultum-data-card is-${report.status}">
              <div class="vaultum-report-card-head">
                <div>
                  <span>${escapeHtml(report.label)}</span>
                  <strong class="value">${escapeHtml(report.coveredLabel)}</strong>
                </div>
                <em>${escapeHtml(report.status)}</em>
              </div>
              <div class="detail">${escapeHtml(report.note)}</div>
              <div class="vaultum-report-stats">
                <div><span>Timeframe</span><strong>${escapeHtml(report.timeframe.toUpperCase())}</strong></div>
                <div><span>Ready</span><strong>${escapeHtml(report.readyLocalLabel)}</strong></div>
                <div><span>Close</span><strong>${escapeHtml(report.anchorLocalLabel)}</strong></div>
              </div>
              <button
                type="button"
                class="vaultum-btn vaultum-btn-primary"
                data-report-period="${escapeHtml(report.period)}"
                ${this.downloadingId === report.period ? 'disabled' : ''}
              >
                ${this.downloadingId === report.period ? 'Archiving PDF...' : report.status === 'ready' ? 'Download + Archive' : 'Generate + Archive'}
              </button>
            </div>
          `).join('')}
        </div>
        <div class="vaultum-data-block vaultum-report-library">
          <div class="vaultum-report-library-head">
            <div>
              <span>Historical Library</span>
              <strong>Saved reports inside Vaultum</strong>
            </div>
            <em>${escapeHtml(`${this.archives.length} saved`)}</em>
          </div>
          ${this.archives.length ? `
            <div class="vaultum-report-library-list">
              ${this.archives.slice(0, 8).map((entry) => `
                <div class="vaultum-report-library-row">
                  <div>
                    <strong>${escapeHtml(entry.label)} ${escapeHtml(entry.market)}</strong>
                    <span>${escapeHtml(`${entry.coveredLabel} | saved ${entry.downloadedAt.slice(0, 16).replace('T', ' ')}`)}</span>
                  </div>
                  <div class="vaultum-report-library-actions">
                    <button type="button" class="vaultum-btn" data-archive-open="${escapeHtml(entry.id)}">Open PDF</button>
                    <button type="button" class="vaultum-btn" data-archive-delete="${escapeHtml(entry.id)}">Delete</button>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="vaultum-callout">
              <strong>No archived PDFs yet</strong>
              <span>Use Download + Archive on any close note and Vaultum will keep a local historical library here.</span>
            </div>
          `}
        </div>
      </div>
    `;
  }

  private bindEvents(root: HTMLElement, redraw: () => void): void {
    root.querySelectorAll<HTMLButtonElement>('[data-report-period]').forEach((button) => {
      button.addEventListener('click', async () => {
        const period = button.dataset.reportPeriod as 'daily' | 'weekly' | 'quarterly' | undefined;
        const report = this.data?.reports.find((item) => item.period === period);
        if (!report) return;
        await this.downloadAndArchiveReport(report, redraw);
      });
    });

    root.querySelectorAll<HTMLButtonElement>('[data-archive-open]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.archiveOpen;
        if (!id) return;
        await this.openArchivedReport(id, redraw);
      });
    });

    root.querySelectorAll<HTMLButtonElement>('[data-archive-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.archiveDelete;
        if (!id) return;
        await deleteArchivedReport(id);
        this.archives = await listArchivedReports();
        redraw();
      });
    });
  }

  private async ensureData(redraw: () => void): Promise<void> {
    const key = this.marketFocus.market;
    if (this.loading) return;
    if (this.loadedKey === key && (this.data || this.error)) return;
    this.loading = true;
    this.error = '';
    redraw();

    try {
      const [overviewResult, archiveResult] = await Promise.allSettled([
        fetchReportOverview(this.marketFocus.market),
        listArchivedReports(),
      ]);
      this.data = overviewResult.status === 'fulfilled' ? overviewResult.value : null;
      this.archives = archiveResult.status === 'fulfilled' ? archiveResult.value : [];
      if (overviewResult.status === 'rejected') {
        throw overviewResult.reason;
      }
      this.loadedKey = key;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to load report schedule.';
    } finally {
      this.loading = false;
      redraw();
    }
  }

  private async downloadAndArchiveReport(
    report: NonNullable<VaultumReportOverview>['reports'][number],
    redraw: () => void,
  ): Promise<void> {
    this.downloadingId = report.period;
    this.error = '';
    redraw();

    try {
      const fallbackName = `vaultum-${report.period}-${this.marketFocus.market.toLowerCase()}.pdf`;
      const response = await fetch(buildReportDownloadUrl(report.period, this.marketFocus.market), {
        headers: { 'Cache-Control': 'no-store' },
      });
      if (!response.ok) {
        throw new Error(`Unable to build ${report.period} report PDF.`);
      }

      const blob = await response.blob();
      const filename = parseFilename(response.headers.get('Content-Disposition'), fallbackName);
      const entry: StoredReportArchiveEntry = {
        id: `report:${this.marketFocus.market}:${report.period}:${report.readyAt}`,
        market: this.marketFocus.market,
        period: report.period,
        label: report.label,
        coveredLabel: report.coveredLabel,
        timeframe: report.timeframe,
        readyLocalLabel: report.readyLocalLabel,
        downloadedAt: new Date().toISOString(),
        filename,
        summary: report.note,
        blob,
      };

      await saveArchivedReport(entry);
      this.archives = await listArchivedReports();
      this.triggerBrowserDownload(blob, filename);
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to archive the PDF report.';
    } finally {
      this.downloadingId = '';
      redraw();
    }
  }

  private async openArchivedReport(id: string, redraw: () => void): Promise<void> {
    this.error = '';
    try {
      const entry = await getArchivedReport(id);
      if (!entry) {
        throw new Error('Archived PDF was not found in local storage.');
      }
      this.triggerBrowserDownload(entry.blob, entry.filename);
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to open archived PDF.';
      redraw();
    }
  }

  private triggerBrowserDownload(blob: Blob, filename: string): void {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_500);
  }
}
