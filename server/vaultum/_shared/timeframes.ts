export type VaultumTimeframe = '5m' | '15m' | '30m' | '1h' | '4h' | '1d';
export type VaultumStructuralTimeframe = '15m' | '1h' | '4h' | '1d';

const SUPPORTED_TIMEFRAMES = new Set<VaultumTimeframe>(['5m', '15m', '30m', '1h', '4h', '1d']);

export function normalizeVaultumTimeframe(timeframe?: string, fallback: VaultumTimeframe = '1h'): VaultumTimeframe {
  const value = String(timeframe || fallback).toLowerCase() as VaultumTimeframe;
  return SUPPORTED_TIMEFRAMES.has(value) ? value : fallback;
}

export function structuralTimeframeFor(timeframe?: string): VaultumStructuralTimeframe {
  switch (normalizeVaultumTimeframe(timeframe)) {
    case '5m':
    case '15m':
    case '30m':
      return '15m';
    case '4h':
      return '4h';
    case '1d':
      return '1d';
    default:
      return '1h';
  }
}
