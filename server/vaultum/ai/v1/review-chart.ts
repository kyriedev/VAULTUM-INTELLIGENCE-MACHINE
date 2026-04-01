import { getTraderReport } from '../../analytics/v1/get-trader-report';
import { getFlowProxy } from '../../options/v1/get-flow-proxy';
import { getOrderflowEngine } from '../../orderflow/v1/get-engine';
import { getLevels } from '../../pivots/v1/get-levels';
import { getBuyerSellerPressure } from '../../pressure/v1/get-buyer-seller-pressure';
import { getMonteCarloScenario } from '../../scenario/v1/get-monte-carlo';
import { getProfile } from '../../volume/v1/get-profile';
import {
  callVisionProvider,
  discoverAiProviders,
  discoverVisionProviders,
  type VaultumIntent,
} from './_shared';

type ChartReviewAlignment = 'aligned' | 'mixed' | 'conflicted' | 'unknown';

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
  chartReadSummary: string;
  alignment: ChartReviewAlignment;
  alignmentScore: number | null;
  thesisScore: number | null;
  extractedLevels: string[];
  overlayComparisons: string[];
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

function extractJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

type ParsedChartReview = {
  conclusion?: string;
  chartReadSummary?: string;
  chartBias?: 'bullish' | 'neutral' | 'bearish';
  alignment?: ChartReviewAlignment;
  alignmentScore?: number;
  thesisScore?: number;
  confidence?: 'low' | 'medium' | 'high';
  supportingSignals?: string[];
  caveats?: string[];
  watchItems?: string[];
  extractedLevels?: string[];
  overlayComparisons?: string[];
  answer?: string;
};

function asStringArray(values: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(values)) return fallback;
  return values.map((value) => String(value)).filter((value) => value.trim().length > 0);
}

