import { COUNTRY_RISK } from './_shared';

export async function getRiskScores(): Promise<{ scores: typeof COUNTRY_RISK }> {
  return { scores: COUNTRY_RISK };
}
