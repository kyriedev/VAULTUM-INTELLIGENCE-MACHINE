import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { buildFeedSnapshotMeta, type FeedSnapshotMeta, type FeedSourceMode, type FeedHealthStatus, minutesSince } from '../../_shared/feed-health';
import { normalizeVaultumTimeframe } from '../../_shared/timeframes';
import { getNewsIntel } from '../../intelligence/v1/get-news-intel';
import { getXIntel } from '../../intelligence/v1/get-x-intel';
import { getMacroSignals } from '../../macro/v1/get-macro-signals';
import { getGammaLevels } from '../../options/v1/get-gamma-levels';
import { getDealerPressure } from '../../options/v1/get-dealer-pressure';
import { getOrderflowEngine } from '../../orderflow/v1/get-engine';
import { getBuyerSellerPressure } from '../../pressure/v1/get-buyer-seller-pressure';
import { getMonteCarloScenario } from '../../scenario/v1/get-monte-carlo';
import { getCotSummary } from '../../positioning/v1/get-cot-summary';

type FeedHealthItem = FeedSnapshotMeta & {
  key: string;
  notes: string[];
};

export type FeedHealthResponse = {
  generatedAt: string;
  market: string;
  timeframe: string;
  overallStatus: FeedHealthStatus;
  overallTrustHaircut: number;
  summary: string;
  feeds: FeedHealthItem[];
};

function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeMarket(market?: string): string {
  const upper = String(market || 'XAUUSD').trim().toUpperCase();
  const aliases: Record<string, string> = {
    GOLD: 'XAUUSD',
    'GC=F': 'XAUUSD',
    '^DJI': 'US30',
    DIA: 'US30',
    'YM=F': 'US30',
  };
  return aliases[upper] ?? upper;
}

function cotMarketFor(market: string): string | null {
  if (market === 'XAUUSD') return 'GOLD';
  if (market === 'WTI' || market === 'OIL') return 'WTI';
  return null;
}

function sourceModeFromOrderflow(volumeClass: string | null | undefined): FeedSourceMode {
  if (volumeClass === 'exchange-volume') return 'direct';
  if (volumeClass === 'broker-volume') return 'broker';
  return 'proxy';
}

function statusRank(status: FeedHealthStatus): number {
  if (status === 'STALE') return 3;
  if (status === 'WARN') return 2;
  if (status === 'EMPTY') return 1;
  return 0;
}

function inferOverallStatus(items: FeedHealthItem[]): FeedHealthStatus {
  if (!items.length) return 'EMPTY';
  const worst = items.reduce((current, item) => Math.max(current, statusRank(item.status)), 0);
  if (worst >= 3) return 'STALE';
  if (worst === 2) return 'WARN';
  if (worst === 1 && !items.some((item) => item.status === 'OK')) return 'EMPTY';
  return 'OK';
}

function buildSyntheticMeta(input: {
  key: string;
  label: string;
  sourceMode: FeedSourceMode;
  detail: string;
  available: boolean;
  staleAfterMinutes?: number;
  extraHaircut?: number;
  fallbackState?: FeedSnapshotMeta['fallbackState'];
  notes?: string[];
}): FeedHealthItem {
  return {
    key: input.key,
    notes: input.notes ?? [],
    ...buildFeedSnapshotMeta({
      label: input.label,
      generatedAt: new Date().toISOString(),
      staleAfterMinutes: input.staleAfterMinutes ?? 240,
      sourceMode: input.sourceMode,
      available: input.available,
      detail: input.detail,
      extraHaircut: input.extraHaircut,
      fallbackState: input.fallbackState,
    }),
  };
}

