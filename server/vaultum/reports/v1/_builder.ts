import { getTraderReport } from '../../analytics/v1/get-trader-report';
import { getEconomicCalendar } from '../../calendar/v1/get-economic-calendar';
import { getMacroSignals } from '../../macro/v1/get-macro-signals';
import { getFlowProxy } from '../../options/v1/get-flow-proxy';
import { getOrderflowEngine } from '../../orderflow/v1/get-engine';
import { getLevels } from '../../pivots/v1/get-levels';
import { getCotSummary } from '../../positioning/v1/get-cot-summary';
import { getPositioningRegime } from '../../positioning/v1/get-positioning-regime';
import { listPredictionMarkets } from '../../prediction/v1/list-prediction-markets';
import { getMonteCarloScenario } from '../../scenario/v1/get-monte-carlo';
import { structuralTimeframeFor } from '../../_shared/timeframes';
import { getProfile } from '../../volume/v1/get-profile';
import { getInstitutionalMonitor } from '../../monitor/v1/get-institutional-monitor';
import { resolveVaultumReportWindow, type ReportPeriod, type VaultumReportWindow } from './_schedule';

export type VaultumReportTable = {
  headers: string[];
  rows: string[][];
};

export type VaultumReportSection = {
  title: string;
  lead: string;
  bullets: string[];
  table?: VaultumReportTable;
};

export type VaultumReportDocument = {
  title: string;
  subtitle: string;
  market: string;
  period: ReportPeriod;
  timeframe: string;
  generatedAt: string;
  readyAt: string;
  readyLocalLabel: string;
  coveredLabel: string;
  timezoneLabel: string;
  sourceLabel: string;
  executiveSummary: string[];
  sections: VaultumReportSection[];
  warnings: string[];
  appendix: string[];
  window: VaultumReportWindow;
};

function resolveCotMarket(market: string): 'GOLD' | 'WTI' | null {
  const normalized = market.toUpperCase();
  if (normalized === 'XAUUSD' || normalized === 'GOLD') return 'GOLD';
  if (normalized === 'WTI' || normalized === 'OIL') return 'WTI';
  return null;
}

function marketLabel(market: string): string {
  const normalized = market.toUpperCase();
  if (normalized === 'XAUUSD') return 'Gold / XAUUSD';
  if (normalized === 'WTI') return 'WTI Crude';
  return normalized;
}

function periodSubtitle(period: ReportPeriod): string {
  if (period === 'weekly') return 'Weekly Flow, Positioning, And Regime Note';
  if (period === 'quarterly') return 'Quarter-End Regime, Positioning, And Strategy Note';
  return 'Daily Close And Next Session Positioning Note';
}

function periodLead(period: ReportPeriod): string {
  if (period === 'weekly') return 'Built for weekend review and next-week bias construction from the institutional stack.';
  if (period === 'quarterly') return 'Built for quarter-end strategic review using the current live regime stack and structural state.';
  return 'Built for next-session preparation immediately after the New York close / FX roll window.';
}

