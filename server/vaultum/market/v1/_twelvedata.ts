import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import {
  fetchTwelveDataIndicator,
  fetchTwelveDataMarketState,
  fetchTwelveDataQuote,
  resolveTwelveDataSymbol,
  twelveDataConfigured,
} from '../../_shared/twelvedata';

type TwelveDataResearchTone = 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'alert';

type TwelveDataResearchCard = {
  key: string;
  label: string;
  value: string;
  tone: TwelveDataResearchTone;
  detail: string;
};

type TwelveDataIndicators = {
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  adx: number | null;
  plusDi: number | null;
  minusDi: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  sma200: number | null;
  atr: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  vwap: number | null;
};

export type TwelveDataResearchResponse = {
  generatedAt: string;
  market: string;
  query: string;
  requestedTimeframe: string;
  selectedInterval: string;
  matchedSymbolId: string | null;
  matchedSymbol: string | null;
  matchedDescription: string | null;
  exchange: string | null;
  type: string | null;
  country: string | null;
  currency: string | null;
  price: number | null;
  percentChange: number | null;
  marketStateLabel: string | null;
  marketOpen: boolean | null;
  selectedRecommendation: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell' | 'unavailable';
  consensus: 'bullish' | 'bearish' | 'mixed' | 'neutral' | 'unavailable';
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  sourceLabel: string;
  warnings: string[];
  cards: TwelveDataResearchCard[];
  indicators: TwelveDataIndicators;
  unavailable?: boolean;
};

function resolveMarket(input?: string): string {
  const normalized = String(input || 'XAUUSD').trim().toUpperCase();
  const aliases: Record<string, string> = {
    GOLD: 'XAUUSD',
    'GC=F': 'XAUUSD',
    OIL: 'WTI',
    'CL=F': 'WTI',
    'EURUSD=X': 'EURUSD',
    'GBPUSD=X': 'GBPUSD',
    'USDJPY=X': 'USDJPY',
    'GBPJPY=X': 'GBPJPY',
    'EURJPY=X': 'EURJPY',
    '^GSPC': 'SPX',
    '^IXIC': 'NDX',
    '^DJI': 'US30',
    DJI: 'US30',
    DIA: 'US30',
    'YM=F': 'US30',
    'DX-Y.NYB': 'DXY',
    'BTC-USD': 'BTCUSD',
  };
  return aliases[normalized] ?? normalized;
}

function toNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function fmt(value: number | null | undefined, digits = 2, suffix = ''): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return `${value.toFixed(digits)}${suffix}`;
}

function recommendationFromScore(score: number | null): TwelveDataResearchResponse['selectedRecommendation'] {
  if (score == null || Number.isNaN(score)) return 'unavailable';
  if (score >= 65) return 'strong-buy';
  if (score >= 25) return 'buy';
  if (score <= -65) return 'strong-sell';
  if (score <= -25) return 'sell';
  return 'neutral';
}

function toneFromRecommendation(value: TwelveDataResearchResponse['selectedRecommendation']): TwelveDataResearchTone {
  if (value === 'strong-buy' || value === 'buy') return 'bullish';
  if (value === 'strong-sell' || value === 'sell') return 'bearish';
  if (value === 'unavailable') return 'mixed';
  return 'neutral';
}

