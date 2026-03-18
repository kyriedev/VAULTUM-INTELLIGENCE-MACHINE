import type { VaultumAppContext } from '@/app/app-context';
import { DataLoader } from '@/app/data-loader';

export class RefreshScheduler {
  private timer: number | null = null;
  private readonly onSnapshotUpdated = () => this.start();

  constructor(
    private readonly context: VaultumAppContext,
    private readonly dataLoader: DataLoader,
  ) {}

  start(): void {
    this.stop();
    const intervalMs = this.resolveIntervalMs();
    this.timer = window.setInterval(() => {
      void this.dataLoader.refreshAll();
    }, intervalMs);
    window.removeEventListener('vaultum:snapshot-updated', this.onSnapshotUpdated);
    window.addEventListener('vaultum:snapshot-updated', this.onSnapshotUpdated);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    window.removeEventListener('vaultum:snapshot-updated', this.onSnapshotUpdated);
  }

  private resolveIntervalMs(): number {
    const base = this.context.snapshot?.runtime.refreshIntervalMs ?? 120000;
    const warnings = this.context.snapshot?.freshness.warnings.length ?? 0;
    if (warnings >= 3) return Math.min(base * 2, 300000);
    if (warnings === 0) return Math.max(60000, Math.round(base * 0.75));
    return base;
  }
}
