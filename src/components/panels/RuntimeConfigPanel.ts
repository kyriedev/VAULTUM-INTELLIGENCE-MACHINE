import type { VaultumAppContext } from '@/app/app-context';
import { BasePanel } from '@/components/base/panel';

export class RuntimeConfigPanel extends BasePanel {
  constructor(private readonly context: VaultumAppContext) {
    super({ id: 'runtime-config', title: 'Runtime Config', kicker: 'Terminal State', tag: 'runtime', tone: 'neutral' });
  }

  protected renderBody(): string {
    const snapshot = this.context.snapshot;
    if (!snapshot) return '<div class="vaultum-callout"><strong>Bootstrapping</strong><span>Runtime config will populate after the first snapshot.</span></div>';

    return `
      <div class="vaultum-callout">
        <strong>Mode: ${snapshot.runtime.mode}</strong>
        <span>Refresh interval: ${Math.round(snapshot.runtime.refreshIntervalMs / 1000)}s</span>
      </div>
      <div class="vaultum-metric-grid">
        <div class="vaultum-metric neutral"><span>Last Update</span><strong>${new Date(snapshot.generatedAt).toLocaleTimeString()}</strong></div>
        <div class="vaultum-metric ${snapshot.freshness.warnings.length ? 'alert' : 'bullish'}"><span>Freshness</span><strong>${snapshot.freshness.summary}</strong></div>
        <div class="vaultum-metric neutral"><span>Intent</span><strong>${snapshot.intent}</strong></div>
      </div>
      <ul class="vaultum-bullets">
        ${(snapshot.freshness.warnings.length ? snapshot.freshness.warnings : ['No major freshness warning currently active.']).map((warning) => `<li>${warning}</li>`).join('')}
      </ul>
    `;
  }
}
