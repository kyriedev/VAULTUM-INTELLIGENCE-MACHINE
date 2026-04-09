import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import {
  fetchFinnhubCompanyNews,
  fetchFinnhubGeneralNews,
  fetchFinnhubNewsSentiment,
  finnhubConfigured,
  finnhubHintSummary,
} from '../../_shared/finnhub';
import { fetchFinvizNewsAndBlogs } from '../../_shared/finviz';
import { searchYahooFinance } from '../../_shared/yahoo';
import { buildFeedSnapshotMeta } from '../../_shared/feed-health';
import { getEconomicCalendar } from '../../calendar/v1/get-economic-calendar';
import { getMacroSignals } from '../../macro/v1/get-macro-signals';
import { getXIntel } from './get-x-intel';

type NewsTheme =
  | 'central-bank'
  | 'inflation'
  | 'jobs'
  | 'growth'
  | 'rates'
  | 'geopolitical'
  | 'trade'
  | 'risk'
  | 'market'
  | 'other';

type NewsBias = 'bullish' | 'bearish' | 'mixed' | 'neutral';
type NewsImpact = 'high' | 'medium' | 'low';
type ChecklistStatus = 'pass' | 'watch' | 'fail';

type NewsCatalyst = {
  title: string;
  source: string | null;
  publishedAt: string | null;
  url: string | null;
  summary: string | null;
  theme: NewsTheme;
  bias: NewsBias;
  biasScore: number;
  impact: NewsImpact;
  relevanceScore: number;
};

type ReleasedEventPattern = {
  event: string;
  currency: string;
  releasedAt: string;
  theme: string;
  pattern: string;
  bias: NewsBias;
  note: string;
};

type ChecklistItem = {
  label: string;
  status: ChecklistStatus;
  detail: string;
};

type HeadlineChannels = {
  usdBullish: number;
  usdBearish: number;
  eurBullish: number;
  eurBearish: number;
  gbpBullish: number;
  gbpBearish: number;
  jpyBullish: number;
  jpyBearish: number;
  riskOn: number;
  riskOff: number;
  yieldUp: number;
  yieldDown: number;
  havenUp: number;
  inflationHot: number;
  inflationCool: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeMarket(market?: string): string {
  const upper = String(market || 'XAUUSD').trim().toUpperCase();
  const aliases: Record<string, string> = {
    GOLD: 'XAUUSD',
    'GC=F': 'XAUUSD',
    'EURUSD=X': 'EURUSD',
    'GBPUSD=X': 'GBPUSD',
    'USDJPY=X': 'USDJPY',
    'GBPJPY=X': 'GBPJPY',
    '^DJI': 'US30',
    DIA: 'US30',
    'YM=F': 'US30',
  };
  return aliases[upper] ?? upper;
}

function tokenize(value: string): string[] {
  return [...new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3),
  )];
}

function marketQuery(market: string): string {
  if (market === 'XAUUSD') return 'gold fed yields dollar inflation geopolitical';
  if (market === 'US30') return 'dow fed yields stocks risk sentiment';
  if (market === 'EURUSD') return 'eur usd ecb fed rates inflation';
  if (market === 'GBPUSD') return 'gbp usd boe fed rates inflation';
  if (market === 'USDJPY') return 'usd jpy boj fed yields carry';
  if (market === 'GBPJPY') return 'gbp jpy boj boe carry risk';
  return `${market} macro news`;
}

function detectTheme(text: string): NewsTheme {
  const lower = text.toLowerCase();
  if (/(fed|ecb|boj|boe|fomc|rate decision|minutes|powell|lagarde|bailey|ueda|policy)/.test(lower)) return 'central-bank';
  if (/(cpi|inflation|ppi|pce|prices|core inflation)/.test(lower)) return 'inflation';
  if (/(payroll|jobs|employment|jobless|claims|wage|unemployment)/.test(lower)) return 'jobs';
  if (/(gdp|pmi|ism|growth|confidence|sentiment|retail sales|production)/.test(lower)) return 'growth';
  if (/(yield|treasury|bond|rates|curve|real yield)/.test(lower)) return 'rates';
  if (/(war|missile|tariff|sanction|shipping|hormuz|red sea|conflict|geopolit)/.test(lower)) return 'geopolitical';
  if (/(trade|exports|imports|tariff)/.test(lower)) return 'trade';
  if (/(selloff|risk-off|risk on|risk-on|volatility|vix|equities|stocks|dow|wall street)/.test(lower)) return 'risk';
  if (/(market|forecast|outlook|analyst|earnings)/.test(lower)) return 'market';
  return 'other';
}

