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
  pricingModel: string;
  price: number;
  atr14: number;
  realizedVol20: number;
  realizedVol60: number;
  volPercentile: number;
  tickMomentum: number;
  rangeExpansion: number;
  theoreticalAtmVol: number;
  downsideSkew: number;
  expectedMove1w: number;
  expectedMove1m: number;
  dealerCorridorWidth: number;
  callOpenInterestProxy: number;
  putOpenInterestProxy: number;
  totalInterestProxy: number;
  chainProxyUnderlying: string | null;
  chainAvailable: boolean;
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

  return getCachedOrCompute(cacheKey('options', `dealer:${symbol}`), async () => {
    const proxy = await buildSyntheticOptionsProxy({ symbol });
    return {
      symbol,
      sourceSymbol: proxy.sourceSymbol,
      conclusion: proxy.pressureConclusion,
      bias: proxy.pressureBias,
      pressureScore: proxy.pressureScore,
      expansionRisk: proxy.expansionRisk,
      pricingModel: proxy.pricingModel,
      price: proxy.price,
      atr14: proxy.atr14,
      realizedVol20: proxy.realizedVol20,
      realizedVol60: proxy.realizedVol60,
      volPercentile: proxy.volPercentile,
      tickMomentum: proxy.tickMomentum,
      rangeExpansion: proxy.rangeExpansion,
      theoreticalAtmVol: proxy.theoreticalAtmVol,
      downsideSkew: proxy.downsideSkew,
      expectedMove1w: proxy.expectedMove1w,
      expectedMove1m: proxy.expectedMove1m,
      dealerCorridorWidth: proxy.dealerCorridorWidth,
      callOpenInterestProxy: proxy.callOpenInterestProxy,
      putOpenInterestProxy: proxy.putOpenInterestProxy,
      totalInterestProxy: proxy.totalInterestProxy,
      chainProxyUnderlying: proxy.chainProxyUnderlying,
      chainAvailable: proxy.chainAvailable,
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
