type SmartPollLoopOptions = {
  label: string;
  intervalMs: number;
  minIntervalMs?: number;
  maxIntervalMs?: number;
  hiddenTabPause?: boolean;
  immediateOnVisible?: boolean;
  task: () => Promise<void> | void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class SmartPollLoop {
  private timer: number | null = null;
  private running = false;
  private inFlight = false;
  private currentIntervalMs: number;
  private readonly onVisibilityChange = () => {
    if (!this.running) return;
    if (document.hidden && this.options.hiddenTabPause !== false) {
      this.clearTimer();
      return;
    }
    if (this.options.immediateOnVisible !== false) {
      this.triggerSoon(250);
      return;
    }
    this.scheduleNext();
  };

  constructor(private readonly options: SmartPollLoopOptions) {
    this.currentIntervalMs = this.normalizeInterval(options.intervalMs);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    this.clearTimer();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  updateInterval(intervalMs: number): void {
    const next = this.normalizeInterval(intervalMs);
    if (next === this.currentIntervalMs) return;
    this.currentIntervalMs = next;
    if (this.running && !document.hidden) this.triggerSoon(0);
  }

  triggerSoon(delayMs = 0): void {
    if (!this.running) return;
    this.clearTimer();
    if (document.hidden && this.options.hiddenTabPause !== false) return;
    this.timer = window.setTimeout(() => {
      void this.tick();
    }, Math.max(delayMs, 0));
  }

  private normalizeInterval(intervalMs: number): number {
    return clamp(
      Math.round(intervalMs || 60_000),
      this.options.minIntervalMs ?? 15_000,
      this.options.maxIntervalMs ?? 300_000,
    );
  }

  private clearTimer(): void {
    if (this.timer != null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(): void {
    if (!this.running) return;
    if (document.hidden && this.options.hiddenTabPause !== false) return;
    this.clearTimer();
    this.timer = window.setTimeout(() => {
      void this.tick();
    }, this.currentIntervalMs);
  }

  private async tick(): Promise<void> {
    if (!this.running) return;
    if (document.hidden && this.options.hiddenTabPause !== false) {
      this.scheduleNext();
      return;
    }
    if (this.inFlight) {
      this.scheduleNext();
      return;
    }

    this.inFlight = true;
    try {
      await this.options.task();
    } catch {
      /* polling is best-effort; panel/service logic should surface actual errors */
    } finally {
      this.inFlight = false;
      this.scheduleNext();
    }
  }
}
