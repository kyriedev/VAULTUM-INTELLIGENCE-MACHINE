import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import {
  fetchFinnhubAggregateIndicator,
  fetchFinnhubCompanyNews,
  fetchFinnhubEarningsCalendar,
  fetchFinnhubGeneralNews,
  fetchFinnhubMarketHoliday,
  fetchFinnhubMarketStatus,
  fetchFinnhubNewsSentiment,
  fetchFinnhubPatternRecognition,
  fetchFinnhubQuoteSnapshot,
  fetchFinnhubSupportResistance,
  finnhubConfigured,
  finnhubHintSummary,
  finnhubTimeframeToResolution,
  resolveFinnhubSymbol,
  type FinnhubResearchHeadline,
} from '../../_shared/finnhub';

type FinnhubResearchTone = 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'alert';

type FinnhubResearchCard = {
  key: string;
  label: string;
  value: string;
  tone: FinnhubResearchTone;
  detail: string;
};

type FinnhubAggregateSnapshot = {
  overallSignal: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell' | 'unavailable';
  movingAverageSignal: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell' | 'unavailable';
  oscillatorSignal: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell' | 'unavailable';
  bullishCount: number | null;
  neutralCount: number | null;
  bearishCount: number | null;
};

type FinnhubPatternSnapshot = {
  name: string | null;
  bias: 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'unavailable';
};

type FinnhubSentimentSnapshot = {
  bullishPercent: number | null;
  bearishPercent: number | null;
  companyNewsScore: number | null;
  sectorAverageBullishPercent: number | null;
  buzz: number | null;
  weeklyAverage: number | null;
  articlesInLastWeek: number | null;
};

type FinnhubUpcomingEvent = {
  date: string;
  label: string;
  hour: string | null;
  epsEstimate: number | null;
  revenueEstimate: number | null;
} | null;

export type FinnhubResearchResponse = {
  generatedAt: string;
  market: string;
  query: string;
  requestedTimeframe: string;
  selectedResolution: string;
  matchedSymbolId: string | null;
  matchedSymbol: string | null;
  matchedDescription: string | null;
  matchedType: string | null;
  matchedMic: string | null;
  proxyMode: 'direct' | 'proxy';
  proxyLabel: string | null;
  price: number | null;
  percentChange: number | null;
  marketOpen: boolean | null;
  sessionLabel: string | null;
  technicalSignal: FinnhubAggregateSnapshot['overallSignal'];
  technicalBias: 'bullish' | 'bearish' | 'mixed' | 'neutral' | 'unavailable';
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  sourceLabel: string;
  warnings: string[];
  cards: FinnhubResearchCard[];
  headlines: FinnhubResearchHeadline[];
  technical: FinnhubAggregateSnapshot;
  levels: {
    support: number | null;
    resistance: number | null;
  };
  pattern: FinnhubPatternSnapshot;
  sentiment: FinnhubSentimentSnapshot;
  upcomingEvent: FinnhubUpcomingEvent;
  holidayNote: string | null;
  unavailable?: boolean;
};

function deepGet(source: any, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value == null || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[key];
  }, source);
}

function toNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function fmt(value: number | null | undefined, digits = 2, suffix = ''): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return `${value.toFixed(digits)}${suffix}`;
}

function normalizeSignal(value: unknown): FinnhubAggregateSnapshot['overallSignal'] {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return 'unavailable';
  if (/(strong[_ -]?buy|strongbuy)/.test(text)) return 'strong-buy';
  if (/(buy)/.test(text) && !/(strong)/.test(text)) return 'buy';
  if (/(strong[_ -]?sell|strongsell)/.test(text)) return 'strong-sell';
  if (/(sell)/.test(text) && !/(strong)/.test(text)) return 'sell';
  if (/(neutral|hold)/.test(text)) return 'neutral';
  return 'unavailable';
}

function signalBias(value: FinnhubAggregateSnapshot['overallSignal']): FinnhubResearchResponse['technicalBias'] {
  if (value === 'strong-buy' || value === 'buy') return 'bullish';
  if (value === 'strong-sell' || value === 'sell') return 'bearish';
  if (value === 'neutral') return 'neutral';
  return 'unavailable';
}

