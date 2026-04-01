import type { VaultumAppContext } from '@/app/app-context';
import { BasePanel } from '@/components/base/panel';

export class RuntimeConfigPanel extends BasePanel {
  constructor(private readonly context: VaultumAppContext) {
    super({ id: 'runtime-config', title: 'Runtime Config', kicker: 'Terminal State', tag: 'runtime', tone: 'neutral' });
  }

  protected renderBody(): string {
    const snapshot = this.context.snapshot;
    if (!snapshot) return '<div class="vaultum-callout"><strong>Bootstrapping</strong><span>Runtime config will populate after the first snapshot.</span></div>';

    const providerCatalog = snapshot.runtime.providerCatalog ?? [];
    const connectorSummary = providerCatalog.length
      ? [
          `${providerCatalog.filter((item) => item.state === 'active').length} active`,
          `${providerCatalog.filter((item) => item.state === 'ready' || item.state === 'configured').length} ready/configured`,
          `${providerCatalog.filter((item) => item.state === 'fallback').length} fallback`,
        ].join(' / ')
      : 'Connector registry unavailable';

    return `
      <div class="vaultum-callout">
        <strong>Mode: ${snapshot.runtime.mode}</strong>
        <span>Refresh interval: ${Math.round(snapshot.runtime.refreshIntervalMs / 1000)}s</span>
      </div>
      <div class="vaultum-metric-grid">
        <div class="vaultum-metric neutral"><span>Last Update</span><strong>${new Date(snapshot.generatedAt).toLocaleTimeString()}</strong></div>
        <div class="vaultum-metric ${snapshot.freshness.warnings.length ? 'alert' : 'bullish'}"><span>Freshness</span><strong>${snapshot.freshness.summary}</strong></div>
        <div class="vaultum-metric neutral"><span>Intent</span><strong>${snapshot.intent}</strong></div>
        <div class="vaultum-metric neutral"><span>Connectors</span><strong>${connectorSummary}</strong></div>
      </div>
      ${snapshot.runtime.feedStatus?.length ? `
        <div class="vaultum-table-wrap">
          <table class="vaultum-table">
            <thead>
              <tr><th>Feed</th><th>Role</th><th>State</th><th>Detail</th></tr>
            </thead>
            <tbody>
              ${snapshot.runtime.feedStatus.map((item) => `
                <tr>
                  <td>${item.provider}</td>
                  <td>${item.role}</td>
                  <td>${item.state}</td>
                  <td>${item.detail}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
      ${providerCatalog.length ? `
        <div class="vaultum-table-wrap">
          <table class="vaultum-table">
            <thead>
              <tr><th>Connector</th><th>Category</th><th>State</th><th>Primary For</th><th>Coverage</th><th>Capabilities</th></tr>
            </thead>
            <tbody>
              ${providerCatalog.map((item) => `
                <tr>
                  <td>${item.provider}</td>
                  <td>${item.category}</td>
                  <td>${item.state}</td>
                  <td>${item.primaryFor.join(', ')}</td>
                  <td>${item.covers.join(', ')}</td>
                  <td>${item.capabilities.join(', ')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
      <ul class="vaultum-bullets">
        ${(snapshot.freshness.warnings.length ? snapshot.freshness.warnings : ['No major freshness warning currently active.']).map((warning) => `<li>${warning}</li>`).join('')}
      </ul>
    `;
  }
}
