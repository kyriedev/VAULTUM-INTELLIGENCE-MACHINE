import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { getEconomicCalendar } from '../../calendar/v1/get-economic-calendar';
import { getMacroSignals } from '../../macro/v1/get-macro-signals';
import { getFlowProxy } from '../../options/v1/get-flow-proxy';
import { getOrderflowEngine } from '../../orderflow/v1/get-engine';
import { getLevels } from '../../pivots/v1/get-levels';
import { getMonteCarloScenario } from '../../scenario/v1/get-monte-carlo';
import { getBuyerSellerPressure } from '../../pressure/v1/get-buyer-seller-pressure';
import { listCommodityQuotes } from '../../market/v1/list-commodity-quotes';
import { getFearGreedIndex } from '../../market/v1/get-fear-greed-index';
import { listMarketQuotes } from '../../market/v1/list-market-quotes';

type BriefQuote = {
  symbol: string;
  display: string;
  price: number | null;
  change: number | null;
  stance: 'bullish' | 'neutral' | 'defensive';
  note: string;
};

const WATCHLIST: Record<string, Array<{ symbol: string; display: string; commodity?: boolean }>> = {
  XAUUSD: [
    { symbol: 'GC=F', display: 'Gold' },
    { symbol: 'DX-Y.NYB', display: 'DXY' },
    { symbol: '^TNX', display: 'US10Y' },
    { symbol: '^VIX', display: 'VIX' },
  ],
  GBPUSD: [
    { symbol: 'GBPUSD=X', display: 'GBPUSD' },
    { symbol: 'DX-Y.NYB', display: 'DXY' },
    { symbol: '^TNX', display: 'US10Y' },
    { symbol: '^VIX', display: 'VIX' },
  ],
  EURUSD: [
    { symbol: 'EURUSD=X', display: 'EURUSD' },
    { symbol: 'DX-Y.NYB', display: 'DXY' },
    { symbol: '^TNX', display: 'US10Y' },
    { symbol: '^VIX', display: 'VIX' },
  ],
  USDJPY: [
    { symbol: 'USDJPY=X', display: 'USDJPY' },
    { symbol: 'JPY=X', display: 'JPY' },
    { symbol: '^TNX', display: 'US10Y' },
    { symbol: '^VIX', display: 'VIX' },
  ],
  SPX: [
    { symbol: '^GSPC', display: 'SPX' },
    { symbol: '^IXIC', display: 'NDX' },
    { symbol: '^VIX', display: 'VIX' },
    { symbol: 'DX-Y.NYB', display: 'DXY' },
  ],
  NDX: [
    { symbol: '^IXIC', display: 'NDX' },
    { symbol: '^GSPC', display: 'SPX' },
    { symbol: '^VIX', display: 'VIX' },
    { symbol: 'DX-Y.NYB', display: 'DXY' },
  ],
  WTI: [
    { symbol: 'CL=F', display: 'WTI', commodity: true },
    { symbol: 'BZ=F', display: 'Brent', commodity: true },
    { symbol: 'GC=F', display: 'Gold', commodity: true },
    { symbol: 'DX-Y.NYB', display: 'DXY' },
  ],
};

function resolveMarket(market: string | undefined): string {
  const normalized = String(market || 'XAUUSD').toUpperCase();
  return WATCHLIST[normalized] ? normalized : 'XAUUSD';
}