function aggregateFromPayload(payload: any): FinnhubAggregateSnapshot {
  const technicalBlock = payload?.technicalAnalysis ?? payload?.technical_analysis ?? payload ?? {};
  const movingAverageBlock = payload?.movingAverages ?? payload?.moving_averages ?? {};
  const oscillatorBlock = payload?.oscillators ?? payload?.oscillator ?? {};
  const count = technicalBlock?.count ?? payload?.count ?? {};

  return {
    overallSignal: normalizeSignal(technicalBlock?.signal ?? payload?.signal),
    movingAverageSignal: normalizeSignal(movingAverageBlock?.signal),
    oscillatorSignal: normalizeSignal(oscillatorBlock?.signal),
    bullishCount: toNumber(count?.buy ?? count?.bullish ?? count?.positive),
    neutralCount: toNumber(count?.neutral),
    bearishCount: toNumber(count?.sell ?? count?.bearish ?? count?.negative),
  };
}

function supportResistanceFromPayload(payload: any): { support: number | null; resistance: number | null } {
  const support = [
    'support',
    'supportLevel',
    'support_level',
    'levels.support',
    'levels.s1',
    'supportResistance.support',
  ].map((path) => toNumber(deepGet(payload, path))).find((value) => value != null) ?? null;
  const resistance = [
    'resistance',
    'resistanceLevel',
    'resistance_level',
    'levels.resistance',
    'levels.r1',
    'supportResistance.resistance',
  ].map((path) => toNumber(deepGet(payload, path))).find((value) => value != null) ?? null;

  return { support, resistance };
}

function patternFromPayload(payload: any): FinnhubPatternSnapshot {
  const name = [
    'pattern',
    'name',
    'result.pattern',
    'result.name',
    'data.pattern',
  ].map((path) => String(deepGet(payload, path) || '').trim()).find(Boolean) || null;
  const rawBias = [
    'signal',
    'result.signal',
    'trend',
    'direction',
    'data.signal',
  ].map((path) => String(deepGet(payload, path) || '').trim()).find(Boolean) || '';
  const text = rawBias.toLowerCase();
  const bias: FinnhubPatternSnapshot['bias'] =
    !text ? 'unavailable'
      : /(bull|buy|up)/.test(text) ? 'bullish'
        : /(bear|sell|down)/.test(text) ? 'bearish'
          : /(mix)/.test(text) ? 'mixed'
            : 'neutral';

  return { name, bias };
}

function summarizeSentiment(payload: any): FinnhubSentimentSnapshot {
  return {
    bullishPercent: toNumber(payload?.sentiment?.bullishPercent),
    bearishPercent: toNumber(payload?.sentiment?.bearishPercent),
    companyNewsScore: toNumber(payload?.companyNewsScore),
    sectorAverageBullishPercent: toNumber(payload?.sectorAverageBullishPercent),
    buzz: toNumber(payload?.buzz?.buzz),
    weeklyAverage: toNumber(payload?.buzz?.weeklyAverage),
    articlesInLastWeek: toNumber(payload?.buzz?.articlesInLastWeek),
  };
}

function confidenceFor(
  technical: FinnhubAggregateSnapshot,
  priceReady: boolean,
  headlineCount: number,
  eventReady: boolean,
): 'low' | 'medium' | 'high' {
  const strongSignal = technical.overallSignal === 'strong-buy' || technical.overallSignal === 'strong-sell';
  if (priceReady && strongSignal && headlineCount >= 2) return 'high';
  if (priceReady && (technical.overallSignal !== 'unavailable' || headlineCount >= 1 || eventReady)) return 'medium';
  return 'low';
}

function summaryFor(
  label: string,
  technical: FinnhubAggregateSnapshot,
  proxyMode: 'direct' | 'proxy',
  sessionLabel: string | null,
  upcomingEvent: FinnhubUpcomingEvent,
): string {
  const signal = technical.overallSignal === 'unavailable' ? 'technical read unavailable' : technical.overallSignal;
  const proxyText = proxyMode === 'proxy' ? 'proxy overlay' : 'direct symbol read';
  const sessionText = sessionLabel ? ` while ${sessionLabel}` : '';
  const eventText = upcomingEvent ? ` Next event ${upcomingEvent.label} on ${upcomingEvent.date}.` : '';
  return `${label} reads ${signal} on Finnhub ${proxyText}${sessionText}.${eventText}`;
}

