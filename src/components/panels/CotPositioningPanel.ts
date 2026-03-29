import { BasePanel } from '@/components/base/panel';
import { clearStoredCotUpload, loadStoredCotUpload, parseCotUploadFile, saveStoredCotUpload, type CotUploadAnalysis } from '@/services/positioning/cot-upload';
import { fetchCotPositioning, type LiveCotRegime, type LiveCotSummary } from '@/services/positioning/live-cot';

const COT_MARKETS = ['GOLD', 'SILVER', 'WTI'] as const;

export class CotPositioningPanel extends BasePanel {
  private selectedMarket: typeof COT_MARKETS[number] = 'GOLD';
  private liveCot: LiveCotSummary = null;
  private liveRegime: LiveCotRegime = null;
  private loadedMarket = '';
  private liveLoading = false;
  private liveError = '';
  private uploadLoading = false;
  private uploadError = '';
  private uploadAnalysis: CotUploadAnalysis | null = loadStoredCotUpload();

  constructor() {
    super({ id: 'cot-positioning', title: 'COT Positioning', kicker: 'Official + Upload Lab', tag: 'cftc', tone: 'neutral' });
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
      body.innerHTML = this.renderCotBody();
      this.bindEvents(body, redraw);
      void this.ensureLiveCot(redraw);
    };

