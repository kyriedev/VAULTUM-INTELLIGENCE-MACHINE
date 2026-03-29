import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { buildSyntheticOptionsProxy } from './_proxy-engine';

export async function getDealerPressure(input: { symbol: string }): Promise<{
  symbol: string;
  sourceSymbol: string;
  conclusion: string;
  bias: string;
  pressureScore: number;
  expansionRisk: string;
  price: number;
  atr14: number;
  realizedVol20: number;
  realizedVol60: number;
  volPercentile: number;
  tickMomentum: number;
  rangeExpansion: number;
  mode: 'synthetic-live';
  sourceLabel: string;
}> {
  const symbol = (input.symbol || 'XAUUSD').toUpperCase();

  return getCachedOrCompute(cacheKey('options', `dealer:${symbol}`), async () => {
    const proxy = await buildSyntheticOptionsProxy({ symbol });
    return {
      symbol,
      sourceSymbol: proxy.sourceSymbol,
      conclusion: proxy.pressureConclusion,
      bias: proxy.pressureBias,
      pressureScore: proxy.pressureScore,
      expansionRisk: proxy.expansionRisk,
      price: proxy.price,
      atr14: proxy.atr14,
      realizedVol20: proxy.realizedVol20,
      realizedVol60: proxy.realizedVol60,
      volPercentile: proxy.volPercentile,
      tickMomentum: proxy.tickMomentum,
      rangeExpansion: proxy.rangeExpansion,
      mode: 'synthetic-live',
      sourceLabel: proxy.sourceLabel,
    };
  }, 1800);
}
