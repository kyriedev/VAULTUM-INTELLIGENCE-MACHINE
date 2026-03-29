import { CHROME_UA } from '../../../_shared/constants';

const BIS_BASE = 'https://stats.bis.org/api/v1/data';

export const BIS_COUNTRIES: Record<string, { name: string; centralBank: string }> = {
  US: { name: 'United States', centralBank: 'Federal Reserve' },
  GB: { name: 'United Kingdom', centralBank: 'Bank of England' },
  JP: { name: 'Japan', centralBank: 'Bank of Japan' },
  XM: { name: 'Euro Area', centralBank: 'European Central Bank' },
  CH: { name: 'Switzerland', centralBank: 'Swiss National Bank' },
  SG: { name: 'Singapore', centralBank: 'MAS' },
  IN: { name: 'India', centralBank: 'Reserve Bank of India' },
  AU: { name: 'Australia', centralBank: 'Reserve Bank of Australia' },
  CN: { name: 'China', centralBank: "People's Bank of China" },
  CA: { name: 'Canada', centralBank: 'Bank of Canada' },
  KR: { name: 'South Korea', centralBank: 'Bank of Korea' },
  BR: { name: 'Brazil', centralBank: 'Banco Central do Brasil' },
};

export const BIS_COUNTRY_KEYS = Object.keys(BIS_COUNTRIES).join('+');

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

export function parseBisCSV(csv: string): Array<Record<string, string>> {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0] ?? '');
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = values[index] ?? '';
      return row;
    }, {});
  });
}

export function parseBisNumber(value: string | undefined): number | null {
  if (!value || value === '.' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchBisCSV(dataset: string, key: string, timeout = 12000): Promise<string> {
  const separator = key.includes('?') ? '&' : '?';
  const url = `${BIS_BASE}/${dataset}/${key}${separator}format=csv`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': CHROME_UA, Accept: 'text/csv' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`BIS HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}
