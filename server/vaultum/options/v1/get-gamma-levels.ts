import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { buildSyntheticOptionsProxy } from './_proxy-engine';

export async function getGammaLevels(input: { symbol: string }): Promise<{
  symbol: string;
  sourceSymbol: string;
  pricingModel: string;
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
  theoreticalAtmVol: number;
  downsideSkew: number;
  expectedMove1w: number;
  expectedMove1m: number;
  dealerCorridorWidth: number;
  chainProxyUnderlying: string | null;
  chainAvailable: boolean;
  topStrikes: Array<{ strike: number; kind: 'call' | 'put' | 'balance'; gammaWeight: number }>;
  atmGreeks: { delta: number; gamma: number; theta: number; vega: number; rho: number };
  numericalGreeks: { delta: number; gamma: number; theta: number; vega: number; rho: number };
  greekAgreementScore: number;
  greekAgreementLabel: string;
  greekAgreementNote: string;
  ivSolverMethod: string;
  ivSolverIterations: number;
  ivSolverResidual: number;
  ivSolverConverged: boolean;
  ivSolverBounded: boolean;
  limitedIv: number;
  limitedIvConverged: boolean;
  ivSurface: Array<{ tenor: string; tenorDays: number; atmVol: number; putWingVol: number; callWingVol: number; skew: number }>;
  surfaceFit: {
    method: string;
    rmse: number;
    quality: string;
    atmVol1m: number;
    riskReversal1m: number;
    butterfly1m: number;
    termSlope: number;
    strikeSlope: number;
    convexity: number;
    calibratedTenors: string[];
  };
  mode: 'synthetic-live';
  sourceLabel: string;
}> {
  const symbol = (input.symbol || 'XAUUSD').toUpperCase();

  return getCachedOrCompute(cacheKey('options', `gamma:${symbol}`), async () => {
    const proxy = await buildSyntheticOptionsProxy({ symbol });
    return {
      symbol,
      sourceSymbol: proxy.sourceSymbol,
      pricingModel: proxy.pricingModel,
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
      theoreticalAtmVol: proxy.theoreticalAtmVol,
      downsideSkew: proxy.downsideSkew,
      expectedMove1w: proxy.expectedMove1w,
      expectedMove1m: proxy.expectedMove1m,
      dealerCorridorWidth: proxy.dealerCorridorWidth,
      chainProxyUnderlying: proxy.chainProxyUnderlying,
      chainAvailable: proxy.chainAvailable,
      topStrikes: proxy.topStrikes,
      atmGreeks: proxy.atmGreeks,
      numericalGreeks: proxy.numericalGreeks,
      greekAgreementScore: proxy.greekAgreementScore,
      greekAgreementLabel: proxy.greekAgreementLabel,
      greekAgreementNote: proxy.greekAgreementNote,
      ivSolverMethod: proxy.ivSolverMethod,
      ivSolverIterations: proxy.ivSolverIterations,
      ivSolverResidual: proxy.ivSolverResidual,
      ivSolverConverged: proxy.ivSolverConverged,
      ivSolverBounded: proxy.ivSolverBounded,
      limitedIv: proxy.limitedIv,
      limitedIvConverged: proxy.limitedIvConverged,
      ivSurface: proxy.ivSurface,
      surfaceFit: proxy.surfaceFit,
      mode: 'synthetic-live',
      sourceLabel: proxy.sourceLabel,
    };
  }, 1800);
}
