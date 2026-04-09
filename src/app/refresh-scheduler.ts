import type { VaultumAppContext } from '@/app/app-context';
import { DataLoader } from '@/app/data-loader';
import { SmartPollLoop } from '@/services/smart-poll-loop';

export class RefreshScheduler {
  private loop: SmartPollLoop | null = null;
  private readonly onSnapshotUpdated = () => this.start();

  constructor(
    private readonly context: VaultumAppContext,
    private readonly dataLoader: DataLoader,
  ) {}

  start(): void {
    const intervalMs = this.resolveIntervalMs();
    if (!this.loop) {
      this.loop = new SmartPollLoop({
        label: 'bootstrap-refresh',
        intervalMs,
        task: async () => {
          await this.dataLoader.refreshAll();
        },
      });
      this.loop.start();
    } else {
      this.loop.updateInterval(intervalMs);
    }
    window.removeEventListener('vaultum:snapshot-updated', this.onSnapshotUpdated);
    window.addEventListener('vaultum:snapshot-updated', this.onSnapshotUpdated);
  }

  stop(): void {
    this.loop?.stop();
    this.loop = null;
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
