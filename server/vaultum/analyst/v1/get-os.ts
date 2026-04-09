import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { normalizeVaultumTimeframe } from '../../_shared/timeframes';
import { getEntryMap } from '../../analytics/v1/get-entry-map';
import { getTraderReport } from '../../analytics/v1/get-trader-report';
import { getInstitutionalMonitor } from '../../monitor/v1/get-institutional-monitor';
import { getPortfolioOverlay } from '../../portfolio/v1/get-overlay';
import { getMonteCarloScenario } from '../../scenario/v1/get-monte-carlo';
import { getDataMoat } from '../../system/v1/get-data-moat';
import { getTrustMoat } from '../../system/v1/get-trust-moat';
import { round, uniqueStrings, type SteeringTrack } from '../../system/v1/_moat-shared';

type AnalystFocus = 'desk' | 'macro' | 'execution' | 'risk' | 'portfolio' | 'catalyst';

type AnalystDecisionNode = {
  key: 'regime' | 'phase' | 'setup' | 'execution' | 'risk' | 'review';
  label: string;
  state: string;
  confidence: 'low' | 'medium' | 'high';
  reason: string;
  action: string;
  sources: string[];
};

export type AnalystOsResponse = {
  generatedAt: string;
  market: string;
  timeframe: string;
  focus: AnalystFocus;
  mission: string;
  summary: string;
  decisionChain: AnalystDecisionNode[];
  blindspots: string[];
  nextQueries: string[];
  operatorPlan: string[];
  steeringTracks: SteeringTrack[];
  trustSummary: string;
  dataSummary: string;
  trustScore: number;
  dataMoatScore: number;
};

function detectFocus(question: string): AnalystFocus {
  const text = question.toLowerCase();
  if (/(portfolio|hedge|diversification|allocation|reserve)/.test(text)) return 'portfolio';
  if (/(risk|drawdown|suppression|var|exposure|blindspot)/.test(text)) return 'risk';
  if (/(entry|exit|execute|phase|impulse|correction|continuation|setup)/.test(text)) return 'execution';
  if (/(macro|rates|yield|dxy|liquidity|policy)/.test(text)) return 'macro';
  if (/(news|calendar|event|catalyst)/.test(text)) return 'catalyst';
  return 'desk';
}

function focusQueries(market: string, focus: AnalystFocus): string[] {
  if (focus === 'macro') {
    return [
      `What changed in the macro regime for ${market} and which institutional line matters most?`,
      `Which rates, dollar, or liquidity input is most likely to break the current phase?`,
      `What catalyst would flip the current regime from supportive to restrictive?`,
    ];
  }
  if (focus === 'execution') {
    return [
      `What confirms ${market} is still in ${market === 'XAUUSD' ? 'gold' : market} execution phase alignment and what invalidates it?`,
      'Which entry condition is missing right now: structure, flow, timing, or catalyst?',
      'What would make this go from watch to ready without forcing the trade?',
    ];
  }
  if (focus === 'risk') {
    return [
      `Where is the trust gap in ${market}: source quality, catalyst risk, or portfolio overlap?`,
      'What would suppress execution even if the chart still looks attractive?',
      'Which blindspot matters most over the next session?',
    ];
  }
  if (focus === 'portfolio') {
    return [
      `How much ${market} exposure should stay deployed versus reserved right now?`,
      'What is the best hedge if the main thesis is wrong?',
      'Where is hidden concentration building across the book?',
    ];
  }
  if (focus === 'catalyst') {
    return [
      `What catalyst matters most next for ${market} and why?`,
      'Which upcoming event could break the current setup before targets are hit?',
      'What should I watch around the calendar instead of the chart alone?',
    ];
  }
  return [
    `Run the full regime to execution chain for ${market}.`,
    `What is the biggest blindspot in the current ${market} workflow?`,
    'Which track should Vaultum improve next to become harder to fool?',
  ];
}

