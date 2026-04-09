import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { normalizeVaultumTimeframe } from '../../_shared/timeframes';
import { buildProviderCatalog } from '../../_shared/provider-catalog';
import { getEntryMap } from '../../analytics/v1/get-entry-map';
import { getInstitutionalMonitor } from '../../monitor/v1/get-institutional-monitor';
import { getOrderflowEngine } from '../../orderflow/v1/get-engine';
import { getPortfolioOverlay } from '../../portfolio/v1/get-overlay';
import { average, clamp, moatStatus, round, type MoatStatus, type SteeringTrack } from './_moat-shared';

type DataMoatLens = {
  key: string;
  label: string;
  score: number;
  status: MoatStatus;
  sourceMode: 'direct' | 'mixed' | 'proxy';
  summary: string;
};

export type DataMoatResponse = {
  generatedAt: string;
  market: string;
  timeframe: string;
  moatScore: number;
  status: MoatStatus;
  summary: string;
  strengths: string[];
  blindspots: string[];
  lenses: DataMoatLens[];
  roadmap: SteeringTrack[];
};

function providerStateWeight(state: string): number {
  if (state === 'active') return 1;
  if (state === 'ready' || state === 'configured') return 0.8;
  if (state === 'fallback') return 0.45;
  return 0;
}

function orderflowSourceMode(orderflow: any): 'direct' | 'mixed' | 'proxy' {
  if (orderflow?.volumeClass === 'exchange-volume') return 'direct';
  if (orderflow?.volumeClass === 'broker-volume') return 'mixed';
  return 'proxy';
}

