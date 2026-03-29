import { BasePanel } from '@/components/base/panel';
import { askVaultum, summarizeRegime, type VaultumAiResponse } from '@/services/ai';

const QUICK_PROMPTS = [
  'What is the current gold bias and what confirms it?',
  'Explain the current macro regime in desk language.',
  'What is USDJPY saying about carry stress right now?',
  'How should I read dealer pressure and gamma for XAUUSD?',
  'Should I enter XAUUSD near 3345 and why?',
  'Should I exit gold near resistance here or hold?',
] as const;

export class AiInsightsPanel extends BasePanel {
  private response: VaultumAiResponse | null = null;
  private loading = false;
  private lastQuestion = '';

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

    return `
      <div class="vaultum-ai-shell">
        <div class="vaultum-ai-hero">
          <div class="vaultum-ai-query-card">
            <div class="vaultum-ai-chip-row">
              <span class="vaultum-ai-chip is-provider">${this.escape(this.response?.provider ?? 'bootstrap.ai-insights')}</span>
              <span class="vaultum-ai-chip is-confidence ${this.response?.confidence ?? 'medium'}">${this.escape((this.response?.confidence ?? 'medium').toUpperCase())}</span>
              <span class="vaultum-ai-chip">${this.escape(this.response?.intent ?? snapshot?.intent ?? 'macro-regime')}</span>
            </div>
            <div class="vaultum-ai-hero-copy">
              <strong>Ask for the why, not just the print.</strong>
              <span>VAULTUM will route through the provider chain, surface market-feed provenance, and keep proxy data labeled honestly.</span>
            </div>
            <div class="vaultum-ai-prompt-wall">
              ${QUICK_PROMPTS.map((prompt) => `
                <button class="vaultum-ai-prompt" data-ai-prompt="${this.escape(prompt)}">${this.escape(prompt)}</button>
              `).join('')}
            </div>
            <div class="vaultum-ai-query">
              <textarea id="vaultum-ai-question" class="vaultum-ai-textarea" placeholder="Ask about gold bias, macro regime, USDJPY carry stress, sanctions impact, gamma pressure, or COT positioning">${this.escape(this.lastQuestion)}</textarea>
              <div class="vaultum-ai-actions">
                <div class="vaultum-ai-hint">Ctrl+Enter runs the query. Provider failures now cascade through the fallback chain.</div>
                <div class="vaultum-ai-action-group">
                  <button id="vaultum-ai-regime" class="vaultum-btn">Summarize Regime</button>
                  <button id="vaultum-ai-ask" class="vaultum-btn vaultum-btn-primary">${this.loading ? 'Running...' : 'Ask VAULTUM'}</button>
                </div>
              </div>
            </div>
          </div>

          <div class="vaultum-ai-status-card">
            <div class="vaultum-ai-status-head">
              <div>
                <div class="vaultum-ai-label">Run Status</div>
                <strong>${this.escape(conclusion)}</strong>
              </div>
              <span>${this.escape(responseMeta)}</span>
            </div>
            <div class="vaultum-ai-mini-grid">
              <div class="vaultum-ai-mini-card">
                <div class="vaultum-ai-label">Provider Chain</div>
                <ul class="vaultum-bullets">${providerTrace.map((item) => `<li>${this.escape(item)}</li>`).join('')}</ul>
              </div>
              <div class="vaultum-ai-mini-card">
                <div class="vaultum-ai-label">Market Feeds</div>
                <ul class="vaultum-bullets">${marketDataTrace.map((item) => `<li>${this.escape(item)}</li>`).join('')}</ul>
              </div>
              <div class="vaultum-ai-mini-card">
                <div class="vaultum-ai-label">Tool Trace</div>
                <ul class="vaultum-bullets">${(tools.length ? tools : ['bootstrap.ai-insights']).map((item) => `<li>${this.escape(item)}</li>`).join('')}</ul>
              </div>
            </div>
          </div>
        </div>

        <div class="vaultum-ai-response">
          <div class="vaultum-ai-conclusion">
            <div class="vaultum-ai-label">Desk Conclusion</div>
            <strong>${this.escape(conclusion)}</strong>
            <span>${this.escape(responseMeta)}</span>
          </div>
          <div class="vaultum-ai-grid">
            <div class="vaultum-ai-block">
              <div class="vaultum-ai-label">Supporting Signals</div>
              <ul class="vaultum-bullets">${signals.map((item: string) => `<li>${this.escape(item)}</li>`).join('')}</ul>
            </div>
            <div class="vaultum-ai-block">
              <div class="vaultum-ai-label">Confirmed Signals</div>
              <ul class="vaultum-bullets">${(confirmed.length ? confirmed : ['No confirmed-signal block yet.']).map((item) => `<li>${this.escape(item)}</li>`).join('')}</ul>
            </div>
            <div class="vaultum-ai-block">
              <div class="vaultum-ai-label">Inferred Implications</div>
              <ul class="vaultum-bullets">${(inferred.length ? inferred : ['No inferred implication block yet.']).map((item) => `<li>${this.escape(item)}</li>`).join('')}</ul>
            </div>
            <div class="vaultum-ai-block">
              <div class="vaultum-ai-label">Estimated / Proxy</div>
              <ul class="vaultum-bullets">${(estimated.length ? estimated : ['No estimated/proxy block yet.']).map((item) => `<li>${this.escape(item)}</li>`).join('')}</ul>
            </div>
            <div class="vaultum-ai-block">
              <div class="vaultum-ai-label">Missing / Uncertain</div>
              <ul class="vaultum-bullets">${(missing.length ? missing : ['No explicit missing-data warning from the last run.']).map((item) => `<li>${this.escape(item)}</li>`).join('')}</ul>
            </div>
            <div class="vaultum-ai-block">
              <div class="vaultum-ai-label">Caveats</div>
              <ul class="vaultum-bullets">${(caveats.length ? caveats : ['No major caveat surfaced yet.']).map((item) => `<li>${this.escape(item)}</li>`).join('')}</ul>
            </div>
            <div class="vaultum-ai-block">
              <div class="vaultum-ai-label">What To Watch</div>
              <ul class="vaultum-bullets">${(watchItems.length ? watchItems : ['Use the input box to query the live terminal context.']).map((item) => `<li>${this.escape(item)}</li>`).join('')}</ul>
            </div>
            <div class="vaultum-ai-block">
              <div class="vaultum-ai-label">Context Snapshot</div>
              <pre class="vaultum-ai-raw vaultum-ai-context">${this.escape(this.response?.contextSnapshot ?? 'Run a question to inspect the full context trace.')}</pre>
            </div>
          </div>
          ${this.response?.answer ? `
            <div class="vaultum-ai-answer-card">
              <div class="vaultum-ai-label">Desk Note</div>
              <pre class="vaultum-ai-raw">${this.escape(this.response.answer)}</pre>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private bindEvents(root: HTMLElement, redraw: () => void): void {
    const runAsk = async (forcedQuestion?: string) => {
      const textarea = root.querySelector<HTMLTextAreaElement>('#vaultum-ai-question');
      const question = (forcedQuestion ?? textarea?.value ?? '').trim();
      if (!question) return;

      this.lastQuestion = question;
      this.loading = true;
      redraw();

      this.response = await askVaultum(question) ?? this.buildFailureResponse(question);

      this.loading = false;
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