function impactFromTheme(theme: NewsTheme): NewsImpact {
  if (theme === 'central-bank' || theme === 'inflation' || theme === 'jobs' || theme === 'geopolitical') return 'high';
  if (theme === 'growth' || theme === 'rates' || theme === 'risk' || theme === 'trade') return 'medium';
  return 'low';
}

function extractChannels(text: string): HeadlineChannels {
  const lower = text.toLowerCase();
  const score = (pattern: RegExp): number => (pattern.test(lower) ? 1 : 0);
  return {
    usdBullish: score(/(strong dollar|dollar rises|dollar gains|hawkish fed|higher for longer|yield(s)? rise|hot cpi|hot inflation|strong payrolls|sticky inflation)/),
    usdBearish: score(/(weak dollar|dollar falls|dollar slips|dovish fed|rate cut|yield(s)? fall|cooling inflation|soft payrolls|disinflation)/),
    eurBullish: score(/(hawkish ecb|ecb hike|euro gains|euro rises|euro zone inflation beats)/),
    eurBearish: score(/(dovish ecb|ecb cut|euro falls|euro drops|euro zone slowdown)/),
    gbpBullish: score(/(hawkish boe|boe hike|sterling gains|pound rises|uk inflation beats|gilt yields rise)/),
    gbpBearish: score(/(dovish boe|boe cut|sterling falls|pound drops|uk slowdown|weak uk data)/),
    jpyBullish: score(/(hawkish boj|boj hike|yen gains|yen strengthens|intervention risk|safe haven yen)/),
    jpyBearish: score(/(dovish boj|yen weakens|carry trade|yen falls|yield gap widens)/),
    riskOn: score(/(risk-on|stocks rally|soft landing|optimism|equities rise|growth rebound)/),
    riskOff: score(/(risk-off|selloff|flight to safety|geopolitical stress|recession fear|volatility spike)/),
    yieldUp: score(/(yield(s)? rise|treasury selloff|higher real yields|curve bear steepening)/),
    yieldDown: score(/(yield(s)? fall|treasury rally|lower real yields|curve bull steepening)/),
    havenUp: score(/(safe haven|gold demand|flight to safety|stress bid)/),
    inflationHot: score(/(hot inflation|inflation beat|cpi beat|ppi beat|prices accelerate)/),
    inflationCool: score(/(cooling inflation|inflation miss|disinflation|cpi cools|ppi cools)/),
  };
}

function biasFromScore(score: number): NewsBias {
  if (score >= 14) return 'bullish';
  if (score <= -14) return 'bearish';
  if (Math.abs(score) >= 6) return 'mixed';
  return 'neutral';
}