function confidenceFromScore(score: number | null, completeness: number): 'low' | 'medium' | 'high' {
  const magnitude = Math.abs(score ?? 0);
  if (magnitude >= 65 && completeness >= 8) return 'high';
  if (magnitude >= 25 && completeness >= 5) return 'medium';
  return 'low';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeScore(indicators: TwelveDataIndicators, price: number | null): number | null {
  if (price == null) return null;

  let score = 0;
  let weight = 0;

  const priceEmaChecks = [
    indicators.ema20 != null ? (price > indicators.ema20 ? 1 : -1) : null,
    indicators.ema50 != null ? (price > indicators.ema50 ? 1 : -1) : null,
    indicators.ema200 != null ? (price > indicators.ema200 ? 1 : -1) : null,
    indicators.sma200 != null ? (price > indicators.sma200 ? 0.75 : -0.75) : null,
    indicators.vwap != null ? (price > indicators.vwap ? 0.5 : -0.5) : null,
  ].filter((value): value is number => value != null);

  priceEmaChecks.forEach((value) => {
    score += value * 14;
    weight += 14;
  });

  if (indicators.ema20 != null && indicators.ema50 != null) {
    score += (indicators.ema20 > indicators.ema50 ? 1 : -1) * 12;
    weight += 12;
  }
  if (indicators.ema50 != null && indicators.ema200 != null) {
    score += (indicators.ema50 > indicators.ema200 ? 1 : -1) * 12;
    weight += 12;
  }

  if (indicators.rsi != null) {
    const rsiScore = indicators.rsi >= 62
      ? 1
      : indicators.rsi >= 54
        ? 0.5
        : indicators.rsi <= 38
          ? -1
          : indicators.rsi <= 46
            ? -0.5
            : 0;
    score += rsiScore * 12;
    weight += 12;
  }

  if (indicators.macd != null && indicators.macdSignal != null) {
    const macdBias = indicators.macd > indicators.macdSignal ? 1 : indicators.macd < indicators.macdSignal ? -1 : 0;
    score += macdBias * 16;
    weight += 16;
  }

  if (indicators.adx != null && indicators.plusDi != null && indicators.minusDi != null) {
    const directional = indicators.plusDi > indicators.minusDi ? 1 : indicators.plusDi < indicators.minusDi ? -1 : 0;
    const strength = clamp((indicators.adx - 15) / 20, 0, 1);
    score += directional * strength * 18;
    weight += 18;
  }

  if (indicators.bbUpper != null && indicators.bbLower != null && indicators.bbMiddle != null) {
    if (price > indicators.bbUpper) score -= 8;
    else if (price < indicators.bbLower) score += 8;
    else if (price > indicators.bbMiddle) score += 4;
    else if (price < indicators.bbMiddle) score -= 4;
    weight += 8;
  }

  return weight ? Number(clamp((score / weight) * 100, -100, 100).toFixed(1)) : null;
}

function buildSummary(
  matchLabel: string,
  timeframe: string,
  recommendation: TwelveDataResearchResponse['selectedRecommendation'],
  marketStateLabel: string | null,
): string {
  if (recommendation === 'unavailable') {
    return `Twelve Data research is unavailable for ${matchLabel} on ${timeframe}.`;
  }
  const statePart = marketStateLabel ? ` while ${marketStateLabel}` : '';
  return `${matchLabel} reads ${recommendation} on ${timeframe}${statePart}.`;
}

function marketStateLabel(payload: { market_state?: string; session?: string; is_market_open?: boolean } | null): string | null {
  if (!payload) return null;
  const state = String(payload.market_state || payload.session || '').trim();
  if (state) return state.toLowerCase();
  if (payload.is_market_open === true) return 'market open';
  if (payload.is_market_open === false) return 'market closed';
  return null;
}

export async function getTwelveDataResearch(input: {
  market?: string;
  timeframe?: string;
  query?: string;
}): Promise<TwelveDataResearchResponse> {
  const market = resolveMarket(input.market);
  const requestedTimeframe = String(input.timeframe || '1h').toLowerCase();
  const key = cacheKey('market', `twelve-data-research:${market}:${requestedTimeframe}:${String(input.query || '').toUpperCase()}`);

  return getCachedOrCompute(key, async () => {
    if (!twelveDataConfigured()) {
      return {
        generatedAt: new Date().toISOString(),
        market,
        query: String(input.query || market),
        requestedTimeframe,
        selectedInterval: requestedTimeframe,
        matchedSymbolId: null,
        matchedSymbol: null,
        matchedDescription: null,
        exchange: null,
        type: null,
        country: null,
        currency: null,
        price: null,
        percentChange: null,
        marketStateLabel: null,
        marketOpen: null,
        selectedRecommendation: 'unavailable',
        consensus: 'unavailable',
        confidence: 'low',
        summary: 'Twelve Data is not configured for this Vaultum deployment.',
        sourceLabel: 'Twelve Data sidecar is optional and not configured here. Vaultum still relies on its own live engines and other providers.',
        warnings: ['TWELVEDATA_API_KEY is missing.'],
        cards: [],
        indicators: {
          rsi: null,
          macd: null,
          macdSignal: null,
          macdHist: null,
          adx: null,
          plusDi: null,
          minusDi: null,
          ema20: null,
          ema50: null,
          ema200: null,
          sma200: null,
          atr: null,
          bbUpper: null,
          bbMiddle: null,
          bbLower: null,
          vwap: null,
        },
        unavailable: true,
      };
    }

    const match = await resolveTwelveDataSymbol(market, input.query);
    if (!match) {
      return {
        generatedAt: new Date().toISOString(),
        market,
        query: String(input.query || market),
        requestedTimeframe,
        selectedInterval: requestedTimeframe,
        matchedSymbolId: null,
        matchedSymbol: null,
        matchedDescription: null,
        exchange: null,
        type: null,
        country: null,
        currency: null,
        price: null,
        percentChange: null,
        marketStateLabel: null,
        marketOpen: null,
        selectedRecommendation: 'unavailable',
        consensus: 'unavailable',
        confidence: 'low',
        summary: `Twelve Data symbol discovery did not return a usable match for ${market}.`,
        sourceLabel: 'Twelve Data is a supplemental technical-indicator and market-state sidecar, not Vaultum quote truth.',
        warnings: ['No Twelve Data symbol match was found for the requested market.'],
        cards: [],
        indicators: {
          rsi: null,
          macd: null,
          macdSignal: null,
          macdHist: null,
          adx: null,
          plusDi: null,
          minusDi: null,
          ema20: null,
          ema50: null,
          ema200: null,
          sma200: null,
          atr: null,
          bbUpper: null,
          bbMiddle: null,
          bbLower: null,
          vwap: null,
        },
        unavailable: true,
      };
    }

    const [quote, state, rsiRaw, macdRaw, adxRaw, ema20Raw, ema50Raw, ema200Raw, sma200Raw, atrRaw, bbandsRaw, vwapRaw] = await Promise.all([
      fetchTwelveDataQuote(match),
      fetchTwelveDataMarketState(match),
      fetchTwelveDataIndicator(match, 'rsi', requestedTimeframe, { time_period: 14 }),
      fetchTwelveDataIndicator(match, 'macd', requestedTimeframe, { fast_period: 12, slow_period: 26, signal_period: 9 }),
      fetchTwelveDataIndicator(match, 'adx', requestedTimeframe, { time_period: 14 }),
      fetchTwelveDataIndicator(match, 'ema', requestedTimeframe, { time_period: 20 }),
      fetchTwelveDataIndicator(match, 'ema', requestedTimeframe, { time_period: 50 }),
      fetchTwelveDataIndicator(match, 'ema', requestedTimeframe, { time_period: 200 }),
      fetchTwelveDataIndicator(match, 'sma', requestedTimeframe, { time_period: 200 }),
      fetchTwelveDataIndicator(match, 'atr', requestedTimeframe, { time_period: 14 }),
      fetchTwelveDataIndicator(match, 'bbands', requestedTimeframe, { time_period: 20, sd: 2, ma_type: 'SMA' }),
      ['15m', '30m', '1h', '4h'].includes(requestedTimeframe)
        ? fetchTwelveDataIndicator(match, 'vwap', requestedTimeframe, {})
        : Promise.resolve(null),
    ]);

    const indicators: TwelveDataIndicators = {
      rsi: toNumber(rsiRaw?.rsi),
      macd: toNumber(macdRaw?.macd),
      macdSignal: toNumber(macdRaw?.macd_signal),
      macdHist: toNumber(macdRaw?.macd_hist),
      adx: toNumber(adxRaw?.adx),
      plusDi: toNumber(adxRaw?.plus_di),
      minusDi: toNumber(adxRaw?.minus_di),
      ema20: toNumber(ema20Raw?.ema),
      ema50: toNumber(ema50Raw?.ema),
      ema200: toNumber(ema200Raw?.ema),
      sma200: toNumber(sma200Raw?.sma),
      atr: toNumber(atrRaw?.atr),
      bbUpper: toNumber(bbandsRaw?.upper_band),
      bbMiddle: toNumber(bbandsRaw?.middle_band),
      bbLower: toNumber(bbandsRaw?.lower_band),
      vwap: toNumber(vwapRaw?.vwap),
    };

    const score = computeScore(indicators, quote.price);
    const selectedRecommendation = recommendationFromScore(score);
    const consensus = selectedRecommendation === 'unavailable'
      ? 'unavailable'
      : selectedRecommendation === 'neutral'
        ? 'neutral'
        : toneFromRecommendation(selectedRecommendation) === 'bullish'
          ? 'bullish'
          : 'bearish';
    const completeness = Object.values(indicators).filter((value) => value != null).length;
    const confidence = confidenceFromScore(score, completeness);
    const stateLabel = marketStateLabel(state);
    const warnings: string[] = [];

    if (indicators.rsi != null && indicators.rsi >= 70) warnings.push(`RSI ${indicators.rsi.toFixed(1)} is stretched / overbought.`);
    if (indicators.rsi != null && indicators.rsi <= 30) warnings.push(`RSI ${indicators.rsi.toFixed(1)} is stretched / oversold.`);
    if (indicators.adx != null && indicators.adx < 18) warnings.push(`ADX ${indicators.adx.toFixed(1)} is soft, so trend conviction is limited.`);
    if (quote.price != null && indicators.bbUpper != null && quote.price >= indicators.bbUpper) warnings.push('Price is pressing the upper Bollinger band; chase risk is higher.');
    if (quote.price != null && indicators.bbLower != null && quote.price <= indicators.bbLower) warnings.push('Price is pressing the lower Bollinger band; breakdown/exhaustion risk is higher.');
    if (state?.is_market_open === false) warnings.push('Matched market is currently closed, so indicator state is static until the next session opens.');
    if (completeness < 5) warnings.push('Twelve Data returned a partial indicator set for this market/timeframe.');

    const atrPct = quote.price && indicators.atr ? (indicators.atr / quote.price) * 100 : null;
    const cards: TwelveDataResearchCard[] = [
      {
        key: 'session',
        label: 'Session',
        value: stateLabel ?? 'unknown',
        tone: state?.is_market_open === false ? 'alert' : 'neutral',
        detail: `Matched ${match.id} ${state?.is_market_open === true ? 'is trading live' : state?.is_market_open === false ? 'is outside its live session' : 'has no explicit session flag'}.`,
      },
      {
        key: 'trend',
        label: 'Trend Stack',
        value: `${fmt(quote.price)} vs EMA20 ${fmt(indicators.ema20)} / EMA50 ${fmt(indicators.ema50)} / EMA200 ${fmt(indicators.ema200)}`,
        tone: toneFromRecommendation(selectedRecommendation),
        detail: `Trend score uses price location versus EMA20/50/200, SMA200, and optional VWAP on ${requestedTimeframe}.`,
      },
      {
        key: 'momentum',
        label: 'Momentum',
        value: `RSI ${fmt(indicators.rsi, 1)} | MACD ${fmt(indicators.macd, 3)} vs ${fmt(indicators.macdSignal, 3)}`,
        tone: indicators.rsi != null && indicators.rsi >= 54 && (indicators.macd ?? 0) >= (indicators.macdSignal ?? 0)
          ? 'bullish'
          : indicators.rsi != null && indicators.rsi <= 46 && (indicators.macd ?? 0) <= (indicators.macdSignal ?? 0)
            ? 'bearish'
            : 'neutral',
        detail: `Momentum reads MACD histogram ${fmt(indicators.macdHist, 3)} with RSI14 ${fmt(indicators.rsi, 1)}.`,
      },
      {
        key: 'strength',
        label: 'Trend Strength',
        value: `ADX ${fmt(indicators.adx, 1)} | +DI ${fmt(indicators.plusDi, 1)} / -DI ${fmt(indicators.minusDi, 1)}`,
        tone: indicators.adx != null && indicators.adx >= 22
          ? (indicators.plusDi ?? 0) >= (indicators.minusDi ?? 0) ? 'bullish' : 'bearish'
          : 'mixed',
        detail: 'ADX and directional movement show whether the current push is trending cleanly or chopping.',
      },
      {
        key: 'volatility',
        label: 'Volatility',
        value: `ATR ${fmt(indicators.atr, 2)}${atrPct != null ? ` (${fmt(atrPct, 2, '%')})` : ''}`,
        tone: atrPct != null && atrPct >= 1.2 ? 'alert' : 'neutral',
        detail: `Band location ${fmt(quote.price != null && indicators.bbUpper != null ? ((quote.price - (indicators.bbLower ?? quote.price)) / Math.max((indicators.bbUpper - (indicators.bbLower ?? quote.price)), 0.0001)) : null, 2)} across BBANDS ${fmt(indicators.bbLower)} / ${fmt(indicators.bbMiddle)} / ${fmt(indicators.bbUpper)}.`,
      },
      {
        key: 'structure',
        label: 'Structure',
        value: `SMA200 ${fmt(indicators.sma200)}${indicators.vwap != null ? ` | VWAP ${fmt(indicators.vwap)}` : ''}`,
        tone: quote.price != null && indicators.sma200 != null
          ? quote.price >= indicators.sma200 ? 'bullish' : 'bearish'
          : 'neutral',
        detail: indicators.vwap != null
          ? 'Long-horizon structure uses SMA200 while intraday anchoring uses VWAP when Twelve Data exposes it.'
          : 'Long-horizon structure uses SMA200; VWAP is only requested on intraday intervals.',
      },
    ];

    return {
      generatedAt: new Date().toISOString(),
      market,
      query: match.query,
      requestedTimeframe,
      selectedInterval: requestedTimeframe,
      matchedSymbolId: match.id,
      matchedSymbol: match.symbol,
      matchedDescription: match.description,
      exchange: match.exchange,
      type: match.type,
      country: match.country,
      currency: match.currency,
      price: quote.price,
      percentChange: quote.percentChange,
      marketStateLabel: stateLabel,
      marketOpen: state?.is_market_open ?? null,
      selectedRecommendation,
      consensus,
      confidence,
      summary: buildSummary(match.id, requestedTimeframe, selectedRecommendation, stateLabel),
      sourceLabel: 'Twelve Data is a supplemental technical-indicator and market-state sidecar. It strengthens technical confirmation and symbol coverage, but it does not replace Vaultum quote truth or orderflow engines.',
      warnings,
      cards,
      indicators,
      unavailable: false,
    };
  }, 240);
}
