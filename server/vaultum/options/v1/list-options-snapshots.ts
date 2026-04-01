import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { buildSyntheticOptionsProxy } from './_proxy-engine';

export async function listOptionsSnapshots(input: { symbol: string }): Promise<{
  symbol: string;
  sourceSymbol: string;
  mode: 'synthetic-live';
  sourceLabel: string;
  pricingModel: string;
  theoreticalAtmVol: number;
  downsideSkew: number;
  expectedMove1w: number;
  expectedMove1m: number;
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
  americanDiagnostics: {
    call: {
      model: string;
      steps: number;
      europeanPremium: number;
      americanPremium: number;
      intrinsicValue: number;
      earlyExercisePremium: number;
      premiumRatioPct: number;
      exerciseStyle: string;
      likelyDriver: string;
    };
    put: {
      model: string;
      steps: number;
      europeanPremium: number;
      americanPremium: number;
      intrinsicValue: number;
      earlyExercisePremium: number;
      premiumRatioPct: number;
      exerciseStyle: string;
      likelyDriver: string;
    };
  };
  strategyPackages: Array<{
    name: string;
    thesis: string;
    structure: string;
    tenorDays: number;
    netPremium: number;
    maxGain: number | null;
    maxLoss: number;
    breakEvenLow: number | null;
    breakEvenHigh: number | null;
    netGreeks: { delta: number; gamma: number; theta: number; vega: number; rho: number };
    summary: string;
  }>;
  featuredStrategy: string;
  featuredStrategySummary: string;
  shockLadder: Array<{
    label: string;
    driver: string;
    premium: number;
    pnl: number;
    tone: string;
  }>;
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
  snapshots: Array<{ tenor: string; bias: string; impliedVol: number; expectedMove: number; atmCall: number; atmPut: number; model: string }>;
}> {
  const symbol = (input.symbol || 'XAUUSD').toUpperCase();

  return getCachedOrCompute(cacheKey('options', `snapshots:${symbol}`), async () => {
    const proxy = await buildSyntheticOptionsProxy({ symbol });
    return {
      symbol,
      sourceSymbol: proxy.sourceSymbol,
      mode: 'synthetic-live',
      sourceLabel: proxy.sourceLabel,
      pricingModel: proxy.pricingModel,
      theoreticalAtmVol: proxy.theoreticalAtmVol,
      downsideSkew: proxy.downsideSkew,
      expectedMove1w: proxy.expectedMove1w,
      expectedMove1m: proxy.expectedMove1m,
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
      americanDiagnostics: proxy.americanDiagnostics,
      strategyPackages: proxy.strategyPackages,
      featuredStrategy: proxy.featuredStrategy,
      featuredStrategySummary: proxy.featuredStrategySummary,
      shockLadder: proxy.shockLadder,
      surfaceFit: proxy.surfaceFit,
      snapshots: proxy.snapshots,
    };
  }, 1800);
}
