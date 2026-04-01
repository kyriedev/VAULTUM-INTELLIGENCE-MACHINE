import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { buildSyntheticOptionsProxy } from './_proxy-engine';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export async function getFlowProxy(input: { symbol: string }): Promise<{
  symbol: string;
  sourceSymbol: string;
  mode: 'synthetic-live';
  flowBias: string;
  flowTilt: string;
  dealerPositioning: string;
  squeezeRisk: string;
  netFlowScore: number;
  callFlowScore: number;
  putFlowScore: number;
  callWall: number;
  putWall: number;
  gammaFlip: number;
  netGamma: number;
  price: number;
  atr14: number;
  momentum20: number;
  tickMomentum: number;
  rangeExpansion: number;
  volPercentile: number;
  pricingModel: string;
  theoreticalAtmVol: number;
  downsideSkew: number;
  expectedMove1w: number;
  expectedMove1m: number;
  dealerCorridorWidth: number;
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
  chainProxyUnderlying: string | null;
  chainAvailable: boolean;
  callOpenInterestProxy: number;
  putOpenInterestProxy: number;
  featuredStrategy: string;
  featuredStrategySummary: string;
  americanExerciseRisk: string;
  sourceLabel: string;
  explanation: string;
}> {
  const symbol = (input.symbol || 'XAUUSD').toUpperCase();

  return getCachedOrCompute(cacheKey('options', `flow-proxy:${symbol}`), async () => {
    const proxy = await buildSyntheticOptionsProxy({ symbol });
    const directionalPressure = (proxy.momentum20 * 2.8) + (proxy.tickMomentum * 11);
    const structuralBoost = (proxy.netGamma < 0 ? Math.sign(directionalPressure || 1) * 18 : 0) + ((proxy.rangeExpansion - 1) * 18) + ((proxy.volPercentile - 50) * 0.5);
    const netFlowScore = clamp(Math.round(directionalPressure + structuralBoost), -100, 100);
    const callFlowScore = clamp(Math.round(50 + (netFlowScore / 2)), 0, 100);
    const putFlowScore = clamp(Math.round(50 - (netFlowScore / 2)), 0, 100);
    const flowBias = netFlowScore >= 18
      ? 'call-chasing proxy'
      : netFlowScore <= -18
        ? 'put-chasing proxy'
        : 'two-way / balanced proxy';
    const flowTilt = netFlowScore > 8 ? 'bullish' : netFlowScore < -8 ? 'bearish' : 'neutral';
    const dealerPositioning = proxy.netGamma < 0 ? 'short-gamma-like inventory' : 'long-gamma-like inventory';
    const squeezeRisk = proxy.netGamma < 0 && Math.abs(netFlowScore) >= 22
      ? 'high'
      : proxy.netGamma < 0 || Math.abs(netFlowScore) >= 12
        ? 'moderate'
        : 'contained';

    return {
      symbol,
      sourceSymbol: proxy.sourceSymbol,
      mode: 'synthetic-live',
      flowBias,
      flowTilt,
      dealerPositioning,
      squeezeRisk,
      netFlowScore,
      callFlowScore,
      putFlowScore,
      callWall: proxy.callWall,
      putWall: proxy.putWall,
      gammaFlip: proxy.gammaFlip,
      netGamma: proxy.netGamma,
      price: proxy.price,
      atr14: proxy.atr14,
      momentum20: proxy.momentum20,
      tickMomentum: proxy.tickMomentum,
      rangeExpansion: proxy.rangeExpansion,
      volPercentile: proxy.volPercentile,
      pricingModel: proxy.pricingModel,
      theoreticalAtmVol: proxy.theoreticalAtmVol,
      downsideSkew: proxy.downsideSkew,
      expectedMove1w: proxy.expectedMove1w,
      expectedMove1m: proxy.expectedMove1m,
      dealerCorridorWidth: proxy.dealerCorridorWidth,
      surfaceFit: proxy.surfaceFit,
      chainProxyUnderlying: proxy.chainProxyUnderlying,
      chainAvailable: proxy.chainAvailable,
      callOpenInterestProxy: proxy.callOpenInterestProxy,
      putOpenInterestProxy: proxy.putOpenInterestProxy,
      featuredStrategy: proxy.featuredStrategy,
      featuredStrategySummary: proxy.featuredStrategySummary,
      americanExerciseRisk: `${proxy.americanDiagnostics.call.exerciseStyle} ATM call / ${proxy.americanDiagnostics.put.exerciseStyle} ATM put`,
      sourceLabel: proxy.sourceLabel,
      explanation: `Flow proxy reads ${flowBias} with ${dealerPositioning}, ${proxy.pricingModel} surface math, ATM IV ${proxy.theoreticalAtmVol}%, skew ${proxy.downsideSkew} pts, ${proxy.surfaceFit.quality} smile fit (${proxy.surfaceFit.rmse} rmse), featured package ${proxy.featuredStrategy.toLowerCase()}, ${proxy.americanDiagnostics.put.exerciseStyle} ATM put exercise risk, and ${squeezeRisk} squeeze risk around ${proxy.putWall}/${proxy.gammaFlip}/${proxy.callWall}.`,
    };
  }, 900);
}