function scoreHeadlineForMarket(market: string, text: string): { biasScore: number; bias: NewsBias } {
  const channels = extractChannels(text);
  let score = 0;

  if (market === 'XAUUSD') {
    score += (channels.usdBearish * 12) - (channels.usdBullish * 13);
    score += (channels.yieldDown * 10) - (channels.yieldUp * 11);
    score += (channels.havenUp * 9) + (channels.riskOff * 7) - (channels.riskOn * 4);
    score += (channels.inflationHot * 2) + (channels.inflationCool * 4);
  } else if (market === 'US30') {
    score += (channels.riskOn * 11) - (channels.riskOff * 13);
    score += (channels.yieldDown * 8) - (channels.yieldUp * 9);
    score += (channels.usdBearish * 2) - (channels.usdBullish * 2);
    score += (channels.inflationCool * 6) - (channels.inflationHot * 8);
  } else if (market === 'EURUSD') {
    score += (channels.eurBullish * 10) - (channels.eurBearish * 10);
    score += (channels.usdBearish * 11) - (channels.usdBullish * 11);
    score += (channels.yieldDown * 3) - (channels.yieldUp * 3);
  } else if (market === 'GBPUSD') {
    score += (channels.gbpBullish * 10) - (channels.gbpBearish * 10);
    score += (channels.usdBearish * 11) - (channels.usdBullish * 11);
    score += (channels.riskOn * 4) - (channels.riskOff * 5);
  } else if (market === 'USDJPY') {
    score += (channels.usdBullish * 9) - (channels.usdBearish * 9);
    score += (channels.yieldUp * 9) - (channels.yieldDown * 8);
    score += (channels.jpyBullish * -10) + (channels.jpyBearish * 9);
    score += (channels.riskOn * 3) - (channels.riskOff * 7);
  } else if (market === 'GBPJPY') {
    score += (channels.gbpBullish * 8) - (channels.gbpBearish * 8);
    score += (channels.jpyBullish * -10) + (channels.jpyBearish * 8);
    score += (channels.riskOn * 8) - (channels.riskOff * 10);
  }

  return {
    biasScore: score,
    bias: biasFromScore(score),
  };
}

function scoreMatch(text: string, tokens: string[]): number {
  const lower = text.toLowerCase();
  return tokens.reduce((score, token) => score + (lower.includes(token) ? 1 : 0), 0);
}

function recencyBoost(publishedAt: string | null): number {
  if (!publishedAt) return 0;
  const ageHours = Math.max((Date.now() - new Date(publishedAt).getTime()) / 3_600_000, 0);
  if (ageHours <= 6) return 5;
  if (ageHours <= 24) return 3;
  if (ageHours <= 72) return 1;
  return 0;
}

function sourceWeight(source: string | null): number {
  const lower = String(source || '').toLowerCase();
  if (/finnhub|reuters|bloomberg|dow jones|wsj/.test(lower)) return 4;
  if (/yahoo/.test(lower)) return 3;
  if (/finviz/.test(lower)) return 2;
  return 1;
}

function numberFromText(value: string | null | undefined): number | null {
  const numeric = String(value || '').replace(/[^0-9.\-]/g, '');
  if (!numeric) return null;
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : null;
}

function eventPolarity(text: string): 1 | -1 {
  const lower = text.toLowerCase();
  if (/(unemployment|jobless|claims|continuing claims)/.test(lower)) return -1;
  return 1;
}

function patternFromEvent(actual: number | null, forecast: number | null, previous: number | null): string | null {
  if (actual == null || forecast == null || previous == null) return null;
  if (actual > forecast && forecast > previous) return 'Actual > Forecast > Previous';
  if (actual > forecast && previous > forecast && actual > previous) return 'Actual > Forecast and Previous';
  if (actual > forecast && previous > actual) return 'Actual > Forecast < Previous';
  if (actual < forecast && forecast < previous) return 'Actual < Forecast < Previous';
  if (actual < forecast && previous < forecast && actual < previous) return 'Actual < Forecast and Previous';
  if (actual < forecast && previous < actual) return 'Actual < Forecast > Previous';
  if (actual === forecast && forecast === previous) return 'Actual = Forecast = Previous';
  if (actual === forecast && forecast > previous) return 'Actual = Forecast > Previous';
  if (actual === forecast && forecast < previous) return 'Actual = Forecast < Previous';
  return 'Mixed surprise pattern';
}