function asIsoDate(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function nextEventFromCalendar(events: Array<any>): FinnhubUpcomingEvent {
  const event = events
    .filter((item) => typeof item?.date === 'string' && item.date)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))[0];
  if (!event) return null;
  return {
    date: String(event.date),
    label: `${event.symbol ?? ''}`.trim() || 'earnings',
    hour: typeof event.hour === 'string' ? event.hour : null,
    epsEstimate: toNumber(event.epsEstimate),
    revenueEstimate: toNumber(event.revenueEstimate),
  };
}

function holidaySummary(payload: any): string | null {
  if (!payload) return null;
  if (Array.isArray(payload) && payload.length) {
    const first = payload[0];
    if (first?.holiday) return `${first.holiday} holiday schedule is active.`;
  }
  if (payload?.holiday) return `${payload.holiday} holiday schedule is active.`;
  return null;
}

export async function getFinnhubResearch(input: {
  market?: string;
  timeframe?: string;
  query?: string;
}): Promise<FinnhubResearchResponse> {
  const { market, hint } = finnhubHintSummary(input.market, input.query);
  const requestedTimeframe = String(input.timeframe || '1h').toLowerCase();
  const selectedResolution = finnhubTimeframeToResolution(requestedTimeframe);
  const key = cacheKey('market', `finnhub-research:${market}:${requestedTimeframe}:${hint.query.toUpperCase()}`);

  return getCachedOrCompute(key, async () => {
    if (!finnhubConfigured()) {
      return {
        generatedAt: new Date().toISOString(),
        market,
        query: hint.query,
        requestedTimeframe,
        selectedResolution,
        matchedSymbolId: null,
        matchedSymbol: null,
        matchedDescription: null,
        matchedType: null,
        matchedMic: null,
        proxyMode: 'direct',
        proxyLabel: null,
        price: null,
        percentChange: null,
        marketOpen: null,
        sessionLabel: null,
        technicalSignal: 'unavailable',
        technicalBias: 'unavailable',
        confidence: 'low',
        summary: 'Finnhub is not configured for this Vaultum deployment.',
        sourceLabel: 'Finnhub sidecar is optional. When configured, it adds equity/ETF quotes, technical aggregates, market-status checks, earnings timing, and news sentiment without replacing Vaultum quote truth.',
        warnings: ['FINNHUB_API_KEY is missing.'],
        cards: [],
        headlines: [],
        technical: {
          overallSignal: 'unavailable',
          movingAverageSignal: 'unavailable',
          oscillatorSignal: 'unavailable',
          bullishCount: null,
          neutralCount: null,
          bearishCount: null,
        },
        levels: { support: null, resistance: null },
        pattern: { name: null, bias: 'unavailable' },
        sentiment: {
          bullishPercent: null,
          bearishPercent: null,
          companyNewsScore: null,
          sectorAverageBullishPercent: null,
          buzz: null,
          weeklyAverage: null,
          articlesInLastWeek: null,
        },
        upcomingEvent: null,
        holidayNote: null,
        unavailable: true,
      };
    }

    const match = await resolveFinnhubSymbol(market, input.query);
    if (!match) {
      return {
        generatedAt: new Date().toISOString(),
        market,
        query: hint.query,
        requestedTimeframe,
        selectedResolution,
        matchedSymbolId: null,
        matchedSymbol: null,
        matchedDescription: null,
        matchedType: null,
        matchedMic: null,
        proxyMode: hint.proxySymbol ? 'proxy' : 'direct',
        proxyLabel: hint.proxySymbol ? `${hint.proxySymbol} proxy overlay` : null,
        price: null,
        percentChange: null,
        marketOpen: null,
        sessionLabel: null,
        technicalSignal: 'unavailable',
        technicalBias: 'unavailable',
        confidence: 'low',
        summary: `Finnhub symbol discovery did not return a usable match for ${market}.`,
        sourceLabel: 'Finnhub sidecar is optional. When configured, it adds equity/ETF quotes, technical aggregates, market-status checks, earnings timing, and news sentiment without replacing Vaultum quote truth.',
        warnings: ['No Finnhub symbol match was found for the requested market or proxy.'],
        cards: [],
        headlines: [],
        technical: {
          overallSignal: 'unavailable',
          movingAverageSignal: 'unavailable',
          oscillatorSignal: 'unavailable',
          bullishCount: null,
          neutralCount: null,
          bearishCount: null,
        },
        levels: { support: null, resistance: null },
        pattern: { name: null, bias: 'unavailable' },
        sentiment: {
          bullishPercent: null,
          bearishPercent: null,
          companyNewsScore: null,
          sectorAverageBullishPercent: null,
          buzz: null,
          weeklyAverage: null,
          articlesInLastWeek: null,
        },
        upcomingEvent: null,
        holidayNote: null,
        unavailable: true,
      };
    }

    const shouldUseGeneralNews = match.isProxy && hint.newsCategory != null;
    const [quote, aggregateRaw, levelsRaw, patternRaw, sentimentRaw, companyNews, generalNews, status, holiday, earnings] = await Promise.all([
      fetchFinnhubQuoteSnapshot(match.symbol),
      fetchFinnhubAggregateIndicator(match.symbol, selectedResolution),
      fetchFinnhubSupportResistance(match.symbol, selectedResolution),
      fetchFinnhubPatternRecognition(match.symbol, selectedResolution),
      fetchFinnhubNewsSentiment(match.symbol),
      fetchFinnhubCompanyNews(match.symbol, asIsoDate(-7), asIsoDate(2)),
      shouldUseGeneralNews ? fetchFinnhubGeneralNews(hint.newsCategory ?? 'general') : Promise.resolve([]),
      fetchFinnhubMarketStatus('US'),
      fetchFinnhubMarketHoliday('US'),
      fetchFinnhubEarningsCalendar(asIsoDate(0), asIsoDate(30), match.symbol),
    ]);

    const technical = aggregateFromPayload(aggregateRaw);
    const levels = supportResistanceFromPayload(levelsRaw);
    const pattern = patternFromPayload(patternRaw);
    const sentiment = summarizeSentiment(sentimentRaw);
    const headlines = (companyNews.length ? companyNews : generalNews).slice(0, 4);
    const upcomingEvent = nextEventFromCalendar(earnings ?? []);
    const sessionLabel = typeof status?.session === 'string'
      ? String(status.session).toLowerCase()
      : status?.isOpen === true
        ? 'market open'
        : status?.isOpen === false
          ? 'market closed'
          : null;
    const technicalBias = technical.overallSignal === 'unavailable'
      ? pattern.bias === 'unavailable'
        ? 'unavailable'
        : pattern.bias
      : signalBias(technical.overallSignal);
    const warnings: string[] = [];

    if (match.isProxy) warnings.push(`Finnhub is using ${match.symbol} as a proxy overlay for ${market}.`);
    if (technical.overallSignal === 'unavailable') warnings.push('Finnhub aggregate technical signal is unavailable for the matched symbol/timeframe.');
    if (levels.support == null || levels.resistance == null) warnings.push('Finnhub support/resistance scan returned a partial level map.');
    if (pattern.bias === 'unavailable') warnings.push('Finnhub pattern-recognition scan returned no clear pattern signal.');
    if (!headlines.length) warnings.push('Finnhub returned no fresh headline context for the current symbol/query window.');
    if (status?.isOpen === false) warnings.push('Matched market is currently closed, so Finnhub technical state is static until the next session.');
    if (sentiment.buzz != null && sentiment.weeklyAverage != null && sentiment.buzz > sentiment.weeklyAverage * 1.6) {
      warnings.push('Finnhub news buzz is running well above weekly average, so catalyst risk is elevated.');
    }

    const confidence = confidenceFor(technical, Boolean(quote), headlines.length, Boolean(upcomingEvent));
    const holidayNote = holidaySummary(holiday);
    const cards: FinnhubResearchCard[] = [
      {
        key: 'session',
        label: 'Session',
        value: sessionLabel ?? 'unknown',
        tone: status?.isOpen === false ? 'alert' : 'neutral',
        detail: match.isProxy
          ? `${match.symbol} is being used as a proxy overlay for ${market}, so session timing follows the matched listing venue.`
          : `${match.symbol} is being used directly for Finnhub status and technical checks.`,
      },
      {
        key: 'technical',
        label: 'TA Aggregate',
        value: `${technical.overallSignal} | MA ${technical.movingAverageSignal} | OSC ${technical.oscillatorSignal}`,
        tone: technicalBias === 'bullish' ? 'bullish' : technicalBias === 'bearish' ? 'bearish' : technicalBias === 'unavailable' ? 'mixed' : 'neutral',
        detail: `Counts ${fmt(technical.bullishCount, 0)} buy / ${fmt(technical.neutralCount, 0)} neutral / ${fmt(technical.bearishCount, 0)} sell across Finnhub aggregate scans on ${selectedResolution}.`,
      },
      {
        key: 'levels',
        label: 'Scan Levels',
        value: `S ${fmt(levels.support)} | R ${fmt(levels.resistance)}`,
        tone: quote?.price != null && levels.resistance != null && quote.price >= levels.resistance ? 'alert' : 'neutral',
        detail: pattern.name
          ? `Pattern recognition currently flags ${pattern.name} with ${pattern.bias} bias.`
          : `Pattern recognition bias is ${pattern.bias}.`,
      },
      {
        key: 'sentiment',
        label: 'News Sentiment',
        value: `${fmt(sentiment.bullishPercent, 1, '%')} bull | ${fmt(sentiment.bearishPercent, 1, '%')} bear`,
        tone: (sentiment.bullishPercent ?? 0) >= 60 ? 'bullish' : (sentiment.bearishPercent ?? 0) >= 60 ? 'bearish' : 'mixed',
        detail: `Company score ${fmt(sentiment.companyNewsScore, 2)} with buzz ${fmt(sentiment.buzz, 2)} versus weekly average ${fmt(sentiment.weeklyAverage, 2)}.`,
      },
      {
        key: 'event',
        label: 'Event Timing',
        value: upcomingEvent ? `${upcomingEvent.label} ${upcomingEvent.date}` : 'no near event',
        tone: upcomingEvent ? 'alert' : 'neutral',
        detail: upcomingEvent
          ? `Next earnings-style catalyst is ${upcomingEvent.hour ?? 'unspecified session'} with EPS estimate ${fmt(upcomingEvent.epsEstimate, 2)} and revenue estimate ${fmt(upcomingEvent.revenueEstimate, 0)}.`
          : 'No near earnings-style event was returned for the matched symbol.',
      },
    ];

    return {
      generatedAt: new Date().toISOString(),
      market,
      query: hint.query,
      requestedTimeframe,
      selectedResolution,
      matchedSymbolId: match.id,
      matchedSymbol: match.symbol,
      matchedDescription: match.description,
      matchedType: match.type,
      matchedMic: match.mic,
      proxyMode: match.isProxy ? 'proxy' : 'direct',
      proxyLabel: match.isProxy ? `${match.symbol} proxy overlay for ${market}` : null,
      price: quote?.price ?? null,
      percentChange: quote?.percentChange ?? null,
      marketOpen: status?.isOpen ?? null,
      sessionLabel,
      technicalSignal: technical.overallSignal,
      technicalBias,
      confidence,
      summary: summaryFor(match.description || match.symbol, technical, match.isProxy ? 'proxy' : 'direct', sessionLabel, upcomingEvent),
      sourceLabel: 'Finnhub sidecar adds equity/ETF quote coverage, technical aggregates, support-resistance scans, market-status checks, earnings timing, and news sentiment. It is strongest for stocks and ETFs, and it acts as a labeled proxy overlay when Vaultum maps macro markets like XAUUSD or EURUSD to liquid listed proxies.',
      warnings: [...new Set(warnings)],
      cards,
      headlines,
      technical,
      levels,
      pattern,
      sentiment,
      upcomingEvent,
      holidayNote,
      unavailable: false,
    };
  }, 240);
}
