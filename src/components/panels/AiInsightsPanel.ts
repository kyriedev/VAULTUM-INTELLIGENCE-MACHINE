import { BasePanel } from '@/components/base/panel';
import { getMarketFocus, subscribeMarketFocus, type MarketFocus } from '@/services/market-focus';
import {
  askVaultum,
  prepareChartReviewImage,
  reviewVaultumChart,
  summarizeRegime,
  type VaultumAiResponse,
  type VaultumChartReviewResponse,
} from '@/services/ai';
import { recordChartReviewExample } from '@/services/learning';
import { buildTradeJournalContext, loadTradeJournal } from '@/services/trade-journal';

const QUICK_PROMPTS = [
  'What is the current gold bias and what confirms it?',
  'Explain the current macro regime in desk language.',
  'What is USDJPY saying about carry stress right now?',
  'How should I read dealer pressure and gamma for XAUUSD?',
  'Should I enter XAUUSD near 3345 and why?',
  'Should I exit gold near resistance here or hold?',
] as const;

export class AiInsightsPanel extends BasePanel {
  private marketFocus: MarketFocus = getMarketFocus();
  private response: VaultumAiResponse | null = null;
  private loading = false;
  private lastQuestion = '';
  private chartReview: VaultumChartReviewResponse | null = null;
  private chartReviewLoading = false;
  private chartReviewError = '';
  private chartReviewQuestion = '';
  private chartReviewImageDataUrl = '';

  constructor() {
    super({ id: 'ai-insights', title: 'AI Insights', kicker: 'Reasoning Layer', tag: 'ai', tone: 'bullish' });
  }

  render(): HTMLElement {
    const panel = document.createElement('section');
    panel.className = `vaultum-panel ${this.definition.tone ?? 'neutral'}`;
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
      body.innerHTML = this.renderAiBody();
      this.bindEvents(body, redraw);
    };

    subscribeMarketFocus((focus) => {
      this.marketFocus = focus;
      redraw();
    });

