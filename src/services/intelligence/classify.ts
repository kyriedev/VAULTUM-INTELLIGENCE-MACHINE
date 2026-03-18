export function classifyEvent(text: string): 'geopolitical' | 'trade' | 'macro' | 'market' {
  const normalized = text.toLowerCase();
  if (normalized.includes('tariff') || normalized.includes('sanction')) return 'trade';
  if (normalized.includes('yield') || normalized.includes('inflation')) return 'macro';
  if (normalized.includes('strike') || normalized.includes('border')) return 'geopolitical';
  return 'market';
}
