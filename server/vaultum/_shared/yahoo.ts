import { CHROME_UA, yahooGate } from '../../_shared/constants';

export type YahooNormalizedCandle = {
  time: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  repaired: boolean;
};

type YahooChartMeta = {
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
  currency?: string;
  instrumentType?: string;
  exchangeName?: string;
  exchangeTimezoneName?: string;
  validRanges?: string[];
};

type YahooChartPayload = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      meta?: YahooChartMeta;
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: { description?: string | null } | null;
  };
};

type YahooSearchPayload = {
  quotes?: Array<{
    symbol?: string;
    shortname?: string;
    longname?: string;
    exchDisp?: string;
    exchange?: string;
    quoteType?: string;
    typeDisp?: string;
    score?: number;
  }>;
  news?: Array<{
    uuid?: string;
    title?: string;
    publisher?: string;
    link?: string;
    providerPublishTime?: number;
    type?: string;
  }>;
};

type YahooScreenerPayload = {
  finance?: {
    result?: Array<{
      quotes?: Array<{
        symbol?: string;
        shortName?: string;
        longName?: string;
        exchange?: string;
        fullExchangeName?: string;
        regularMarketPrice?: number;
        regularMarketChangePercent?: number;
        regularMarketVolume?: number;
      }>;
    }>;
  };
};

export type YahooChartResult = {
  symbol: string;
  range: string;
  requestedInterval: string;
  resolvedInterval: string;
  meta: YahooChartMeta | null;
  candles: YahooNormalizedCandle[];
  rateLimited: boolean;
  warnings: string[];
  repairedRows: number;
  droppedRows: number;
};

export type YahooQuoteSnapshot = {
  price: number;
  change: number;
  sparkline: number[];
  repairedRows: number;
  warnings: string[];
};

export type YahooSearchMatch = {
  symbol: string;
  name: string;
  exchange: string | null;
  quoteType: string | null;
  score: number | null;
};

export type YahooNewsMatch = {
  uuid: string;
  title: string;
  publisher: string | null;
  link: string | null;
  publishedAt: string | null;
  type: string | null;
};

export type YahooScreenerMatch = {
  symbol: string;
  name: string;
  exchange: string | null;
  price: number | null;
  percentChange: number | null;
  volume: number | null;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[middle - 1]! + sorted[middle]!) / 2;
  return sorted[middle]!;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function usesSafeBlockRepair(symbol: string): boolean {
  return /(^\^|=X$|=F$|-USD$|DX-Y\.NYB$)/i.test(symbol);
}

function normalizeExtrema(candle: YahooNormalizedCandle): YahooNormalizedCandle {
  const low = Math.min(candle.open, candle.high, candle.low, candle.close);
  const high = Math.max(candle.open, candle.high, candle.low, candle.close);
  return {
    ...candle,
    low: roundTo(low),
    high: roundTo(high),
  };
}

async function fetchYahooJson<T>(url: string, timeoutMs: number, maxRetries = 1): Promise<{ payload: T | null; rateLimited: boolean }> {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await yahooGate();
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': CHROME_UA,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 429) return { payload: null, rateLimited: true };
      if (!response.ok) {
        if (attempt < maxRetries && response.status >= 500) {
          await delay(200 * (attempt + 1));
          continue;
        }
        return { payload: null, rateLimited: false };
      }

      const text = await response.text();
      if (/too many requests/i.test(text)) return { payload: null, rateLimited: true };
      return { payload: JSON.parse(text) as T, rateLimited: false };
    } catch {
      if (attempt < maxRetries) {
        await delay(220 * (attempt + 1));
        continue;
      }
      return { payload: null, rateLimited: false };
    }
  }

  return { payload: null, rateLimited: false };
}

function resampleCandlesTo30m(candles: YahooNormalizedCandle[]): YahooNormalizedCandle[] {
  const groups = new Map<number, YahooNormalizedCandle[]>();
  candles.forEach((candle) => {
    const bucket = Math.floor(candle.timestamp / 1800) * 1800;
    const list = groups.get(bucket) ?? [];
    list.push(candle);
    groups.set(bucket, list);
  });

  return [...groups.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([bucket, group]) => {
      const ordered = [...group].sort((left, right) => left.timestamp - right.timestamp);
      const first = ordered[0]!;
      const last = ordered[ordered.length - 1]!;
      return {
        time: new Date(bucket * 1000).toISOString(),
        timestamp: bucket,
        open: first.open,
        high: roundTo(Math.max(...ordered.map((item) => item.high))),
        low: roundTo(Math.min(...ordered.map((item) => item.low))),
        close: last.close,
        volume: ordered.some((item) => item.volume != null)
          ? ordered.reduce((sum, item) => sum + (item.volume ?? 0), 0)
          : null,
        repaired: ordered.some((item) => item.repaired),
      };
    });
}

