import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { interpretStrikePressure, type StrikePressureRequest, type StrikePressureResponse } from './_strike-pressure.ts';

export async function getStrikePressure(input: StrikePressureRequest): Promise<StrikePressureResponse> {
  const symbol = String(input.symbol || 'XAUUSD').toUpperCase();
  const hasInlinePayload = Boolean(input.structuredRows?.length || input.ocrText || input.ocrTable?.length);

  if (hasInlinePayload) {
    return interpretStrikePressure(input);
  }

  const focusKey = input.focusStrike != null ? Number(input.focusStrike).toFixed(2) : 'atm';
  const expiryKey = String(input.expiryBucket || 'all').toLowerCase();
  const neighborKey = Math.max(1, Math.min(4, Math.round(input.neighboringDepth ?? 2)));

  return getCachedOrCompute(
    cacheKey('options', `strike-pressure:${symbol}:${focusKey}:${expiryKey}:${neighborKey}`),
    async () => interpretStrikePressure(input),
    1800,
  );
}
