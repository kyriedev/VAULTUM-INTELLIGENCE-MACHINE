import { BasePanel } from '@/components/base/panel';
import { askVaultum, summarizeRegime, type VaultumAiResponse } from '@/services/ai';

export class AiInsightsPanel extends BasePanel {
  private response: VaultumAiResponse | null = null;
  private loading = false;

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

    return `
      <div class="vaultum-ai-shell">
        <div class="vaultum-ai-query">
          <textarea id="vaultum-ai-question" class="vaultum-ai-textarea" placeholder="Ask about gold bias, macro regime, USDJPY carry stress, sanctions impact, gamma pressure, or COT positioning"></textarea>
          <div class="vaultum-ai-actions">
            <button id="vaultum-ai-ask" class="vaultum-btn vaultum-btn-primary">${this.loading ? 'Running...' : 'Ask VAULTUM'}</button>
            <button id="vaultum-ai-regime" class="vaultum-btn">Summarize Regime</button>
          </div>
        </div>
        <div class="vaultum-ai-response">
          <div class="vaultum-callout">
            <strong>${this.escape(conclusion)}</strong>
            <span>${this.response ? `Provider ${this.escape(this.response.provider)} | confidence ${this.escape(this.response.confidence)}` : `Status ${this.escape(panelData?.status ?? 'mixed')}`}</span>
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
              <div class="vaultum-ai-label">Tool Trace</div>
              <ul class="vaultum-bullets">${(tools.length ? tools : ['bootstrap.ai-insights']).map((item) => `<li>${this.escape(item)}</li>`).join('')}</ul>
            </div>
          </div>
          ${this.response?.answer ? `<pre class="vaultum-ai-raw">${this.escape(this.response.answer)}</pre>` : ''}
        </div>
      </div>
    `;
  }

  private bindEvents(root: HTMLElement, redraw: () => void): void {
    const runAsk = async () => {
      const textarea = root.querySelector<HTMLTextAreaElement>('#vaultum-ai-question');
      const question = textarea?.value.trim() || '';
      if (!question) return;
      this.loading = true;
      redraw();
      this.response = await askVaultum(question);
      this.loading = false;
      redraw();
    };

    root.querySelector<HTMLButtonElement>('#vaultum-ai-ask')?.addEventListener('click', async () => {
      await runAsk();
    });

    root.querySelector<HTMLTextAreaElement>('#vaultum-ai-question')?.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        await runAsk();
      }
    });

    root.querySelector<HTMLButtonElement>('#vaultum-ai-regime')?.addEventListener('click', async () => {
      this.loading = true;
      redraw();
      const summary = await summarizeRegime();
      this.response = summary ? {
        provider: 'deterministic-fallback',
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
      } : null;
      this.loading = false;
      redraw();
    });
  }

  private escape(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
}