function biasFromReleasedEvent(market: string, currency: string, event: string, actual: number | null, forecast: number | null): NewsBias {
  if (actual == null || forecast == null) return 'neutral';
  const polarity = eventPolarity(event);
  const surprise = actual === forecast ? 0 : actual > forecast ? 1 : -1;
  const signedSurprise = surprise * polarity;
  let marketScore = 0;

  if (currency === 'USD') {
    if (market === 'XAUUSD') marketScore = signedSurprise * -18;
    if (market === 'US30') marketScore = signedSurprise * -8;
    if (market === 'EURUSD' || market === 'GBPUSD') marketScore = signedSurprise * -18;
    if (market === 'USDJPY') marketScore = signedSurprise * 16;
    if (market === 'GBPJPY') marketScore = signedSurprise * -6;
  }
  if (currency === 'EUR' && market === 'EURUSD') marketScore = signedSurprise * 16;
  if (currency === 'GBP' && (market === 'GBPUSD' || market === 'GBPJPY')) marketScore = signedSurprise * 16;
  if (currency === 'JPY' && (market === 'USDJPY' || market === 'GBPJPY')) marketScore = signedSurprise * -16;

  return biasFromScore(marketScore);
}

function calendarDirectionScore(calendar: Awaited<ReturnType<typeof getEconomicCalendar>> | null, market: string): number {
  const prediction = calendar?.predictiveSignals?.[0] ?? null;
  if (!prediction) return 0;
  const confidenceWeight = prediction.confidence === 'high' ? 18 : prediction.confidence === 'medium' ? 10 : 4;
  const positive =
    (market === 'XAUUSD' && prediction.direction === 'down')
    || (market === 'US30' && prediction.direction === 'up')
    || ((market === 'EURUSD' || market === 'GBPUSD') && prediction.direction === 'up')
    || ((market === 'USDJPY' || market === 'GBPJPY') && prediction.direction === 'up');
  const negative =
    (market === 'XAUUSD' && prediction.direction === 'up')
    || (market === 'US30' && prediction.direction === 'down')
    || ((market === 'EURUSD' || market === 'GBPUSD') && prediction.direction === 'down')
    || ((market === 'USDJPY' || market === 'GBPJPY') && prediction.direction === 'down');
  if (positive) return confidenceWeight;
  if (negative) return -confidenceWeight;
  return 0;
}

function macroDirectionScore(market: string, macro: Awaited<ReturnType<typeof getMacroSignals>> | null): number {
  const focus = macro?.focus ?? null;
  if (!focus) return 0;
  if (focus.bias === 'bullish') return 16;
  if (focus.bias === 'bearish') return -16;
  return 0;
}

function checklistStatus(score: number): ChecklistStatus {
  if (score >= 12) return 'pass';
  if (score <= -12) return 'fail';
  return 'watch';
}

function formatBias(score: number): string {
  const bias = biasFromScore(score);
  if (bias === 'bullish') return 'bullish';
  if (bias === 'bearish') return 'bearish';
  if (bias === 'mixed') return 'mixed';
  return 'neutral';
}

