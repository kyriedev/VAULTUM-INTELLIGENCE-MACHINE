export const OPTIONS_REGIME = {
  netGamma: -1,
  callWall: 2250,
  putWall: 2140
};

export function symbolSeed(symbol: string): number {
  return symbol.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
}
