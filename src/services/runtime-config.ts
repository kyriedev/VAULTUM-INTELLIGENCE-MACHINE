export function runtimeConfig(): { mode: string; refreshIntervalMs: number } {
  return {
    mode: 'rpc-backed terminal',
    refreshIntervalMs: 120000,
  };
}
