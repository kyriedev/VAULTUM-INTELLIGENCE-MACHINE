export function cotBias(netSpecPositionZScore: number): string {
  if (netSpecPositionZScore >= 1.5) return 'crowded-long';
  if (netSpecPositionZScore <= -1.5) return 'crowded-short';
  return 'balanced';
}