function fmtMove(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function stanceForMove(change: number | null | undefined): 'bullish' | 'neutral' | 'defensive' {
  if (change == null || Number.isNaN(change)) return 'neutral';
  if (change >= 0.7) return 'bullish';
  if (change <= -0.7) return 'defensive';
  return 'neutral';
}

function noteForQuote(display: string, change: number | null | undefined): string {
  const stance = stanceForMove(change);
  if (display === 'VIX') return change != null && change > 0 ? 'volatility is expanding' : 'volatility is contained';
  if (display === 'DXY') return change != null && change > 0 ? 'dollar pressure is rising' : 'dollar pressure is easing';
  if (display === 'US10Y') return change != null && change > 0 ? 'yields are pressing risk' : 'yields are easing';
  if (stance === 'bullish') return 'price action is constructive';
  if (stance === 'defensive') return 'price action is under pressure';
  return 'tape is balanced';
}

function findQuote(quotes: Array<{ symbol: string; price: number; change: number }>, symbols: string[]): { price: number; change: number } | null {
  for (const symbol of symbols) {
    const hit = quotes.find((quote) => quote.symbol === symbol);
    if (hit) return { price: hit.price, change: hit.change };
  }
  return null;
}

export async function getMarketBrief(input: { market?: string; timeframe?: string }): Promise<any> {
  const market = resolveMarket(input.market);
  const timeframe = String(input.timeframe || '1h').toLowerCase();
  const key = cacheKey('intelligence', `market-brief:${market}:${timeframe}`);

  return getCachedOrCompute(key, async () => {
    const watchlist = WATCHLIST[market] ?? WATCHLIST.XAUUSD;
    const marketSymbols = watchlist.filter((item) => !item.commodity).map((item) => item.symbol);
    const commoditySymbols = watchlist.filter((item) => item.commodity).map((item) => item.symbol);

    const [
      marketQuotes,
      commodityQuotes,
      fearGreed,
      macroSignals,
      calendar,
      pivots,
      pressure,
      orderflow,
      flowProxy,
      scenario,
    ] = await Promise.all([
      marketSymbols.length ? listMarketQuotes({ symbols: marketSymbols }) : Promise.resolve({ quotes: [] }),
      commoditySymbols.length ? listCommodityQuotes({ symbols: commoditySymbols }) : Promise.resolve({ quotes: [] }),
      getFearGreedIndex(),
      getMacroSignals(),
      getEconomicCalendar({ market }),
      getLevels({ market, timeframe: timeframe === '1d' ? '1d' : '1h' }),
      getBuyerSellerPressure({ market, mode: 'auto' }),
      getOrderflowEngine({ market, timeframe }),
      getFlowProxy({ symbol: market }),
      getMonteCarloScenario({ market, timeframe }),
    ]);

    const combinedQuotes = [
      ...(marketQuotes?.quotes ?? []),
      ...(commodityQuotes?.quotes ?? []),
    ];

    const watchItems: BriefQuote[] = watchlist.map((item) => {
      const hit = findQuote(combinedQuotes, [item.symbol, item.display, market, `${market}=X`]);
      const change = hit?.change ?? null;
      return {
        symbol: item.symbol,
        display: item.display,
        price: hit?.price ?? null,
        change,
        stance: stanceForMove(change),
        note: noteForQuote(item.display, change),
      };
    });

    const support = pivots?.mappedSupport?.price ?? pivots?.supports?.[0] ?? pivots?.pivot ?? null;
    const resistance = pivots?.mappedResistance?.price ?? pivots?.resistances?.[0] ?? pivots?.pivot ?? null;
    const pathBias = String(scenario?.pathBias ?? 'mixed').toLowerCase();
    const pressureBias = String(pressure?.dominance ?? 'balanced').toLowerCase();
    const orderflowBias = String(orderflow?.dominance ?? 'balanced').toLowerCase();
    const macroBias = String(macroSignals?.goldBias ?? macroSignals?.regime ?? 'mixed').toLowerCase();

    const bullishVotes = [
      /bull|constructive|buy|risk-on/.test(pathBias),
      /bull|buy/.test(pressureBias),
      /bull|buy/.test(orderflowBias),
      /bull|easing|support/.test(macroBias),
      Number(fearGreed?.compositeScore ?? 50) >= 55,
    ].filter(Boolean).length;
    const bearishVotes = [
      /bear|defensive|risk-off|sell/.test(pathBias),
      /sell|bear/.test(pressureBias),
      /sell|bear/.test(orderflowBias),
      /tightening|fragile|soft/.test(macroBias),
      Number(fearGreed?.compositeScore ?? 50) <= 45,
    ].filter(Boolean).length;

    const stance = bullishVotes > bearishVotes ? 'bullish' : bearishVotes > bullishVotes ? 'defensive' : 'neutral';
    const confidence = Math.abs(bullishVotes - bearishVotes) >= 2 ? 'high' : 'medium';

    const summary = `${
      market
    } reads ${stance} with ${macroSignals?.regime ?? 'macro context mixed'}, ${orderflow?.summary ?? 'orderflow mixed'}, and Vaultum sentiment at ${
      fearGreed?.compositeScore?.toFixed?.(1) ?? 'n/a'
    }.`;

    const actionPlan = stance === 'bullish'
      ? `Favor pullbacks above ${support != null ? support.toFixed(2) : 'the nearest support cluster'} and only chase if pressure re-accelerates through ${resistance != null ? resistance.toFixed(2) : 'the next resistance shelf'}.`
      : stance === 'defensive'
        ? `Respect resistance around ${resistance != null ? resistance.toFixed(2) : 'the active sell shelf'} and avoid forcing longs unless price reclaims ${support != null ? support.toFixed(2) : 'support'} with better flow.`
        : `Treat ${support != null ? support.toFixed(2) : 'support'} to ${resistance != null ? resistance.toFixed(2) : 'resistance'} as the active decision box and wait for clean confirmation before sizing up.`;

    const nextEvent = calendar?.events?.find((event: any) => event.isUpcoming);

    const riskWatch = [
      nextEvent?.event
        ? `Next event: ${nextEvent.event}`
        : null,
      orderflow?.priceDeltaDivergence && orderflow.priceDeltaDivergence !== 'none'
        ? `Price/delta divergence: ${orderflow.divergenceDetail}`
        : null,
      flowProxy?.squeezeRisk ? `Squeeze risk: ${flowProxy.squeezeRisk}` : null,
      pressure?.mode && pressure.mode !== 'direct'
        ? `Pressure mode: ${pressure.mode}`
        : null,
    ].filter((value): value is string => Boolean(value));

    return {
      generatedAt: new Date().toISOString(),
      market,
      timeframe,
      stance,
      confidence,
      sourceLabel: 'Vaultum market brief built from live market quotes, economic calendar, structure, pressure, orderflow, scenario, and sentiment engines.',
      summary,
      actionPlan,
      riskWatch: riskWatch.join(' | ') || 'No immediate extra risk flag beyond the active structure and macro regime.',
      watchlist: watchItems,
      confirmationChecklist: [
        support != null ? `Hold above ${support.toFixed(2)}` : 'Hold the active support cluster',
        resistance != null ? `Clear ${resistance.toFixed(2)} with follow-through` : 'Clear the active resistance cluster',
        pressure?.dominance ? `${pressure.dominance} pressure must stay in control` : 'Pressure must stay aligned',
        scenario?.targetHitProbability != null ? `Monte Carlo target probability ${scenario.targetHitProbability.toFixed(1)}% or better` : 'Scenario edge should remain supportive',
      ],
      metrics: {
        sentiment: fearGreed?.compositeScore ?? null,
        sentimentLabel: fearGreed?.compositeLabel ?? 'unknown',
        macro: macroSignals?.regime ?? 'unknown',
        pressure: pressure?.dominance ?? 'unknown',
        orderflow: orderflow?.dominance ?? 'unknown',
        targetHitProbability: scenario?.targetHitProbability ?? null,
        invalidationProbability: scenario?.invalidationProbability ?? null,
      },
    };
  }, 240);
}
