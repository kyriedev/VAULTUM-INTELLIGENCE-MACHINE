import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { describeBrokerStack } from '../../_shared/feed-status';
import { getEconomicCalendar } from '../../calendar/v1/get-economic-calendar';
import { getMacroSignals } from '../../macro/v1/get-macro-signals';
import { listCommodityQuotes } from '../../market/v1/list-commodity-quotes';
import { getFearGreedIndex } from '../../market/v1/get-fear-greed-index';
import { listMarketQuotes } from '../../market/v1/list-market-quotes';
import { getTradingViewResearch } from '../../market/v1/_tradingview';
import { getTwelveDataResearch } from '../../market/v1/_twelvedata';
import { getFinnhubResearch } from '../../market/v1/_finnhub-research';
import { getDealerPressure } from '../../options/v1/get-dealer-pressure';
import { getFlowProxy } from '../../options/v1/get-flow-proxy';
import { getGammaLevels } from '../../options/v1/get-gamma-levels';
import { getOrderflowEngine } from '../../orderflow/v1/get-engine';
import { getLevels } from '../../pivots/v1/get-levels';
import { getCryptoDerivativesContext } from '../../positioning/v1/get-crypto-derivatives-context';
import { listPredictionMarkets } from '../../prediction/v1/list-prediction-markets';
import { getBuyerSellerPressure } from '../../pressure/v1/get-buyer-seller-pressure';
import { getPortfolioOverlay } from '../../portfolio/v1/get-overlay';
import { getMonteCarloScenario } from '../../scenario/v1/get-monte-carlo';
import { getProfile } from '../../volume/v1/get-profile';
import { createVaultumAnalyticsContext } from './_context';
import { buildDeskRecommendation, type DeskRecommendation } from './_desk-recommendation';
import { getEntryMap } from './get-entry-map';
import { buildExecutionRiskEnvelope, getTechnicalCommittee, type ExecutionRiskEnvelope, type TechnicalCommitteeResponse } from './_execution-committee';
import { runVaultumProcessorGraph, type VaultumProcessor } from './_processor';
import { recallSituationMemories, rememberSituation, type SituationMemoryMatch } from './_situation-memory';

type BriefQuote = {
  symbol: string;
  display: string;
  price: number | null;
  change: number | null;
  stance: 'bullish' | 'neutral' | 'defensive';
  note: string;
};

type TraderReportMeasure = {
  key: string;
  label: string;
  value: string;
  status: 'confirmed' | 'derived' | 'estimated';
  detail: string;
};

type TraderReportSection = {
  title: string;
  body: string;
  tone: 'neutral' | 'bullish' | 'bearish' | 'alert';
};

type TraderReportDecisionStage = {
  key: 'analyst-team' | 'technical-committee' | 'bull-case' | 'bear-case' | 'risk-envelope' | 'risk-team' | 'portfolio-manager';
  title: string;
  body: string;
  tone: 'neutral' | 'bullish' | 'bearish' | 'alert';
};

type TraderReportSignalDiagnostic = {
  key: string;
  label: string;
  confidenceScore: number;
  confidence: 'low' | 'medium' | 'high';
  status: 'confirmed' | 'derived' | 'estimated';
  summary: string;
  sources: string[];
};

type ExecutionCommitteeVote = {
  key: string;
  label: string;
  signal: 'bullish' | 'neutral' | 'bearish';
  confidence: number;
  weight: number;
};

type ExecutionCommitteeSummary = {
  action: 'lean-long' | 'lean-short' | 'wait' | 'stand-down';
  ensembleScore: number;
  summary: string;
  votes: ExecutionCommitteeVote[];
};

export type TraderReportResponse = {
  generatedAt: string;
  market: string;
  timeframe: string;
  structuralTimeframe: string;
  requestId: string;
  reportStyle: 'desk' | 'execution';
  sourceLabel: string;
  sourceTrace: string[];
  summary: string;
  stance: string;
  confidence: 'low' | 'medium' | 'high';
  actionPlan: string;
  riskWatch: string;
  reportMeasures: TraderReportMeasure[];
  decisionStages: TraderReportDecisionStage[];
  signalDiagnostics: TraderReportSignalDiagnostic[];
  deskRecommendation: DeskRecommendation;
  executionCommittee: ExecutionCommitteeSummary;
  riskEnvelope: ExecutionRiskEnvelope;
  memoryMatches: Array<{
    createdAt: string;
    outcome: 'win' | 'loss' | 'flat' | 'open' | null;
    similarityScore: number;
    recommendation: string;
  }>;
  sections: {
    opening: TraderReportSection;
    structure: TraderReportSection;
    flow: TraderReportSection;
    scenario: TraderReportSection;
    risk: TraderReportSection;
    execution: TraderReportSection;
  };
  watchlist: BriefQuote[];
  confirmationChecklist: string[];
  invalidationChecklist: string[];
  warnings: string[];
  metrics: {
    sentiment: number | null;
    sentimentLabel: string;
    macro: string;
    pressure: string;
    orderflow: string;
    targetHitProbability: number | null;
    invalidationProbability: number | null;
  };
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
  US30: [
    { symbol: 'DIA', display: 'US30' },
    { symbol: 'SPY', display: 'SPX' },
    { symbol: 'VIXY', display: 'VIX' },
    { symbol: 'UUP', display: 'DXY' },
  ],
  WTI: [
    { symbol: 'CL=F', display: 'WTI', commodity: true },
    { symbol: 'BZ=F', display: 'Brent', commodity: true },
    { symbol: 'GC=F', display: 'Gold', commodity: true },
    { symbol: 'DX-Y.NYB', display: 'DXY' },
  ],
};

