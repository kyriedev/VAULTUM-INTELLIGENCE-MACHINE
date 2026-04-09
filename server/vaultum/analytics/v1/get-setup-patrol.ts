import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { normalizeVaultumTimeframe } from '../../_shared/timeframes';
import { getOrderflowEngine } from '../../orderflow/v1/get-engine';
import { getMacroSignals } from '../../macro/v1/get-macro-signals';
import { getNewsIntel } from '../../intelligence/v1/get-news-intel';
import { getEntryMap } from './get-entry-map';

function normalizeMarket(input?: string): string {
  const market = String(input || 'XAUUSD').trim().toUpperCase();
  if (market === 'GOLD' || market === 'XAU') return 'XAUUSD';
  return market || 'XAUUSD';
}

export async function getSetupPatrol(input: {
  market?: string;
  timeframe?: string;
} = {}): Promise<any> {
  const market = normalizeMarket(input.market);
  const timeframe = normalizeVaultumTimeframe(input.timeframe);

  return getCachedOrCompute(cacheKey('analytics', `setup-patrol:${market}:${timeframe}`), async () => {
    const [entryMap, orderflow, macro, news] = await Promise.all([
      getEntryMap({ market, chartTimeframe: timeframe }),
      getOrderflowEngine({ market, timeframe }),
      getMacroSignals({ market }).catch(() => null),
      getNewsIntel({ market, timeframe }).catch(() => null),
    ]);

    const nextEvent = news?.nextEvent ?? null;
    const eventTooClose = nextEvent?.minutesUntil != null && nextEvent.minutesUntil <= 45;
    const highProbability =
      !entryMap.doNotExecute
      && entryMap.readiness === 'ready'
      && entryMap.confidence >= 72
      && entryMap.modelTwoConfluenceScore >= 70;
    const building =
      !highProbability
      && !entryMap.doNotExecute
      && (entryMap.readiness === 'watch' || entryMap.modelTwoConfluenceLabel === 'building');

    const patrolState = highProbability ? 'armed' : building ? 'monitoring' : 'standby';
    const nextAction = highProbability
      ? `Active setup patrol: ${entryMap.executionRead}`
      : building
        ? `Monitor ${entryMap.institutionalReferenceZone} for ${entryMap.triggerPattern} and phase confirmation.`
        : `Stand by until the market leaves ${entryMap.phase} / ${entryMap.readiness} and clears the current blockers.`;

    return {
      generatedAt: new Date().toISOString(),
      market,
      timeframe,
      patrolState,
      summary: `${market} patrol is ${patrolState}. ${nextAction}`,
      chartAutomation: {
        canScanLive: true,
        canAutoPanChart: false,
        note: 'Vaultum can actively rescan live structure, orderflow, macro, and catalyst state. The current TradingView embed does not expose reliable in-app left/right programmatic panning, so patrol is data-driven rather than camera-driven.',
      },
      whyNow: [
        entryMap.phaseSummary,
        entryMap.tradeThesisSummary,
        orderflow?.summary,
        macro?.focus?.summary,
      ].filter((item): item is string => Boolean(item)).slice(0, 4),
      whatIsMissing: [
        ...(entryMap.noTradeReasons ?? []),
        ...(eventTooClose && nextEvent ? [`${nextEvent.currency} ${nextEvent.event} is too close for clean execution.`] : []),
      ].slice(0, 5),
      triggerChecklist: [
        { label: 'Phase', state: entryMap.phase, detail: entryMap.phaseSummary },
        { label: 'Readiness', state: entryMap.readiness, detail: entryMap.executionRead },
        { label: 'Model 2', state: entryMap.modelTwoConfluenceLabel, detail: entryMap.modelTwoConfluenceSummary },
        { label: 'Orderflow', state: orderflow?.dominance ?? 'unknown', detail: orderflow?.summary ?? 'Orderflow summary unavailable.' },
        { label: 'Macro', state: macro?.focus?.bias ?? 'unknown', detail: macro?.focus?.summary ?? 'Macro focus unavailable.' },
        { label: 'Catalyst', state: eventTooClose ? 'blocked' : (news?.patternModel?.bias ?? 'quiet'), detail: news?.smartAnalysis?.summary ?? 'Catalyst layer unavailable.' },
      ],
      alertConditions: [
        ...entryMap.alertConditions.slice(0, 4),
        nextEvent ? `Next event: ${nextEvent.currency} ${nextEvent.event} ${nextEvent.minutesUntil != null ? `in ${nextEvent.minutesUntil}m` : 'approaching'}.` : null,
      ].filter((item): item is string => Boolean(item)),
      entryMap,
    };
  }, 15);
}