export async function buildVaultumReportDocument(input: {
  market?: string;
  period: ReportPeriod;
}): Promise<VaultumReportDocument> {
  const market = String(input.market || 'XAUUSD').toUpperCase();
  const window = resolveVaultumReportWindow(input.period);
  const timeframe = window.timeframe;
  const structuralTimeframe = structuralTimeframeFor(timeframe);
  const cotMarket = resolveCotMarket(market);

  const [
    traderReport,
    monitor,
    macro,
    calendar,
    flowProxy,
    orderflow,
    pivots,
    profile,
    scenario,
    prediction,
    cotSummary,
    positioningRegime,
  ] = await Promise.all([
    getTraderReport({ market, timeframe, reportStyle: 'desk' }),
    getInstitutionalMonitor({ market, timeframe }),
    getMacroSignals(),
    getEconomicCalendar({ market }),
    getFlowProxy({ symbol: market }),
    getOrderflowEngine({ market, timeframe }),
    getLevels({ market, timeframe: structuralTimeframe }),
    getProfile({ market, timeframe: structuralTimeframe }),
    getMonteCarloScenario({ market, timeframe }),
    listPredictionMarkets({ market, mode: 'markets' }),
    cotMarket ? getCotSummary({ market: cotMarket }) : Promise.resolve(null),
    cotMarket ? getPositioningRegime({ market: cotMarket }) : Promise.resolve(null),
  ]);

  const upcomingEvents = Array.isArray(calendar?.events) ? calendar.events.slice(0, 5) : [];
  const monitorTable: VaultumReportTable = {
    headers: ['Stack', 'State', 'Confidence', 'Status'],
    rows: monitor.items.map((item) => [
      item.label,
      item.state,
      `${item.confidence} ${item.confidenceScore}`,
      item.status,
    ]),
  };

  const dashboardTable: VaultumReportTable = {
    headers: ['Measure', 'Value', 'Status'],
    rows: (traderReport.reportMeasures ?? []).slice(0, 8).map((measure) => [
      measure.label,
      measure.value,
      measure.status,
    ]),
  };

  const catalystTable: VaultumReportTable | undefined = upcomingEvents.length
    ? {
        headers: ['Time', 'Currency', 'Event', 'Impact'],
        rows: upcomingEvents.map((event: any) => [
          String(event.localTime || event.date || 'n/a'),
          String(event.currency || 'n/a'),
          String(event.event || 'n/a'),
          String(event.impact || 'n/a'),
        ]),
      }
    : undefined;

  const sections: VaultumReportSection[] = [
    {
      title: 'Executive Dashboard',
      lead: traderReport.summary,
      bullets: [
        traderReport.actionPlan,
        traderReport.riskWatch,
        ...traderReport.confirmationChecklist.slice(0, 3),
      ],
      table: dashboardTable,
    },
    {
      title: 'Institutional Monitor',
      lead: monitor.summary,
      bullets: [
        ...monitor.items.slice(0, 5).map((item) => item.summary),
        ...monitor.alerts.slice(0, 3),
      ],
      table: monitorTable,
    },
    {
      title: 'Structure And Liquidity',
      lead: traderReport.sections.structure.body,
      bullets: [
        orderflow.liquidityMapSummary,
        `Stop-cluster bias: ${orderflow.stopClusterBias ?? 'unknown'}.`,
        `Mapped support ${pivots?.mappedSupport?.price ?? 'n/a'} / resistance ${pivots?.mappedResistance?.price ?? 'n/a'} / dynamic ${pivots?.dynamicLevel ?? 'n/a'}.`,
        `Value area ${profile?.valueAreaPosition ?? 'unknown'} with POC distance ${profile?.pocDistance ?? 'n/a'}.`,
      ],
    },
    {
      title: 'Dealers, Gamma, And Positioning',
      lead: traderReport.sections.flow.body,
      bullets: [
        `Dealer posture: ${flowProxy.dealerPositioning} with ${flowProxy.squeezeRisk} squeeze risk.`,
        `Gamma map: put wall ${flowProxy.putWall}, flip ${flowProxy.gammaFlip}, call wall ${flowProxy.callWall}.`,
        cotSummary
          ? `${cotSummary.summary} ${cotSummary.marketImpact ?? ''} Regime ${positioningRegime?.regime ?? 'unknown'} / bias ${positioningRegime?.bias ?? 'unknown'}.`
          : 'Official COT annex is unavailable for this market mapping, so crowding is inferred from live flow and prediction context only.',
        cotSummary
          ? `Commercial change ${cotSummary.commercialChange ?? 'n/a'} vs spec change ${cotSummary.change ?? 'n/a'} contracts.`
          : 'Commercial change unavailable for this market mapping.',
        prediction?.summary ?? 'Prediction-market crowd layer unavailable.',
      ],
    },
    {
      title: 'Macro And Policy',
      lead: `Macro regime ${macro?.regime ?? 'unknown'} with policy divergence ${macro?.inferred?.policyDivergence ?? 'unknown'}.`,
      bullets: [
        `Real 10Y yield ${macro?.rates?.real10y ?? 'n/a'} with ${macro?.inferred?.realYieldPressure ?? 'unknown'} pressure and ${macro?.rates?.curveShape ?? 'unknown'} curve shape.`,
        `Dollar regime ${macro?.inferred?.dollarRegime ?? 'unknown'} and haven pressure ${macro?.safeHavenPressure ?? 'unknown'}.`,
        `Fed ${macro?.policy?.fedRate ?? 'n/a'}%, ECB ${macro?.policy?.ecbRate ?? 'n/a'}%, BOJ ${macro?.policy?.bojRate ?? 'n/a'}%.`,
        `Energy backdrop: oil ${macro?.energy?.oilChange ?? 'n/a'}% with geopolitical stress ${macro?.inferred?.geopoliticalStress ?? 'unknown'}.`,
      ],
    },
    {
      title: 'Catalysts And Event Risk',
      lead: calendar?.summary ?? 'Calendar state unavailable.',
      bullets: [
        upcomingEvents[0] ? `Nearest event: ${upcomingEvents[0].currency} ${upcomingEvents[0].event} (${upcomingEvents[0].impact}).` : 'No immediate catalyst was returned by the calendar layer.',
        `Market note: ${periodLead(input.period)}`,
      ],
      table: catalystTable,
    },
    {
      title: 'Scenario And Next Session Plan',
      lead: traderReport.sections.execution.body,
      bullets: [
        `Monte Carlo path bias ${scenario?.pathBias ?? 'unknown'} with target-first ${scenario?.targetFirstProbability ?? 'n/a'}% and invalidation-first ${scenario?.invalidationFirstProbability ?? 'n/a'}%.`,
        `Support-hold probability ${scenario?.supportHoldProbability ?? 'n/a'}% and median max drawdown ${scenario?.medianMaxDrawdownPct ?? 'n/a'}%.`,
        `Recommended framing: ${traderReport.actionPlan}`,
        ...traderReport.invalidationChecklist.slice(0, 3),
      ],
    },
  ];

  const warnings = [
    ...traderReport.warnings.slice(0, 6),
    input.period === 'quarterly'
      ? 'Quarterly note is currently a quarter-end regime snapshot, not a fully archived historical performance book.'
      : null,
  ].filter((item): item is string => Boolean(item));

  return {
    title: `${marketLabel(market)} ${window.label}`,
    subtitle: periodSubtitle(input.period),
    market,
    period: input.period,
    timeframe,
    generatedAt: new Date().toISOString(),
    readyAt: window.readyAt,
    readyLocalLabel: window.readyLocalLabel,
    coveredLabel: window.coveredLabel,
    timezoneLabel: window.timezoneLabel,
    sourceLabel: 'Vaultum reports are assembled from the same live trader-report, institutional monitor, structure, flow, macro, and scenario engines that power the terminal and AI layers.',
    executiveSummary: [
      traderReport.summary,
      traderReport.actionPlan,
      traderReport.riskWatch,
      cotSummary?.primaryLens === 'commercials' ? cotSummary.commercialSummary : null,
      periodLead(input.period),
    ].filter((item): item is string => Boolean(item)),
    sections,
    warnings,
    appendix: [
      ...traderReport.sourceTrace.slice(0, 8),
      monitor.sourceLabel,
      'TradingView remains chart UI only; report data comes from backend engines and providers.',
    ],
    window,
  };
}
