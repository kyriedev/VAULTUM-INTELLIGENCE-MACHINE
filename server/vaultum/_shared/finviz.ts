import { cacheKey } from '../../_shared/cache-keys.ts';
import { CHROME_UA } from '../../_shared/constants.ts';
import { getCachedOrCompute } from '../../_shared/redis.ts';

export type FinvizHeadline = {
  date: string;
  title: string;
  source: string;
  link: string;
};

export type FinvizQuoteSnapshot = {
  ticker: string;
  company: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  exchange: string | null;
  description: string | null;
  fundamentals: Record<string, string>;
  news: FinvizHeadline[];
};

export type FinvizInsiderRow = {
  ticker: string;
  company: string;
  relationship: string;
  date: string;
  transaction: string;
  cost: string;
  shares: string;
  value: string;
  sharesTotal: string;
  secForm4Url: string | null;
};

export type FinvizForexRow = {
  pair: string;
  price: number | null;
  perf5Min: number | null;
  perfHour: number | null;
  perfDay: number | null;
  perfWeek: number | null;
  perfMonth: number | null;
  perfQuarter: number | null;
  perfHalf: number | null;
  perfYtd: number | null;
  perfYear: number | null;
};

export type FinvizScreenerRow = {
  ticker: string;
  company: string;
  sector: string;
  industry: string;
  country: string;
  marketCap: string;
  pe: string;
  price: number | null;
  change: number | null;
  volume: number | null;
};

const FINVIZ_BASE = 'https://finviz.com';

