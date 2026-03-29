import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { buildSyntheticOptionsProxy } from './_proxy-engine';

export async function getGammaLevels(input: { symbol: string }): Promise<{
  symbol: string;
  sourceSymbol: string;
  callWall: number;
  putWall: number;
  gammaFlip: number;
  netGamma: number;
  volatilityZone: string;
  keyStrikes: number[];
  price: number;
  atr14: number;
  realizedVol20: number;
  realizedVol60: number;
  volPercentile: number;
  momentum20: number;
  tickMomentum: number;
  rangeExpansion: number;
  mode: 'synthetic-live';
  sourceLabel: string;
}> {
  const symbol = (input.symbol || 'XAUUSD').toUpperCase();

  return getCachedOrCompute(cacheKey('options', `gamma:${symbol}`), async () => {
    const proxy = await buildSyntheticOptionsProxy({ symbol });
    return {
      symbol,
      sourceSymbol: proxy.sourceSymbol,
      callWall: proxy.callWall,
      putWall: proxy.putWall,
      gammaFlip: proxy.gammaFlip,
      netGamma: proxy.netGamma,
      volatilityZone: proxy.volatilityZone,
      keyStrikes: [proxy.putWall, proxy.gammaFlip, proxy.callWall],
      price: proxy.price,
      atr14: proxy.atr14,
      realizedVol20: proxy.realizedVol20,
      realizedVol60: proxy.realizedVol60,
      volPercentile: proxy.volPercentile,
      momentum20: proxy.momentum20,
      tickMomentum: proxy.tickMomentum,
      rangeExpansion: proxy.rangeExpansion,
      mode: 'synthetic-live',
      sourceLabel: proxy.sourceLabel,
    };
  }, 1800);
}
