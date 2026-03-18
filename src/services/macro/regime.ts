export function classifyMacroRegime(realYieldTrend: number, dollarTrend: number, creditTrend: number): string {
  if (realYieldTrend < 0 && dollarTrend <= 0 && creditTrend >= 0) return 'liquidity-expanding';
  if (realYieldTrend > 0 && dollarTrend > 0 && creditTrend < 0) return 'tightening-stress';
  return 'mixed-transition';
}
