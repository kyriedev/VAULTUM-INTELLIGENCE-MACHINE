export type FeedHealthStatus = 'OK' | 'WARN' | 'STALE' | 'EMPTY';
export type FeedSourceMode =
  | 'direct'
  | 'broker'
  | 'relay'
  | 'mixed'
  | 'proxy'
  | 'synthetic'
  | 'headline'
  | 'manual'
  | 'inactive'
  | 'unavailable';

export type FeedSnapshotMeta = {
  label: string;
  generatedAt: string;
  lastUpdatedAt: string | null;
  ageMinutes: number | null;
  staleAfterMinutes: number;
  status: FeedHealthStatus;
  sourceMode: FeedSourceMode;
  trustHaircut: number;
  activeMonitoring: boolean;
  fallbackState: 'primary' | 'fallback' | 'stale-fallback' | 'inactive';
  detail: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function minutesSince(timestamp?: string | null): number | null {
  if (!timestamp) return null;
  const parsed = new Date(timestamp).getTime();
  if (!Number.isFinite(parsed)) return null;
  return Math.max((Date.now() - parsed) / 60_000, 0);
}

export function healthStatusFromAge(input: {
  available: boolean;
  ageMinutes?: number | null;
  staleAfterMinutes: number;
  fallbackState?: FeedSnapshotMeta['fallbackState'];
}): FeedHealthStatus {
  if (!input.available) return 'EMPTY';
  if (input.fallbackState === 'stale-fallback') return 'STALE';
  if (input.ageMinutes == null) return 'WARN';
  if (input.ageMinutes >= input.staleAfterMinutes) return 'STALE';
  if (input.ageMinutes >= Math.max(input.staleAfterMinutes * 0.5, 1)) return 'WARN';
  return 'OK';
}

function baseHaircutForSourceMode(mode: FeedSourceMode): number {
  if (mode === 'direct') return 0;
  if (mode === 'broker') return 0.03;
  if (mode === 'relay') return 0.04;
  if (mode === 'mixed') return 0.06;
  if (mode === 'headline') return 0.12;
  if (mode === 'proxy') return 0.16;
  if (mode === 'synthetic') return 0.22;
  if (mode === 'manual') return 0.08;
  if (mode === 'inactive' || mode === 'unavailable') return 0.3;
  return 0.1;
}

function statusHaircut(status: FeedHealthStatus): number {
  if (status === 'OK') return 0;
  if (status === 'WARN') return 0.06;
  if (status === 'STALE') return 0.12;
  return 0.22;
}

function fallbackHaircut(state: FeedSnapshotMeta['fallbackState']): number {
  if (state === 'primary') return 0;
  if (state === 'fallback') return 0.05;
  if (state === 'stale-fallback') return 0.1;
  return 0.12;
}

export function buildFeedSnapshotMeta(input: {
  label: string;
  generatedAt?: string | null;
  lastUpdatedAt?: string | null;
  staleAfterMinutes: number;
  sourceMode: FeedSourceMode;
  available?: boolean;
  activeMonitoring?: boolean;
  fallbackState?: FeedSnapshotMeta['fallbackState'];
  detail: string;
  extraHaircut?: number;
}): FeedSnapshotMeta {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const lastUpdatedAt = input.lastUpdatedAt ?? generatedAt;
  const ageMinutes = minutesSince(lastUpdatedAt);
  const status = healthStatusFromAge({
    available: input.available ?? true,
    ageMinutes,
    staleAfterMinutes: input.staleAfterMinutes,
    fallbackState: input.fallbackState ?? 'primary',
  });
  const trustHaircut = round(clamp(
    baseHaircutForSourceMode(input.sourceMode)
    + statusHaircut(status)
    + fallbackHaircut(input.fallbackState ?? 'primary')
    + Math.max(input.extraHaircut ?? 0, 0),
    0,
    0.45,
  ));

  return {
    label: input.label,
    generatedAt,
    lastUpdatedAt,
    ageMinutes,
    staleAfterMinutes: input.staleAfterMinutes,
    status,
    sourceMode: input.sourceMode,
    trustHaircut,
    activeMonitoring: Boolean(input.activeMonitoring),
    fallbackState: input.fallbackState ?? 'primary',
    detail: input.detail,
  };
}
