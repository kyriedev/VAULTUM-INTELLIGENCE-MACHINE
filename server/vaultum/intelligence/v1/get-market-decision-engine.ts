import { getNewsIntel } from './get-news-intel';
import { getCotSummary } from '../../positioning/v1/get-cot-summary';
import { buildConfluenceDecision } from './engine/confluence-engine.ts';
import { buildCotIntelligence } from './engine/cot-engine.ts';
import { buildMonteCarloRiskEngine } from './engine/monte-carlo-risk-engine.ts';
import { buildHeadlineInputsFromVaultumNewsPayload, buildNewsIntelligence } from './engine/news-engine.ts';
import { buildOptionsIntelligence } from './engine/options/engine.ts';
import { normalizeMarket, resolveCotMarket, type MarketDecisionEngineOutput, type MonteCarloRiskInput, type NormalizedHeadlineInput, type OptionsChainRowInput } from './engine/shared.ts';

type DecisionEngineInput = {
  market?: string;
  timeframe?: string;
  observedMovePct?: number | null;
  headlines?: NormalizedHeadlineInput[];
  cotInput?: Parameters<typeof buildCotIntelligence>[0] | null;
  monteCarloRisk?: Partial<MonteCarloRiskInput> | null;
  optionsStructuredRows?: OptionsChainRowInput[] | null;
  optionsOcrText?: string | null;
  optionsOcrTable?: string[][] | null;
  focusStrike?: number | null;
};

function defaultRiskModelForMarket(market: string): MonteCarloRiskInput {
  const normalized = normalizeMarket(market);
  if (normalized === 'XAUUSD') {
    return { market: normalized, winRate: 0.47, rewardRisk: 2.0, riskPerTradePct: 1, numberOfTrades: 40, simulations: 1500, slippageBps: 4, feeBps: 2, recentPerformanceRegime: 'stable' };
  }
  if (normalized === 'US30') {
    return { market: normalized, winRate: 0.45, rewardRisk: 2.2, riskPerTradePct: 1.1, numberOfTrades: 35, simulations: 1500, slippageBps: 5, feeBps: 2, recentPerformanceRegime: 'stable' };
  }
  return { market: normalized, winRate: 0.51, rewardRisk: 1.7, riskPerTradePct: 0.75, numberOfTrades: 35, simulations: 1500, slippageBps: 2, feeBps: 1, recentPerformanceRegime: 'stable' };
}

function mergeRiskModel(base: MonteCarloRiskInput, override: Partial<MonteCarloRiskInput> | null | undefined): MonteCarloRiskInput {
  return {
    ...base,
    ...(override ?? {}),
    market: base.market,
  };
}

export async function getMarketDecisionEngine(input: DecisionEngineInput = {}): Promise<MarketDecisionEngineOutput> {
  const market = normalizeMarket(input.market);
  const timeframe = String(input.timeframe || '1h').toLowerCase();

  const newsPayload = input.headlines?.length
    ? null
    : await getNewsIntel({ market, timeframe });
  const news = input.headlines?.length
    ? buildNewsIntelligence({
      market,
      headlines: input.headlines,
      observedMovePct: input.observedMovePct ?? null,
      source: 'manual headline input',
    })
    : buildNewsIntelligence({
      market,
      headlines: buildHeadlineInputsFromVaultumNewsPayload({ market, newsIntel: newsPayload }),
      observedMovePct: input.observedMovePct ?? null,
      source: 'live news + x intelligence',
    });

  const cotMarket = resolveCotMarket(market);
  const liveCot = !input.cotInput && cotMarket ? await getCotSummary({ market: cotMarket }) : null;
  const cot = input.cotInput
    ? buildCotIntelligence(input.cotInput)
    : liveCot
      ? buildCotIntelligence({
        market: cotMarket ?? market,
        commercialLong: liveCot.commercialLong,
        commercialShort: liveCot.commercialShort,
        nonCommercialLong: liveCot.nonCommercialLong,
        nonCommercialShort: liveCot.nonCommercialShort,
        spreading: liveCot.spreading,
        openInterest: ((liveCot.commercialLong + liveCot.commercialShort + liveCot.nonCommercialLong + liveCot.nonCommercialShort + liveCot.nonReportableLong + liveCot.nonReportableShort) / 2),
        weeklyCommercialChange: liveCot.commercialChange,
        weeklySpecChange: liveCot.change,
        source: liveCot.source,
        timestamp: liveCot.reportDate ? new Date(liveCot.reportDate).toISOString() : new Date().toISOString(),
      })
      : null;

  const monteCarloRisk = buildMonteCarloRiskEngine(mergeRiskModel(defaultRiskModelForMarket(market), input.monteCarloRisk));
  const options = await buildOptionsIntelligence({
    market,
    focusStrike: input.focusStrike ?? null,
    structuredRows: input.optionsStructuredRows ?? null,
    ocrText: input.optionsOcrText ?? null,
    ocrTable: input.optionsOcrTable ?? null,
  });
  const confluence = buildConfluenceDecision({
    market,
    news,
    cot,
    monteCarloRisk,
    options,
  });

  return {
    generatedAt: new Date().toISOString(),
    market,
    timeframe,
    news,
    cot,
    monteCarloRisk,
    options,
    confluence,
    uiSummary: {
      headline: confluence.uiSummary,
      bullets: [
        news.uiSummary,
        cot?.uiSummary ?? 'Live COT context is unavailable for this market mapping.',
        options.uiSummary,
        monteCarloRisk.uiSummary,
      ],
    },
    sampleMode: false,
  };
}
