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
      sourceLabel: 'Synthetic options-flow engine inferred from live price path, realized volatility, ATR, range expansion, gamma posture, and short-horizon momentum.',
      explanation: `Flow proxy reads ${flowBias} with ${dealerPositioning} and ${squeezeRisk} squeeze risk around ${proxy.putWall}/${proxy.gammaFlip}/${proxy.callWall}.`,
    };
  }, 900);
}