function resolveMarket(market?: string): string {
  const normalized = String(market || 'XAUUSD').toUpperCase();
  const aliases: Record<string, string> = {
    GOLD: 'XAUUSD',
    'GC=F': 'XAUUSD',
    OIL: 'WTI',
    'CL=F': 'WTI',
    '^GSPC': 'SPX',
    SPY: 'SPX',
    '^IXIC': 'NDX',
    QQQ: 'NDX',
    '^DJI': 'US30',
    DJI: 'US30',
    DIA: 'US30',
    'YM=F': 'US30',
    '^VIX': 'VIX',
    VIXY: 'VIX',
    'DX-Y.NYB': 'DXY',
    UUP: 'DXY',
  };
  const resolved = aliases[normalized] ?? normalized;
  return WATCHLIST[resolved] ? resolved : 'XAUUSD';
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

function findQuote(
  quotes: Array<{ symbol: string; price: number; change: number }>,
  symbols: string[],
): { price: number; change: number } | null {
  for (const symbol of symbols) {
    const hit = quotes.find((quote) => quote.symbol === symbol);
    if (hit) return { price: hit.price, change: hit.change };
  }
  return null;
}

function toneFromBias(bias: string): 'neutral' | 'bullish' | 'bearish' | 'alert' {
  const value = bias.toLowerCase();
  if (/(bull|constructive|supportive|upside)/.test(value)) return 'bullish';
  if (/(bear|defensive|downside)/.test(value)) return 'bearish';
  if (/(risk|fragile|stress|caution)/.test(value)) return 'alert';
  return 'neutral';
}

function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function fmtLevel(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return value.toFixed(2);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function confidenceBandFromScore(score: number): 'low' | 'medium' | 'high' {
  if (score >= 72) return 'high';
  if (score >= 48) return 'medium';
  return 'low';
}

function statusBase(status: 'confirmed' | 'derived' | 'estimated'): number {
  if (status === 'confirmed') return 72;
  if (status === 'derived') return 58;
  return 40;
}

function feedAdjustment(feedQuality?: string | null): number {
  const value = String(feedQuality || '').toLowerCase();
  if (value === 'strong') return 10;
  if (value === 'usable') return 4;
  if (value === 'weak') return -10;
  return 0;
}

function modeAdjustment(mode?: string | null): number {
  const value = String(mode || '').toLowerCase();
  if (value === 'direct') return 10;
  if (value === 'proxy') return -2;
  if (value === 'estimated') return -10;
  if (value === 'synthetic-live') return -8;
  if (value === 'unavailable') return -18;
  return 0;
}

function buildSignalDiagnostic(input: {
  key: string;
  label: string;
  status: 'confirmed' | 'derived' | 'estimated';
  summary: string;
  sources: Array<string | null | undefined>;
  mode?: string | null;
  feedQuality?: string | null;
  signalStrength?: number | null;
  caveatPenalty?: number;
}): TraderReportSignalDiagnostic {
  const sources = uniqueStrings(input.sources).slice(0, 6);
  const signalStrength = clamp(Number(input.signalStrength ?? 55), 20, 90);
  const sourceBreadthBonus = Math.min(14, sources.length * 3);
  const confidenceScore = clamp(Math.round(
    (statusBase(input.status) * 0.45)
    + (signalStrength * 0.35)
    + sourceBreadthBonus
    + feedAdjustment(input.feedQuality)
    + modeAdjustment(input.mode)
    - (input.caveatPenalty ?? 0),
  ), 18, 95);

  return {
    key: input.key,
    label: input.label,
    confidenceScore,
    confidence: confidenceBandFromScore(confidenceScore),
    status: input.status,
    summary: input.summary,
    sources,
  };
}

function stageTone(items: string[]): 'neutral' | 'bullish' | 'bearish' | 'alert' {
  const text = items.join(' ').toLowerCase();
  if (/(bull|constructive|support|upside|haven)/.test(text)) return 'bullish';
  if (/(bear|defensive|rejection|downside|tightening)/.test(text)) return 'bearish';
  if (/(risk|warning|divergence|squeeze|event)/.test(text)) return 'alert';
  return 'neutral';
}

function signalFromText(value: string, fallback: 'bullish' | 'neutral' | 'bearish' = 'neutral'): 'bullish' | 'neutral' | 'bearish' {
  const text = String(value || '').toLowerCase();
  if (/(bull|constructive|supportive|upside|favor)/.test(text)) return 'bullish';
  if (/(bear|defensive|downside|fragile|rejection)/.test(text)) return 'bearish';
  return fallback;
}

function voteScore(signal: 'bullish' | 'neutral' | 'bearish', confidence: number, weight: number): number {
  const signed = signal === 'bullish' ? 1 : signal === 'bearish' ? -1 : 0;
  return signed * confidence * weight;
}

export async function getTraderReport(input: {
  market?: string;
  timeframe?: string;
  reportStyle?: 'desk' | 'execution';
}): Promise<TraderReportResponse> {
  const market = resolveMarket(input.market);
  const context = createVaultumAnalyticsContext({
    market,
    timeframe: input.timeframe,
    reportStyle: input.reportStyle ?? 'desk',
  });
  const key = cacheKey('analytics', `trader-report:${context.cacheSegment}`);

  return getCachedOrCompute(key, async () => {
    const watchlist = WATCHLIST[context.market] ?? WATCHLIST.XAUUSD;
    const marketSymbols = watchlist.filter((item) => !item.commodity).map((item) => item.symbol);
    const commoditySymbols = watchlist.filter((item) => item.commodity).map((item) => item.symbol);

    const [
      marketQuotes,
      commodityQuotes,
      fearGreed,
      macroSignals,
      prediction,
      calendar,
      pivots,
      profile,
      pressure,
      orderflow,
      flowProxy,
      gammaLevels,
      dealerPressure,
      cryptoDerivatives,
      scenario,
      technical,
      entryMap,
      tvResearch,
      twelveDataResearch,
      finnhubResearch,
    ] = await Promise.all([
      marketSymbols.length ? listMarketQuotes({ symbols: marketSymbols }) : Promise.resolve({ quotes: [] as any[] }),
      commoditySymbols.length ? listCommodityQuotes({ symbols: commoditySymbols }) : Promise.resolve({ quotes: [] as any[] }),
      getFearGreedIndex(),
      getMacroSignals({ market: context.market }),
      listPredictionMarkets({ market: context.market, mode: 'markets' }),
      getEconomicCalendar({ market: context.market }),
      getLevels({ market: context.market, timeframe: context.structuralTimeframe }),
      getProfile({ market: context.market, timeframe: context.structuralTimeframe }),
      getBuyerSellerPressure({ market: context.market, timeframe: context.timeframe, mode: 'auto' }),
      getOrderflowEngine({ market: context.market, timeframe: context.timeframe }),
      getFlowProxy({ symbol: context.market }),
      getGammaLevels({ symbol: context.market }),
      getDealerPressure({ symbol: context.market }),
      getCryptoDerivativesContext({ market: context.market }),
      getMonteCarloScenario({ market: context.market, timeframe: context.timeframe }),
      getTechnicalCommittee({ market: context.market, timeframe: context.timeframe }),
      getEntryMap({ market: context.market, chartTimeframe: context.timeframe }),
      getTradingViewResearch({ market: context.market, timeframe: context.timeframe }),
      getTwelveDataResearch({ market: context.market, timeframe: context.timeframe }),
      getFinnhubResearch({ market: context.market, timeframe: context.timeframe }),
    ]);

    const combinedQuotes = [...(marketQuotes?.quotes ?? []), ...(commodityQuotes?.quotes ?? [])];
    const macroFocus = macroSignals?.focus ?? null;
    const ratesFocus = macroSignals?.ratesDifferentials?.focus ?? null;
    const nextEvent = calendar?.events?.find((event: any) => event.isUpcoming) ?? null;
    const predictiveCalendar = calendar?.predictiveSignals?.[0] ?? null;

    const processors: VaultumProcessor[] = [
      {
        key: 'watchlist',
        run: async () => ({
          status: 'confirmed',
          detail: 'Live watchlist rows built from the active market quote stack.',
          value: watchlist.map((item) => {
            const hit = findQuote(combinedQuotes, [item.symbol, item.display, context.market, `${context.market}=X`]);
            const change = hit?.change ?? null;
            return {
              symbol: item.symbol,
              display: item.display,
              price: hit?.price ?? null,
              change,
              stance: stanceForMove(change),
              note: noteForQuote(item.display, change),
            } satisfies BriefQuote;
          }),
        }),
      },
      {
        key: 'structure',
        run: async () => {
          const support = pivots?.mappedSupport?.price ?? pivots?.supports?.[0] ?? profile?.valueAreaLow ?? null;
          const resistance = pivots?.mappedResistance?.price ?? pivots?.resistances?.[0] ?? profile?.valueAreaHigh ?? null;
          const structureRegime = pivots?.regime;
          const bias = pivots?.signalMap?.buySignal
            ? 'constructive support'
            : pivots?.signalMap?.sellSignal
              ? 'defensive resistance'
              : pivots?.structure ?? 'balanced structure';
          return {
            status: 'derived',
            detail: `Structure comes from weighted volume pivot mapping, nofx-style box/regime classification, volume profile, and POC alignment on ${context.structuralTimeframe}.`,
            references: ['pivots', 'profile'],
            value: {
              support,
              resistance,
              pivot: pivots?.pivot ?? null,
              dynamicLevel: pivots?.dynamicLevel ?? null,
              bias,
              body: `Support sits near ${fmtLevel(support)}, resistance near ${fmtLevel(resistance)}, with ${pivots?.signalMap?.bias ?? 'no strong pivot signal'}, buyer concentration ${pivots?.mappedSupport?.buyersPct ?? 'n/a'}%, seller concentration ${pivots?.mappedResistance?.sellersPct ?? 'n/a'}%, ${profile?.valueAreaPosition ?? 'unknown'} value-area context, and ${structureRegime?.summary ?? 'structure regime unavailable'}.`,
            },
          };
        },
      },
      {
        key: 'flow',
        run: async () => {
          const cryptoTail = !cryptoDerivatives?.unsupported && !cryptoDerivatives?.unavailable
            ? ` Crypto derivatives add ${cryptoDerivatives.summary}`
            : '';
          const body = `Pressure is ${pressure?.dominance ?? 'unknown'} (${pressure?.score ?? 'n/a'}) with confidence ${pressure?.confidence ?? 'n/a'}, momentum ${pressure?.priceMomentumPressure ?? 'n/a'}, volume ${pressure?.volumePressureScore ?? 'n/a'}, structure ${pressure?.structurePressureScore ?? 'n/a'}, macro ${pressure?.macroProxyScore ?? 'n/a'}, and volatility ${pressure?.volatilityAdjustment ?? 'n/a'}. Orderflow is ${orderflow?.dominance ?? 'unknown'} (${orderflow?.buySellPressure ?? 'n/a'}) on ${orderflow?.matchedSourceSymbol ?? orderflow?.sourceSymbol ?? 'unknown'} ${orderflow?.volumeClass ?? 'unknown'}, normalized broker volume is ${orderflow?.aggregateVolumeDominance ?? 'unknown'} (${orderflow?.aggregateVolumePressure ?? 'n/a'}) with ${orderflow?.secondSourceActive ? 'multi-broker confirmation' : 'single-broker confirmation'}, and options flow proxy reads ${flowProxy?.flowBias ?? 'unknown'} with ${flowProxy?.dealerPositioning ?? 'unknown'}, ATM IV ${flowProxy?.theoreticalAtmVol ?? 'n/a'}%, skew ${flowProxy?.downsideSkew ?? 'n/a'}, smile fit ${flowProxy?.surfaceFit?.quality ?? 'unknown'} (${flowProxy?.surfaceFit?.rmse ?? 'n/a'} rmse), featured package ${flowProxy?.featuredStrategy ?? 'unknown'}, ${flowProxy?.americanExerciseRisk ?? 'unknown'} exercise risk, and expected move ${flowProxy?.expectedMove1w ?? 'n/a'} over 1W.${cryptoTail}`;
          return {
            status: pressure?.mode === 'direct' ? 'confirmed' : 'estimated',
            detail: 'Flow layer blends buyer/seller pressure, orderflow proxy, and synthetic options-flow context.',
            references: ['pressure', 'orderflow', 'flowProxy'],
            value: {
              bias:
                (pressure?.score ?? 0) + (orderflow?.buySellPressure ?? 0) + (flowProxy?.netFlowScore ?? 0) > 15
                  ? 'bullish flow alignment'
                  : (pressure?.score ?? 0) + (orderflow?.buySellPressure ?? 0) + (flowProxy?.netFlowScore ?? 0) < -15
                    ? 'bearish flow alignment'
                    : 'mixed flow alignment',
              body,
              divergence: orderflow?.priceDeltaDivergence ?? 'none',
              pressureMode: pressure?.mode ?? 'unknown',
            },
          };
        },
      },
      {
        key: 'technical',
        run: async () => ({
          status: technical.status,
          detail: 'Technical committee ports the strongest ai-hedge-fund pattern into Vaultum: multi-strategy voting across trend, mean reversion, momentum, volatility, and statistical profile.',
          references: ['technical-committee'],
          value: technical,
        }),
      },
      {
        key: 'scenario',
        run: async () => ({
          status: 'derived',
          detail: 'Scenario layer comes from Vaultum Monte Carlo over live structure, flow, and macro inputs.',
          references: ['scenario'],
          value: {
            bias: scenario?.pathBias ?? 'balanced',
            body: `Monte Carlo favors ${scenario?.pathBias ?? 'a mixed path'} across ${scenario?.horizonLabel ?? 'the active horizon'} using ${scenario?.pathMethod ?? 'its active engine'}, with target-first ${scenario?.targetFirstProbability ?? 'n/a'}%, invalidation-first ${scenario?.invalidationFirstProbability ?? 'n/a'}%, break-even ${scenario?.breakEvenProbability ?? 'n/a'}%, median max drawdown ${scenario?.medianMaxDrawdownPct ?? 'n/a'}%, and a neutral GBM benchmark of ${scenario?.benchmark?.annualizedVolPct ?? 'n/a'}% vol showing ${scenario?.benchmark?.terminalAboveTargetProbability ?? 'n/a'}% terminal upside versus ${scenario?.benchmark?.terminalBelowInvalidationProbability ?? 'n/a'}% downside to invalidation.`,
            targetHitProbability: scenario?.targetHitProbability ?? null,
            invalidationProbability: scenario?.invalidationProbability ?? null,
            supportHoldProbability: scenario?.supportHoldProbability ?? null,
            targetFirstProbability: scenario?.targetFirstProbability ?? null,
            invalidationFirstProbability: scenario?.invalidationFirstProbability ?? null,
            breakEvenProbability: scenario?.breakEvenProbability ?? null,
          },
        }),
      },
      {
        key: 'prediction',
        run: async () => ({
          status: prediction?.unavailable ? 'estimated' : 'confirmed',
          detail: 'Prediction layer blends Polymarket and Kalshi crowd context into one venue-aware event-risk read.',
          references: ['prediction'],
          value: {
            bias: prediction?.crowdBias ?? 'unavailable',
            body: prediction?.summary ?? 'Prediction-market crowd context is unavailable.',
            convictionScore: prediction?.convictionScore ?? null,
            uncertaintyScore: prediction?.uncertaintyScore ?? null,
            spreadCostBps: prediction?.spreadCostBps ?? null,
            executionCostBps: prediction?.executionCostBps ?? null,
            fillQualityPct: prediction?.fillQualityPct ?? null,
            liquidityQuality: prediction?.liquidityQuality ?? 'unavailable',
            orderbookBias: prediction?.orderbookBias ?? 'unavailable',
            topMarket: prediction?.markets?.[0]?.title ?? null,
          },
        }),
      },
      {
        key: 'risk',
        run: async () => {
          const warningBits = [
            nextEvent?.event ? `next event ${nextEvent.event}` : null,
            predictiveCalendar?.summary ? `calendar chain ${predictiveCalendar.direction} ${predictiveCalendar.targetEvent}` : null,
            orderflow?.priceDeltaDivergence && orderflow.priceDeltaDivergence !== 'none'
              ? `price/delta ${orderflow.divergenceDetail}`
              : null,
            flowProxy?.squeezeRisk ? `squeeze risk ${flowProxy.squeezeRisk}` : null,
            pressure?.mode && pressure.mode !== 'direct' ? `pressure mode ${pressure.mode}` : null,
          ].filter((value): value is string => Boolean(value));

          return {
            status: 'confirmed',
            detail: 'Risk layer blends event timing, divergence, squeeze risk, and sentiment regime.',
            references: ['calendar', 'orderflow', 'fearGreed'],
            value: {
              body: warningBits.length
                ? warningBits.join(' | ')
                : 'No immediate extra risk flag beyond the active structure and macro regime.',
              sentiment: fearGreed?.compositeScore ?? null,
              sentimentLabel: fearGreed?.compositeLabel ?? 'unknown',
              macro: macroSignals?.regime ?? 'unknown',
            },
          };
        },
      },
      {
        key: 'risk-envelope',
        dependencies: ['technical', 'scenario'],
        run: async (ctx, results) => {
          const technicalState = results.technical!.value as TechnicalCommitteeResponse;
          const riskEnvelope = buildExecutionRiskEnvelope({
            technical: technicalState,
            scenario,
            pressure,
            orderflow,
            flowProxy,
            calendar,
            fearGreed,
          });

          return {
            status: riskEnvelope.tradeSuppression ? 'estimated' : 'derived',
            detail: `Risk envelope adapts ai-hedge-fund style risk gating for single-market execution in ${ctx.market}, using volatility, scenario odds, event load, feed quality, and squeeze risk instead of static sizing.`,
            references: ['technical-committee', 'scenario', 'pressure', 'orderflow', 'calendar'],
            value: riskEnvelope,
          };
        },
      },
      {
        key: 'execution',
        dependencies: ['structure', 'flow', 'technical', 'scenario', 'prediction', 'risk', 'risk-envelope'],
        run: async (_ctx, results) => {
          const structure = results.structure!.value as any;
          const flow = results.flow!.value as any;
          const technicalState = results.technical!.value as TechnicalCommitteeResponse;
          const scenarioState = results.scenario!.value as any;
          const predictionState = results.prediction!.value as any;
          const riskEnvelope = results['risk-envelope']!.value as ExecutionRiskEnvelope;
          const entryDirection = signalFromText(entryMap?.biasLabel ?? '', 'neutral');

          const voteBoard: ExecutionCommitteeVote[] = [
            {
              key: 'structure',
              label: 'Structure',
              signal: signalFromText(structure.bias),
              confidence: /constructive|defensive|resistance|support/.test(String(structure.bias).toLowerCase()) ? 68 : 44,
              weight: 1,
            },
            {
              key: 'flow',
              label: 'Flow',
              signal: signalFromText(flow.bias),
              confidence: /mixed/.test(String(flow.bias).toLowerCase()) ? 42 : 72,
              weight: 1.1,
            },
            {
              key: 'entry-map',
              label: 'Entry Map',
              signal: entryDirection,
              confidence: Math.round(Math.max(38, Number(entryMap?.confidence ?? 42))),
              weight: 1.2,
            },
            {
              key: 'technical',
              label: 'Technical Committee',
              signal: technicalState.consensus,
              confidence: Math.round(Math.abs(technicalState.ensembleScore)),
              weight: 1.15,
            },
            {
              key: 'trend-structure',
              label: 'Trend Structure',
              signal: technicalState.trendStructure.breakoutPressure === 'neutral'
                ? technicalState.trendStructure.bias
                : technicalState.trendStructure.breakoutPressure,
              confidence: Math.round(Math.max(
                42,
                Math.min(
                  86,
                  50
                    + (technicalState.trendStructure.supportTouches * 2)
                    + (technicalState.trendStructure.resistanceTouches * 2)
                    + (technicalState.trendStructure.compression === 'compressing' ? 6 : 0),
                ),
              )),
              weight: 0.85,
            },
            {
              key: 'scenario',
              label: 'Scenario',
              signal: /upside/.test(String(scenarioState.bias).toLowerCase())
                ? 'bullish'
                : /downside/.test(String(scenarioState.bias).toLowerCase())
                  ? 'bearish'
                  : 'neutral',
              confidence: Math.round(Math.abs((scenarioState.targetFirstProbability ?? 50) - (scenarioState.invalidationFirstProbability ?? 50))),
              weight: 1,
            },
            {
              key: 'macro',
              label: 'Macro',
              signal: macroSignals?.goldBias === 'bullish'
                ? 'bullish'
                : macroSignals?.goldBias === 'bearish'
                  ? 'bearish'
                  : signalFromText(macroSignals?.regime ?? ''),
              confidence: /risk-off with haven support|bullish|tightening|fragile|bearish/.test(`${macroSignals?.regime ?? ''} ${macroSignals?.goldBias ?? ''}`.toLowerCase()) ? 62 : 40,
              weight: 0.9,
            },
            {
              key: 'crowd',
              label: 'Prediction Crowd',
              signal: signalFromText(predictionState.bias ?? '', 'neutral'),
              confidence: Math.round(Math.max(32, Number(predictionState.convictionScore ?? 42))),
              weight: 0.6,
            },
          ];

          const weightedSum = voteBoard.reduce((sum, vote) => sum + voteScore(vote.signal, vote.confidence, vote.weight), 0);
          const maxWeightedScore = voteBoard.reduce((sum, vote) => sum + (vote.weight * 100), 0);
          const ensembleScore = maxWeightedScore ? Number(((weightedSum / maxWeightedScore) * 100).toFixed(1)) : 0;
          const rawStance = ensembleScore >= 20 ? 'bullish' : ensembleScore <= -20 ? 'defensive' : 'neutral';
          const stance = riskEnvelope.tradeSuppression && rawStance !== 'neutral' ? `${rawStance} but suppressed` : rawStance;
          const confidence = riskEnvelope.tradeSuppression
            ? 'low'
            : Math.abs(ensembleScore) >= 42
              ? 'high'
              : Math.abs(ensembleScore) >= 18
                ? 'medium'
                : 'low';
          const action = riskEnvelope.tradeSuppression
            ? 'stand-down'
            : ensembleScore >= 20
              ? 'lean-long'
              : ensembleScore <= -20
                ? 'lean-short'
                : 'wait';
          const actionPlan = action === 'lean-long'
            ? `Favor pullbacks into ${entryMap?.entryZone ?? fmtLevel(structure.support)} with ${riskEnvelope.sizeBand} size, keep invalidation around ${entryMap?.invalidationLevel ?? fmtLevel(scenario?.invalidationLevel ?? structure.support)}, and only press phase-3 continuation if ${entryMap?.triggerPattern ?? technicalState.trendStructure.pattern}, pressure, the committee, and scenario votes stay aligned${predictiveCalendar?.direction === 'up' ? ` while the calendar chain still leans ${predictiveCalendar.direction} into ${predictiveCalendar.targetEvent}` : ''}.`
            : action === 'lean-short'
              ? `Respect the premium reaction band around ${entryMap?.entryZone ?? fmtLevel(structure.resistance)} and only press downside with ${riskEnvelope.sizeBand} size if price keeps failing there, ${entryMap?.triggerPattern ?? technicalState.trendStructure.pattern} stays hostile, and the committee remains net defensive${predictiveCalendar?.direction === 'down' ? ` while the calendar chain still leans ${predictiveCalendar.direction} into ${predictiveCalendar.targetEvent}` : ''}.`
              : action === 'stand-down'
                ? `${entryMap?.executionRead ?? 'Stand down or use only very small feeler size.'} Risk envelope is still ${riskEnvelope.actionMode}, so wait for the committee and trigger stack to re-align.`
                : `${entryMap?.executionRead ?? `Treat ${fmtLevel(structure.support)} to ${fmtLevel(structure.resistance)} as the active decision box.`} Wait for cleaner committee alignment, ${technicalState.trendStructure.breakoutPressure} trend pressure, and better indicator agreement before sizing up${predictiveCalendar?.summary ? `; the current calendar chain says ${predictiveCalendar.summary.toLowerCase()}` : ''}.`;
          const voteSummary = voteBoard
            .map((vote) => `${vote.label} ${vote.signal} ${vote.confidence}`)
            .join(' | ');

          return {
            status: 'derived',
            detail: 'Execution layer now uses ai-hedge-fund style committee aggregation plus the live entry map: deterministic weighted votes, then a separate risk gate, before the final desk action is issued.',
            references: ['structure', 'flow', 'entry-map', 'technical-committee', 'scenario', 'risk-envelope'],
            value: {
              stance,
              confidence,
              action,
              ensembleScore,
              voteBoard,
              voteSummary,
              actionPlan,
              summary: `${context.market} reads ${stance} with committee score ${ensembleScore}, entry map ${entryMap?.biasLabel ?? 'pending'} in ${entryMap?.phase ?? 'transition'} (${entryMap?.readiness ?? 'watch'}), ${technicalState.trendStructure.pattern} showing ${technicalState.trendStructure.breakoutPressure} pressure, indicator stack ${technicalState.indicatorStack.bias}, ${macroSignals?.regime ?? 'macro mixed'}${ratesFocus?.summary ? `, ${ratesFocus.summary}` : ''}, ${orderflow?.summary ?? 'orderflow mixed'}, and Vaultum sentiment at ${fearGreed?.compositeScore?.toFixed?.(1) ?? 'n/a'}.`,
              confirmationChecklist: [
                entryMap?.phaseSummary ?? (structure.support != null ? `Hold above ${fmtLevel(structure.support)}` : 'Hold the active support cluster'),
                entryMap?.entryZone ? `Work inside ${entryMap.entryZone} before forcing the trade` : (structure.support != null ? `Hold above ${fmtLevel(structure.support)}` : 'Hold the active support cluster'),
                structure.resistance != null ? `Clear ${fmtLevel(structure.resistance)} with follow-through` : 'Clear the active resistance cluster',
                pressure?.dominance ? `${pressure.dominance} pressure must stay in control` : 'Pressure must stay aligned',
                ...(entryMap?.executionChecklist?.slice(0, 2) ?? []),
                `Technical committee should stay ${technicalState.consensus} with score ${technicalState.ensembleScore}`,
                `${entryMap?.triggerPattern ?? technicalState.trendStructure.pattern} should keep ${technicalState.trendStructure.breakoutPressure} pressure`,
                scenario?.targetFirstProbability != null ? `Monte Carlo target-first probability ${scenario.targetFirstProbability.toFixed(1)}% or better` : 'Scenario edge should remain supportive',
              ].slice(0, 7),
              invalidationChecklist: [
                entryMap?.invalidationLevel ? `Lose ${entryMap.invalidationLevel}` : (scenario?.invalidationLevel != null ? `Lose ${fmtLevel(scenario.invalidationLevel)}` : 'Lose the active invalidation line'),
                ...(entryMap?.alertConditions?.slice(0, 2) ?? []),
                orderflow?.priceDeltaDivergence === 'bearish-divergence' ? 'Do not ignore bearish delta divergence' : 'Do not ignore fresh flow divergence',
                `Do not ignore ${technicalState.trendStructure.location} placement inside the ${technicalState.trendStructure.pattern}`,
                flowProxy?.squeezeRisk === 'high' ? 'Respect squeeze risk around gamma walls' : 'Respect options-flow squeeze pockets',
                riskEnvelope.tradeSuppression ? 'Do not override the risk gate while it is suppressing execution' : `Do not size beyond the ${riskEnvelope.sizeBand} risk band`,
              ].slice(0, 7),
            },
          };
        },
      },
    ];

    const results = await runVaultumProcessorGraph(context, processors);
    const structure = results.structure!.value as any;
    const flow = results.flow!.value as any;
    const technicalState = results.technical!.value as TechnicalCommitteeResponse;
    const predictionState = results.prediction!.value as any;
    const scenarioState = results.scenario!.value as any;
    const risk = results.risk!.value as any;
    const riskEnvelope = results['risk-envelope']!.value as ExecutionRiskEnvelope;
    const execution = results.execution!.value as any;
    const watchItems = results.watchlist!.value as BriefQuote[];

    const marketQuoteSourceSummary = Array.isArray((marketQuotes as any)?.sourceSummary)
      ? ((marketQuotes as any).sourceSummary as string[])
      : [];
    const commodityQuoteSourceSummary = Array.isArray((commodityQuotes as any)?.sourceSummary)
      ? ((commodityQuotes as any).sourceSummary as string[])
      : [];
    const portfolioOverlay = await getPortfolioOverlay({
      market: context.market,
      timeframe: context.timeframe,
      action: execution.action,
      confidence: execution.confidence,
      riskBudgetPct: riskEnvelope.riskBudgetPct,
      scenario,
      macroSignals,
    });

    const sourceTrace = [
      'Trader report uses a shared analytics context and processor graph so the same structure can feed UI, AI, and MCP tools.',
      'TradingView is chart UI only; live quotes come from backend feeds rather than the widget itself.',
      ...describeBrokerStack(),
      ...marketQuoteSourceSummary,
      ...commodityQuoteSourceSummary,
      pivots?.regime?.sourceLabel ? [pivots.regime.sourceLabel] : [],
      pressure?.sourceLabel ? [pressure.sourceLabel] : [],
      orderflow?.sourceLabel ? [orderflow.sourceLabel] : [],
      entryMap?.sourceLabel ? [entryMap.sourceLabel] : [],
      flowProxy?.sourceLabel ? [flowProxy.sourceLabel] : [],
      gammaLevels?.sourceLabel ? [gammaLevels.sourceLabel] : [],
      dealerPressure?.sourceLabel ? [dealerPressure.sourceLabel] : [],
      cryptoDerivatives?.sourceLabel && !cryptoDerivatives?.unsupported ? [cryptoDerivatives.sourceLabel] : [],
      technicalState.sourceLabel ? [technicalState.sourceLabel] : [],
      tvResearch?.sourceLabel ? [tvResearch.sourceLabel] : [],
      twelveDataResearch?.sourceLabel ? [twelveDataResearch.sourceLabel] : [],
      finnhubResearch?.sourceLabel ? [finnhubResearch.sourceLabel] : [],
      portfolioOverlay?.sourceLabel ? [portfolioOverlay.sourceLabel] : [],
      prediction?.venueBreakdown?.length
        ? [`Prediction crowd layer active across ${prediction.venueBreakdown.map((venue: any) => venue.venue).join(' + ')}.`]
        : [],
    ].filter((value, index, array) => Boolean(value) && array.indexOf(value) === index) as string[];

    const warnings = [
      pressure?.mode && pressure.mode !== 'direct' ? `Pressure mode is ${pressure.mode}, not centralized tape.` : null,
      orderflow?.feedQuality === 'weak' ? 'Orderflow feed quality is weak here, so footprint-style readings are estimated.' : null,
      flowProxy?.mode === 'synthetic-live' ? 'Options flow remains proxy-derived rather than contract-tape true.' : null,
      entryMap?.doNotExecute ? `Entry map is still in ${entryMap.phase} / ${entryMap.readiness} mode, so execution should stay patient.` : null,
      riskEnvelope.tradeSuppression ? `Risk gate is suppressing aggressive execution with score ${riskEnvelope.riskScore}/100.` : null,
      prediction?.spreadCostBps != null && prediction.spreadCostBps >= 900 ? `Prediction spread cost is elevated near ${prediction.spreadCostBps.toFixed(0)} bps.` : null,
      prediction?.executionCostBps != null && prediction.executionCostBps >= 120 ? `Prediction execution cost is elevated near ${prediction.executionCostBps.toFixed(0)} bps for the simulated clip.` : null,
      prediction?.fillQualityPct != null && prediction.fillQualityPct <= 45 ? `Prediction fill quality is thin near ${prediction.fillQualityPct}% for the simulated clip.` : null,
      prediction?.unavailable ? 'Prediction-market crowd layer is unavailable.' : null,
      cryptoDerivatives?.unavailable && !cryptoDerivatives?.unsupported ? 'Crypto derivatives sidecar is unavailable.' : null,
      pivots?.regime?.breakout?.state === 'confirmed' && pivots?.regime?.breakout?.level !== 'none'
        ? `Structure breakout is confirmed on the ${pivots.regime.breakout.level} box to the ${pivots.regime.breakout.direction}.`
        : null,
      nextEvent?.event ? `Calendar watch: ${nextEvent.currency} ${nextEvent.event}` : null,
      predictiveCalendar?.summary ? `Calendar chain: ${predictiveCalendar.summary}` : null,
      tvResearch?.unavailable ? 'TradingView scanner sidecar is unavailable.' : null,
      finnhubResearch?.unavailable ? 'Finnhub research sidecar is unavailable.' : null,
      ...(portfolioOverlay?.warnings ?? []),
    ].filter((value): value is string => Boolean(value));

    const analystRead = uniqueStrings([
      macroSignals?.regime ? `Macro regime ${macroSignals.regime}.` : null,
      macroSignals?.goldBias ? `Primary asset bias ${macroSignals.goldBias}.` : null,
      predictionState.body,
      structure.body,
      entryMap?.tradeThesisSummary,
      technicalState.summary,
      flow.body,
      !cryptoDerivatives?.unsupported && !cryptoDerivatives?.unavailable ? cryptoDerivatives.summary : null,
      tvResearch?.summary,
      twelveDataResearch?.summary,
      finnhubResearch?.summary,
      nextEvent?.event ? `Upcoming catalyst ${nextEvent.currency} ${nextEvent.event}.` : null,
      predictiveCalendar?.summary ? `${predictiveCalendar.summary} ${predictiveCalendar.note}` : null,
      finnhubResearch?.upcomingEvent ? `Finnhub event ${finnhubResearch.upcomingEvent.label} ${finnhubResearch.upcomingEvent.date}.` : null,
    ]);
    const technicalCommitteeRead = uniqueStrings([
      technicalState.summary,
      technicalState.marketRegime.summary,
      technicalState.trendStructure.summary,
      technicalState.indicatorStack.summary,
      pivots?.regime?.summary ? `Structure regime is ${pivots.regime.summary}` : null,
      tvResearch?.selectedRecommendation && tvResearch.selectedRecommendation !== 'unavailable'
        ? `TradingView scanner sidecar is ${tvResearch.selectedRecommendation} on ${tvResearch.selectedTimeframe} with ${tvResearch.consensus} alignment.`
        : null,
      twelveDataResearch?.selectedRecommendation && twelveDataResearch.selectedRecommendation !== 'unavailable'
        ? `Twelve Data sidecar is ${twelveDataResearch.selectedRecommendation} on ${twelveDataResearch.selectedInterval} with ${twelveDataResearch.consensus} alignment, RSI ${twelveDataResearch.indicators?.rsi ?? 'n/a'}, and ADX ${twelveDataResearch.indicators?.adx ?? 'n/a'}.`
        : null,
      finnhubResearch?.technicalSignal && finnhubResearch.technicalSignal !== 'unavailable'
        ? `Finnhub sidecar is ${finnhubResearch.technicalSignal} on ${finnhubResearch.selectedResolution}, with support ${fmtLevel(finnhubResearch.levels?.support)} and resistance ${fmtLevel(finnhubResearch.levels?.resistance)}.`
        : null,
      ...technicalState.votes
        .filter((vote) => vote.signal !== 'neutral')
        .slice(0, 3)
        .map((vote) => `${vote.label} is ${vote.signal} with ${Math.round(vote.confidence)} confidence.`),
      technicalState.feedQuality !== 'strong' ? `Feed quality is ${technicalState.feedQuality}.` : null,
      twelveDataResearch?.marketStateLabel ? `Matched session state is ${twelveDataResearch.marketStateLabel}.` : null,
      finnhubResearch?.sessionLabel ? `Finnhub session state is ${finnhubResearch.sessionLabel}.` : null,
    ]);
    const bullCase = uniqueStrings([
      /bullish|constructive/.test(String(structure.bias)) ? `Structure favors upside above ${fmtLevel(structure.support)}.` : null,
      /bullish/.test(String(flow.bias)) ? 'Flow stack is leaning with the move rather than against it.' : null,
      technicalState.consensus === 'bullish' ? `Technical committee is bullish with score ${technicalState.ensembleScore}.` : null,
      technicalState.marketRegime.state === 'bull' ? `Daily regime classifier is bullish with ${technicalState.marketRegime.confidence}% confidence.` : null,
      technicalState.trendStructure.bias === 'bullish'
        ? `${technicalState.trendStructure.pattern} keeps ${technicalState.trendStructure.breakoutPressure} pressure with price in the ${technicalState.trendStructure.location}.`
        : null,
      technicalState.indicatorStack.bias === 'bullish'
        ? `Indicator stack is constructive with RSI ${technicalState.indicatorStack.rsi14}, MACD hist ${technicalState.indicatorStack.macdHist}, and ROC ${technicalState.indicatorStack.roc10}.`
        : null,
      /favorite-heavy|mixed/.test(String(predictionState.bias)) && (predictionState.convictionScore ?? 0) >= 55
        ? `Prediction crowd is ${predictionState.bias} with conviction ${predictionState.convictionScore}.`
        : null,
      /upside/.test(String(scenarioState.bias)) ? `Scenario map still gives the path upside room with ${scenarioState.targetFirstProbability ?? 'n/a'}% target-first probability.` : null,
      entryMap?.direction === 'long' ? `${entryMap.phaseSummary} ${entryMap.executionRead}` : null,
      pivots?.regime?.primaryCode === 'BREAKOUT' && pivots?.regime?.breakout?.direction === 'up'
        ? `Structure regime is already in confirmed upward breakout mode with ${pivots.regime.breakout.guidance} guidance.`
        : null,
      cryptoDerivatives?.netBias === 'bullish' || cryptoDerivatives?.liquidationBias === 'bullish'
        ? `Crypto derivatives crowd context is supportive: ${cryptoDerivatives.summary}`
        : null,
      Number(fearGreed?.compositeScore ?? 50) >= 55 ? `Sentiment is supportive at ${fearGreed?.compositeLabel ?? 'constructive'} ${fearGreed?.compositeScore?.toFixed?.(1) ?? 'n/a'}.` : null,
      finnhubResearch?.technicalBias === 'bullish' ? `Finnhub technical and sentiment sidecar is constructive through ${finnhubResearch.matchedSymbol ?? 'the matched symbol'}.` : null,
    ]);
    const bearCase = uniqueStrings([
      /defensive|bearish/.test(String(structure.bias)) ? `Structure is vulnerable below ${fmtLevel(structure.support)} or into ${fmtLevel(structure.resistance)}.` : null,
      /bearish/.test(String(flow.bias)) ? 'Flow stack is not aligned with clean trend continuation.' : null,
      technicalState.consensus === 'bearish' ? `Technical committee is bearish with score ${technicalState.ensembleScore}.` : null,
      technicalState.marketRegime.state === 'bear' ? `Daily regime classifier is bearish with ${technicalState.marketRegime.confidence}% confidence.` : null,
      technicalState.trendStructure.bias === 'bearish'
        ? `${technicalState.trendStructure.pattern} keeps ${technicalState.trendStructure.breakoutPressure} pressure with price in the ${technicalState.trendStructure.location}.`
        : null,
      technicalState.indicatorStack.bias === 'bearish'
        ? `Indicator stack is defensive with RSI ${technicalState.indicatorStack.rsi14}, MACD hist ${technicalState.indicatorStack.macdHist}, and ROC ${technicalState.indicatorStack.roc10}.`
        : null,
      predictionState.bias === 'longshot-heavy'
        ? `Prediction crowd is longshot-heavy with ${predictionState.uncertaintyScore ?? 'n/a'} surprise risk.`
        : null,
      /downside/.test(String(scenarioState.bias)) ? `Scenario map still leaves ${scenarioState.invalidationProbability ?? 'n/a'}% invalidation risk on the table.` : null,
      entryMap?.direction === 'short' ? `${entryMap.phaseSummary} ${entryMap.executionRead}` : null,
      pivots?.regime?.primaryCode === 'BREAKOUT' && pivots?.regime?.breakout?.direction === 'down'
        ? `Structure regime is already in confirmed downward breakout mode with ${pivots.regime.breakout.guidance} guidance.`
        : null,
      cryptoDerivatives?.netBias === 'bearish' || cryptoDerivatives?.liquidationBias === 'bearish'
        ? `Crypto derivatives crowd context is defensive: ${cryptoDerivatives.summary}`
        : null,
      orderflow?.priceDeltaDivergence && orderflow.priceDeltaDivergence !== 'none' ? `Price and delta are not aligned: ${orderflow.divergenceDetail}.` : null,
      flowProxy?.squeezeRisk === 'high' ? 'Dealer and gamma context still carries high squeeze risk.' : null,
      finnhubResearch?.technicalBias === 'bearish' ? `Finnhub sidecar is leaning bearish through ${finnhubResearch.matchedSymbol ?? 'the matched symbol'}.` : null,
    ]);
    const riskEnvelopeRead = uniqueStrings([
      riskEnvelope.body,
      ...riskEnvelope.reasons.map((reason) => `${reason}.`),
      `Use ${riskEnvelope.sizeBand} size at ${(riskEnvelope.riskBudgetPct * 100).toFixed(0)}% of normal risk.`,
    ]);
    const riskTeam = uniqueStrings([
      risk.body,
      riskEnvelope.body,
      portfolioOverlay?.summary ?? null,
      prediction?.spreadCostBps != null ? `Prediction crowd spread cost ${prediction.spreadCostBps.toFixed(0)} bps.` : null,
      warnings[0] ?? null,
      nextEvent?.event ? `Catalyst timing matters around ${nextEvent.event}.` : null,
      predictiveCalendar?.summary ? `Calendar chain says ${predictiveCalendar.summary.toLowerCase()}` : null,
    ]);
    const decisionStages: TraderReportDecisionStage[] = [
      {
        key: 'analyst-team',
        title: 'Analyst Team',
        body: analystRead.join(' '),
        tone: stageTone(analystRead),
      },
      {
        key: 'technical-committee',
        title: 'Technical Committee',
        body: (technicalCommitteeRead.length ? technicalCommitteeRead : ['Technical committee is mixed.']).join(' '),
        tone: toneFromBias(technicalState.bias),
      },
      {
        key: 'bull-case',
        title: 'Bull Case',
        body: (bullCase.length ? bullCase : ['Bull case is not especially dominant right now.']).join(' '),
        tone: stageTone(bullCase.length ? bullCase : ['neutral']),
      },
      {
        key: 'bear-case',
        title: 'Bear Case',
        body: (bearCase.length ? bearCase : ['Bear case is not especially dominant right now.']).join(' '),
        tone: stageTone(bearCase.length ? bearCase : ['neutral']),
      },
      {
        key: 'risk-envelope',
        title: 'Risk Envelope',
        body: (riskEnvelopeRead.length ? riskEnvelopeRead : ['Risk envelope is balanced.']).join(' '),
        tone: riskEnvelope.tradeSuppression ? 'alert' : riskEnvelope.actionMode === 'cautious' ? 'bearish' : 'neutral',
      },
      {
        key: 'risk-team',
        title: 'Risk Team',
        body: (riskTeam.length ? riskTeam : ['No extra risk gate beyond the active regime.']).join(' '),
        tone: stageTone(riskTeam.length ? riskTeam : ['neutral']),
      },
      {
        key: 'portfolio-manager',
        title: 'Portfolio Manager',
        body: `${execution.summary} ${execution.actionPlan} ${portfolioOverlay?.summary ?? ''} ${portfolioOverlay?.recommended?.rationale ?? ''}`.trim(),
        tone: portfolioOverlay?.concentrationRisk === 'high' ? 'alert' : toneFromBias(execution.stance),
      },
    ];

    const memoryQuery = [
      execution.summary,
      predictionState.body,
      structure.body,
      ...(entryMap?.contextLines ?? []),
      technicalState.summary,
      flow.body,
      riskEnvelope.body,
      risk.body,
      scenarioState.body,
      portfolioOverlay?.summary ?? '',
    ].join('\n');
    const memoryMatches = await recallSituationMemories({
      namespace: 'trader-report',
      market: context.market,
      timeframe: context.timeframe,
      query: memoryQuery,
      limit: 2,
    });
    if (memoryMatches.length) {
      sourceTrace.push(`Situation memory matched ${memoryMatches.length} similar ${context.market} setup${memoryMatches.length > 1 ? 's' : ''}.`);
    }

    const deskRecommendation = buildDeskRecommendation({
      market: context.market,
      timeframe: context.timeframe,
      execution: {
        action: execution.action,
        stance: execution.stance,
        confidence: execution.confidence,
        ensembleScore: execution.ensembleScore,
        summary: execution.summary,
        actionPlan: execution.actionPlan,
      },
      riskEnvelope: {
        actionMode: riskEnvelope.actionMode,
        sizeBand: riskEnvelope.sizeBand,
        riskBudgetPct: riskEnvelope.riskBudgetPct,
        riskScore: riskEnvelope.riskScore,
        tradeSuppression: riskEnvelope.tradeSuppression,
        body: riskEnvelope.body,
      },
      entryMap,
      scenario,
      flowProxy,
      gammaLevels,
      dealerPressure,
      pressure,
      orderflow,
      macroSignals,
      technicalPattern: technicalState.trendStructure.pattern,
    });

    await rememberSituation({
      namespace: 'trader-report',
      market: context.market,
      timeframe: context.timeframe,
      situation: memoryQuery,
      recommendation: execution.actionPlan,
      outcome: 'open',
      tags: [execution.stance, execution.confidence, macroSignals?.regime ?? 'unknown', orderflow?.dominance ?? 'unknown', technicalState.consensus, riskEnvelope.actionMode],
    });

    const reportMeasures: TraderReportMeasure[] = [
      {
        key: 'structure',
        label: 'Structure',
        value: structure.bias,
        status: results.structure!.status,
        detail: results.structure!.detail,
      },
      {
        key: 'structure-regime',
        label: 'Structure Regime',
        value: pivots?.regime
          ? `${pivots.regime.primaryCode} / ${pivots.regime.secondaryCode} / ${pivots.regime.regimeLevel}`
          : 'unavailable',
        status: pivots?.regime ? 'derived' : 'estimated',
        detail: pivots?.regime?.summary ?? 'nofx-style structure regime is unavailable.',
      },
      {
        key: 'flow',
        label: 'Flow',
        value: flow.bias,
        status: results.flow!.status,
        detail: results.flow!.detail,
      },
      {
        key: 'entry-map',
        label: 'Entry Map',
        value: entryMap ? `${entryMap.biasLabel} / ${entryMap.phase} / ${entryMap.readiness}` : 'unavailable',
        status: entryMap?.confidenceLabel === 'high' ? 'derived' : 'estimated',
        detail: entryMap?.sourceLabel ?? 'Entry map unavailable.',
      },
      {
        key: 'options-package',
        label: 'Options Package',
        value: `${flowProxy?.featuredStrategy ?? 'unknown'} / ${flowProxy?.americanExerciseRisk ?? 'unknown'}`,
        status: 'estimated',
        detail: flowProxy?.featuredStrategySummary ?? 'Options strategy package view unavailable.',
      },
      {
        key: 'portfolio-overlay',
        label: 'Portfolio Overlay',
        value: `${portfolioOverlay?.recommended?.model ?? 'unavailable'} / ${portfolioOverlay?.recommended?.deployedPct ?? 'n/a'}% deployed / ${portfolioOverlay?.recommended?.reservePct ?? 'n/a'}% reserve`,
        status: 'derived',
        detail: `${portfolioOverlay?.summary ?? 'Portfolio overlay unavailable.'} ${portfolioOverlay?.recommended?.rationale ?? ''}`.trim(),
      },
      {
        key: 'desk-bias',
        label: 'Desk Bias',
        value: `${deskRecommendation.bias} / ${deskRecommendation.biasScore}`,
        status: 'derived',
        detail: deskRecommendation.institutionalSummary,
      },
      {
        key: 'quant-lens',
        label: 'Quant Lens',
        value: `${gammaLevels?.pricingModel ?? flowProxy?.pricingModel ?? 'unknown'} / ${scenarioState.targetFirstProbability ?? 'n/a'}% target first`,
        status: 'estimated',
        detail: `${deskRecommendation.monteCarloSummary} ${deskRecommendation.optionsMathSummary}`,
      },
      {
        key: 'technical',
        label: 'Technical',
        value: `${technicalState.consensus} / ${technicalState.ensembleScore}`,
        status: results.technical!.status,
        detail: results.technical!.detail,
      },
      {
        key: 'trend-structure',
        label: 'Trend Structure',
        value: `${technicalState.trendStructure.pattern} / ${technicalState.trendStructure.breakoutPressure}`,
        status: 'derived',
        detail: technicalState.trendStructure.summary,
      },
      {
        key: 'indicator-stack',
        label: 'Indicator Stack',
        value: `${technicalState.indicatorStack.bias} / score ${technicalState.indicatorStack.score}`,
        status: 'derived',
        detail: technicalState.indicatorStack.summary,
      },
      {
        key: 'tradingview',
        label: 'TV Consensus',
        value: tvResearch?.selectedRecommendation && tvResearch?.matchedSymbolId
          ? `${tvResearch.selectedTimeframe} ${tvResearch.selectedRecommendation}`
          : 'unavailable',
        status: tvResearch?.unavailable ? 'estimated' : 'derived',
        detail: tvResearch?.summary ?? 'TradingView scanner sidecar unavailable.',
      },
      {
        key: 'twelve-data',
        label: '12D Technical',
        value: twelveDataResearch?.selectedRecommendation && twelveDataResearch?.matchedSymbolId
          ? `${twelveDataResearch.selectedInterval} ${twelveDataResearch.selectedRecommendation}`
          : 'unavailable',
        status: twelveDataResearch?.unavailable ? 'estimated' : 'derived',
        detail: twelveDataResearch?.summary ?? 'Twelve Data technical sidecar unavailable.',
      },
      {
        key: 'finnhub',
        label: 'Finnhub Research',
        value: finnhubResearch?.technicalSignal && finnhubResearch?.matchedSymbol
          ? `${finnhubResearch.selectedResolution} ${finnhubResearch.technicalSignal} / ${finnhubResearch.matchedSymbol}`
          : 'unavailable',
        status: finnhubResearch?.unavailable ? 'estimated' : 'derived',
        detail: finnhubResearch?.summary ?? 'Finnhub technical/catalyst sidecar unavailable.',
      },
      {
        key: 'prediction',
        label: 'Crowd',
        value: `${predictionState.bias} / ${predictionState.convictionScore ?? 'n/a'} conviction`,
        status: results.prediction!.status,
        detail: results.prediction!.detail,
      },
      ...(!cryptoDerivatives?.unsupported
        ? [{
            key: 'crypto-derivatives',
            label: 'Crypto Derivatives',
            value: cryptoDerivatives?.unavailable
              ? 'unavailable'
              : `${cryptoDerivatives?.flowLabel ?? 'mixed'} / ${cryptoDerivatives?.netBias ?? 'neutral'} / ${cryptoDerivatives?.liquidationBias ?? 'neutral'}`,
            status: cryptoDerivatives?.unavailable ? 'estimated' as const : 'confirmed' as const,
            detail: cryptoDerivatives?.summary ?? 'Crypto derivatives context unavailable.',
          }]
        : []),
      {
        key: 'market-regime',
        label: 'Market Regime',
        value: `${technicalState.marketRegime.label} / ${technicalState.marketRegime.confidence}%`,
        status: 'derived',
        detail: technicalState.marketRegime.summary,
      },
      {
        key: 'scenario',
        label: 'Scenario',
        value: `${scenarioState.targetFirstProbability ?? 'n/a'}% target first / ${scenarioState.invalidationFirstProbability ?? 'n/a'}% invalidation first`,
        status: results.scenario!.status,
        detail: results.scenario!.detail,
      },
      {
        key: 'risk-envelope',
        label: 'Risk Envelope',
        value: `${riskEnvelope.sizeBand} / ${(riskEnvelope.riskBudgetPct * 100).toFixed(0)}% normal risk`,
        status: results['risk-envelope']!.status,
        detail: results['risk-envelope']!.detail,
      },
      {
        key: 'risk',
        label: 'Risk',
        value: `${fearGreed?.compositeLabel ?? 'unknown'} ${fearGreed?.compositeScore != null ? fearGreed.compositeScore.toFixed(1) : 'n/a'} / score ${riskEnvelope.riskScore}`,
        status: results.risk!.status,
        detail: results.risk!.detail,
      },
      {
        key: 'execution',
        label: 'Execution',
        value: `${execution.action} / ${execution.confidence}`,
        status: results.execution!.status,
        detail: results.execution!.detail,
      },
      ...(memoryMatches.length
        ? [{
            key: 'memory',
            label: 'Memory',
            value: `${Math.round(memoryMatches[0]!.similarityScore * 100)}% similar`,
            status: 'derived' as const,
            detail: memoryMatches[0]!.recommendation,
          }]
        : []),
    ];

    const signalDiagnostics: TraderReportSignalDiagnostic[] = [
      buildSignalDiagnostic({
        key: 'macro',
        label: 'Macro',
        status: 'confirmed',
        summary: `${macroFocus?.summary ?? `Macro regime ${macroSignals?.regime ?? 'unknown'} with primary bias ${macroSignals?.goldBias ?? 'unknown'}.`} ${ratesFocus?.summary ?? ''} Real-yield pressure ${macroSignals?.inferred?.realYieldPressure ?? 'unknown'}, dollar regime ${macroSignals?.inferred?.dollarRegime ?? 'unknown'}, ${macroSignals?.rates?.curveShape ?? 'unknown'} curve shape, policy divergence ${macroSignals?.inferred?.policyDivergence ?? 'unknown'}, haven pressure ${macroSignals?.safeHavenPressure ?? 'unknown'}, and carry stress ${macroSignals?.inferred?.carryStress ?? 'unknown'}.`.trim(),
        sources: [
          'Yahoo DXY chart',
          'Yahoo US10Y chart',
          'Yahoo SPX chart',
          'Yahoo VIX chart',
          'Yahoo USDJPY chart',
          'FRED real yields / curve',
          'BIS policy rates / rates differential board',
        ],
        signalStrength:
          macroFocus?.convictionScore ?? (/risk-off tightening|risk-on easing/i.test(String(macroSignals?.regime ?? '')) ? 72 : 52),
      }),
      buildSignalDiagnostic({
        key: 'structure',
        label: 'Structure',
        status: results.structure!.status,
        summary: structure.body,
        sources: [
          pivots?.regime?.sourceLabel,
          'Weighted volume pivot mapping',
          'Buyer / seller concentration levels',
          'Volume profile',
          'POC line',
          'Structure regime',
        ],
        mode: profile?.mode ?? null,
        signalStrength:
          pivots?.signalMap?.buySignal || pivots?.signalMap?.sellSignal
            ? 78
            : pivots?.regime?.breakout?.state === 'confirmed'
              ? 74
              : 58,
        caveatPenalty: profile?.mode === 'estimated' ? 6 : 0,
      }),
      buildSignalDiagnostic({
        key: 'pressure',
        label: 'Pressure',
        status: pressure?.mode === 'direct' ? 'confirmed' : 'estimated',
        summary: `Pressure is ${pressure?.dominance ?? 'unknown'} at ${pressure?.score ?? 'n/a'} with confidence ${pressure?.confidence ?? 'n/a'}, momentum ${pressure?.priceMomentumPressure ?? 'n/a'}, volume ${pressure?.volumePressureScore ?? 'n/a'}, structure ${pressure?.structurePressureScore ?? 'n/a'}, normalized broker volume ${pressure?.aggregateVolumeDominance ?? 'unknown'} ${pressure?.aggregateVolumePressure ?? 'n/a'}, macro proxy ${pressure?.macroProxyBias ?? 'not_applicable'} ${pressure?.macroProxyScore ?? 'n/a'}, volatility ${pressure?.volatilityAdjustment ?? 'n/a'}, and liquidity ${pressure?.liquiditySummary ?? 'unknown'}.`,
        sources: [
          pressure?.sourceLabel,
          'Intraday momentum',
          'Tick-volume / relative-volume proxy',
          pressure?.structurePressureScore != null ? 'Session and prior-day structure map' : null,
          pressure?.liquiditySummary ? 'Liquidity swing zones' : null,
          pressure?.aggregateVolumeLatest != null ? 'Aggregate broker-volume sidecar' : null,
          pressure?.macroProxyPressure != null && pressure?.macroProxyBias !== 'not_applicable' ? 'DXY proxy' : null,
          pressure?.macroProxyPressure != null && pressure?.macroProxyBias !== 'not_applicable' ? 'US10Y proxy' : null,
          pressure?.jpyRiskPressure != null ? 'JPY risk proxy' : null,
        ],
        mode: pressure?.mode ?? null,
        signalStrength: Math.min(Math.abs(Number(pressure?.score ?? 0)) + 28, 88),
        caveatPenalty: pressure?.mode === 'estimated' ? 8 : pressure?.mode === 'proxy' ? 4 : 0,
      }),
      buildSignalDiagnostic({
        key: 'orderflow',
        label: 'Orderflow',
        status: orderflow?.feedQuality === 'strong' ? 'confirmed' : orderflow?.feedQuality === 'usable' ? 'derived' : 'estimated',
        summary: `Orderflow is ${orderflow?.dominance ?? 'unknown'} at ${orderflow?.buySellPressure ?? 'n/a'} on ${orderflow?.matchedSourceSymbol ?? orderflow?.sourceSymbol ?? 'unknown'} ${orderflow?.volumeClass ?? 'unknown'}, with candle pressure ${orderflow?.candlePressureScore ?? 'n/a'}, normalized broker volume ${orderflow?.aggregateVolumeDominance ?? 'unknown'} ${orderflow?.aggregateVolumePressure ?? 'n/a'}, quote imbalance ${orderflow?.quoteImbalance ?? 'n/a'}, ${orderflow?.priceDeltaDivergence ?? 'none'}, and liquidity map ${orderflow?.stopClusterBias ?? 'unknown'} around ${orderflow?.stopClusterAbove ?? 'n/a'} / ${orderflow?.stopClusterBelow ?? 'n/a'}.`,
        sources: [
          orderflow?.sourceLabel,
          'Candle delta proxy',
          orderflow?.aggregateVolumeLatest != null ? 'Aggregate broker-volume sidecar' : null,
          'Bid/ask pressure ratio proxy',
          'VWAP auction state',
          'Session highs/lows',
          'Stop-cluster map',
          orderflow?.macroProxyPressure != null && orderflow?.macroProxyBias !== 'not_applicable' ? 'FX macro proxy' : null,
        ],
        mode: orderflow?.mode ?? null,
        feedQuality: orderflow?.feedQuality ?? null,
        signalStrength: Math.min(Math.abs(Number(orderflow?.buySellPressure ?? 0)) + 30, 90),
        caveatPenalty: orderflow?.feedQuality === 'weak' ? 10 : orderflow?.feedQuality === 'usable' ? 4 : 0,
      }),
      buildSignalDiagnostic({
        key: 'options',
        label: 'Options / Dealers',
        status: 'estimated',
        summary: deskRecommendation.optionsMathSummary,
        sources: [
          flowProxy?.sourceLabel,
          gammaLevels?.sourceLabel,
          dealerPressure?.sourceLabel,
          flowProxy?.surfaceFit?.quality ? `Smile fit ${flowProxy.surfaceFit.quality}` : null,
          flowProxy?.chainProxyUnderlying ? `Chain overlay ${flowProxy.chainProxyUnderlying}` : null,
          'Synthetic surface math',
          'Dealer/gamma proxy',
        ],
        mode: flowProxy?.mode ?? null,
        signalStrength:
          flowProxy?.surfaceFit?.quality === 'good'
            ? 68
            : flowProxy?.surfaceFit?.quality === 'usable'
              ? 58
              : 46,
        caveatPenalty: flowProxy?.mode === 'synthetic-live' ? 8 : 0,
      }),
      buildSignalDiagnostic({
        key: 'entry-map',
        label: 'Entry Map',
        status: entryMap?.confidenceLabel === 'high' ? 'derived' : 'estimated',
        summary: entryMap
          ? `${entryMap.executionRead} Entry zone ${entryMap.entryZone}, invalidation ${entryMap.invalidationLevel}, trim ${entryMap.trimZone}, trigger ${entryMap.triggerPattern}, and scores ${entryMap.supportingSignals.join(' / ')}.`
          : 'Entry map is unavailable for the current market focus.',
        sources: [
          entryMap?.sourceLabel,
          `${context.timeframe} chart focus`,
          entryMap ? `${entryMap.timeframes.major}/${entryMap.timeframes.minor}/${entryMap.timeframes.trigger} execution ladder` : null,
          '4H structure',
          '15m structure and volume profile',
          '5m trigger tape',
        ],
        signalStrength: Math.max(Number(entryMap?.confidence ?? 0), 30),
        caveatPenalty: entryMap?.doNotExecute ? 8 : 0,
      }),
      buildSignalDiagnostic({
        key: 'technical',
        label: 'Technical Committee',
        status: technical.status,
        summary: technicalState.summary,
        sources: [
          technicalState.sourceLabel,
          'Trend structure vote',
          'Indicator stack vote',
          tvResearch?.selectedRecommendation && !tvResearch?.unavailable ? 'TradingView scanner sidecar' : null,
          twelveDataResearch?.selectedRecommendation && !twelveDataResearch?.unavailable ? 'Twelve Data sidecar' : null,
          finnhubResearch?.technicalSignal && !finnhubResearch?.unavailable ? 'Finnhub sidecar' : null,
        ],
        feedQuality: technicalState.feedQuality ?? null,
        signalStrength: Math.abs(Number(technicalState.ensembleScore ?? 0)),
        caveatPenalty: technicalState.feedQuality === 'weak' ? 8 : technicalState.feedQuality === 'usable' ? 3 : 0,
      }),
      buildSignalDiagnostic({
        key: 'scenario',
        label: 'Scenario',
        status: results.scenario!.status,
        summary: deskRecommendation.monteCarloSummary,
        sources: [
          scenario?.sourceLabel,
          'Monte Carlo engine',
          'Structure inputs',
          'Pressure inputs',
          'Orderflow inputs',
          'Calendar inputs',
        ],
        signalStrength: Math.max(
          Math.abs(Number((scenario?.targetFirstProbability ?? 50) - (scenario?.invalidationFirstProbability ?? 50))),
          36,
        ),
      }),
      buildSignalDiagnostic({
        key: 'prediction',
        label: 'Prediction Crowd',
        status: results.prediction!.status,
        summary: predictionState.body,
        sources: [
          prediction?.venueBreakdown?.some((venue: any) => venue.venue === 'Polymarket') ? 'Polymarket order books' : null,
          prediction?.venueBreakdown?.some((venue: any) => venue.venue === 'Kalshi') ? 'Kalshi order books' : null,
          prediction?.orderbookBias ? 'Prediction microstructure model' : null,
          prediction?.liquidityQuality ? `Liquidity ${prediction.liquidityQuality}` : null,
        ],
        signalStrength: Math.max(Number(predictionState.convictionScore ?? 42), 28),
        caveatPenalty:
          prediction?.liquidityQuality === 'thin'
            ? 10
            : prediction?.liquidityQuality === 'tradable'
              ? 3
              : 0,
      }),
      buildSignalDiagnostic({
        key: 'calendar-chain',
        label: 'Calendar Chain',
        status: predictiveCalendar ? 'derived' : 'estimated',
        summary: predictiveCalendar
          ? `${predictiveCalendar.summary} ${predictiveCalendar.note}`
          : 'No same-day U.S. precursor chain has enough released data yet to create a useful desk prediction.',
        sources: predictiveCalendar
          ? [
              'Economic calendar',
              'Vaultum U.S. desk heuristics',
              ...predictiveCalendar.drivers.map((driver: any) => driver.event),
            ]
          : ['Economic calendar'],
        signalStrength: predictiveCalendar?.confidenceScore ?? 28,
        caveatPenalty: predictiveCalendar ? 4 : 10,
      }),
      buildSignalDiagnostic({
        key: 'risk',
        label: 'Risk',
        status: results.risk!.status,
        summary: risk.body,
        sources: [
          'Economic calendar',
          predictiveCalendar ? 'Calendar chain' : null,
          'Fear & Greed index',
          orderflow?.priceDeltaDivergence && orderflow.priceDeltaDivergence !== 'none' ? 'Orderflow divergence' : null,
          prediction?.spreadCostBps != null ? 'Prediction execution cost' : null,
          nextEvent?.event ? `Upcoming ${nextEvent.currency} event` : null,
        ],
        signalStrength: Math.max(Number(riskEnvelope.riskScore ?? 50), 32),
        caveatPenalty: warnings.length >= 5 ? 4 : 0,
      }),
      buildSignalDiagnostic({
        key: 'execution',
        label: 'Execution',
        status: results.execution!.status,
        summary: execution.summary,
        sources: [
          'Structure signal',
          'Flow signal',
          entryMap ? 'Entry map' : null,
          'Technical committee',
          'Scenario engine',
          'Risk envelope',
          riskEnvelope.tradeSuppression ? 'Risk gate suppression' : 'Risk gate open',
        ],
        signalStrength: Math.abs(Number(execution.ensembleScore ?? 0)),
        caveatPenalty: riskEnvelope.tradeSuppression ? 10 : 0,
      }),
    ];

    return {
      generatedAt: context.generatedAt,
      market: context.market,
      timeframe: context.timeframe,
      structuralTimeframe: context.structuralTimeframe,
      requestId: context.requestId,
      reportStyle: context.reportStyle,
      sourceLabel: 'Vaultum trader report is assembled from a shared analytics context, graph-based processors, and live trading engines rather than panel-specific one-off logic.',
      sourceTrace,
      summary: deskRecommendation.institutionalSummary,
      stance: execution.stance,
      confidence: execution.confidence,
      actionPlan: deskRecommendation.entrySuggestion,
      riskWatch: [risk.body, portfolioOverlay?.warnings?.[0]].filter(Boolean).join(' '),
      reportMeasures,
      decisionStages,
      signalDiagnostics,
      deskRecommendation,
      executionCommittee: {
        action: execution.action,
        ensembleScore: execution.ensembleScore,
        summary: execution.voteSummary,
        votes: execution.voteBoard.map((vote: ExecutionCommitteeVote) => ({
          key: vote.key,
          label: vote.label,
          signal: vote.signal,
          confidence: vote.confidence,
          weight: vote.weight,
        })),
      },
      riskEnvelope,
      memoryMatches: memoryMatches.map((item: SituationMemoryMatch) => ({
        createdAt: item.createdAt,
        outcome: item.outcome,
        similarityScore: item.similarityScore,
        recommendation: item.recommendation,
      })),
      sections: {
        opening: { title: 'Opening Note', body: deskRecommendation.institutionalSummary, tone: toneFromBias(execution.stance) },
        structure: { title: 'Structure', body: structure.body, tone: toneFromBias(structure.bias) },
        flow: { title: 'Flow', body: `${flow.body} ${technicalState.summary}`, tone: toneFromBias(flow.bias) },
        scenario: { title: 'Scenario', body: scenarioState.body, tone: toneFromBias(scenarioState.bias) },
        risk: { title: 'Risk Watch', body: `${risk.body} ${riskEnvelope.body}`, tone: warnings.length || riskEnvelope.tradeSuppression ? 'alert' : 'neutral' },
        execution: {
          title: 'Execution Plan',
          body: `${deskRecommendation.entrySuggestion} ${deskRecommendation.reEntrySuggestion} ${deskRecommendation.exitSuggestion} Portfolio overlay: ${portfolioOverlay?.summary ?? 'overlay unavailable.'} Vote stack: ${execution.voteSummary}`,
          tone: toneFromBias(execution.stance),
        },
      },
      watchlist: watchItems,
      confirmationChecklist: execution.confirmationChecklist,
      invalidationChecklist: execution.invalidationChecklist,
      warnings,
      metrics: {
        sentiment: fearGreed?.compositeScore ?? null,
        sentimentLabel: fearGreed?.compositeLabel ?? 'unknown',
        macro: macroSignals?.regime ?? 'unknown',
        pressure: pressure?.dominance ?? 'unknown',
        orderflow: orderflow?.dominance ?? 'unknown',
        targetHitProbability: scenario?.targetHitProbability ?? null,
        invalidationProbability: scenario?.invalidationProbability ?? null,
      },
    } satisfies TraderReportResponse;
  }, 240);
}
