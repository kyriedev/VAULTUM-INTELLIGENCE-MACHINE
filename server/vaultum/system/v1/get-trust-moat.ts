import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { normalizeVaultumTimeframe } from '../../_shared/timeframes';
import { buildProviderCatalog } from '../../_shared/provider-catalog';
import { getGammaLevels } from '../../options/v1/get-gamma-levels';
import { getOrderflowEngine } from '../../orderflow/v1/get-engine';
import { getPortfolioOverlay } from '../../portfolio/v1/get-overlay';
import { getProfile } from '../../volume/v1/get-profile';
import { average, clamp, round, trustStatus, uniqueStrings, type TrustStatus } from './_moat-shared';

type TrustLedgerItem = {
  key: string;
  label: string;
  sourceType: 'direct' | 'mixed' | 'proxy';
  quality: string;
  detail: string;
};

export type TrustMoatResponse = {
  generatedAt: string;
  market: string;
  timeframe: string;
  trustScore: number;
  status: TrustStatus;
  summary: string;
  safeguards: string[];
  warnings: string[];
  sourceLedger: TrustLedgerItem[];
};

function sourceTypeFromOrderflow(orderflow: any): 'direct' | 'mixed' | 'proxy' {
  if (orderflow?.volumeClass === 'exchange-volume') return 'direct';
  if (orderflow?.volumeClass === 'broker-volume') return 'mixed';
  return 'proxy';
}

function sourceTypeFromOptions(gamma: any): 'direct' | 'mixed' | 'proxy' {
  if (gamma?.mode === 'direct') return 'direct';
  if (gamma?.mode && !/synthetic|estimated/i.test(String(gamma.mode))) return 'mixed';
  return 'proxy';
}

function ledgerScore(item: TrustLedgerItem): number {
  const base =
    item.sourceType === 'direct' ? 86
      : item.sourceType === 'mixed' ? 68
        : 44;
  const qualityBoost =
    /strong|high|active/i.test(item.quality) ? 8
      : /usable|building|configured/i.test(item.quality) ? 3
        : /weak|estimated|manual/i.test(item.quality) ? -8
          : 0;
  return clamp(base + qualityBoost, 24, 94);
}

export async function getTrustMoat(input: {
  market?: string;
  timeframe?: string;
}): Promise<TrustMoatResponse> {
  const market = String(input.market || 'XAUUSD').toUpperCase();
  const timeframe = normalizeVaultumTimeframe(input.timeframe);

  return getCachedOrCompute(cacheKey('system', `trust-moat:${market}:${timeframe}`), async () => {
    const providerCatalog = buildProviderCatalog();
    const [orderflow, profile, gamma, portfolioOverlay] = await Promise.all([
      getOrderflowEngine({ market, timeframe }).catch(() => null),
      getProfile({ market, timeframe }).catch(() => null),
      getGammaLevels({ symbol: market }).catch(() => null),
      getPortfolioOverlay({ market, timeframe }).catch(() => null),
    ]);

    const providerStates = providerCatalog.providers.map((provider) =>
      provider.state === 'active' ? 90
        : provider.state === 'ready' || provider.state === 'configured' ? 74
          : provider.state === 'fallback' ? 58
            : 28);
    const providerDisciplineScore = average(providerStates);

    const sourceLedger: TrustLedgerItem[] = [
      {
        key: 'orderflow',
        label: 'Orderflow Engine',
        sourceType: sourceTypeFromOrderflow(orderflow),
        quality: orderflow?.feedQuality ?? 'unknown',
        detail: orderflow?.sourceLabel ?? 'Orderflow source labeling is unavailable.',
      },
      {
        key: 'profile',
        label: 'Volume Profile',
        sourceType: sourceTypeFromOrderflow(orderflow),
        quality: profile?.mode ?? 'unknown',
        detail: profile?.sourceLabel ?? 'Volume profile source labeling is unavailable.',
      },
      {
        key: 'options',
        label: 'Options Structure',
        sourceType: sourceTypeFromOptions(gamma),
        quality: gamma?.mode ?? 'unknown',
        detail: gamma?.sourceLabel ?? 'Options source labeling is unavailable.',
      },
      {
        key: 'portfolio',
        label: 'Portfolio Overlay',
        sourceType: 'proxy',
        quality: portfolioOverlay?.recommended?.model ?? 'inactive',
        detail: portfolioOverlay?.sourceLabel ?? 'Portfolio overlay source labeling is unavailable.',
      },
      {
        key: 'journal',
        label: 'Post-Trade Review',
        sourceType: 'proxy',
        quality: 'manual',
        detail: 'Trade review is explicit and local, but it still depends on disciplined manual capture rather than automatic trade import.',
      },
    ];

    const lineageScore = clamp(
      average(sourceLedger.map((item) => ledgerScore(item)))
      + (sourceLedger.filter((item) => item.detail && item.detail !== 'unknown').length * 1.5),
      24,
      96,
    );

    const disclosureScore = clamp(
      52
      + (sourceLedger.filter((item) => item.sourceType === 'proxy').length * 4)
      + (sourceLedger.filter((item) => /source|label|proxy|broker|exchange/i.test(item.detail)).length * 5),
      28,
      94,
    );

    const trustScore = round(average([providerDisciplineScore, lineageScore, disclosureScore]));
    const warnings = uniqueStrings([
      sourceTypeFromOrderflow(orderflow) !== 'direct'
        ? `${market} orderflow is not always exchange-tape truth, so the machine must keep labeling it as ${orderflow?.volumeClass ?? 'proxy volume'}.`
        : null,
      sourceTypeFromOptions(gamma) === 'proxy'
        ? 'Options structure still includes synthetic or estimated math, so Vaultum should treat it as contextual structure rather than direct chain truth.'
        : null,
      'Trade journal and review still rely on manual operator input, so weak journaling can create false lessons even when the analysis was strong.',
      providerCatalog.providers.find((provider) => provider.id === 'redis')?.state !== 'active'
        ? 'Shared cache is not fully active, so cross-instance trust and stale fallback discipline are weaker than they should be.'
        : null,
    ]);

    const safeguards = [
      'Every major workflow should say whether the source is exchange, broker, relay, fallback, or synthetic.',
      'Proxy orderflow and synthetic options math must stay labeled as context, never disguised as direct venue truth.',
      'Freshness, fallback state, and missing-lens warnings should travel with the output instead of living only in logs.',
      'Manual journaling is acceptable for an analysis-only terminal, but the review template must capture what Vaultum said, what the trader did, and what invalidated the idea.',
    ];

    return {
      generatedAt: new Date().toISOString(),
      market,
      timeframe,
      trustScore,
      status: trustStatus(trustScore),
      summary: `Vaultum trust moat is ${trustStatus(trustScore)} at ${trustScore}/100. Source labeling and fallback disclosure are improving fast, but proxy orderflow, synthetic options math, and manual review still need tighter analysis-grade truth rails.`,
      safeguards,
      warnings,
      sourceLedger,
    };
  }, 60);
}