function buildCandles(payload: YahooChartPayload): { candles: YahooNormalizedCandle[]; meta: YahooChartMeta | null; droppedRows: number } {
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp ?? [];
  const candles: YahooNormalizedCandle[] = [];
  let droppedRows = 0;

  for (let index = 0; index < timestamps.length; index += 1) {
    const open = Number(quote?.open?.[index]);
    const high = Number(quote?.high?.[index]);
    const low = Number(quote?.low?.[index]);
    const close = Number(quote?.close?.[index]);
    const timestamp = Number(timestamps[index]);

    if (![open, high, low, close, timestamp].every((value) => Number.isFinite(value))) {
      droppedRows += 1;
      continue;
    }
    if (Math.min(open, high, low, close) <= 0) {
      droppedRows += 1;
      continue;
    }

    const volumeValue = Number(quote?.volume?.[index]);
    candles.push(normalizeExtrema({
      time: new Date(timestamp * 1000).toISOString(),
      timestamp,
      open: roundTo(open),
      high: roundTo(high),
      low: roundTo(low),
      close: roundTo(close),
      volume: Number.isFinite(volumeValue) ? volumeValue : null,
      repaired: false,
    }));
  }

  return { candles, meta: result?.meta ?? null, droppedRows };
}

function repairRandomHundredX(candles: YahooNormalizedCandle[]): number {
  const priceKeys: Array<'open' | 'high' | 'low' | 'close'> = ['open', 'high', 'low', 'close'];
  let repaired = 0;

  for (let index = 0; index < candles.length; index += 1) {
    const localPrices: number[] = [];
    for (let cursor = Math.max(0, index - 3); cursor < Math.min(candles.length, index + 4); cursor += 1) {
      if (cursor === index) continue;
      localPrices.push(candles[cursor]!.open, candles[cursor]!.high, candles[cursor]!.low, candles[cursor]!.close);
    }
    const cleanLocalPrices = localPrices.filter((value) => Number.isFinite(value) && value > 0);
    const localMedian = median(cleanLocalPrices);
    if (!localMedian) continue;

    let candleChanged = false;
    const next = { ...candles[index]! };
    priceKeys.forEach((key) => {
      const value = next[key];
      const ratio = value / localMedian;
      if (ratio > 40 && ratio < 160) {
        next[key] = roundTo(value / 100);
        candleChanged = true;
      } else if (ratio > 0.005 && ratio < 0.025) {
        next[key] = roundTo(value * 100);
        candleChanged = true;
      }
    });

    if (candleChanged) {
      candles[index] = normalizeExtrema({ ...next, repaired: true });
      repaired += 1;
    }
  }

  return repaired;
}

function repairBlockHundredX(symbol: string, candles: YahooNormalizedCandle[]): number {
  if (!usesSafeBlockRepair(symbol) || candles.length < 8) return 0;

  let repaired = 0;
  for (let index = 3; index < candles.length - 3; index += 1) {
    const left = candles.slice(index - 3, index).map((item) => item.close).filter((value) => value > 0);
    const right = candles.slice(index, index + 3).map((item) => item.close).filter((value) => value > 0);
    const leftMedian = median(left);
    const rightMedian = median(right);
    if (!leftMedian || !rightMedian) continue;

    let multiplier = 1;
    const ratio = rightMedian / leftMedian;
    if (ratio > 40 && ratio < 160) multiplier = 0.01;
    else if (ratio > 0.005 && ratio < 0.025) multiplier = 100;
    if (multiplier === 1) continue;

    for (let cursor = index; cursor < candles.length; cursor += 1) {
      candles[cursor] = normalizeExtrema({
        ...candles[cursor]!,
        open: roundTo(candles[cursor]!.open * multiplier),
        high: roundTo(candles[cursor]!.high * multiplier),
        low: roundTo(candles[cursor]!.low * multiplier),
        close: roundTo(candles[cursor]!.close * multiplier),
        repaired: true,
      });
      repaired += 1;
    }
    break;
  }

  return repaired;
}

function repairYahooCandles(symbol: string, candles: YahooNormalizedCandle[]): { candles: YahooNormalizedCandle[]; repairedRows: number } {
  const cleaned = candles
    .map((candle) => normalizeExtrema(candle))
    .filter((candle) => candle.high > 0 && candle.low > 0 && candle.close > 0 && candle.open > 0)
    .sort((left, right) => left.timestamp - right.timestamp);

  const randomRepairs = repairRandomHundredX(cleaned);
  const blockRepairs = repairBlockHundredX(symbol, cleaned);

  return {
    candles: cleaned,
    repairedRows: randomRepairs + blockRepairs,
  };
}

