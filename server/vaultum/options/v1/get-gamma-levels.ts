import { OPTIONS_REGIME, symbolSeed } from './_shared';

export async function getGammaLevels(input: { symbol: string }): Promise<any> {
  const seed = symbolSeed(input.symbol || 'XAUUSD') % 40;
  return {
    symbol: input.symbol,
    callWall: OPTIONS_REGIME.callWall + seed,
    putWall: OPTIONS_REGIME.putWall - seed,
    gammaFlip: OPTIONS_REGIME.putWall + Math.round(seed / 2),
    netGamma: OPTIONS_REGIME.netGamma,
    volatilityZone: OPTIONS_REGIME.netGamma < 0 ? 'expansion-risk' : 'pinning-risk',
    keyStrikes: [
      OPTIONS_REGIME.putWall - Math.round(seed / 3),
      OPTIONS_REGIME.putWall + Math.round(seed / 2),
      OPTIONS_REGIME.callWall + Math.round(seed / 3),
    ],
  };
}
