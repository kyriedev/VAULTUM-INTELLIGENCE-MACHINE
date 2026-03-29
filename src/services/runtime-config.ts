export function runtimeConfig(feedStatus: Array<{ provider: string; role: string; state: string; detail: string }> = []): {
  mode: string;
  refreshIntervalMs: number;
  feedStatus: Array<{ provider: string; role: string; state: string; detail: string }>;
} {
  return {
    mode: 'rpc-backed terminal',
    refreshIntervalMs: 120000,
    feedStatus,
  };
}
