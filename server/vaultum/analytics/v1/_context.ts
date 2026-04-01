import { normalizeVaultumTimeframe, structuralTimeframeFor } from '../../_shared/timeframes';

export type VaultumAnalyticsContextInput = {
  market?: string;
  timeframe?: string;
  reportStyle?: 'desk' | 'execution';
  requestId?: string;
};

export type VaultumAnalyticsContext = {
  market: string;
  timeframe: string;
  structuralTimeframe: string;
  reportStyle: 'desk' | 'execution';
  requestId: string;
  generatedAt: string;
  cacheSegment: string;
};

function normalizeMarket(market?: string): string {
  return String(market || 'XAUUSD').toUpperCase();
}

function createRequestId(market: string, timeframe: string): string {
  const stamp = Date.now().toString(36);
  return `${market.toLowerCase()}-${timeframe}-${stamp}`;
}

export function createVaultumAnalyticsContext(input: VaultumAnalyticsContextInput): VaultumAnalyticsContext {
  const market = normalizeMarket(input.market);
  const timeframe = normalizeVaultumTimeframe(input.timeframe);
  const reportStyle = input.reportStyle ?? 'desk';

  return {
    market,
    timeframe,
    structuralTimeframe: structuralTimeframeFor(timeframe),
    reportStyle,
    requestId: input.requestId || createRequestId(market, timeframe),
    generatedAt: new Date().toISOString(),
    cacheSegment: `${market}:${timeframe}:${reportStyle}`,
  };
}