export async function getNewsIntel(input: { market?: string; timeframe?: string } = {}): Promise<any> {
  const market = normalizeMarket(input.market);
  const timeframe = String(input.timeframe || '1h').toLowerCase();
  const query = marketQuery(market);

  return getCachedOrCompute(cacheKey('intelligence', `news-intel:${market}:${timeframe}`), async () => {
    const [calendar, macro, yahoo, finnhubContext, finviz, xIntel] = await Promise.all([
      getEconomicCalendar({ market }).catch(() => null),
      getMacroSignals({ market }).catch(() => null),
      searchYahooFinance(query, { maxResults: 4, newsCount: 8 }).catch(() => ({ quotes: [], news: [] })),
      (async () => {
        if (!finnhubConfigured()) {
          return { proxySymbol: null, companyNews: [] as any[], generalNews: [] as any[], sentiment: null };
        }
        const { hint } = finnhubHintSummary(market);
        const proxySymbol = hint.proxySymbol ?? null;
        const from = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
        const to = new Date().toISOString().slice(0, 10);
        const [companyNews, generalNews, sentiment] = await Promise.all([
          proxySymbol ? fetchFinnhubCompanyNews(proxySymbol, from, to).catch(() => []) : Promise.resolve([]),
          fetchFinnhubGeneralNews(hint.newsCategory ?? 'general').catch(() => []),
          proxySymbol ? fetchFinnhubNewsSentiment(proxySymbol).catch(() => null) : Promise.resolve(null),
        ]);
        return { proxySymbol, companyNews, generalNews, sentiment };
      })(),
      fetchFinvizNewsAndBlogs().catch(() => ({ news: [], blogs: [] })),
      getXIntel({ market, timeframe }).catch(() => null),
    ]);

    const tokens = tokenize(`${query} ${(calendar?.primaryCurrencies ?? []).join(' ')}`);
    const rawCatalysts: NewsCatalyst[] = [
      ...(yahoo.news ?? []).map((item) => ({
        title: item.title,
        source: item.publisher ?? 'Yahoo',
        publishedAt: item.publishedAt,
        url: item.link,
        summary: null,
        theme: detectTheme(item.title),
        ...scoreHeadlineForMarket(market, item.title),
        impact: impactFromTheme(detectTheme(item.title)),
        relevanceScore: scoreMatch(`${item.title} ${item.publisher ?? ''}`, tokens) + recencyBoost(item.publishedAt) + sourceWeight(item.publisher ?? 'Yahoo'),
      })),
      ...finnhubContext.companyNews.map((item: any) => ({
        title: item.title,
        source: item.source ?? 'Finnhub',
        publishedAt: item.publishedAt,
        url: item.url,
        summary: item.summary,
        theme: detectTheme(`${item.title} ${item.summary ?? ''}`),
        ...scoreHeadlineForMarket(market, `${item.title} ${item.summary ?? ''}`),
        impact: impactFromTheme(detectTheme(`${item.title} ${item.summary ?? ''}`)),
        relevanceScore: scoreMatch(`${item.title} ${item.summary ?? ''}`, tokens) + recencyBoost(item.publishedAt) + sourceWeight(item.source ?? 'Finnhub') + 3,
      })),
      ...finnhubContext.generalNews.slice(0, 10).map((item: any) => ({
        title: item.title,
        source: item.source ?? 'Finnhub',
        publishedAt: item.publishedAt,
        url: item.url,
        summary: item.summary,
        theme: detectTheme(`${item.title} ${item.summary ?? ''}`),
        ...scoreHeadlineForMarket(market, `${item.title} ${item.summary ?? ''}`),
        impact: impactFromTheme(detectTheme(`${item.title} ${item.summary ?? ''}`)),
        relevanceScore: scoreMatch(`${item.title} ${item.summary ?? ''}`, tokens) + recencyBoost(item.publishedAt) + sourceWeight(item.source ?? 'Finnhub'),
      })),
      ...finviz.news.slice(0, 6).map((item: any) => ({
        title: item.title,
        source: item.source ?? 'Finviz',
        publishedAt: item.publishedAt,
        url: item.url,
        summary: null,
        theme: detectTheme(item.title),
        ...scoreHeadlineForMarket(market, item.title),
        impact: impactFromTheme(detectTheme(item.title)),
        relevanceScore: scoreMatch(`${item.title} ${item.source ?? ''}`, tokens) + recencyBoost(item.publishedAt) + sourceWeight(item.source ?? 'Finviz'),
      })),
      ...finviz.blogs.slice(0, 4).map((item: any) => ({
        title: item.title,
        source: item.source ?? 'Finviz Blogs',
        publishedAt: item.publishedAt,
        url: item.url,
        summary: null,
        theme: detectTheme(item.title),
        ...scoreHeadlineForMarket(market, item.title),
        impact: impactFromTheme(detectTheme(item.title)),
        relevanceScore: scoreMatch(`${item.title} ${item.source ?? ''}`, tokens) + recencyBoost(item.publishedAt) + sourceWeight(item.source ?? 'Finviz Blogs'),
      })),
      ...((xIntel?.clusters ?? []).slice(0, 6).map((item: any) => ({
        title: item.headline,
        source: item.sourceHandles?.length ? `X ${item.sourceHandles.slice(0, 2).map((handle: string) => `@${handle}`).join(' / ')}` : 'X',
        publishedAt: item.latestUpdateAt ?? null,
        url: item.posts?.[0]?.url ?? null,
        summary: item.explanation?.whyItMatters ?? item.cleanedSummary ?? null,
        theme: detectTheme(`${item.eventType} ${item.cleanedSummary ?? ''}`),
        bias: item.posts?.[0]?.bias ?? 'neutral',
        biasScore: Number(item.overallImpactScore ?? 0) * ((item.posts?.[0]?.bias ?? 'neutral') === 'bearish' ? -0.4 : 0.4),
        impact: (item.overallImpactScore >= 72 ? 'high' : item.overallImpactScore >= 44 ? 'medium' : 'low') as NewsImpact,
        relevanceScore: Number(item.overallImpactScore ?? 0) + (item.validation?.reactionValidation === 'confirmed' ? 6 : item.validation?.reactionValidation === 'partial' ? 3 : 0),
      }))),
    ];

    const deduped = new Map<string, NewsCatalyst>();
    rawCatalysts.forEach((item) => {
      const key = item.title.trim().toLowerCase();
      const existing = deduped.get(key);
      if (!existing || item.relevanceScore > existing.relevanceScore) deduped.set(key, item);
    });

    const catalysts = [...deduped.values()]
      .filter((item) => item.relevanceScore > 0)
      .sort((left, right) => {
        if (right.relevanceScore !== left.relevanceScore) return right.relevanceScore - left.relevanceScore;
        return String(right.publishedAt || '').localeCompare(String(left.publishedAt || ''));
      })
      .slice(0, 10);

    const weightedHeadlineScore = catalysts.reduce((sum, item) => sum + (item.biasScore * Math.max(item.relevanceScore, 1)), 0);
    const headlineWeight = catalysts.reduce((sum, item) => sum + Math.max(item.relevanceScore, 1), 0) || 1;
    const headlineSentimentScore = clamp(weightedHeadlineScore / headlineWeight, -100, 100);
    const finnhubSentimentScore =
      finnhubContext.sentiment?.companyNewsScore != null
        ? Number((finnhubContext.sentiment.companyNewsScore * 50).toFixed(1))
        : null;
    const combinedSentimentScore = clamp(
      headlineSentimentScore + ((finnhubSentimentScore ?? 0) * 0.35) + (((xIntel?.sentiment?.score ?? 0)) * 0.4),
      -100,
      100,
    );
    const sentimentLabel = formatBias(combinedSentimentScore);

    const releasedEventPatterns = (calendar?.events ?? [])
      .filter((event: any) => !event.isUpcoming && event.actual != null && event.forecast != null && event.previous != null)
      .slice(0, 5)
      .map((event: any) => {
        const actual = numberFromText(event.actual);
        const forecast = numberFromText(event.forecast);
        const previous = numberFromText(event.previous);
        const pattern = patternFromEvent(actual, forecast, previous) ?? 'Outcome unavailable';
        const bias = biasFromReleasedEvent(market, event.currency, event.event, actual, forecast);
        return {
          event: event.event,
          currency: event.currency,
          releasedAt: event.date,
          theme: event.theme,
          pattern,
          bias,
          note: `${event.currency} ${event.event} printed ${pattern}.`,
        } satisfies ReleasedEventPattern;
      });

    const releasedPatternScore = releasedEventPatterns.reduce((sum, item) => {
      if (item.bias === 'bullish') return sum + 12;
      if (item.bias === 'bearish') return sum - 12;
      return sum;
    }, 0);
    const calendarScore = calendarDirectionScore(calendar, market);
    const macroScore = macroDirectionScore(market, macro);
    const patternModelScore = clamp(
      (combinedSentimentScore * 0.45)
      + (calendarScore * 0.9)
      + (releasedPatternScore * 0.35)
      + (macroScore * 0.45),
      -100,
      100,
    );
    const patternModelBias = formatBias(patternModelScore);
    const patternModelConfidence =
      Math.abs(patternModelScore) >= 28 ? 'high'
        : Math.abs(patternModelScore) >= 14 ? 'medium'
          : 'low';

    const nextEvent = calendar?.events?.find((event: any) => event.isUpcoming) ?? null;
    const checklist: ChecklistItem[] = [
      {
        label: 'Primary market linkage',
        status: catalysts.slice(0, 3).some((item) => item.relevanceScore >= 6) ? 'pass' : 'watch',
        detail: catalysts.length
          ? `${catalysts.slice(0, 3).length} top catalysts are linked to ${market} or its primary currencies.`
          : `No strong market-specific catalyst headlines were detected for ${market}.`,
      },
      {
        label: 'Scheduled catalyst chain',
        status: Math.abs(calendarScore) >= 12 ? 'pass' : nextEvent ? 'watch' : 'fail',
        detail: calendar?.predictiveSignals?.[0]?.summary
          ?? (nextEvent ? `Next event is ${nextEvent.currency} ${nextEvent.event}.` : 'No predictive calendar chain is active right now.'),
      },
      {
        label: 'Headline sentiment',
        status: checklistStatus(combinedSentimentScore),
        detail: `Headline sentiment is ${sentimentLabel} at ${combinedSentimentScore.toFixed(1)} using Yahoo, Finnhub, Finviz, and tracked X/Twitter context when configured.`,
      },
      {
        label: 'Tracked social headline layer',
        status: xIntel?.state === 'active'
          ? (xIntel.clusters?.some((item: any) => item.actionability?.state === 'TRADEABLE_CATALYST' || item.actionability?.state === 'MACRO_BIAS_SHIFT') ? 'pass' : 'watch')
          : 'watch',
        detail: xIntel?.state === 'active'
          ? (xIntel.summary ?? 'Tracked X/Twitter feed is active.')
          : 'Tracked X/Twitter layer is not active, so fast policy/headline posts are not contributing to the current catalyst read.',
      },
      {
        label: 'Macro agreement',
        status: checklistStatus(patternModelScore + macroScore),
        detail: `${macro?.focus?.summary ?? `Macro regime is ${macro?.regime ?? 'unknown'}.`} Pattern model is ${patternModelBias}.`,
      },
      {
        label: 'Release quality',
        status: releasedEventPatterns.length ? 'pass' : 'watch',
        detail: releasedEventPatterns.length
          ? `${releasedEventPatterns.length} released event patterns are available for same-session context.`
          : 'No fresh released event pattern was available to strengthen the catalyst read.',
      },
      {
        label: 'Tradability now',
        status: nextEvent?.minutesUntil != null && nextEvent.minutesUntil <= 45 ? 'fail' : 'watch',
        detail: nextEvent?.minutesUntil != null && nextEvent.minutesUntil <= 45
          ? `${nextEvent.currency} ${nextEvent.event} is too close (${nextEvent.minutesUntil}m) for clean news-chasing.`
          : nextEvent
            ? `${nextEvent.currency} ${nextEvent.event} is next, so news should be treated as setup context rather than blind execution fuel.`
            : 'No immediate primary release is about to hit the tape.',
      },
    ];

    const smartSummary = [
      `Vaultum smart analysis reads ${sentimentLabel} catalyst pressure for ${market}.`,
      calendar?.predictiveSignals?.[0]?.summary ?? 'No active calendar chain is leading the next release.',
      macro?.focus?.summary ?? `Macro regime is ${macro?.regime ?? 'unknown'}.`,
      xIntel?.state === 'active'
        ? `${xIntel.summary} ${xIntel.clusters?.[0] ? `Lead event: ${xIntel.clusters[0].eventType} / ${xIntel.clusters[0].actionability?.state} / ${xIntel.clusters[0].validation?.reactionValidation}.` : ''}`.trim()
        : 'Tracked X/Twitter account flow is not active in this read.',
      nextEvent ? `Next event is ${nextEvent.currency} ${nextEvent.event}.` : 'No immediate primary release is scheduled.',
    ].join(' ');

    const summary = `${market} news-intel reads ${sentimentLabel} sentiment ${combinedSentimentScore.toFixed(1)} with a ${patternModelBias} pattern model (${patternModelConfidence}). ${calendar?.predictiveSignals?.[0]?.summary ?? 'Calendar chain is quiet.'} ${xIntel?.state === 'active' ? `Tracked X/Twitter accounts are contributing through ${xIntel.clusters?.length ?? 0} scored event clusters${xIntel.clusters?.[0] ? `; lead state is ${xIntel.clusters[0].actionability?.state}` : ''}.` : 'Tracked X/Twitter accounts are not contributing to the fast-headline layer right now.'}`;
    const blindspots = [
      'This layer uses a labeled Vaultum pattern model plus tracked-account social scoring, not a direct JB-News/JBlanked machine-learning feed.',
      !finnhubConfigured() ? 'Finnhub news sentiment is not configured, so sentiment is being derived mainly from lexical headlines plus calendar and macro context.' : null,
      'Public headlines can lag what rates, options, or real-money flows have already priced.',
      nextEvent?.minutesUntil != null && nextEvent.minutesUntil <= 45
        ? `${nextEvent.currency} ${nextEvent.event} is close enough that post-release repricing can invalidate the headline read quickly.`
        : null,
      ...(xIntel?.blindspots ?? []).slice(0, 2),
    ].filter((item): item is string => Boolean(item));
    const snapshotMeta = buildFeedSnapshotMeta({
      label: 'News Intelligence',
      generatedAt: new Date().toISOString(),
      staleAfterMinutes: 180,
      sourceMode: xIntel?.state === 'active'
        ? 'mixed'
        : finnhubConfigured()
          ? 'mixed'
          : 'proxy',
      available: Boolean(catalysts.length || releasedEventPatterns.length || calendar?.predictiveSignals?.length),
      fallbackState: xIntel?.state === 'error' ? 'fallback' : 'primary',
      detail: summary,
      extraHaircut: xIntel?.state !== 'active' ? 0.05 : 0,
    });

    return {
      generatedAt: snapshotMeta.generatedAt,
      market,
      timeframe,
      query,
      summary,
      snapshotMeta,
      sourceLabel: `Vaultum news intelligence combines Yahoo headline search, Finnhub market/company news and sentiment when configured, Finviz news/blog context, the live economic calendar,${xIntel?.state === 'active' ? ' a tracked X/Twitter account layer,' : ''} and a labeled Vaultum pattern model inspired by JB-News structure.`,
      sentiment: {
        score: Number(combinedSentimentScore.toFixed(1)),
        label: sentimentLabel,
        summary: `Headline sentiment is ${sentimentLabel} at ${combinedSentimentScore.toFixed(1)} for ${market}.`,
        finnhubNewsScore: finnhubSentimentScore,
        xNewsScore: xIntel?.sentiment?.score ?? null,
      },
      patternModel: {
        label: 'Vaultum Pattern Model',
        score: Number(patternModelScore.toFixed(1)),
        bias: patternModelBias,
        confidence: patternModelConfidence,
        summary: `Vaultum pattern model leans ${patternModelBias} with ${patternModelConfidence} confidence from headline sentiment, released-event patterns, calendar chain, and macro agreement.`,
        components: [
          `headline sentiment ${combinedSentimentScore.toFixed(1)}`,
          `calendar chain ${calendarScore}`,
          `released-event patterns ${releasedPatternScore}`,
          `macro alignment ${macroScore}`,
        ],
      },
      smartAnalysis: {
        bias: patternModelBias,
        summary: smartSummary,
        notes: [
          calendar?.heuristicsSummary ?? null,
          macro?.focus?.executionFocus ?? null,
          macro?.ratesDifferentials?.focus?.summary ?? null,
          xIntel?.state === 'active' ? xIntel.sentiment?.summary ?? null : null,
        ].filter((item): item is string => Boolean(item)),
      },
      predictionChecklist: checklist,
      catalysts,
      xIntel,
      releasedEventPatterns,
      nextEvent: nextEvent
        ? {
          currency: nextEvent.currency,
          event: nextEvent.event,
          date: nextEvent.date,
          minutesUntil: nextEvent.minutesUntil,
          impact: nextEvent.impact,
          priority: nextEvent.priority,
        }
        : null,
      blindspots,
    };
  }, 300);
}
