function normalize(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

export function summarizeLocally(lines: string[]): string {
  return lines
    .map(normalize)
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');
}

export function classifyUrgency(lines: string[]): 'routine' | 'watch' | 'urgent' {
  const joined = lines.join(' ').toLowerCase();
  if (/(stress|shock|escalat|rate-limit|missing|warning|dealer|gamma|carry)/.test(joined)) return 'urgent';
  if (/(mixed|fragile|uncertain|risk)/.test(joined)) return 'watch';
  return 'routine';
}
