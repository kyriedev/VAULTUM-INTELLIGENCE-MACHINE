import { riskLabel } from '@/services/intelligence/risk';

export function buildCountryBrief(country: string, score: number): string {
  return `${country} sits in a ${riskLabel(score)} risk regime. Confirmed pressure comes from the current event mix; inferred market effect depends on commodity exposure, dollar sensitivity, and regional contagion channels.`;
}
