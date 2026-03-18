export function gammaRegime(netGamma: number): string {
  if (netGamma > 0) return 'long-gamma';
  if (netGamma < 0) return 'short-gamma';
  return 'flat-gamma';
}
