export function buildFreshnessSummary(warnings: string[]): { summary: string; warnings: string[] } {
  return {
    summary: warnings.length ? `degraded: ${warnings.length} caveat(s)` : 'fresh enough for interpretation',
    warnings,
  };
}
