import { getTraderReport } from '../../analytics/v1/get-trader-report';
import { getChartLogic, type VaultumChartLogicDecision } from '../../analytics/v1/get-chart-logic';
import { getFlowProxy } from '../../options/v1/get-flow-proxy';
import { getOrderflowEngine } from '../../orderflow/v1/get-engine';
import { getLevels } from '../../pivots/v1/get-levels';
import { getBuyerSellerPressure } from '../../pressure/v1/get-buyer-seller-pressure';
import { getMonteCarloScenario } from '../../scenario/v1/get-monte-carlo';
import { getProfile } from '../../volume/v1/get-profile';
import type { VaultumIntent } from './_shared';

type ChartReviewAlignment = 'aligned' | 'mixed' | 'conflicted' | 'unknown';
type ExecutionPhase = 'impulse' | 'correction' | 'continuation' | 'reversal' | 'transition';

export interface VaultumChartReviewResponse {
  provider: string;
  providerTrace: string[];
  marketDataTrace: string[];
  intent: VaultumIntent;
  toolsUsed: string[];
  confidence: 'low' | 'medium' | 'high';
  conclusion: string;
  supportingSignals: string[];
  caveats: string[];
  watchItems: string[];
  confirmedSignals: string[];
  inferredImplications: string[];
  estimatedSignals: string[];
  missingData: string[];
  answer: string;
  contextSnapshot: string;
  market: string;
  timeframe: string;
  reviewMode: 'vision+live' | 'live-only-fallback';
  imageReviewed: boolean;
  executionPhase: ExecutionPhase | 'unknown';
  executionPhaseReason: string;
  chartReadSummary: string;
  alignment: ChartReviewAlignment;
  alignmentScore: number | null;
  thesisScore: number | null;
  extractedLevels: string[];
  overlayComparisons: string[];
  chartLogic: VaultumChartLogicDecision;
  knowledgeContext: {
    summary: string;
    focusConcepts: string[];
    sourceLineage: string[];
    structureRules: Array<{ label: string; operationalUse: string; whenItMatters: string }>;
    macroRules: Array<{ label: string; operationalUse: string; whenItMatters: string }>;
    agentFocus: Array<{ key: string; label: string; mission: string }>;
  } | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeString(value: unknown, fallback = 'unknown'): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function safeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function fmtLevel(value: unknown): string {
  const number = safeNumber(value);
  return number == null ? 'n/a' : number.toFixed(2);
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function ensureImageDataUrl(imageDataUrl: string): string {
  const value = String(imageDataUrl || '').trim();
  if (!/^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(value)) {
    throw new Error('Chart review expects a PNG, JPEG, or WEBP screenshot.');
  }
  if (value.length > 4_500_000) {
    throw new Error('Chart screenshot is too large. Please upload a smaller image.');
  }
  return value;
}

function confidenceFromState(input: {
  provider: string | null;
  alignment: ChartReviewAlignment;
  thesisScore: number | null;
}): 'low' | 'medium' | 'high' {
  if (input.alignment === 'aligned' && (input.thesisScore ?? 0) >= 72) return 'high';
  if (input.provider || input.thesisScore != null) return 'medium';
  return 'low';
}

function alignmentScore(alignment: ChartReviewAlignment): number | null {
  if (alignment === 'aligned') return 78;
  if (alignment === 'mixed') return 56;
  if (alignment === 'conflicted') return 32;
  return null;
}

function buildAnswer(input: {
  conclusion: string;
  executionPhase: string;
  executionPhaseReason: string;
  chartReadSummary: string;
  chartActions: string[];
  supportingSignals: string[];
  caveats: string[];
  overlayComparisons: string[];
  watchItems: string[];
  alignment: ChartReviewAlignment;
  confidence: 'low' | 'medium' | 'high';
}): string {
  return [
    `Conclusion: ${input.conclusion}`,
    `Execution phase: ${input.executionPhase}`,
    `Phase reason: ${input.executionPhaseReason}`,
    `Chart read: ${input.chartReadSummary}`,
    `Decision engine: ${input.chartActions.join(' | ') || 'none'}`,
    `Alignment: ${input.alignment}`,
    `Strongest signals: ${input.supportingSignals.join(' | ') || 'none'}`,
    `Live comparison: ${input.overlayComparisons.join(' | ') || 'none'}`,
    `Caveats: ${input.caveats.join(' | ') || 'none'}`,
    `What to watch: ${input.watchItems.join(' | ') || 'none'}`,
    `Confidence: ${input.confidence}`,
  ].join('\n');
}

export async function reviewChart(input: {
  market?: string;
  timeframe?: string;
  question?: string;
  imageDataUrl?: string;
}): Promise<VaultumChartReviewResponse> {
  const market = safeString(input.market, 'XAUUSD').toUpperCase();
  const timeframe = safeString(input.timeframe, '1h').toLowerCase();
  const question = safeString(
    input.question,
    'Review this chart screenshot against Vaultum live context and tell me whether the thesis is aligned, what is missing, and how to frame the trade.',
  );
  const imageDataUrl = ensureImageDataUrl(String(input.imageDataUrl || ''));

  const [chartLogic, traderReport, pivots, profile, flowProxy, orderflow, pressure, scenario] = await Promise.all([
    getChartLogic({ market, timeframe, question, imageDataUrl }),
    getTraderReport({ market, timeframe, reportStyle: 'execution' }),
    getLevels({ market, timeframe }),
    getProfile({ market, timeframe }),
    getFlowProxy({ symbol: market }),
    getOrderflowEngine({ market, timeframe }),
    getBuyerSellerPressure({ market, mode: 'auto' }),
    getMonteCarloScenario({ market, timeframe }),
  ]);

  const liveReference = chartLogic.liveReference;
  const marketDataTrace = unique([
    ...traderReport.sourceTrace,
    'Chart-to-logic converter compares a user-provided screenshot against the live structure-first execution map.',
  ]);
  const overlayComparisons = unique([
    `Execution phase ${liveReference?.phase ?? chartLogic.chartLogic.phase} with ${liveReference?.modelTwoConfluenceLabel ?? 'unknown'} confluence.`,
    `Institutional reference ${liveReference?.institutionalReferenceZone ?? chartLogic.chartLogic.zone} (${liveReference?.institutionalReference ?? chartLogic.chartLogic.zoneLabel}).`,
    `Live support cluster ${fmtLevel((pivots as any)?.mappedSupport?.price ?? (pivots as any)?.supports?.[0])}.`,
    `Live resistance cluster ${fmtLevel((pivots as any)?.mappedResistance?.price ?? (pivots as any)?.resistances?.[0])}.`,
    `Value area ${fmtLevel((profile as any)?.valueAreaLow)} to ${fmtLevel((profile as any)?.valueAreaHigh)} with POC ${fmtLevel((profile as any)?.poc)}.`,
    `Gamma map ${fmtLevel((flowProxy as any)?.putWall)} / ${fmtLevel((flowProxy as any)?.gammaFlip)} / ${fmtLevel((flowProxy as any)?.callWall)}.`,
    `Execution committee ${traderReport.executionCommittee.action} with score ${traderReport.executionCommittee.ensembleScore}.`,
    `Decision engine ${chartLogic.chartLogic.actionLines.slice(0, 3).join(' ')}`,
  ]);

  const alignment = chartLogic.liveAlignment;
  const thesisScore = liveReference?.modelTwoConfluenceScore ?? null;
  const confidence = confidenceFromState({
    provider: chartLogic.provider,
    alignment,
    thesisScore,
  });
  const fallbackConclusion = alignment === 'aligned'
    ? `${traderReport.summary} The screenshot is broadly aligned with Vaultum's structure-first read.`
    : alignment === 'conflicted'
      ? `${traderReport.summary} The screenshot is fighting the live structure-first map.`
      : `${traderReport.summary} The screenshot needs more confirmation before it can be trusted.`;

  const supportingSignals = unique([
    traderReport.summary,
    ...chartLogic.chartLogic.keyEvents.slice(0, 4),
    ...(chartLogic.knowledgeContext?.focusConcepts?.slice(0, 2).map((item) => `Doctrine ${item}.`) ?? []),
    `Pressure ${(pressure as any)?.dominance ?? 'unknown'} / ${(pressure as any)?.score ?? 'n/a'}.`,
    `Scenario ${(scenario as any)?.pathBias ?? 'unknown'} with ${(scenario as any)?.targetFirstProbability ?? 'n/a'}% target-first.`,
  ]);
  const caveats = unique([
    ...chartLogic.chartLogic.missing.slice(0, 3),
    chartLogic.provider ? null : 'No configured vision model successfully produced a structured screenshot read, so live structure carries more weight here.',
    (orderflow as any)?.feedQuality === 'weak' ? 'Orderflow feed quality is weak here, so footprint-style reads stay estimated.' : 'Orderflow is still a proxy layer where centralized tape is unavailable.',
    (flowProxy as any)?.mode === 'synthetic-live' ? 'Options flow remains proxy-derived rather than paid contract tape.' : 'Options context is structural, not tape-truth.',
  ]);
  const watchItems = unique([
    ...chartLogic.chartLogic.invalidates.slice(0, 3),
    `Watch gamma pressure around ${fmtLevel((flowProxy as any)?.gammaFlip)} and squeeze risk ${(flowProxy as any)?.squeezeRisk ?? 'unknown'}.`,
    `Watch risk gate ${traderReport.riskEnvelope.actionMode} and event risk ${traderReport.riskEnvelope.eventRiskScore}.`,
  ]);

  const executionPhase = chartLogic.chartLogic.phase !== 'unclear'
    ? chartLogic.chartLogic.phase
    : liveReference?.phase ?? 'unknown';
  const executionPhaseReason = chartLogic.chartLogic.summary
    || liveReference?.phaseSummary
    || liveReference?.tradeThesisSummary
    || 'Execution phase could not be resolved cleanly from the screenshot and live context.';

  const answer = buildAnswer({
    conclusion: fallbackConclusion,
    executionPhase,
    executionPhaseReason,
    chartReadSummary: chartLogic.chartReadSummary,
    chartActions: chartLogic.chartLogic.actionLines,
    supportingSignals,
    caveats,
    overlayComparisons,
    watchItems,
    alignment,
    confidence,
  });

  const liveContext = [
    `Question: ${question}`,
    `Market: ${market}`,
    `Timeframe: ${timeframe}`,
    `Vision provider: ${chartLogic.provider ?? 'none'}`,
    `Chart read: ${chartLogic.chartReadSummary}`,
    `Execution phase: ${liveReference?.phase ?? chartLogic.chartLogic.phase} / ${liveReference?.readiness ?? 'unknown'}`,
    `Phase summary: ${liveReference?.phaseSummary ?? chartLogic.chartLogic.summary}`,
    `Structure context: ${liveReference?.structureContext ?? chartLogic.chartLogic.majorStructure}`,
    `Institutional reference: ${liveReference?.institutionalReferenceZone ?? chartLogic.chartLogic.zone} (${liveReference?.institutionalReference ?? chartLogic.chartLogic.zoneLabel})`,
    `Entry / invalidation: ${chartLogic.chartLogic.bestEntryPrice} / ${chartLogic.chartLogic.invalidation}`,
    `Decision engine: ${chartLogic.chartLogic.actionLines.join(' | ')}`,
    `Knowledge pack: ${chartLogic.knowledgeContext?.summary ?? 'not attached'}`,
    `Doctrine focus: ${chartLogic.knowledgeContext?.focusConcepts?.slice(0, 6).join(' | ') ?? 'n/a'}`,
    `Live comparison: ${overlayComparisons.join(' | ')}`,
  ].join('\n');

  return {
    provider: chartLogic.provider ?? 'deterministic-fallback:vaultum-live-context-only',
    providerTrace: chartLogic.providerTrace,
    marketDataTrace,
    intent: 'chart-review',
    toolsUsed: [
      'analytics.get_chart_logic',
      'analytics.get_trader_report',
      'pivots.get_levels',
      'volume.get_profile',
      'options.get_flow_proxy',
      'orderflow.get_engine',
      'pressure.get_buyer_seller_pressure',
      'scenario.get_monte_carlo',
    ],
    confidence,
    conclusion: fallbackConclusion,
    supportingSignals,
    caveats,
    watchItems,
    confirmedSignals: [
      traderReport.summary,
      `Execution ${traderReport.executionCommittee.action} / ${traderReport.executionCommittee.ensembleScore}.`,
      `Risk envelope ${traderReport.riskEnvelope.sizeBand}.`,
      ...chartLogic.chartLogic.actionLines.slice(0, 2),
    ],
    inferredImplications: [
      traderReport.actionPlan,
      `Orderflow ${(orderflow as any)?.priceDeltaDivergence ?? 'none'} / pressure ${(pressure as any)?.dominance ?? 'unknown'}.`,
      `Scenario ${(scenario as any)?.targetFirstProbability ?? 'n/a'}% target-first against ${(scenario as any)?.invalidationFirstProbability ?? 'n/a'}% invalidation-first.`,
    ],
    estimatedSignals: [
      (pressure as any)?.sourceLabel ?? 'Pressure layer may use proxy or estimated feed paths.',
      (orderflow as any)?.sourceLabel ?? 'Orderflow layer may use proxy or estimated feed paths.',
      (flowProxy as any)?.sourceLabel ?? 'Options flow layer may use proxy or estimated feed paths.',
    ],
    missingData: chartLogic.provider ? [] : ['No configured vision model successfully processed the screenshot into a structured payload.'],
    answer,
    contextSnapshot: liveContext,
    market,
    timeframe,
    reviewMode: chartLogic.provider ? 'vision+live' : 'live-only-fallback',
    imageReviewed: chartLogic.imageReviewed,
    executionPhase,
    executionPhaseReason,
    chartReadSummary: chartLogic.chartReadSummary,
    alignment,
    alignmentScore: alignmentScore(alignment),
    thesisScore: thesisScore != null ? clamp(thesisScore, 0, 100) : null,
    extractedLevels: chartLogic.extractedLevels,
    overlayComparisons,
    chartLogic: chartLogic.chartLogic,
    knowledgeContext: chartLogic.knowledgeContext,
  };
}