export async function fetchYahooChart(symbol: string, range: string, interval: string): Promise<YahooChartResult | null> {
  const requestedInterval = interval;
  const resolvedInterval = interval === '30m' ? '15m' : interval;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(resolvedInterval)}`;
  const { payload, rateLimited } = await fetchYahooJson<YahooChartPayload>(url, 12_000, 1);
  if (!payload) {
    return {
      symbol,
      range,
      requestedInterval,
      resolvedInterval,
      meta: null,
      candles: [],
      rateLimited,
      warnings: rateLimited ? ['Yahoo Finance signaled a rate-limit condition.'] : ['Yahoo Finance did not return chart data.'],
      repairedRows: 0,
      droppedRows: 0,
    };
  }

  const { candles: rawCandles, meta, droppedRows } = buildCandles(payload);
  const repaired = repairYahooCandles(symbol, rawCandles);
  const warnings: string[] = [];
  if (interval === '30m') warnings.push('Yahoo 30m candles were rebuilt from 15m data to avoid the native 30m response bug.');
  if (repaired.repairedRows > 0) warnings.push(`Yahoo chart repair corrected ${repaired.repairedRows} suspicious 100x-style row${repaired.repairedRows === 1 ? '' : 's'}.`);
  if (droppedRows > 0) warnings.push(`Yahoo chart normalization dropped ${droppedRows} invalid row${droppedRows === 1 ? '' : 's'}.`);

  const candles = interval === '30m' ? resampleCandlesTo30m(repaired.candles) : repaired.candles;

  return {
    symbol,
    range,
    requestedInterval,
    resolvedInterval,
    meta,
    candles,
    rateLimited: false,
    warnings,
    repairedRows: repaired.repairedRows,
    droppedRows,
  };
}

export async function fetchYahooQuoteSnapshot(symbol: string): Promise<YahooQuoteSnapshot | null> {
  const chart = await fetchYahooChart(symbol, '1mo', '1d');
  if (!chart || !chart.candles.length) return null;
  const latest = chart.candles[chart.candles.length - 1]!;
  const previous = chart.candles[chart.candles.length - 2] ?? latest;
  const price = Number(chart.meta?.regularMarketPrice ?? latest.close);
  const previousClose = Number(chart.meta?.chartPreviousClose ?? chart.meta?.previousClose ?? previous.close);
  const change = previousClose ? ((price - previousClose) / previousClose) * 100 : 0;
  return {
    price,
    change,
    sparkline: chart.candles.map((candle) => candle.close).filter((value) => Number.isFinite(value)),
    repairedRows: chart.repairedRows,
    warnings: chart.warnings,
  };
}

export async function searchYahooFinance(query: string, options: { maxResults?: number; newsCount?: number } = {}): Promise<{ quotes: YahooSearchMatch[]; news: YahooNewsMatch[] }> {
  const url = new URL('https://query2.finance.yahoo.com/v1/finance/search');
  url.searchParams.set('q', query);
  url.searchParams.set('quotesCount', String(options.maxResults ?? 8));
  url.searchParams.set('newsCount', String(options.newsCount ?? 5));
  url.searchParams.set('enableFuzzyQuery', 'true');
  url.searchParams.set('quotesQueryId', 'tss_match_phrase_query');
  url.searchParams.set('newsQueryId', 'news_cie_vespa');
  url.searchParams.set('listsCount', '0');
  url.searchParams.set('enableCb', 'true');
  url.searchParams.set('enableNavLinks', 'false');
  url.searchParams.set('enableResearchReports', 'false');
  url.searchParams.set('enableCulturalAssets', 'false');
  url.searchParams.set('recommendedCount', '6');

  const { payload } = await fetchYahooJson<YahooSearchPayload>(url.toString(), 10_000, 1);
  if (!payload) return { quotes: [], news: [] };

  return {
    quotes: (payload.quotes ?? [])
      .filter((item) => Boolean(item.symbol))
      .map((item) => ({
        symbol: String(item.symbol),
        name: String(item.longname || item.shortname || item.symbol),
        exchange: item.exchDisp || item.exchange || null,
        quoteType: item.quoteType || item.typeDisp || null,
        score: typeof item.score === 'number' ? item.score : null,
      })),
    news: (payload.news ?? []).map((item) => ({
      uuid: String(item.uuid || item.link || item.title || Math.random()),
      title: String(item.title || 'Untitled Yahoo Finance item'),
      publisher: item.publisher || null,
      link: item.link || null,
      publishedAt: typeof item.providerPublishTime === 'number'
        ? new Date(item.providerPublishTime * 1000).toISOString()
        : null,
      type: item.type || null,
    })),
  };
}

export async function fetchYahooScreener(screenId: 'most_actives' | 'day_gainers' | 'day_losers', count = 6): Promise<YahooScreenerMatch[]> {
  const url = new URL('https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved');
  url.searchParams.set('formatted', 'false');
  url.searchParams.set('lang', 'en-US');
  url.searchParams.set('region', 'US');
  url.searchParams.set('scrIds', screenId);
  url.searchParams.set('count', String(clamp(count, 1, 25)));

  const { payload } = await fetchYahooJson<YahooScreenerPayload>(url.toString(), 10_000, 1);
  const quotes = payload?.finance?.result?.[0]?.quotes ?? [];
  return quotes.map((item) => ({
    symbol: String(item.symbol || ''),
    name: String(item.longName || item.shortName || item.symbol || 'Unknown'),
    exchange: item.fullExchangeName || item.exchange || null,
    price: typeof item.regularMarketPrice === 'number' ? item.regularMarketPrice : null,
    percentChange: typeof item.regularMarketChangePercent === 'number' ? item.regularMarketChangePercent : null,
    volume: typeof item.regularMarketVolume === 'number' ? item.regularMarketVolume : null,
  })).filter((item) => item.symbol);
}