function buildAnswer(input: {
  conclusion: string;
  chartReadSummary: string;
  supportingSignals: string[];
  caveats: string[];
  overlayComparisons: string[];
  watchItems: string[];
  alignment: ChartReviewAlignment;
  confidence: 'low' | 'medium' | 'high';
}): string {
  return [
    `Conclusion: ${input.conclusion}`,
    `Chart read: ${input.chartReadSummary}`,
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

  const [traderReport, pivots, profile, flowProxy, orderflow, pressure, scenario] = await Promise.all([
    getTraderReport({ market, timeframe, reportStyle: 'execution' }),
    getLevels({ market, timeframe }),
    getProfile({ market, timeframe }),
    getFlowProxy({ symbol: market }),
    getOrderflowEngine({ market, timeframe }),
    getBuyerSellerPressure({ market, mode: 'auto' }),
    getMonteCarloScenario({ market, timeframe }),
  ]);

  const liveContext = [
    `Market: ${market}`,
    `Timeframe: ${timeframe}`,
    `Desk summary: ${traderReport.summary}`,
    `Action plan: ${traderReport.actionPlan}`,
    `Risk watch: ${traderReport.riskWatch}`,
    `Execution committee: ${traderReport.executionCommittee.action} / ${traderReport.executionCommittee.ensembleScore}`,
    `Risk envelope: ${traderReport.riskEnvelope.body}`,
    `Structure support: ${fmtLevel((pivots as any)?.mappedSupport?.price ?? (pivots as any)?.supports?.[0])}`,
    `Structure resistance: ${fmtLevel((pivots as any)?.mappedResistance?.price ?? (pivots as any)?.resistances?.[0])}`,
    `Pivot: ${fmtLevel((pivots as any)?.pivot)}`,
    `POC / balance level: ${fmtLevel((pivots as any)?.dynamicLevel)}`,
    `Value area low/high: ${fmtLevel((profile as any)?.valueAreaLow)} / ${fmtLevel((profile as any)?.valueAreaHigh)}`,
    `POC: ${fmtLevel((profile as any)?.poc)}`,
    `Pressure: ${(pressure as any)?.dominance ?? 'unknown'} / ${(pressure as any)?.score ?? 'n/a'} / ${(pressure as any)?.structureState ?? 'unknown'}`,
    `Orderflow: ${(orderflow as any)?.dominance ?? 'unknown'} / ${(orderflow as any)?.buySellPressure ?? 'n/a'} / divergence ${(orderflow as any)?.priceDeltaDivergence ?? 'none'}`,
    `Gamma map: put ${fmtLevel((flowProxy as any)?.putWall)} / flip ${fmtLevel((flowProxy as any)?.gammaFlip)} / call ${fmtLevel((flowProxy as any)?.callWall)}`,
    `Options flow: ${(flowProxy as any)?.flowBias ?? 'unknown'} / dealer ${(flowProxy as any)?.dealerPositioning ?? 'unknown'} / squeeze ${(flowProxy as any)?.squeezeRisk ?? 'unknown'}`,
    `Scenario: ${(scenario as any)?.pathBias ?? 'unknown'} / target-first ${(scenario as any)?.targetFirstProbability ?? 'n/a'}% / invalidation-first ${(scenario as any)?.invalidationFirstProbability ?? 'n/a'}%`,
    `Technical measures: ${traderReport.reportMeasures.map((measure) => `${measure.label} ${measure.value}`).slice(0, 8).join(' | ')}`,
    `Technical stage: ${traderReport.decisionStages.find((stage) => stage.key === 'technical-committee')?.body ?? 'n/a'}`,
  ].join('\n');

  const systemPrompt = `You are VAULTUM AI reviewing a trader's chart screenshot against live institutional trading context.

Your job:
1. Read the screenshot itself.
2. Extract what the trader appears to be seeing: symbol/timeframe if visible, trendlines, zones, support/resistance, breakout/retest/chop, annotations, and visible indicators.
3. Compare that visual thesis against the live context below.
4. Tell the trader where the chart aligns with VAULTUM, where it conflicts, and what matters most for execution.

Rules:
- Never invent exact values that are not visible or provided.
- If the screenshot is unclear, say so.
- Treat the screenshot as a sidecar view, not truth.
- Use the live context as the institutional reference layer.
- Focus on entry quality, invalidation, chase risk, and catalyst/risk context.
- Return strict JSON only.

Required JSON shape:
{
  "conclusion": "short sentence",
  "chartReadSummary": "what the screenshot appears to show",
  "chartBias": "bullish|neutral|bearish",
  "alignment": "aligned|mixed|conflicted|unknown",
  "alignmentScore": 0,
  "thesisScore": 0,
  "confidence": "low|medium|high",
  "supportingSignals": ["..."],
  "caveats": ["..."],
  "watchItems": ["..."],
  "extractedLevels": ["..."],
  "overlayComparisons": ["..."],
  "answer": "compact desk-style paragraph"
}`;

  const userPrompt = [
    `Trader request: ${question}`,
    '',
    'Live VAULTUM context:',
    liveContext,
    '',
    'Instructions:',
    '- Read the screenshot and compare it to the live context.',
    '- If the screenshot thesis is late or chasing, say that clearly.',
    '- If the screenshot lines up with support/resistance, gamma, value area, or trend structure, say that clearly.',
    '- If the screenshot seems to ignore a live risk factor, call it out.',
  ].join('\n');

  const external = await callVisionProvider(systemPrompt, userPrompt, imageDataUrl);
  const parsed = extractJson<ParsedChartReview>(external.content);
  const visionAttempted = Boolean(external.provider);

  const providerTrace = external.attempted.length
    ? external.attempted
    : discoverVisionProviders().map((provider) => `${provider.provider}:${provider.model}`);
  const marketDataTrace = [
    ...traderReport.sourceTrace,
    'Chart screenshot review compares a user-provided image against the live Vaultum trader report and structure engines.',
  ].filter((value, index, values) => values.indexOf(value) === index);

  const overlayComparisons = [
    `Live support cluster ${fmtLevel((pivots as any)?.mappedSupport?.price ?? (pivots as any)?.supports?.[0])}.`,
    `Live resistance cluster ${fmtLevel((pivots as any)?.mappedResistance?.price ?? (pivots as any)?.resistances?.[0])}.`,
    `Value area ${fmtLevel((profile as any)?.valueAreaLow)} to ${fmtLevel((profile as any)?.valueAreaHigh)} with POC ${fmtLevel((profile as any)?.poc)}.`,
    `Gamma map ${fmtLevel((flowProxy as any)?.putWall)} / ${fmtLevel((flowProxy as any)?.gammaFlip)} / ${fmtLevel((flowProxy as any)?.callWall)}.`,
    `Execution committee ${traderReport.executionCommittee.action} with score ${traderReport.executionCommittee.ensembleScore}.`,
    `Risk envelope ${traderReport.riskEnvelope.sizeBand} at ${(traderReport.riskEnvelope.riskBudgetPct * 100).toFixed(0)}% normal risk.`,
  ];

  const fallbackConclusion = visionAttempted
    ? `${traderReport.summary} A vision model reviewed the screenshot, but it did not return a structured chart payload, so Vaultum is leaning more heavily on the live institutional context.`
    : `${traderReport.summary} Screenshot-specific image reading was not completed by a configured vision model, so this review falls back to the live institutional context only.`;
  const supportingSignals = parsed?.supportingSignals?.length
    ? asStringArray(parsed.supportingSignals)
    : [
        traderReport.summary,
        `Structure ${safeString((pivots as any)?.signalMap?.bias, 'mixed')}.`,
        `Pressure ${(pressure as any)?.dominance ?? 'unknown'} / ${(pressure as any)?.score ?? 'n/a'}.`,
        `Scenario ${(scenario as any)?.pathBias ?? 'unknown'} with ${(scenario as any)?.targetFirstProbability ?? 'n/a'}% target-first.`,
      ];
  const caveats = parsed?.caveats?.length
    ? asStringArray(parsed.caveats)
    : [
        'Screenshot interpretation was not available from a vision model, so this is a live-context-only fallback.',
        (orderflow as any)?.feedQuality === 'weak' ? 'Orderflow feed quality is weak here, so footprint-style reads stay estimated.' : 'Orderflow is still a proxy layer where centralized tape is unavailable.',
        (flowProxy as any)?.mode === 'synthetic-live' ? 'Options flow remains proxy-derived rather than paid contract tape.' : 'Options context is structural, not tape-truth.',
      ];
  const watchItems = parsed?.watchItems?.length
    ? asStringArray(parsed.watchItems)
    : [
        `Watch acceptance around ${fmtLevel((pivots as any)?.mappedSupport?.price ?? (pivots as any)?.supports?.[0])} and ${fmtLevel((pivots as any)?.mappedResistance?.price ?? (pivots as any)?.resistances?.[0])}.`,
        `Watch gamma pressure around ${fmtLevel((flowProxy as any)?.gammaFlip)} and squeeze risk ${(flowProxy as any)?.squeezeRisk ?? 'unknown'}.`,
        `Watch risk gate ${traderReport.riskEnvelope.actionMode} and event risk ${traderReport.riskEnvelope.eventRiskScore}.`,
      ];

  const response: VaultumChartReviewResponse = {
    provider: external.provider ?? 'deterministic-fallback:vaultum-live-context-only',
    providerTrace,
    marketDataTrace,
    intent: 'chart-review',
    toolsUsed: [
      'analytics.get_trader_report',
      'pivots.get_levels',
      'volume.get_profile',
      'options.get_flow_proxy',
      'orderflow.get_engine',
      'pressure.get_buyer_seller_pressure',
      'scenario.get_monte_carlo',
    ],
    confidence: parsed?.confidence ?? (external.provider ? 'medium' : 'low'),
    conclusion: parsed?.conclusion ?? fallbackConclusion,
    supportingSignals,
    caveats,
    watchItems,
    confirmedSignals: [
      traderReport.summary,
      `Execution ${traderReport.executionCommittee.action} / ${traderReport.executionCommittee.ensembleScore}.`,
      `Risk envelope ${traderReport.riskEnvelope.sizeBand}.`,
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
    missingData: visionAttempted
      ? (parsed ? [] : ['Vision review returned unstructured text, so exact screenshot extraction fields were not available.'])
      : [
          'No configured vision model successfully processed the screenshot.',
          ...(!discoverAiProviders().some((provider) => provider.provider !== 'deterministic-fallback')
            ? ['No AI providers are configured for screenshot review.']
            : ['No configured vision model is available on the current AI providers.']),
        ],
    answer: parsed?.answer && parsed.answer.trim().length
      ? parsed.answer
      : (visionAttempted && external.content?.trim().length
          ? external.content
          : buildAnswer({
              conclusion: parsed?.conclusion ?? fallbackConclusion,
              chartReadSummary: parsed?.chartReadSummary ?? 'Image-specific chart read unavailable; live institutional context review only.',
              supportingSignals,
              caveats,
              overlayComparisons: parsed?.overlayComparisons?.length ? asStringArray(parsed.overlayComparisons) : overlayComparisons,
              watchItems,
              alignment: parsed?.alignment ?? 'unknown',
              confidence: parsed?.confidence ?? (external.provider ? 'medium' : 'low'),
            })),
    contextSnapshot: [
      `Question: ${question}`,
      `Market: ${market}`,
      `Timeframe: ${timeframe}`,
      `Vision provider: ${external.provider ?? 'none'}`,
      `Live context:`,
      liveContext,
    ].join('\n'),
    market,
    timeframe,
    reviewMode: external.provider ? 'vision+live' : 'live-only-fallback',
    imageReviewed: visionAttempted,
    chartReadSummary: parsed?.chartReadSummary
      ?? (visionAttempted
        ? 'A vision model reviewed the screenshot, but Vaultum could not extract a structured chart summary from the response.'
        : 'The screenshot was not machine-read by a configured vision model, so the review falls back to the live institutional context.'),
    alignment: parsed?.alignment ?? 'unknown',
    alignmentScore: parsed?.alignmentScore != null ? clamp(Number(parsed.alignmentScore), 0, 100) : null,
    thesisScore: parsed?.thesisScore != null ? clamp(Number(parsed.thesisScore), 0, 100) : null,
    extractedLevels: parsed?.extractedLevels?.length ? asStringArray(parsed.extractedLevels) : [],
    overlayComparisons: parsed?.overlayComparisons?.length ? asStringArray(parsed.overlayComparisons) : overlayComparisons,
  };

  return response;
}