const FINVIZ_SCREENER_SIGNALS: Record<string, string> = {
  'Most Active': 'ta_mostactive',
  'Unusual Volume': 'ta_unusualvolume',
  'Recent Insider Buying': 'it_latestbuys',
};

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripTags(value: string): string {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function absoluteFinvizUrl(href: string | null | undefined): string {
  const raw = String(href || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  return `${FINVIZ_BASE}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function extractSection(html: string, marker: string, size = 10_000): string {
  const index = html.indexOf(marker);
  if (index < 0) return '';
  return html.slice(index, index + size);
}

function matchTablesByClass(html: string, classNeedle: string): string[] {
  const tables = [...html.matchAll(/<table\b[^>]*class="([^"]+)"[^>]*>([\s\S]*?)<\/table>/gi)];
  return tables
    .filter((match) => match[1]?.includes(classNeedle))
    .map((match) => match[0]);
}

function extractRows(tableHtml: string): string[] {
  return [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[0]);
}

function extractCells(rowHtml: string, tag: 'td' | 'th' | 'both' = 'both'): string[] {
  const pattern = tag === 'both'
    ? /<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi
    : new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  if (tag === 'both') {
    return [...rowHtml.matchAll(pattern)].map((match) => match[2]);
  }
  return [...rowHtml.matchAll(pattern)].map((match) => match[1]);
}

function extractHref(html: string): string | null {
  const match = html.match(/<a\b[^>]*href="([^"]+)"/i);
  return match ? absoluteFinvizUrl(match[1]) : null;
}

function toNumber(value: string | null | undefined): number | null {
  const raw = String(value || '').trim();
  if (!raw || raw === '-') return null;
  const normalized = raw.replace(/,/g, '');
  if (/^-?\d+(\.\d+)?%$/.test(normalized)) return Number(normalized.slice(0, -1));
  if (/^-?\d+(\.\d+)?B$/i.test(normalized)) return Number(normalized.slice(0, -1)) * 1_000_000_000;
  if (/^-?\d+(\.\d+)?M$/i.test(normalized)) return Number(normalized.slice(0, -1)) * 1_000_000;
  if (/^-?\d+(\.\d+)?K$/i.test(normalized)) return Number(normalized.slice(0, -1)) * 1_000;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

async function fetchFinvizHtml(path: string): Promise<string> {
  const response = await fetch(path, {
    headers: {
      Accept: 'text/html',
      'User-Agent': CHROME_UA,
      Referer: FINVIZ_BASE,
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Finviz HTTP ${response.status} for ${path}`);
  return response.text();
}

export function parseFinvizNewsTables(html: string): { news: FinvizHeadline[]; blogs: FinvizHeadline[] } {
  const section = extractSection(html, 'id="news"', 60_000);
  const tables = matchTablesByClass(section, 'styled-table-new');
  const parseTable = (tableHtml: string): FinvizHeadline[] =>
    extractRows(tableHtml).flatMap((row) => {
      const cells = extractCells(row, 'td');
      if (cells.length < 3) return [];
      const date = stripTags(cells[1]);
      const title = stripTags(cells[2]);
      const link = extractHref(cells[2]);
      if (!date || !title || !link) return [];
      let source = '';
      try {
        source = new URL(link).hostname.replace(/^www\./, '');
      } catch {
        source = '';
      }
      return [{ date, title, source, link }];
    });

  return {
    news: tables[0] ? parseTable(tables[0]) : [],
    blogs: tables[1] ? parseTable(tables[1]) : [],
  };
}

export function parseFinvizQuotePage(html: string, ticker: string): FinvizQuoteSnapshot {
  const company = stripTags(html.match(/<h2\b[^>]*quote-header_ticker-wrapper_company[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? '');
  const linksBlock = html.match(/<div\b[^>]*class="[^"]*quote-links[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? '';
  const linkTexts = [...linksBlock.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => stripTags(match[1]));
  const description = stripTags(html.match(/<td\b[^>]*class="[^"]*fullview-profile[^"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? '');
  const snapshotTable = html.match(/<table\b[^>]*class="[^"]*snapshot-table2[^"]*"[^>]*>([\s\S]*?)<\/table>/i)?.[0] ?? '';
  const fundamentals: Record<string, string> = {};
  extractRows(snapshotTable).forEach((row) => {
    const cells = extractCells(row, 'td');
    for (let index = 0; index + 1 < cells.length; index += 2) {
      const label = stripTags(cells[index]);
      const value = stripTags(cells[index + 1]);
      if (label) fundamentals[label] = value;
    }
  });

  const newsTable = html.match(/<table\b[^>]*class="[^"]*fullview-news-outer[^"]*"[^>]*>([\s\S]*?)<\/table>/i)?.[0] ?? '';
  let lastDate = '';
  const news = extractRows(newsTable).flatMap((row) => {
    const cells = extractCells(row, 'td');
    if (cells.length < 2) return [];
    const rawDate = stripTags(cells[0]);
    const title = stripTags(cells[1]);
    const link = extractHref(cells[1]);
    const source = stripTags(cells[1].match(/<span>\(([\s\S]*?)\)<\/span>/i)?.[1] ?? '');
    if (!title || !link) return [];
    const date = /\d/.test(rawDate) && /\s/.test(rawDate)
      ? (lastDate = rawDate, rawDate)
      : (lastDate ? `${lastDate.split(' ')[0]} ${rawDate}` : rawDate);
    return [{ date, title, source, link }];
  });

  return {
    ticker: ticker.toUpperCase(),
    company: company || null,
    sector: linkTexts[0] ?? null,
    industry: linkTexts[1] ?? null,
    country: linkTexts[2] ?? null,
    exchange: linkTexts[3] ?? null,
    description: description || null,
    fundamentals,
    news,
  };
}

export function parseFinvizInsiderTable(html: string): FinvizInsiderRow[] {
  const table = html.match(/<table\b[^>]*(?:id="insider-table"|class="[^"]*body-table[^"]*")[^>]*>([\s\S]*?)<\/table>/i)?.[0] ?? '';
  const rows = extractRows(table);
  if (!rows.length) return [];
  return rows.slice(1).flatMap((row) => {
    const cells = extractCells(row, 'td');
    if (cells.length < 10) return [];
    const ticker = stripTags(cells[0]);
    const company = stripTags(cells[1]);
    const relationship = stripTags(cells[2]);
    const date = stripTags(cells[3]);
    const transaction = stripTags(cells[4]);
    const cost = stripTags(cells[5]);
    const shares = stripTags(cells[6]);
    const value = stripTags(cells[7]);
    const sharesTotal = stripTags(cells[8]);
    const secForm4Url = extractHref(cells[cells.length - 1]);
    if (!ticker) return [];
    return [{ ticker, company, relationship, date, transaction, cost, shares, value, sharesTotal, secForm4Url }];
  });
}

export function parseFinvizForexPerformance(html: string): FinvizForexRow[] {
  const table = html.match(/<table\b[^>]*class="[^"]*groups_table[^"]*"[^>]*>([\s\S]*?)<\/table>/i)?.[0] ?? '';
  const rows = extractRows(table);
  return rows.slice(1).flatMap((row) => {
    const cells = extractCells(row, 'td').map(stripTags);
    if (cells.length < 12) return [];
    return [{
      pair: cells[1],
      price: toNumber(cells[2]),
      perf5Min: toNumber(cells[3]),
      perfHour: toNumber(cells[4]),
      perfDay: toNumber(cells[5]),
      perfWeek: toNumber(cells[6]),
      perfMonth: toNumber(cells[7]),
      perfQuarter: toNumber(cells[8]),
      perfHalf: toNumber(cells[9]),
      perfYtd: toNumber(cells[10]),
      perfYear: toNumber(cells[11]),
    }];
  });
}

export function parseFinvizScreenerTable(html: string): FinvizScreenerRow[] {
  const table = html.match(/<table\b[^>]*class="[^"]*screener_table[^"]*"[^>]*>([\s\S]*?)<\/table>/i)?.[0] ?? '';
  const rows = extractRows(table);
  return rows.slice(1).flatMap((row) => {
    const cells = extractCells(row, 'td').map(stripTags);
    if (cells.length < 11) return [];
    return [{
      ticker: cells[1],
      company: cells[2],
      sector: cells[3],
      industry: cells[4],
      country: cells[5],
      marketCap: cells[6],
      pe: cells[7],
      price: toNumber(cells[8]),
      change: toNumber(cells[9]),
      volume: toNumber(cells[10]),
    }];
  });
}

export async function fetchFinvizNewsAndBlogs(): Promise<{ news: FinvizHeadline[]; blogs: FinvizHeadline[] }> {
  return getCachedOrCompute(cacheKey('market', 'finviz:news-and-blogs'), async () => {
    const html = await fetchFinvizHtml(`${FINVIZ_BASE}/news.ashx`);
    return parseFinvizNewsTables(html);
  }, 300);
}

export async function fetchFinvizQuoteSnapshot(ticker: string): Promise<FinvizQuoteSnapshot | null> {
  const normalizedTicker = String(ticker || '').trim().toUpperCase();
  if (!normalizedTicker) return null;
  return getCachedOrCompute(cacheKey('market', `finviz:quote:${normalizedTicker}`), async () => {
    const html = await fetchFinvizHtml(`${FINVIZ_BASE}/quote.ashx?t=${encodeURIComponent(normalizedTicker)}`);
    return parseFinvizQuotePage(html, normalizedTicker);
  }, 300);
}

export async function fetchFinvizInsiderRows(option: 'latest-buys' | 'top-owner-buys' = 'top-owner-buys'): Promise<FinvizInsiderRow[]> {
  const url = option === 'latest-buys'
    ? `${FINVIZ_BASE}/insidertrading?tc=1`
    : `${FINVIZ_BASE}/insidertrading?o=-transactionValue&or=10&tc=1&tv=1000000`;
  return getCachedOrCompute(cacheKey('market', `finviz:insider:${option}`), async () => {
    const html = await fetchFinvizHtml(url);
    return parseFinvizInsiderTable(html);
  }, 300);
}

export async function fetchFinvizForexPerformance(): Promise<FinvizForexRow[]> {
  return getCachedOrCompute(cacheKey('market', 'finviz:forex-performance'), async () => {
    const html = await fetchFinvizHtml(`${FINVIZ_BASE}/forex_performance.ashx`);
    return parseFinvizForexPerformance(html);
  }, 300);
}

export async function fetchFinvizScreener(signalLabel: keyof typeof FINVIZ_SCREENER_SIGNALS): Promise<FinvizScreenerRow[]> {
  const signal = FINVIZ_SCREENER_SIGNALS[signalLabel];
  return getCachedOrCompute(cacheKey('market', `finviz:screener:${signal}`), async () => {
    const html = await fetchFinvizHtml(`${FINVIZ_BASE}/screener.ashx?v=111&s=${encodeURIComponent(signal)}`);
    return parseFinvizScreenerTable(html);
  }, 300);
}
