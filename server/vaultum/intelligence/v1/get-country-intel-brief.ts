import { COUNTRY_RISK } from './_shared';

export async function getCountryIntelBrief(input: { countryCode: keyof typeof COUNTRY_RISK; contextSnapshot?: string }): Promise<{ brief: string }> {
  const score = COUNTRY_RISK[input.countryCode] ?? 50;
  return {
    brief: `${input.countryCode} is operating in a ${score >= 70 ? 'high' : 'elevated'}-risk regime. Confirmed pressure comes from current regional tension and trade-flow sensitivity; inferred market effect depends on energy, FX funding, and shipping exposure.${input.contextSnapshot ? ` Context: ${input.contextSnapshot.slice(0, 180)}` : ''}`
  };
}