export async function getDataMoat(input: {
  market?: string;
  timeframe?: string;
}): Promise<DataMoatResponse> {
  const market = String(input.market || 'XAUUSD').toUpperCase();
  const timeframe = normalizeVaultumTimeframe(input.timeframe);

  return getCachedOrCompute(cacheKey('system', `data-moat:${market}:${timeframe}`), async () => {
    const providerCatalog = buildProviderCatalog();
    const providerMap = new Map(providerCatalog.providers.map((provider) => [provider.id, provider]));
    const [entryMap, orderflow, portfolioOverlay, monitor] = await Promise.all([
      getEntryMap({ market, chartTimeframe: timeframe }).catch(() => null),
      getOrderflowEngine({ market, timeframe }).catch(() => null),
      getPortfolioOverlay({ market, timeframe }).catch(() => null),
      getInstitutionalMonitor({ market, timeframe }).catch(() => null),
    ]);

    const executionScore = clamp(
      ((entryMap?.modelTwoConfluenceScore ?? 48) * 0.55)
      + ((entryMap?.confidence ?? 45) * 0.25)
      + ((orderflow?.feedQuality === 'strong' ? 14 : orderflow?.feedQuality === 'usable' ? 8 : 2) * 1.1),
      26,
      92,
    );

    const orderflowScore = clamp(
      (orderflow?.feedQuality === 'strong' ? 84 : orderflow?.feedQuality === 'usable' ? 68 : orderflow?.feedQuality === 'weak' ? 42 : 32)
      + (orderflow?.volumeClass === 'exchange-volume' ? 10 : orderflow?.volumeClass === 'broker-volume' ? -2 : -12)
      + (orderflow?.secondSourceActive ? 6 : 0),
      18,
      95,
    );

    const macroProviders = ['fred', 'bis', 'tradingeconomics', 'cftc']
      .map((id) => providerStateWeight(providerMap.get(id)?.state ?? 'inactive'));
    const macroHighConfidence = monitor?.items?.filter((item: any) => item.confidence === 'high').length ?? 0;
    const institutionalMacroScore = clamp(
      (average(macroProviders) * 58)
      + (macroHighConfidence * 5)
      + 22,
      22,
      88,
    );

    const optionsProvider = providerStateWeight(providerMap.get('tda')?.state ?? 'inactive');
    const optionsMonitor = monitor?.items?.find((item: any) => item.key === 'options');
    const optionsScore = clamp(
      36
      + (optionsProvider * 22)
      + (optionsMonitor?.confidenceScore != null ? optionsMonitor.confidenceScore * 0.35 : 0)
      + (String(optionsMonitor?.status || '').toLowerCase() === 'estimated' ? -8 : 4),
      16,
      82,
    );

    const researchProviders = ['tradingview', 'yahoo', 'finnhub', 'twelvedata']
      .map((id) => providerStateWeight(providerMap.get(id)?.state ?? 'inactive'));
    const researchScore = clamp((average(researchProviders) * 58) + 26, 24, 86);

    const portfolioScore = clamp(
      28
      + (portfolioOverlay?.recommended?.allocations?.length ? 16 : 0)
      + ((portfolioOverlay?.diversificationScore ?? 0) * 0.34)
      - (portfolioOverlay?.warnings?.length ? portfolioOverlay.warnings.length * 4 : 0),
      18,
      84,
    );

    const fixedIncomeCreditScore = clamp(
      20
      + (providerStateWeight(providerMap.get('bis')?.state ?? 'inactive') * 24)
      + (providerStateWeight(providerMap.get('fred')?.state ?? 'inactive') * 20),
      16,
      68,
    );

    const postTradeWorkflowScore = 30;

    const lenses: DataMoatLens[] = [
      {
        key: 'execution-structure',
        label: 'Execution Structure',
        score: round(executionScore),
        status: moatStatus(executionScore),
        sourceMode: orderflowSourceMode(orderflow),
        summary: entryMap?.phaseSummary
          ? `Entry map is live with ${entryMap.phase} phase logic, ${entryMap.modelTwoConfluenceLabel ?? 'unknown'} confluence, and explicit invalidation.`
          : 'Execution structure still depends on the older bootstrap stack when the entry map is unavailable.',
      },
      {
        key: 'orderflow-volume',
        label: 'Orderflow And Volume',
        score: round(orderflowScore),
        status: moatStatus(orderflowScore),
        sourceMode: orderflowSourceMode(orderflow),
        summary: orderflow?.sourceLabel ?? 'Orderflow coverage is limited or unavailable.',
      },
      {
        key: 'institutional-macro',
        label: 'Institutional Macro',
        score: round(institutionalMacroScore),
        status: moatStatus(institutionalMacroScore),
        sourceMode: 'mixed',
        summary: monitor?.summary ?? 'Institutional macro stack is degraded.',
      },
      {
        key: 'options-vol',
        label: 'Options And Volatility',
        score: round(optionsScore),
        status: moatStatus(optionsScore),
        sourceMode: optionsProvider >= 0.8 ? 'mixed' : 'proxy',
        summary: optionsMonitor?.summary ?? 'Options structure is still largely synthetic.',
      },
      {
        key: 'research-search',
        label: 'Research And Screening',
        score: round(researchScore),
        status: moatStatus(researchScore),
        sourceMode: providerStateWeight(providerMap.get('finnhub')?.state ?? 'inactive') >= 0.8 ? 'mixed' : 'proxy',
        summary: 'TradingView, Yahoo, Finnhub, and Twelve Data sidecars now give Vaultum a broader analyst workbench than a single-feed dashboard.',
      },
      {
        key: 'portfolio-risk',
        label: 'Portfolio And Risk Overlay',
        score: round(portfolioScore),
        status: moatStatus(portfolioScore),
        sourceMode: 'proxy',
        summary: portfolioOverlay?.summary ?? 'Portfolio overlay is inactive because proxy history or context is unavailable.',
      },
      {
        key: 'fixed-income-credit',
        label: 'Rates And Credit Depth',
        score: round(fixedIncomeCreditScore),
        status: moatStatus(fixedIncomeCreditScore),
        sourceMode: 'mixed',
        summary: 'BIS and FRED give Vaultum institutional macro footing, but full rates, credit, curve, and spread coverage are still thinner than a terminal stack.',
      },
      {
        key: 'post-trade-workflow',
        label: 'Post-Trade Workflow',
        score: round(postTradeWorkflowScore),
        status: moatStatus(postTradeWorkflowScore),
        sourceMode: 'proxy',
        summary: 'Vaultum has a manual journal and reflection loop, but the post-trade learning layer still needs deeper replay, tagging, and idea-attribution discipline.',
      },
    ];

    const moatScore = round(average(lenses.map((lens) => lens.score)));
    const strengths = lenses
      .filter((lens) => lens.score >= 62)
      .map((lens) => `${lens.label}: ${lens.summary}`)
      .slice(0, 4);

    const blindspots = [
      orderflow?.volumeClass !== 'exchange-volume'
        ? `${market} is not always running on centralized exchange tape, so orderflow can still be broker-style or proxy participation rather than full venue truth.`
        : null,
      optionsScore < 56
        ? 'Options structure still leans on proxy math more than direct chain breadth, so vol-surface depth remains a gap.'
        : null,
      fixedIncomeCreditScore < 58
        ? 'Fixed income and credit depth are still shallow relative to a terminal-grade rates and spreads stack.'
        : null,
      postTradeWorkflowScore < 50
        ? 'Post-trade workflow is still manual; review quality depends on how well the trader logs what Vaultum said, what they did, and what the market actually did.'
        : null,
      portfolioScore < 60
        ? 'Portfolio overlay is useful for diversification and hedging, but it is not yet full idea attribution, VaR, or mandate-level portfolio risk.'
        : null,
      researchScore < 60
        ? 'Analyst search and screening breadth still depend on sidecars rather than a dedicated cross-asset query engine.'
        : null,
    ].filter((value): value is string => Boolean(value));

    const roadmap: SteeringTrack[] = [
      {
        key: 'data-backbone',
        title: 'Data Backbone',
        priority: 'now',
        status: moatScore >= 64 ? 'active' : 'building',
        summary: 'Keep upgrading futures-first volume anchors, institutional macro feeds, and source-ranked sidecars so the machine is less proxy-dependent.',
      },
      {
        key: 'execution-workflow',
        title: 'Trade Workflow And Review',
        priority: 'now',
        status: postTradeWorkflowScore >= 58 ? 'active' : 'building',
        summary: 'Move from basic journaling into stronger pre-trade checklists, manual replay, and phase-aware post-trade learning so the workflow closes the loop.',
      },
      {
        key: 'analyst-os',
        title: 'Analyst OS',
        priority: 'now',
        status: 'active',
        summary: 'Vaultum now has the first Analyst OS layer, but it still needs deeper cross-asset querying, alerts, and workflow memory.',
      },
      {
        key: 'portfolio-risk',
        title: 'Portfolio And Risk',
        priority: 'soon',
        status: portfolioScore >= 58 ? 'building' : 'missing',
        summary: 'Promote the portfolio overlay into stronger allocation, hedging, concentration, idea-attribution, and scenario-aware risk control.',
      },
      {
        key: 'reliability-governance',
        title: 'Reliability And Governance',
        priority: 'soon',
        status: 'building',
        summary: 'Formalize source lineage, trust rules, entitlement awareness, auditability, and operator-grade runtime monitoring.',
      },
    ];

    return {
      generatedAt: new Date().toISOString(),
      market,
      timeframe,
      moatScore,
      status: moatStatus(moatScore),
      summary: `Vaultum data moat is ${moatStatus(moatScore)} at ${moatScore}/100. Execution structure and institutional workflow depth are ahead of general dashboards, but direct data breadth, fixed income/credit depth, and post-trade workflow still need more buildout.`,
      strengths,
      blindspots,
      lenses,
      roadmap,
    };
  }, 60);
}
