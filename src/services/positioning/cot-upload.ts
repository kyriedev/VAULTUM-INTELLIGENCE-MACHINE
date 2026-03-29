import { extractPdfText } from '@/services/pdfjs';

const STORAGE_KEY = 'vaultum-cot-upload-analysis';
const NUMBER_PATTERN = '(-?[\\d,]+(?:\\.\\d+)?)';

export type CotUploadAnalysis = {
  sourceName: string;
  sourceKind: 'pdf' | 'text';
  market: string;
  reportDate: string;
  source: string;
  openInterest: number | null;
  nonCommercialLong: number | null;
  nonCommercialShort: number | null;
  commercialLong: number | null;
  commercialShort: number | null;
  nonReportableLong: number | null;
  nonReportableShort: number | null;
  spreading: number | null;
  nonCommercialChange: number | null;
  commercialChange: number | null;
  nonCommercialNet: number | null;
  commercialNet: number | null;
  nonCommercialRatio: number | null;
  commercialRatio: number | null;
  bias: string;
  strength: string;
  change: string;
  summary: string;
  warnings: string[];
  rawPreview: string;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function linesFrom(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function detectMarket(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('gold') || lower.includes('comex')) return 'GOLD';
  if (lower.includes('silver')) return 'SILVER';
  if (lower.includes('crude oil') || lower.includes('nymex') || lower.includes('wti')) return 'WTI';
  return 'UNKNOWN';
}

function extractDate(text: string): string {
  const patterns = [
    /\b(?:as of|report date|date)\s*[:\-]?\s*([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/i,
    /\b(?:as of|report date|date)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/i,
    /\b([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})\b/,
    /\b(\d{4}-\d{2}-\d{2})\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return 'unknown';
}

function extractValue(text: string, labels: string[]): number | null {
  for (const label of labels) {
    const match = text.match(new RegExp(`${escapeRegex(label)}[^\\d-]{0,24}${NUMBER_PATTERN}`, 'i'));
    const value = toNumber(match?.[1]);
    if (value != null) return value;
  }
  return null;
}

function extractPair(text: string, lines: string[], labels: string[]): { long: number | null; short: number | null; change: number | null } {
  const union = labels.map(escapeRegex).join('|');
  const patterns = [
    new RegExp(`(?:${union})[\\s\\S]{0,120}?long(?:s| positions?)?[^\\d-]{0,24}${NUMBER_PATTERN}[\\s\\S]{0,120}?short(?:s| positions?)?[^\\d-]{0,24}${NUMBER_PATTERN}[\\s\\S]{0,80}?change[^\\d-]{0,24}${NUMBER_PATTERN}`, 'i'),
    new RegExp(`(?:${union})[\\s\\S]{0,120}?long(?:s| positions?)?[^\\d-]{0,24}${NUMBER_PATTERN}[\\s\\S]{0,120}?short(?:s| positions?)?[^\\d-]{0,24}${NUMBER_PATTERN}`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    return {
      long: toNumber(match[1]),
      short: toNumber(match[2]),
      change: toNumber(match[3]),
    };
  }

  const line = lines.find((entry) => labels.some((label) => entry.toLowerCase().includes(label.toLowerCase())));
  if (!line) return { long: null, short: null, change: null };

  const values = [...line.matchAll(new RegExp(NUMBER_PATTERN, 'g'))].map((match) => toNumber(match[1])).filter((value): value is number => value != null);
  return {
    long: values[0] ?? null,
    short: values[1] ?? null,
    change: values[2] ?? null,
  };
}

function deriveBias(input: {
  openInterest: number | null;
  nonCommercialNet: number | null;
  nonCommercialRatio: number | null;
  nonCommercialChange: number | null;
}): { bias: string; strength: string; change: string } {
  const netShare = input.openInterest && input.nonCommercialNet != null
    ? (input.nonCommercialNet / input.openInterest) * 100
    : null;
  const ratio = input.nonCommercialRatio ?? 1;
  const bias = input.nonCommercialNet == null
    ? 'unknown'
    : input.nonCommercialNet > 0
      ? 'bullish speculative bias'
      : input.nonCommercialNet < 0
        ? 'bearish speculative bias'
        : 'balanced speculative bias';

  const intensity = Math.max(
    netShare != null ? Math.abs(netShare) : 0,
    Math.abs(ratio - 1) * 20,
  );
  const strength = intensity >= 14
    ? 'extreme'
    : intensity >= 8
      ? 'strong'
      : intensity >= 4
        ? 'moderate'
        : 'light';

  const change = input.nonCommercialChange == null
    ? 'weekly change not parsed'
    : input.nonCommercialChange > 0
      ? 'spec length building'
      : input.nonCommercialChange < 0
        ? 'spec length unwinding'
        : 'positioning stable';

  return { bias, strength, change };
}

function buildSummary(input: {
  market: string;
  nonCommercialNet: number | null;
  commercialNet: number | null;
  nonCommercialRatio: number | null;
  bias: string;
  strength: string;
  change: string;
}): string {
  const pieces = [
    `${input.market} upload reads as ${input.bias}`,
    input.strength !== 'light' ? `with ${input.strength} conviction` : 'with light conviction',
    input.nonCommercialNet != null ? `spec net ${input.nonCommercialNet.toLocaleString()}` : 'spec net unavailable',
    input.commercialNet != null ? `commercial net ${input.commercialNet.toLocaleString()}` : 'commercial net unavailable',
    input.nonCommercialRatio != null ? `long/short ${input.nonCommercialRatio.toFixed(2)}` : 'ratio unavailable',
    input.change,
  ];
  return pieces.join(', ') + '.';
}

export async function parseCotUploadFile(file: File): Promise<CotUploadAnalysis> {
  const sourceKind = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'text';
  const rawText = sourceKind === 'pdf' ? await extractPdfText(file) : await file.text();
  return parseCotUploadText(rawText, file.name, sourceKind);
}

export function parseCotUploadText(rawText: string, sourceName = 'manual-input', sourceKind: 'pdf' | 'text' = 'text'): CotUploadAnalysis {
  const text = normalizeText(rawText);
  const lines = linesFrom(text);
  const market = detectMarket(text);
  const reportDate = extractDate(text);

  const nonCommercial = extractPair(text, lines, ['non-commercial', 'noncommercial', 'managed money']);
  const commercial = extractPair(text, lines, ['commercial', 'producer merchant', 'swap dealer']);
  const nonReportable = extractPair(text, lines, ['non-reportable', 'nonreportable', 'small trader']);
  const openInterest = extractValue(text, ['open interest', 'open_interest']);
  const spreading = extractValue(text, ['spreading', 'spread positions', 'spread']);

  const nonCommercialNet = nonCommercial.long != null && nonCommercial.short != null
    ? nonCommercial.long - nonCommercial.short
    : null;
  const commercialNet = commercial.long != null && commercial.short != null
    ? commercial.long - commercial.short
    : null;
  const nonCommercialRatio = nonCommercial.long != null && nonCommercial.short
    ? Number((nonCommercial.long / nonCommercial.short).toFixed(2))
    : null;
  const commercialRatio = commercial.long != null && commercial.short
    ? Number((commercial.long / commercial.short).toFixed(2))
    : null;

  const biasState = deriveBias({
    openInterest,
    nonCommercialNet,
    nonCommercialRatio,
    nonCommercialChange: nonCommercial.change,
  });

  const warnings = [
    nonCommercial.long == null || nonCommercial.short == null ? 'Non-commercial long/short values were only partially parsed.' : null,
    commercial.long == null || commercial.short == null ? 'Commercial long/short values were only partially parsed.' : null,
    openInterest == null ? 'Open interest was not found in the uploaded report.' : null,
    market === 'UNKNOWN' ? 'Market could not be identified from the upload text.' : null,
  ].filter((value): value is string => Boolean(value));

  return {
    sourceName,
    sourceKind,
    market,
    reportDate,
    source: sourceKind === 'pdf' ? 'Uploaded PDF report' : 'Uploaded text report',
    openInterest,
    nonCommercialLong: nonCommercial.long,
    nonCommercialShort: nonCommercial.short,
    commercialLong: commercial.long,
    commercialShort: commercial.short,
    nonReportableLong: nonReportable.long,
    nonReportableShort: nonReportable.short,
    spreading,
    nonCommercialChange: nonCommercial.change,
    commercialChange: commercial.change,
    nonCommercialNet,
    commercialNet,
    nonCommercialRatio,
    commercialRatio,
    bias: biasState.bias,
    strength: biasState.strength,
    change: biasState.change,
    summary: buildSummary({
      market,
      nonCommercialNet,
      commercialNet,
      nonCommercialRatio,
      bias: biasState.bias,
      strength: biasState.strength,
      change: biasState.change,
    }),
    warnings,
    rawPreview: text.slice(0, 1400),
  };
}

export function loadStoredCotUpload(): CotUploadAnalysis | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as CotUploadAnalysis : null;
  } catch {
    return null;
  }
}

export function saveStoredCotUpload(analysis: CotUploadAnalysis): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(analysis));
}

export function clearStoredCotUpload(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
