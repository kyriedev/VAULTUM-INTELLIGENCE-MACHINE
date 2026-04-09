import { RELAY_CONFIG } from './_config.ts';
import { startBinanceRelayRuntime } from './_binance.ts';
import { getRelayMacroSnapshot } from './_macro.ts';
import { getRelayLiquiditySnapshot } from './get-liquidity.ts';
import { getRelayVolumeSnapshot } from './get-volume.ts';

let prewarmTimer: ReturnType<typeof setInterval> | null = null;
let runtimeBooted = false;

async function warmAsset(asset: string): Promise<void> {
  await Promise.all([
    getRelayVolumeSnapshot({ asset, forceRefresh: true }),
    getRelayLiquiditySnapshot({ asset, forceRefresh: true }),
  ]);
}

export async function prewarmRelaySnapshots(): Promise<void> {
  await getRelayMacroSnapshot({ forceRefresh: true });
  await Promise.all(RELAY_CONFIG.prewarmAssets.map((asset) =>
    warmAsset(asset).catch(() => {
      /* warm failures are tolerated */
    })));
}

export function startRelayRuntime(): void {
  if (runtimeBooted) return;
  runtimeBooted = true;

  if (RELAY_CONFIG.runtimeEnabled) {
    startBinanceRelayRuntime(RELAY_CONFIG.binanceSymbols);
  }

  void prewarmRelaySnapshots();

  prewarmTimer = setInterval(() => {
    void prewarmRelaySnapshots();
  }, Math.max(RELAY_CONFIG.prewarmIntervalMs, 10_000));
}

export function stopRelayRuntime(): void {
  if (prewarmTimer) clearInterval(prewarmTimer);
  prewarmTimer = null;
  runtimeBooted = false;
}
