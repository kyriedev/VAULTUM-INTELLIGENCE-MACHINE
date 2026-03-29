import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { buildSyntheticOptionsProxy } from './_proxy-engine';

export async function listOptionsSnapshots(input: { symbol: string }): Promise<{
  symbol: string;
  sourceSymbol: string;
  mode: 'synthetic-live';
  sourceLabel: string;
  snapshots: Array<{ tenor: string; bias: string; impliedVol: number }>;
}> {
  const symbol = (input.symbol || 'XAUUSD').toUpperCase();

  return getCachedOrCompute(cacheKey('options', `snapshots:${symbol}`), async () => {
    const proxy = await buildSyntheticOptionsProxy({ symbol });
    return {
      symbol,
      sourceSymbol: proxy.sourceSymbol,
      mode: 'synthetic-live',
      sourceLabel: proxy.sourceLabel,
      snapshots: proxy.snapshots,
    };
  }, 1800);
}
