export function runtimeConfig(
  feedStatus: Array<{ provider: string; role: string; state: string; detail: string }> = [],
  providerCatalog: Array<{
    id: string;
    provider: string;
    category: string;
    role: string;
    state: string;
    sourceKind: string;
    primaryFor: string[];
    covers: string[];
    capabilities: string[];
    credentials: string[];
    detail: string;
    notes: string[];
  }> = [],
): {
  mode: string;
  refreshIntervalMs: number;
  feedStatus: Array<{ provider: string; role: string; state: string; detail: string }>;
  providerCatalog: Array<{
    id: string;
    provider: string;
    category: string;
    role: string;
    state: string;
    sourceKind: string;
    primaryFor: string[];
    covers: string[];
    capabilities: string[];
    credentials: string[];
    detail: string;
    notes: string[];
  }>;
} {
  return {
    mode: 'rpc-backed terminal',
    refreshIntervalMs: 120000,
    feedStatus,
    providerCatalog,
  };
}
