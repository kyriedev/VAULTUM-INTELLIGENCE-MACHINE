export async function classifyEvent(input: { title: string; description?: string; source?: string; country?: string }): Promise<{ category: string; marketImpact: string }> {
  const text = `${input.title} ${input.description ?? ''}`.toLowerCase();
  if (text.includes('tariff') || text.includes('sanction')) return { category: 'trade-policy', marketImpact: 'inflationary and FX-relevant' };
  if (text.includes('missile') || text.includes('shipping')) return { category: 'geopolitical', marketImpact: 'oil and gold supportive' };
  return { category: 'macro-market', marketImpact: 'requires asset-level confirmation' };
}