    redraw();
    window.addEventListener('vaultum:snapshot-updated', () => redraw());
    return panel;
  }

  protected renderBody(): string {
    return '';
  }

  private renderCotBody(): string {
    const live = this.liveCot;
    const regime = this.liveRegime;
    const upload = this.uploadAnalysis;
    const comparison = this.buildComparison(live, upload);

    return `
      <div class="vaultum-cot-shell">
        <div class="vaultum-cot-guide">
          <div class="vaultum-cot-guide-card"><span>1</span><strong>Official feed</strong><p>Weekly CFTC disaggregated positioning is fetched live from the backend.</p></div>
          <div class="vaultum-cot-guide-card"><span>2</span><strong>Upload report</strong><p>Drop a PDF or text export and VAULTUM will extract long, short, net, ratio, and change fields.</p></div>
          <div class="vaultum-cot-guide-card"><span>3</span><strong>Translate bias</strong><p>The panel converts raw contracts into bias, strength, crowding, and weekly positioning change.</p></div>
        </div>

        <div class="vaultum-cot-market-row">
          ${COT_MARKETS.map((market) => `
            <button class="vaultum-cot-market ${market === this.selectedMarket ? 'is-active' : ''}" data-cot-market="${market}">${market}</button>
          `).join('')}
          <button class="vaultum-cot-market" data-cot-refresh="true">${this.liveLoading ? 'Refreshing...' : 'Refresh Live Feed'}</button>
        </div>

        <div class="vaultum-cot-hero">
          <div class="vaultum-cot-card">
            <div class="vaultum-cot-card-head">
              <div>
                <div class="vaultum-ai-label">Official CFTC Snapshot</div>
                <strong>${this.escape(live?.summary ?? (this.liveLoading ? 'Loading official COT positioning...' : 'Official COT snapshot unavailable.'))}</strong>
              </div>
              <span>${this.escape(regime?.regime ?? live?.source ?? 'live-feed')}</span>
            </div>
            <div class="vaultum-cot-stat-grid">
              ${this.renderStat('Market', live?.market ?? this.selectedMarket)}
              ${this.renderStat('Report Date', live?.reportDate ?? 'n/a')}
              ${this.renderStat('Bias', regime?.bias ?? 'unknown')}
              ${this.renderStat('Crowding', live?.crowdedRisk ?? 'unknown')}
              ${this.renderStat('Spec Net', this.formatNumber(live?.netPosition))}
              ${this.renderStat('L/S Ratio', this.formatDecimal(live?.longShortRatio))}
            </div>
            <div class="vaultum-cot-table">
              ${this.renderRow('Non-Commercial', this.formatNumber(live?.nonCommercialLong), this.formatNumber(live?.nonCommercialShort), this.formatNumber(live?.netPosition))}
              ${this.renderRow('Commercial', this.formatNumber(live?.commercialLong), this.formatNumber(live?.commercialShort), this.formatNumber(live?.commercialNetPosition))}
              ${this.renderRow('Non-Reportable', this.formatNumber(live?.nonReportableLong), this.formatNumber(live?.nonReportableShort), 'n/a')}
            </div>
            <ul class="vaultum-bullets">
              <li>Source: ${this.escape(live?.source ?? 'Official CFTC feed not returned yet.')}</li>
              <li>Weekly change: ${this.formatSigned(live?.change)}</li>
              <li>Spreading: ${this.formatNumber(live?.spreading)}</li>
            </ul>
            ${this.liveError ? `<div class="vaultum-alert-row">${this.escape(this.liveError)}</div>` : ''}
          </div>

          <div class="vaultum-cot-card">
            <div class="vaultum-cot-card-head">
              <div>
                <div class="vaultum-ai-label">Upload COT Report</div>
                <strong>${this.escape(upload?.summary ?? 'Upload a PDF or text report to extract long/short, net, change, and ratio data.')}</strong>
              </div>
              <span>${this.escape(upload?.source ?? 'local-parser')}</span>
            </div>
            <div class="vaultum-cot-upload-box">
              <label class="vaultum-cot-drop">
                <input id="vaultum-cot-upload" type="file" accept=".pdf,.txt,text/plain,application/pdf" />
                <strong>${this.uploadLoading ? 'Parsing report...' : 'Choose PDF or TXT'}</strong>
                <span>Best results come from text-based COT reports. VAULTUM will keep the extracted result on this browser.</span>
              </label>
              <div class="vaultum-cot-upload-actions">
                <button class="vaultum-btn" data-cot-clear="true">Clear Upload</button>
              </div>
            </div>
            <div class="vaultum-cot-stat-grid">
              ${this.renderStat('Uploaded Market', upload?.market ?? 'n/a')}
              ${this.renderStat('Report Date', upload?.reportDate ?? 'n/a')}
              ${this.renderStat('Bias', upload?.bias ?? 'unknown')}
              ${this.renderStat('Strength', upload?.strength ?? 'unknown')}
              ${this.renderStat('Spec Net', this.formatNumber(upload?.nonCommercialNet))}
              ${this.renderStat('L/S Ratio', this.formatDecimal(upload?.nonCommercialRatio))}
            </div>
            <div class="vaultum-cot-table">
              ${this.renderRow('Non-Commercial', this.formatNumber(upload?.nonCommercialLong), this.formatNumber(upload?.nonCommercialShort), this.formatNumber(upload?.nonCommercialNet))}
              ${this.renderRow('Commercial', this.formatNumber(upload?.commercialLong), this.formatNumber(upload?.commercialShort), this.formatNumber(upload?.commercialNet))}
              ${this.renderRow('Non-Reportable', this.formatNumber(upload?.nonReportableLong), this.formatNumber(upload?.nonReportableShort), 'n/a')}
            </div>
            <ul class="vaultum-bullets">
              <li>Uploaded source: ${this.escape(upload?.sourceName ?? 'none')}</li>
              <li>Weekly change: ${this.escape(upload?.change ?? 'not parsed')}</li>
              <li>Open interest: ${this.formatNumber(upload?.openInterest)}</li>
            </ul>
            ${this.uploadError ? `<div class="vaultum-alert-row">${this.escape(this.uploadError)}</div>` : ''}
          </div>
        </div>

        <div class="vaultum-cot-compare-grid">
          <div class="vaultum-cot-card">
            <div class="vaultum-ai-label">Bias Translation</div>
            <strong>${this.escape(comparison.headline)}</strong>
            <ul class="vaultum-bullets">${comparison.points.map((point) => `<li>${this.escape(point)}</li>`).join('')}</ul>
          </div>
          <div class="vaultum-cot-card">
            <div class="vaultum-ai-label">Extraction Notes</div>
            <ul class="vaultum-bullets">
              ${(upload?.warnings?.length ? upload.warnings : ['No upload parsed yet.']).map((warning) => `<li>${this.escape(warning)}</li>`).join('')}
            </ul>
            <pre class="vaultum-ai-raw vaultum-cot-raw">${this.escape(upload?.rawPreview ?? 'Upload text preview will appear here after parsing.')}</pre>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(root: HTMLElement, redraw: () => void): void {
    root.querySelectorAll<HTMLButtonElement>('[data-cot-market]').forEach((button) => {
      button.addEventListener('click', async () => {
        const market = button.dataset.cotMarket as typeof COT_MARKETS[number] | undefined;
        if (!market || market === this.selectedMarket) return;
        this.selectedMarket = market;
        await this.loadLiveCot(market, redraw, true);
      });
    });

    root.querySelector<HTMLButtonElement>('[data-cot-refresh="true"]')?.addEventListener('click', async () => {
      await this.loadLiveCot(this.selectedMarket, redraw, true);
    });

    root.querySelector<HTMLInputElement>('#vaultum-cot-upload')?.addEventListener('change', async (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;

      this.uploadError = '';
      this.uploadLoading = true;
      redraw();

      try {
        const analysis = await parseCotUploadFile(file);
        this.uploadAnalysis = analysis;
        saveStoredCotUpload(analysis);

        if (analysis.market === 'GOLD' || analysis.market === 'SILVER' || analysis.market === 'WTI') {
          this.selectedMarket = analysis.market;
          await this.loadLiveCot(analysis.market, redraw, true);
          return;
        }
      } catch (error) {
        this.uploadError = error instanceof Error ? error.message : 'Unable to parse the uploaded report.';
      }

      this.uploadLoading = false;
      redraw();
    });

    root.querySelector<HTMLButtonElement>('[data-cot-clear="true"]')?.addEventListener('click', () => {
      this.uploadAnalysis = null;
      this.uploadError = '';
      clearStoredCotUpload();
      redraw();
    });
  }

  private async ensureLiveCot(redraw: () => void): Promise<void> {
    if (this.liveLoading) return;
    if (this.loadedMarket === this.selectedMarket && (this.liveCot || this.liveError)) return;
    await this.loadLiveCot(this.selectedMarket, redraw, false);
  }

  private async loadLiveCot(market: typeof COT_MARKETS[number], redraw: () => void, force: boolean): Promise<void> {
    if (this.liveLoading) return;
    if (!force && this.loadedMarket === market && (this.liveCot || this.liveError)) return;

    this.liveLoading = true;
    this.liveError = '';
    redraw();

    try {
      const payload = await fetchCotPositioning(market);
      this.liveCot = payload.cot;
      this.liveRegime = payload.regime;
      this.loadedMarket = market;
      if (!payload.cot?.reportDate) {
        this.liveError = `Official CFTC feed did not return a report date for ${market}.`;
      }
    } catch (error) {
      this.liveCot = null;
      this.liveRegime = null;
      this.loadedMarket = market;
      this.liveError = error instanceof Error ? error.message : `Unable to load official COT data for ${market}.`;
    }

    this.liveLoading = false;
    this.uploadLoading = false;
    redraw();
  }

  private buildComparison(live: LiveCotSummary, upload: CotUploadAnalysis | null): { headline: string; points: string[] } {
    if (!live && !upload) {
      return {
        headline: 'No official snapshot or uploaded report is available yet.',
        points: ['Use the market buttons to pull live weekly CFTC data, then upload a PDF or TXT report to compare the extraction.'],
      };
    }

    if (live && !upload) {
      return {
        headline: 'Official CFTC positioning is live; upload a report to compare it against your document workflow.',
        points: [
          `Current live bias: ${this.safeText(this.liveRegime?.bias ?? live.crowdedRisk ?? 'unknown')}.`,
          `Spec long/short ratio is ${this.safeText(this.formatDecimal(live.longShortRatio))}.`,
          'Upload parsing is useful for broker notes, research PDFs, or old archived COT reports.',
        ],
      };
    }

    if (!live && upload) {
      return {
        headline: 'Upload parsing worked, but the live official feed is missing for the selected market.',
        points: [
          `Uploaded bias: ${this.safeText(upload.bias)} with ${this.safeText(upload.strength)} strength.`,
          `Uploaded weekly change: ${this.safeText(upload.change)}.`,
          'Refresh the official feed to compare your report against the current backend source.',
        ],
      };
    }

    const sameBias = live && upload
      ? (this.liveRegime?.bias ?? '').toLowerCase().includes(upload.bias.includes('bullish') ? 'bullish' : upload.bias.includes('bearish') ? 'bearish' : 'neutral')
      : false;

    return {
      headline: sameBias
        ? 'Uploaded report agrees with the current official CFTC bias.'
        : 'Uploaded report and current official CFTC read are not perfectly aligned.',
      points: [
        `Official bias: ${this.safeText(this.liveRegime?.bias ?? 'unknown')} | uploaded bias: ${this.safeText(upload?.bias ?? 'unknown')}.`,
        `Official spec net: ${this.safeText(this.formatNumber(live?.netPosition))} | uploaded spec net: ${this.safeText(this.formatNumber(upload?.nonCommercialNet))}.`,
        `Official ratio: ${this.safeText(this.formatDecimal(live?.longShortRatio))} | uploaded ratio: ${this.safeText(this.formatDecimal(upload?.nonCommercialRatio))}.`,
      ],
    };
  }

  private renderStat(label: string, value: string): string {
    return `
      <div class="vaultum-cot-stat">
        <span>${this.escape(label)}</span>
        <strong>${this.escape(value)}</strong>
      </div>
    `;
  }

  private renderRow(label: string, longValue: string, shortValue: string, netValue: string): string {
    return `
      <div class="vaultum-cot-row">
        <span>${this.escape(label)}</span>
        <span>Long ${this.escape(longValue)}</span>
        <span>Short ${this.escape(shortValue)}</span>
        <span>Net ${this.escape(netValue)}</span>
      </div>
    `;
  }

  private formatNumber(value: number | null | undefined): string {
    return value == null || !Number.isFinite(value) ? 'n/a' : Math.round(value).toLocaleString();
  }

  private formatDecimal(value: number | null | undefined): string {
    return value == null || !Number.isFinite(value) ? 'n/a' : value.toFixed(2);
  }

  private formatSigned(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return 'n/a';
    return `${value >= 0 ? '+' : ''}${Math.round(value).toLocaleString()}`;
  }

  private safeText(value: string): string {
    return value || 'n/a';
  }

  private escape(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
}
