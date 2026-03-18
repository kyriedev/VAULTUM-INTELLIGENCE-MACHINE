export function compareToBaseline(current: number, baseline: number): number {
  if (baseline === 0) return 0;
  return Number((((current - baseline) / baseline) * 100).toFixed(1));
}