export async function getFeedHealth(input: {
  market?: string;
  timeframe?: string;
}): Promise<FeedHealthResponse> {
  const market = normalizeMarket(input.market);
  const timeframe = normalizeVaultumTimeframe(input.timeframe);

  return getCachedOrCompute(cacheKey('system', `feed-health:${market}:${timeframe}`), async () => {
    const [newsIntel, xIntel, macro, gamma, dealer, orderflow, pressure, scenario, cot] = await Promise.all([
      getNewsIntel({ market, timeframe }).catch(() => null),
      getXIntel({ market, timeframe }).catch(() => null),
      getMacroSignals({ market }).catch(() => null),
      getGammaLevels({ symbol: market }).catch(() => null),
      getDealerPressure({ symbol: market }).catch(() => null),
      getOrderflowEngine({ market, timeframe }).catch(() => null),
      getBuyerSellerPressure({ market, timeframe, mode: 'auto' }).catch(() => null),
      getMonteCarloScenario({ market, timeframe }).catch(() => null),
      cotMarketFor(market) ? getCotSummary({ market: cotMarketFor(market)! }).catch(() => null) : Promise.resolve(null),
    ]);

    const items: FeedHealthItem[] = [];

    if (newsIntel?.snapshotMeta) {
      items.push({
        key: 'news-intel',
        notes: [
          'Structured news/calendar interpretation is the main catalyst layer.',
          xIntel?.state === 'active' ? 'Tracked-account X flow is actively reinforcing the headline layer.' : 'Tracked-account X flow is not actively reinforcing this layer right now.',
        ],
        ...newsIntel.snapshotMeta,
      });
    } else {
      items.push(buildSyntheticMeta({
        key: 'news-intel',
        label: 'News Intelligence',
        sourceMode: 'proxy',
        available: Boolean(newsIntel?.summary),
        detail: newsIntel?.summary ?? 'Structured news intelligence unavailable.',
        extraHaircut: 0.1,
        notes: ['Headline interpretation is unavailable, so the calendar remains the fallback context.'],
      }));
    }

    if (xIntel?.snapshotMeta) {
      items.push({
        key: 'x-intel',
        notes: [
          'X remains a fast catalyst layer, not standalone execution proof.',
          xIntel.monitor?.activelyMonitoring ? `Tracking ${xIntel.monitor.watchCount} live event clusters.` : 'Active monitoring is not currently running.',
        ],
        ...xIntel.snapshotMeta,
      });
    } else {
      items.push(buildSyntheticMeta({
        key: 'x-intel',
        label: 'X Event Intelligence',
        sourceMode: 'inactive',
        available: false,
        detail: 'Tracked-account X layer unavailable.',
        fallbackState: 'inactive',
        notes: ['Fast policy/headline catalyst flow is unavailable until the X tracked-account layer is active.'],
      }));
    }

    items.push(buildSyntheticMeta({
      key: 'macro',
      label: 'Macro Signals',
      sourceMode: macro?.ratesDifferentials?.scoreboard?.length ? 'mixed' : 'proxy',
      available: Boolean(macro?.focus?.summary || macro?.regime),
      detail: macro?.focus?.summary ?? (macro?.regime ? `Macro regime ${macro.regime}.` : 'Macro signals unavailable.'),
      extraHaircut: macro?.ratesDifferentials?.scoreboard?.length ? 0.02 : 0.08,
      notes: [
        macro?.ratesDifferentials?.focus?.summary ?? 'Rates-differential nuance is not fully active.',
        macro?.focus?.executionFocus ?? 'Macro layer is currently only a context filter.',
      ],
    }));

    items.push(buildSyntheticMeta({
      key: 'orderflow',
      label: 'Orderflow Engine',
      sourceMode: sourceModeFromOrderflow(orderflow?.volumeClass),
      available: Boolean(orderflow?.summary),
      detail: orderflow?.summary ?? orderflow?.sourceLabel ?? 'Orderflow engine unavailable.',
      extraHaircut: orderflow?.feedQuality === 'strong' ? 0 : orderflow?.feedQuality === 'usable' ? 0.05 : 0.12,
      notes: [
        orderflow?.sourceLabel ?? 'Orderflow source labeling unavailable.',
        orderflow?.divergenceDetail ?? 'Divergence layer unavailable.',
      ],
    }));

    items.push(buildSyntheticMeta({
      key: 'pressure',
      label: 'Buyer/Seller Pressure',
      sourceMode: /oanda/i.test(String(pressure?.sourceLabel || ''))
        ? 'broker'
        : /proxy|estimated/i.test(String(pressure?.sourceLabel || ''))
          ? 'proxy'
          : 'mixed',
      available: pressure?.score != null,
      detail: pressure?.sourceLabel ?? 'Buyer/seller pressure unavailable.',
      extraHaircut: pressure?.mode === 'unavailable' ? 0.12 : pressure?.secondSourceActive ? 0.02 : 0.06,
      notes: [
        pressure?.liquiditySummary ?? 'Pressure liquidity map unavailable.',
        pressure?.aggregateVolumeLabel ?? 'No second-source pressure sidecar is active.',
      ],
    }));

    items.push(buildSyntheticMeta({
      key: 'gamma',
      label: 'Gamma Structure',
      sourceMode: gamma?.mode === 'synthetic-live' ? 'synthetic' : 'mixed',
      available: Boolean(gamma?.symbol),
      detail: gamma?.sourceLabel ?? 'Gamma structure unavailable.',
      staleAfterMinutes: 720,
      extraHaircut: gamma?.mode === 'synthetic-live' ? 0.14 : 0.04,
      notes: [
        gamma?.greekAgreementNote ?? 'Greek agreement note unavailable.',
        gamma?.chainAvailable ? 'Structured chain proxy is contributing.' : 'Chain structure is synthetic-live only.',
      ],
    }));

    items.push(buildSyntheticMeta({
      key: 'dealer-pressure',
      label: 'Dealer Pressure',
      sourceMode: dealer?.mode === 'synthetic-live' ? 'synthetic' : 'mixed',
      available: Boolean(dealer?.conclusion),
      detail: dealer?.sourceLabel ?? dealer?.conclusion ?? 'Dealer pressure unavailable.',
      staleAfterMinutes: 720,
      extraHaircut: dealer?.mode === 'synthetic-live' ? 0.14 : 0.04,
      notes: [
        dealer?.conclusion ?? 'Dealer pressure conclusion unavailable.',
        dealer?.chainAvailable ? 'Chain-linked proxy inputs are present.' : 'Dealer logic is inferred from proxy structure only.',
      ],
    }));

    items.push(buildSyntheticMeta({
      key: 'scenario',
      label: 'Scenario Engine',
      sourceMode: 'mixed',
      available: Boolean(scenario?.summary),
      detail: scenario?.summary ?? scenario?.sourceLabel ?? 'Scenario engine unavailable.',
      staleAfterMinutes: 240,
      extraHaircut: scenario?.scenarioQuality === 'high' ? 0.02 : scenario?.scenarioQuality === 'medium' ? 0.06 : 0.1,
      notes: [
        scenario?.sourceLabel ?? 'Scenario source labeling unavailable.',
        `Scenario quality: ${scenario?.scenarioQuality ?? 'unknown'}.`,
      ],
    }));

    if (cot) {
      const reportAge = minutesSince(cot.reportDate ? new Date(cot.reportDate).toISOString() : null);
      items.push({
        key: 'cot',
        notes: [
          cot.marketImpact ?? 'COT market-impact note unavailable.',
          'COT is higher-timeframe institutional posture, not intraday timing.',
        ],
        ...buildFeedSnapshotMeta({
          label: 'COT Positioning',
          generatedAt: new Date().toISOString(),
          lastUpdatedAt: cot.reportDate ? new Date(cot.reportDate).toISOString() : null,
          staleAfterMinutes: 10_080,
          sourceMode: 'direct',
          available: Boolean(cot.reportDate),
          detail: cot.summary ?? 'COT unavailable.',
          extraHaircut: reportAge != null && reportAge > 7_200 ? 0.05 : 0,
        }),
      });
    } else {
      items.push(buildSyntheticMeta({
        key: 'cot',
        label: 'COT Positioning',
        sourceMode: 'inactive',
        available: false,
        detail: cotMarketFor(market)
          ? 'COT feed unavailable for the mapped market.'
          : `${market} does not currently have a direct hedger-focused COT mapping in Vaultum.`,
        fallbackState: 'inactive',
        notes: ['COT is intentionally absent here rather than faked for unsupported markets.'],
      }));
    }

    const overallStatus = inferOverallStatus(items);
    const overallTrustHaircut = round(items.reduce((sum, item) => sum + item.trustHaircut, 0) / Math.max(items.length, 1));
    const worst = items
      .slice()
      .sort((left, right) => statusRank(right.status) - statusRank(left.status) || right.trustHaircut - left.trustHaircut)
      .slice(0, 2)
      .map((item) => `${item.label} ${item.status} (${Math.round(item.trustHaircut * 100)}% haircut)`);

    return {
      generatedAt: new Date().toISOString(),
      market,
      timeframe,
      overallStatus,
      overallTrustHaircut,
      summary: overallStatus === 'OK'
        ? `Feed health is stable for ${market}; the average trust haircut is ${Math.round(overallTrustHaircut * 100)}%, with the biggest caveats coming from ${worst.join(' and ')}.`
        : `Feed health needs caution for ${market}; the average trust haircut is ${Math.round(overallTrustHaircut * 100)}%, led by ${worst.join(' and ')}.`,
      feeds: items,
    };
  }, 45);
}
