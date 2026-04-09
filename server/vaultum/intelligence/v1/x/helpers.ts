import type { ParsedEntities, XAccountConfig, XEventCardTone, XImpactDirection } from './types';
import { DEFAULT_X_INTEL_ACCOUNTS } from './default-accounts.ts';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function env(name: string): string {
  return (process.env[name] || '').trim();
}

const HANDLE_ALIASES: Record<string, string> = {
  deitaone: 'deltaone',
  deltaone: 'deltaone',
  financialjuice: 'financialjuice',
  unusual_whales: 'unusual_whales',
  investinglive_: 'investinglive_',
};

export function normalizeHandle(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const withoutProtocol = trimmed
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '')
    .replace(/^@+/, '')
    .split(/[/?#]/)[0]
    .trim()
    .toLowerCase();
  return HANDLE_ALIASES[withoutProtocol] ?? withoutProtocol;
}

export function normalizeMarket(market?: string): string {
  const upper = String(market || 'XAUUSD').trim().toUpperCase();
  const aliases: Record<string, string> = {
    GOLD: 'XAUUSD',
    'GC=F': 'XAUUSD',
    '^DJI': 'US30',
    DIA: 'US30',
    'YM=F': 'US30',
    'EURUSD=X': 'EURUSD',
    'GBPUSD=X': 'GBPUSD',
    'USDJPY=X': 'USDJPY',
    'GBPJPY=X': 'GBPJPY',
  };
  return aliases[upper] ?? upper;
}

export function parseAccounts(rawAccounts?: string[]): XAccountConfig[] {
  const source = rawAccounts?.length
    ? rawAccounts.join(',')
    : (env('X_INTEL_ACCOUNTS') || DEFAULT_X_INTEL_ACCOUNTS.join(','));
  if (!source) return [];
  return source
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const isUrl = /^https?:\/\//i.test(item) || /(?:^|\/\/)(?:www\.)?(?:x|twitter)\.com\//i.test(item);
      const [rawHandle, rawWeight, rawCategory] = isUrl
        ? [item, undefined, undefined]
        : item.split(':').map((part) => part.trim());
      const handle = normalizeHandle(rawHandle);
      const parsedWeight = Number(rawWeight);
      return {
        handle,
        weight: Number.isFinite(parsedWeight) ? clamp(parsedWeight, 1, 9) : 4,
        category: rawCategory || 'headline',
      } satisfies XAccountConfig;
    })
    .filter((item) => item.handle.length >= 2);
}

export function cleanText(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\$[A-Z]{1,6}\b/g, ' ')
    .replace(/[@#][A-Za-z0-9_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(value: string): string[] {
  return [...new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3),
  )];
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function extractUrls(text: string): string[] {
  return uniq([...(text.match(/https?:\/\/\S+/gi) ?? [])]);
}

export function detectEntities(text: string): ParsedEntities {
  const lower = text.toLowerCase();
  const matches = (list: string[]): string[] => uniq(list.filter((item) => lower.includes(item.toLowerCase())));
  const people = matches(['trump', 'powell', 'lagarde', 'bailey', 'ueda', 'bessent', 'xi', 'netanyahu', 'putin']);
  const countries = matches(['us', 'united states', 'china', 'eu', 'europe', 'uk', 'japan', 'iran', 'israel', 'saudi', 'russia', 'taiwan', 'ukraine']);
  const institutions = matches(['fed', 'fomc', 'ecb', 'boj', 'boe', 'white house', 'treasury', 'opec', 'opec+', 'pentagon', 'nato', 'commerce department']);
  const commodities = matches(['gold', 'oil', 'crude', 'brent', 'wti', 'gas']);
  const indices = matches(['dow', 'us30', 'nasdaq', 'es', 's&p', 'spx', 'vix']);
  const currencies = matches(['dollar', 'usd', 'eur', 'euro', 'gbp', 'pound', 'jpy', 'yen', 'dxy']);
  const militaryTerms = matches(['war', 'missile', 'strike', 'attack', 'drone', 'ceasefire', 'truce', 'escalation', 'retaliation']);
  const tradeTerms = matches(['tariff', 'trade', 'sanction', 'export control', 'deal', 'talks', 'breakdown']);
  const policyTerms = matches(['rate', 'rates', 'inflation', 'cpi', 'ppi', 'pce', 'growth', 'gdp', 'pmi', 'fiscal', 'stimulus', 'regulation']);
  const symbols = uniq([
    ...(lower.includes('gold') || lower.includes('xau') ? ['XAUUSD'] : []),
    ...(lower.includes('oil') || lower.includes('wti') ? ['WTI'] : []),
    ...(lower.includes('brent') ? ['BRENT'] : []),
    ...(lower.includes('dow') || lower.includes('us30') ? ['US30'] : []),
    ...(lower.includes('nasdaq') || lower.includes('nq') ? ['NASDAQ'] : []),
    ...(lower.includes('s&p') || lower.includes('es') ? ['US500'] : []),
    ...(lower.includes('eurusd') || (lower.includes('euro') && lower.includes('dollar')) ? ['EURUSD'] : []),
    ...(lower.includes('usdjpy') || (lower.includes('dollar') && lower.includes('yen')) ? ['USDJPY'] : []),
    ...(lower.includes('dxy') ? ['DXY'] : []),
  ]);
  const keywords = tokenize(text).slice(0, 16);

  return {
    people,
    leaders: people.filter((item) => ['trump', 'xi', 'netanyahu', 'putin'].includes(item.toLowerCase())),
    countries,
    institutions,
    commodities,
    indices,
    currencies,
    militaryTerms,
    tradeTerms,
    policyTerms,
    symbols,
    keywords,
  };
}

export function duplicateKey(text: string): string {
  return tokenize(cleanText(text))
    .filter((token) => !['breaking', 'just', 'says', 'said', 'report', 'reports', 'update'].includes(token))
    .slice(0, 10)
    .join('-');
}

export function simpleHash(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function minutesAgo(timestamp: string): number {
  return Math.max((Date.now() - new Date(timestamp).getTime()) / 60_000, 0);
}

export function toneFromActionability(state: string): XEventCardTone {
  if (state === 'TRADEABLE_CATALYST' || state === 'EXECUTION_CAUTION') return 'red';
  if (state === 'MACRO_BIAS_SHIFT') return 'green';
  if (state === 'MONITOR') return 'amber';
  return 'gray';
}

export function formatDirectionLabel(direction: XImpactDirection): string {
  if (direction === 'bullish') return 'bullish';
  if (direction === 'bearish') return 'bearish';
  return 'mixed';
}

export function jaccardSimilarity(left: string[], right: string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  const intersection = [...a].filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size || 1;
  return intersection / union;
}