    redraw();
    window.addEventListener('vaultum:snapshot-updated', () => redraw());
    return panel;
  }

  protected renderBody(): string {
    return '';
  }

  private renderAiBody(): string {
    const snapshot = (window as Window & { __vaultumSnapshot?: any }).__vaultumSnapshot;
    const panelData = snapshot?.panels?.['ai-insights'];
    const conclusion = this.response?.conclusion ?? panelData?.conclusion ?? 'AI reasoning layer idle.';
    const signals = this.response?.supportingSignals ?? panelData?.bullets ?? [];
    const caveats = this.response?.caveats ?? [];
    const watchItems = this.response?.watchItems ?? [];
    const tools = this.response?.toolsUsed ?? [];
    const confirmed = this.response?.confirmedSignals ?? [];
    const inferred = this.response?.inferredImplications ?? [];
    const estimated = this.response?.estimatedSignals ?? [];
    const missing = this.response?.missingData ?? [];
    const tradePlan = this.response?.tradePlan ?? null;
    const memoryMatches = this.response?.memoryMatches ?? [];
    const providerTrace = this.response?.providerTrace ?? [
      'ollama:local-if-configured',
      'groq:cloud-if-configured',
      'openrouter:cloud-if-configured',
      'deterministic-fallback:vaultum-rule-engine',
    ];
    const marketDataTrace = this.response?.marketDataTrace ?? [
      'TradingView is chart UI only; backend feeds power the actual quote context.',
      'Market quotes use Finnhub where configured and Yahoo Finance for indices, futures, FX, and fallbacks.',
    ];
    const responseMeta = this.response
      ? `Provider ${this.escape(this.response.provider)} | confidence ${this.escape(this.response.confidence)}`
      : `Status ${this.escape(panelData?.status ?? 'mixed')}`;
    const focusLabel = `${this.marketFocus.market} | ${this.marketFocus.timeframe.toUpperCase()}`;
    const bias = this.deriveBias(conclusion, confirmed, signals, watchItems);
    const primaryReason = confirmed[0] ?? signals[0] ?? watchItems[0] ?? 'Waiting for the next structured AI run.';

    return `
      <div class="vaultum-ai-shell">
        <div class="vaultum-data-grid vaultum-data-grid--halves">
          <div class="vaultum-primary-card ${bias.tone}">
            <div class="vaultum-primary-card-head">
              <span>AI Bias</span>
              <strong>${this.escape((this.response?.confidence ?? 'medium').toUpperCase())}</strong>
            </div>
            <div class="vaultum-primary-card-value">${this.escape(bias.label)}</div>
            <div class="vaultum-primary-card-copy">${this.escape(primaryReason)}</div>
          </div>
          <div class="vaultum-data-card">
            <span>Execution Read</span>
            <strong class="value">${this.escape(conclusion)}</strong>
            <div class="detail">${this.escape(focusLabel)}</div>
            <div class="meta">${this.escape(responseMeta)}</div>
          </div>
        </div>

        ${tradePlan ? `
          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head">
              <span>Trade Plan</span>
              <strong>${this.escape(`${tradePlan.bias} | ${tradePlan.biasScore}`)}</strong>
            </div>
            <div class="vaultum-data-grid">
              <div class="vaultum-data-card">
                <span>Institutional Bias</span>
                <strong class="value">${this.escape(tradePlan.institutionalSummary)}</strong>
              </div>
              <div class="vaultum-data-card">
                <span>Entry</span>
                <strong class="value">${this.escape(tradePlan.entrySuggestion)}</strong>
              </div>
              <div class="vaultum-data-card">
                <span>Re-entry</span>
                <strong class="value">${this.escape(tradePlan.reEntrySuggestion)}</strong>
              </div>
              <div class="vaultum-data-card">
                <span>Exit</span>
                <strong class="value">${this.escape(tradePlan.exitSuggestion)}</strong>
              </div>
              <div class="vaultum-data-card">
                <span>Monte Carlo</span>
                <strong class="value">${this.escape(tradePlan.monteCarloSummary)}</strong>
              </div>
              <div class="vaultum-data-card">
                <span>Options Math</span>
                <strong class="value">${this.escape(tradePlan.optionsMathSummary)}</strong>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="vaultum-ai-query-card">
          <div class="vaultum-ai-chip-row">
            <span class="vaultum-ai-chip is-provider">${this.escape(this.response?.provider ?? 'bootstrap.ai-insights')}</span>
            <span class="vaultum-ai-chip is-confidence ${this.response?.confidence ?? 'medium'}">${this.escape((this.response?.confidence ?? 'medium').toUpperCase())}</span>
            <span class="vaultum-ai-chip">${this.escape(this.response?.intent ?? snapshot?.intent ?? 'macro-regime')}</span>
          </div>
          <div class="vaultum-ai-prompt-wall">
            ${QUICK_PROMPTS.map((prompt) => `
              <button class="vaultum-ai-prompt" data-ai-prompt="${this.escape(prompt)}">${this.escape(prompt)}</button>
            `).join('')}
          </div>
          <div class="vaultum-ai-query">
            <textarea id="vaultum-ai-question" class="vaultum-ai-textarea" placeholder="Ask about gold bias, macro regime, USDJPY carry stress, sanctions impact, gamma pressure, or COT positioning">${this.escape(this.lastQuestion)}</textarea>
            <div class="vaultum-ai-actions">
              <div class="vaultum-ai-hint">Ctrl+Enter runs the query. Provider failures cascade through the fallback chain.</div>
              <div class="vaultum-ai-action-group">
                <button id="vaultum-ai-regime" class="vaultum-btn">Summarize Regime</button>
                <button id="vaultum-ai-ask" class="vaultum-btn vaultum-btn-primary">${this.loading ? 'Running...' : 'Ask VAULTUM'}</button>
              </div>
            </div>
          </div>
        </div>

        ${this.renderChartReviewSection(focusLabel)}

        <div class="vaultum-ai-response">
          <div class="vaultum-data-grid">
            ${this.renderListBlock('Supporting Signals', signals)}
            ${this.renderListBlock('Confirmed Signals', confirmed.length ? confirmed : ['No confirmed-signal block yet.'])}
            ${this.renderListBlock('Inferred Implications', inferred.length ? inferred : ['No inferred implication block yet.'])}
            ${this.renderListBlock('Estimated / Proxy', estimated.length ? estimated : ['No estimated/proxy block yet.'])}
            ${this.renderListBlock('Missing / Uncertain', missing.length ? missing : ['No explicit missing-data warning from the last run.'], 'alert')}
            ${this.renderListBlock('Caveats', caveats.length ? caveats : ['No major caveat surfaced yet.'], 'alert')}
            ${this.renderListBlock('What To Watch', watchItems.length ? watchItems : ['Use the input box to query the live terminal context.'])}
            ${tradePlan?.quotedEvidence?.length
              ? this.renderListBlock(
                'Quoted Evidence',
                tradePlan.quotedEvidence.map((item) => `[${item.status}] ${item.label} | ${item.source} | ${item.quote}`),
              )
              : ''}
            ${this.renderListBlock(
              'Situation Memory',
              memoryMatches.length
                ? memoryMatches.map((item) => `${Math.round(item.similarityScore * 100)}% ${item.outcome ?? 'open'} | ${item.recommendation}`)
                : ['No similar stored setup has been recalled yet.'],
            )}
            ${this.renderListBlock('Provider Chain', providerTrace)}
            ${this.renderListBlock('Market Feeds', marketDataTrace)}
            ${this.renderListBlock('Tool Trace', tools.length ? tools : ['bootstrap.ai-insights'])}
          </div>
          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head">
              <span>Context Snapshot</span>
              <strong>trace</strong>
            </div>
            <pre class="vaultum-ai-raw vaultum-ai-context">${this.escape(this.response?.contextSnapshot ?? 'Run a question to inspect the full context trace.')}</pre>
          </div>
          ${this.response?.answer ? `
            <div class="vaultum-data-block">
              <div class="vaultum-data-block-head">
                <span>Desk Note</span>
                <strong>raw</strong>
              </div>
              <pre class="vaultum-ai-raw">${this.escape(this.response.answer)}</pre>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private renderChartReviewSection(focusLabel: string): string {
    const review = this.chartReview;
    const imageMarkup = this.chartReviewImageDataUrl
      ? `<img src="${this.escape(this.chartReviewImageDataUrl)}" alt="Chart review upload preview" class="vaultum-ai-review-image" />`
      : `<div class="vaultum-ai-review-placeholder">Upload a chart screenshot with your levels, notes, or footprint view.</div>`;

    const metrics = review ? `
      <div class="vaultum-ai-review-metrics">
        <div class="vaultum-ai-review-metric"><span>Mode</span><strong>${this.escape(review.reviewMode)}</strong></div>
        <div class="vaultum-ai-review-metric"><span>Alignment</span><strong>${this.escape(review.alignment)}</strong></div>
        <div class="vaultum-ai-review-metric"><span>Alignment Score</span><strong>${review.alignmentScore != null ? this.escape(String(review.alignmentScore)) : 'n/a'}</strong></div>
        <div class="vaultum-ai-review-metric"><span>Thesis Score</span><strong>${review.thesisScore != null ? this.escape(String(review.thesisScore)) : 'n/a'}</strong></div>
      </div>
    ` : '';

    return `
      <div class="vaultum-ai-review-card">
        <div class="vaultum-ai-review-head">
          <div>
            <div class="vaultum-ai-label">Chart Review</div>
            <strong>Feed a screenshot and compare it to Vaultum's live institutional read.</strong>
          </div>
          <span>${this.escape(focusLabel)}</span>
        </div>
        <div class="vaultum-ai-review-grid">
          <label class="vaultum-ai-review-drop">
            <input id="vaultum-ai-chart-upload" type="file" accept="image/png,image/jpeg,image/webp" />
            <strong>${this.chartReviewLoading ? 'Preparing chart...' : 'Choose chart screenshot'}</strong>
            <span>Vaultum uses the current market focus when comparing your screenshot to live structure, flow, and risk context.</span>
          </label>
          <div class="vaultum-ai-review-preview">${imageMarkup}</div>
        </div>
        <textarea id="vaultum-ai-chart-note" class="vaultum-ai-textarea vaultum-ai-review-note" placeholder="Optional note: tell Vaultum what you are seeing, what your entry idea is, or what level you want reviewed.">${this.escape(this.chartReviewQuestion)}</textarea>
        <div class="vaultum-ai-actions vaultum-ai-review-actions">
          <div class="vaultum-ai-hint">If the screenshot is for a different market or timeframe, switch the live chart focus first so the comparison stays honest.</div>
          <div class="vaultum-ai-action-group">
            <button id="vaultum-ai-chart-clear" class="vaultum-btn">Clear Chart</button>
            <button id="vaultum-ai-chart-review" class="vaultum-btn vaultum-btn-primary">${this.chartReviewLoading ? 'Reviewing...' : 'Review Screenshot'}</button>
          </div>
        </div>
        ${this.chartReviewError ? `<div class="vaultum-alert-row">${this.escape(this.chartReviewError)}</div>` : ''}
        ${review ? `
          ${metrics}
          <div class="vaultum-primary-card ${review.alignment === 'aligned' ? 'bullish' : review.alignment === 'conflicted' ? 'bearish' : 'neutral'}">
            <div class="vaultum-primary-card-head">
              <span>Chart Read</span>
              <strong>${this.escape(review.alignment)}</strong>
            </div>
            <div class="vaultum-primary-card-value">${this.escape(review.conclusion)}</div>
            <div class="vaultum-primary-card-copy">${this.escape(review.chartReadSummary)}</div>
          </div>
          <div class="vaultum-data-grid">
            ${review.extractedLevels?.length ? this.renderListBlock('Extracted Levels', review.extractedLevels) : ''}
            ${review.overlayComparisons?.length ? this.renderListBlock('Live Comparison', review.overlayComparisons) : ''}
            ${review.chartLogic?.actionLines?.length ? this.renderListBlock('Decision Engine', review.chartLogic.actionLines) : ''}
            ${review.chartLogic?.keyEvents?.length ? this.renderListBlock('Key Events', review.chartLogic.keyEvents) : ''}
            ${review.knowledgeContext?.focusConcepts?.length ? this.renderListBlock('Doctrine Focus', review.knowledgeContext.focusConcepts) : ''}
            ${review.knowledgeContext?.sourceLineage?.length ? this.renderListBlock('Knowledge Sources', review.knowledgeContext.sourceLineage) : ''}
            ${review.chartLogic?.missing?.length ? this.renderListBlock('Missing', review.chartLogic.missing, 'alert') : ''}
            ${review.chartLogic?.invalidates?.length ? this.renderListBlock('Invalidates', review.chartLogic.invalidates, 'alert') : ''}
            ${this.renderListBlock('Supporting Signals', review.supportingSignals)}
            ${this.renderListBlock('Caveats', review.caveats, 'alert')}
            ${this.renderListBlock('What To Watch', review.watchItems)}
          </div>
          <div class="vaultum-data-grid">
            <div class="vaultum-data-card">
              <span>Major Structure</span>
              <strong class="value">${this.escape(review.chartLogic?.majorStructure ?? 'n/a')}</strong>
            </div>
            <div class="vaultum-data-card">
              <span>Minor Structure</span>
              <strong class="value">${this.escape(review.chartLogic?.minorStructure ?? 'n/a')}</strong>
            </div>
            <div class="vaultum-data-card">
              <span>Execution Layer</span>
              <strong class="value">${this.escape(review.chartLogic?.executionLayer ?? 'n/a')}</strong>
            </div>
            <div class="vaultum-data-card">
              <span>Best Entry / SL</span>
              <strong class="value">${this.escape(`${review.chartLogic?.bestEntryPrice ?? 'n/a'} / ${review.chartLogic?.invalidation ?? 'n/a'}`)}</strong>
            </div>
          </div>
          <div class="vaultum-data-block">
            <div class="vaultum-data-block-head">
              <span>Chart Review Note</span>
              <strong>raw</strong>
            </div>
            <pre class="vaultum-ai-raw">${this.escape(review.answer)}</pre>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderListBlock(
    title: string,
    items: string[],
    tone: 'neutral' | 'bullish' | 'bearish' | 'alert' = 'neutral',
  ): string {
    return `
      <div class="vaultum-data-block">
        <div class="vaultum-data-block-head">
          <span>${this.escape(title)}</span>
          <strong>${items.length}</strong>
        </div>
        <div class="vaultum-signal-list">
          ${items.map((item) => `<div class="vaultum-signal-row ${tone}"><span>${this.escape(item)}</span></div>`).join('')}
        </div>
      </div>
    `;
  }

  private deriveBias(
    conclusion: string,
    confirmed: string[],
    supporting: string[],
    watchItems: string[],
  ): { label: string; tone: 'neutral' | 'bullish' | 'bearish' | 'alert' } {
    const haystack = [conclusion, ...confirmed, ...supporting, ...watchItems].join(' ').toLowerCase();
    if (/(stand-down|stay flat|conflicted|avoid|risk-off warning)/.test(haystack)) {
      return { label: 'Stand Down', tone: 'alert' };
    }
    if (/(lean-short|short bias|short|bearish|sell|sellers dominant|downside)/.test(haystack)) {
      return { label: 'Short Bias', tone: 'bearish' };
    }
    if (/(lean-long|long bias|long|bullish|buy|buyers dominant|upside)/.test(haystack)) {
      return { label: 'Long Bias', tone: 'bullish' };
    }
    if (/(wait|neutral|mixed|balanced|rotational)/.test(haystack)) {
      return { label: 'Wait / Mixed', tone: 'neutral' };
    }
    return { label: 'Context Pending', tone: 'neutral' };
  }

  private bindEvents(root: HTMLElement, redraw: () => void): void {
    const runAsk = async (forcedQuestion?: string) => {
      const textarea = root.querySelector<HTMLTextAreaElement>('#vaultum-ai-question');
      const question = (forcedQuestion ?? textarea?.value ?? '').trim();
      if (!question) return;

      this.lastQuestion = question;
      this.loading = true;
      redraw();

      try {
        let localContext = `Manual trade journal is unavailable for ${this.marketFocus.market} on this device.`;
        try {
          const journalEntries = await loadTradeJournal();
          localContext = buildTradeJournalContext(journalEntries, this.marketFocus.market);
        } catch {
          localContext = `Manual trade journal could not be read locally for ${this.marketFocus.market}.`;
        }

        this.response = await askVaultum(question, localContext, this.marketFocus) ?? this.buildFailureResponse(question);
      } catch {
        this.response = this.buildFailureResponse(question);
      } finally {
        this.loading = false;
        redraw();
      }
    };

    const runChartReview = async () => {
      if (!this.chartReviewImageDataUrl) {
        this.chartReviewError = 'Upload a chart screenshot first.';
        redraw();
        return;
      }

      const noteInput = root.querySelector<HTMLTextAreaElement>('#vaultum-ai-chart-note');
      const question = (noteInput?.value ?? this.chartReviewQuestion ?? '').trim()
        || `Review this ${this.marketFocus.market} ${this.marketFocus.timeframe.toUpperCase()} screenshot and tell me whether the setup is aligned, too late, or missing something important.`;

      this.chartReviewQuestion = question;
      this.chartReviewLoading = true;
      this.chartReviewError = '';
      redraw();

      try {
        const response = await reviewVaultumChart({
          market: this.marketFocus.market,
          timeframe: this.marketFocus.timeframe,
          question,
          imageDataUrl: this.chartReviewImageDataUrl,
        });
        if (!response) {
          this.chartReview = null;
          this.chartReviewError = 'Chart review request did not return a response.';
        } else {
          this.chartReview = response;
          void recordChartReviewExample({
            review: response,
            market: this.marketFocus.market,
            timeframe: this.marketFocus.timeframe,
            note: question,
          }).catch(() => undefined);
        }
      } catch (error) {
        this.chartReview = null;
        this.chartReviewError = error instanceof Error ? error.message : 'Chart review failed.';
      }

      this.chartReviewLoading = false;
      redraw();
    };

    root.querySelectorAll<HTMLButtonElement>('[data-ai-prompt]').forEach((button) => {
      button.addEventListener('click', async () => {
        const prompt = button.dataset.aiPrompt ?? '';
        const textarea = root.querySelector<HTMLTextAreaElement>('#vaultum-ai-question');
        if (textarea) textarea.value = prompt;
        await runAsk(prompt);
      });
    });

    root.querySelector<HTMLButtonElement>('#vaultum-ai-ask')?.addEventListener('click', async () => {
      await runAsk();
    });

    root.querySelector<HTMLTextAreaElement>('#vaultum-ai-question')?.addEventListener('input', (event) => {
      this.lastQuestion = (event.target as HTMLTextAreaElement).value;
    });

    root.querySelector<HTMLTextAreaElement>('#vaultum-ai-question')?.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        await runAsk();
      }
    });

    root.querySelector<HTMLButtonElement>('#vaultum-ai-regime')?.addEventListener('click', async () => {
      this.lastQuestion = 'Summarize the current macro regime for trading.';
      this.loading = true;
      redraw();
      const summary = await summarizeRegime();
      this.response = summary ? {
        provider: 'deterministic-fallback:vaultum-rule-engine',
        providerTrace: ['deterministic-fallback:vaultum-rule-engine'],
        marketDataTrace: [
          'Regime summary is generated from the current backend domain snapshot.',
          'TradingView is chart UI only; quote context comes from backend feeds.',
        ],
        intent: 'macro-regime',
        toolsUsed: ['macro.get_macro_signals', 'liquidity.get_cross_asset_regime'],
        confidence: 'medium',
        conclusion: summary.summary,
        supportingSignals: ['Macro summary generated from current backend domain state.'],
        caveats: ['Use this as a compact note; query the panel for asset-specific detail.'],
        watchItems: ['Watch yields, dollar, gold, and VIX for regime confirmation.'],
        confirmedSignals: [],
        inferredImplications: [],
        estimatedSignals: [],
        missingData: [],
        answer: summary.summary,
        contextSnapshot: summary.summary,
      } : this.buildFailureResponse(this.lastQuestion);
      this.loading = false;
      redraw();
    });

    root.querySelector<HTMLInputElement>('#vaultum-ai-chart-upload')?.addEventListener('change', async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      this.chartReviewLoading = true;
      this.chartReviewError = '';
      this.chartReview = null;
      redraw();
      try {
        this.chartReviewImageDataUrl = await prepareChartReviewImage(file);
      } catch (error) {
        this.chartReviewImageDataUrl = '';
        this.chartReviewError = error instanceof Error ? error.message : 'Unable to prepare the chart screenshot.';
      }
      this.chartReviewLoading = false;
      redraw();
    });

    root.querySelector<HTMLTextAreaElement>('#vaultum-ai-chart-note')?.addEventListener('input', (event) => {
      this.chartReviewQuestion = (event.target as HTMLTextAreaElement).value;
    });

    root.querySelector<HTMLButtonElement>('#vaultum-ai-chart-review')?.addEventListener('click', async () => {
      await runChartReview();
    });

    root.querySelector<HTMLButtonElement>('#vaultum-ai-chart-clear')?.addEventListener('click', () => {
      this.chartReview = null;
      this.chartReviewError = '';
      this.chartReviewQuestion = '';
      this.chartReviewImageDataUrl = '';
      const upload = root.querySelector<HTMLInputElement>('#vaultum-ai-chart-upload');
      if (upload) upload.value = '';
      const note = root.querySelector<HTMLTextAreaElement>('#vaultum-ai-chart-note');
      if (note) note.value = '';
      redraw();
    });
  }

  private buildFailureResponse(question: string): VaultumAiResponse {
    return {
      provider: 'deterministic-fallback:vaultum-rule-engine',
      providerTrace: [
        'ollama:local-if-configured',
        'groq:cloud-if-configured',
        'openrouter:cloud-if-configured',
        'deterministic-fallback:vaultum-rule-engine',
      ],
      marketDataTrace: [
        'TradingView is chart UI only; backend feeds power the actual quote context.',
        'If live providers fail, Vaultum now falls back to deterministic analysis plus cached feed metadata where available.',
      ],
      intent: 'macro-regime',
      toolsUsed: [],
      confidence: 'low',
      conclusion: 'AI request failed to return a live provider response.',
      supportingSignals: [`Question queued: ${question}`],
      caveats: ['The RPC call did not return a response, so this panel is showing a local failure fallback.'],
      watchItems: ['Check provider credentials or upstream connectivity, then rerun the query.'],
      confirmedSignals: [],
      inferredImplications: [],
      estimatedSignals: [],
      missingData: ['Live AI provider response unavailable.'],
      answer: 'No structured AI response was returned by the backend.',
      contextSnapshot: `Question: ${question}\nStatus: local fallback`,
    };
  }

  private escape(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
}