export async function getAnalystOs(input: {
  market?: string;
  timeframe?: string;
  question?: string;
}): Promise<AnalystOsResponse> {
  const market = String(input.market || 'XAUUSD').toUpperCase();
  const timeframe = normalizeVaultumTimeframe(input.timeframe);
  const question = String(input.question || '').trim();
  const focus = detectFocus(question);

  return getCachedOrCompute(cacheKey('analyst', `os:${market}:${timeframe}:${focus}:${question || 'default'}`), async () => {
    const [traderReport, entryMap, monitor, scenario, portfolioOverlay, dataMoat, trustMoat] = await Promise.all([
      getTraderReport({ market, timeframe, reportStyle: 'desk' }).catch(() => null),
      getEntryMap({ market, chartTimeframe: timeframe }).catch(() => null),
      getInstitutionalMonitor({ market, timeframe }).catch(() => null),
      getMonteCarloScenario({ market, timeframe }).catch(() => null),
      getPortfolioOverlay({ market, timeframe }).catch(() => null),
      getDataMoat({ market, timeframe }).catch(() => null),
      getTrustMoat({ market, timeframe }).catch(() => null),
    ]);

    const decisionChain: AnalystDecisionNode[] = [
      {
        key: 'regime',
        label: 'Regime',
        state: traderReport?.metrics?.macro ?? monitor?.items?.find((item: any) => item.key === 'rates')?.state ?? 'unknown',
        confidence: traderReport?.confidence ?? 'medium',
        reason: monitor?.summary ?? traderReport?.summary ?? 'Regime stack unavailable.',
        action: 'Anchor the desk on macro, dollar, liquidity, and institutional pressure before reading the chart in isolation.',
        sources: uniqueStrings([monitor?.sourceLabel, traderReport?.sourceLabel]),
      },
      {
        key: 'phase',
        label: 'Execution Phase',
        state: entryMap ? `${entryMap.phase} / ${entryMap.biasLabel}` : 'unknown',
        confidence: entryMap?.confidenceLabel ?? 'medium',
        reason: entryMap?.phaseSummary ?? 'Entry-map phase logic unavailable.',
        action: 'Use the market phase as the bridge between regime and the actual setup.',
        sources: uniqueStrings([entryMap?.sourceLabel]),
      },
      {
        key: 'setup',
        label: 'Setup Quality',
        state: entryMap?.modelTwoConfluenceLabel ?? traderReport?.confidence ?? 'unknown',
        confidence: entryMap?.confidenceLabel ?? traderReport?.confidence ?? 'medium',
        reason: entryMap?.modelTwoConfluenceSummary ?? traderReport?.actionPlan ?? 'Setup-quality stack unavailable.',
        action: 'Require structure, flow, and timing agreement before promoting the idea from watchlist to trade candidate.',
        sources: uniqueStrings([entryMap?.sourceLabel, traderReport?.sourceLabel]),
      },
      {
        key: 'execution',
        label: 'Execution Workflow',
        state: traderReport?.stance ?? entryMap?.readiness ?? 'unknown',
        confidence: traderReport?.confidence ?? 'medium',
        reason: traderReport?.actionPlan ?? entryMap?.executionRead ?? 'Execution workflow unavailable.',
        action: entryMap?.executionChecklist?.[0] ?? 'Run the checklist, then either execute manually with invalidation discipline or stand aside.',
        sources: uniqueStrings([traderReport?.sourceLabel, entryMap?.sourceLabel]),
      },
      {
        key: 'risk',
        label: 'Risk Envelope',
        state: traderReport?.riskEnvelope?.actionMode ?? portfolioOverlay?.recommended?.model ?? 'unknown',
        confidence: traderReport?.confidence ?? 'medium',
        reason: traderReport?.riskWatch ?? scenario?.summary ?? 'Risk envelope unavailable.',
        action: portfolioOverlay?.summary ?? 'Size down when the scenario, trust, or portfolio lens goes defensive.',
        sources: uniqueStrings([scenario?.sourceLabel, portfolioOverlay?.sourceLabel]),
      },
      {
        key: 'review',
        label: 'Review Loop',
        state: 'manual review',
        confidence: 'medium',
        reason: 'Vaultum can remember reflected outcomes, but the journal and post-trade review still rely on manual operator capture.',
        action: 'After the trade, store the lesson and compare it against the setup chain instead of reviewing from memory alone.',
        sources: ['reflect_trade_outcome', 'trade journal'],
      },
    ];

    const blindspots = uniqueStrings([
      ...(dataMoat?.blindspots ?? []),
      ...(trustMoat?.warnings ?? []),
      ...(traderReport?.warnings ?? []),
    ]).slice(0, 8);

    const operatorPlan = [
      `Start with ${decisionChain[0]?.label.toLowerCase()}: ${decisionChain[0]?.state ?? 'unknown'}.`,
      `Translate that into phase: ${decisionChain[1]?.state ?? 'unknown'}.`,
      `Promote the idea only if setup quality is real: ${decisionChain[2]?.state ?? 'unknown'}.`,
      `Use the checklist before manual execution, not emotion: ${decisionChain[3]?.action ?? 'checklist unavailable'}.`,
      `Respect the risk lens and reserve: ${decisionChain[4]?.reason ?? 'risk lens unavailable'}.`,
      'Close the loop with post-trade review so the machine and operator both learn from the outcome.',
    ];

    const dataMoatScore = round(dataMoat?.moatScore ?? 0);
    const trustScore = round(trustMoat?.trustScore ?? 0);
    const summary = [
      traderReport?.summary ?? entryMap?.executionRead ?? 'Analyst OS is waiting for the desk stack.',
      `Data moat ${dataMoatScore}/100.`,
      `Trust moat ${trustScore}/100.`,
      blindspots[0] ? `Main blindspot: ${blindspots[0]}` : null,
    ].filter(Boolean).join(' ');

    return {
      generatedAt: new Date().toISOString(),
      market,
      timeframe,
      focus,
      mission: question
        ? `Run the ${focus} workflow for ${market} on ${timeframe} and surface the strongest reason, the weakest trust point, and the next operator move.`
        : `Run the regime -> phase -> setup -> execution -> risk -> review chain for ${market} on ${timeframe}.`,
      summary,
      decisionChain,
      blindspots,
      nextQueries: focusQueries(market, focus),
      operatorPlan,
      steeringTracks: dataMoat?.roadmap ?? [],
      trustSummary: trustMoat?.summary ?? 'Trust moat unavailable.',
      dataSummary: dataMoat?.summary ?? 'Data moat unavailable.',
      trustScore,
      dataMoatScore,
    };
  }, 45);
}
