export function riskLabel(score: number): string {
  if (score >= 75) return 'high';
  if (score >= 45) return 'elevated';
  return 'contained';
}
