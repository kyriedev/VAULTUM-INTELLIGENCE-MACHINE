export function changeToBias(change: number): 'bullish' | 'bearish' | 'neutral' {
  if (change > 0.6) return 'bullish';
  if (change < -0.6) return 'bearish';
  return 'neutral';
}
