import type { VaultumAppContext } from '@/app/app-context';
import { loadBootstrapSnapshot } from '@/services/bootstrap';

export class DataLoader {
  constructor(private readonly context: VaultumAppContext) {}

  async bootstrap(): Promise<void> {
    await this.refresh(false);
  }

  async refreshAll(): Promise<void> {
    await this.refresh(true);
  }

  private async refresh(force: boolean): Promise<void> {
    const snapshot = await loadBootstrapSnapshot(force);
    this.context.snapshot = snapshot;
    this.context.lastUpdatedAt = snapshot.generatedAt;
    this.context.activeIntent = snapshot.intent;
    (window as Window & { __vaultumSnapshot?: typeof snapshot }).__vaultumSnapshot = snapshot;

    const freshnessEl = document.getElementById('vaultum-freshness');
    const intentEl = document.getElementById('vaultum-intent');
    const assetEl = document.getElementById('vaultum-primary-asset');
    const modeEl = document.getElementById('vaultum-update-mode');

    if (freshnessEl) freshnessEl.textContent = snapshot.freshness.summary;
    if (intentEl) intentEl.textContent = snapshot.intent.replace(/-/g, ' ');
    if (assetEl) assetEl.textContent = snapshot.primaryAsset;
    if (modeEl) modeEl.textContent = snapshot.runtime.mode;

    window.dispatchEvent(new CustomEvent('vaultum:snapshot-updated', { detail: snapshot }));
  }
}
