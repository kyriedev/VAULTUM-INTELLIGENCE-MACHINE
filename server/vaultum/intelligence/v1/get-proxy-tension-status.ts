import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { getCrossAssetRegime } from '../../liquidity/v1/get-cross-asset-regime';
import { getSafeHavenPressure } from '../../liquidity/v1/get-safe-haven-pressure';
import { getMacroSignals } from '../../macro/v1/get-macro-signals';
import { listCommodityQuotes } from '../../market/v1/list-commodity-quotes';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export async function getProxyTensionStatus(): Promise<{
  conclusion: string;
  score: number;
  regions: Array<{ region: string; status: string; driver: string }>;
}> {
  return getCachedOrCompute(cacheKey('intelligence', 'proxy-tension-status'), async () => {
    const [macro, crossAsset, safeHaven, commodities] = await Promise.all([
      getMacroSignals(),
      getCrossAssetRegime(),
      getSafeHavenPressure(),
      listCommodityQuotes({ symbols: ['CL=F', 'BZ=F', 'GC=F'] }).catch(() => ({ quotes: [] as Array<{ symbol: string; change: number }> })),
    ]);

    const oil = commodities.quotes?.find((quote) => quote.symbol === 'CL=F' || quote.symbol === 'BZ=F') ?? null;
    const gold = commodities.quotes?.find((quote) => quote.symbol === 'GC=F') ?? null;
    const stressScore = clamp(Math.round(
      35
      + Number(safeHaven?.score ?? 50) * 0.35
      + ((oil?.change ?? 0) * 7)
      + (((crossAsset?.supporting?.vix ?? 0)) * 2.5)
      + (((macro?.energy?.oilChange ?? 0)) * 5),
    ), 0, 100);

    const shippingStatus =
      (oil?.change ?? 0) >= 1.5 || macro?.inferred?.geopoliticalStress === 'elevated'
        ? 'shipping-sensitive'
        : (oil?.change ?? 0) >= 0.7
          ? 'watch'
          : 'contained';
    const energyStatus =
      macro?.inferred?.geopoliticalStress === 'elevated' || (macro?.energy?.oilChange ?? 0) >= 2
        ? 'high sensitivity'
        : (macro?.energy?.oilChange ?? 0) >= 0.8
          ? 'moderate sensitivity'
          : 'contained';
    const asiaStatus =
      crossAsset?.riskState === 'risk-off' || Number(safeHaven?.score ?? 0) >= 62
        ? 'strategic watch'
        : 'background watch';

    const conclusion =
      stressScore >= 68
        ? `Proxy geopolitical stress is elevated: oil is ${oil?.change != null ? `${oil.change >= 0 ? '+' : ''}${oil.change.toFixed(2)}%` : 'n/a'}, gold is ${gold?.change != null ? `${gold.change >= 0 ? '+' : ''}${gold.change.toFixed(2)}%` : 'n/a'}, and the safe-haven complex is active.`
        : stressScore >= 52
          ? 'Proxy geopolitical stress is elevated enough to stay on the watchlist, but cross-asset confirmation is not yet extreme.'
          : 'Proxy geopolitical stress is contained in the live cross-asset read right now.';

    return {
      conclusion,
      score: stressScore,
      regions: [
        {
          region: 'Energy chokepoints',
          status: energyStatus,
          driver: `Oil change ${macro?.energy?.oilChange ?? 'n/a'}% and macro stress ${macro?.inferred?.geopoliticalStress ?? 'unknown'}.`,
        },
        {
          region: 'Shipping corridors',
          status: shippingStatus,
          driver: `Cross-asset regime ${crossAsset?.regime ?? 'unknown'} with safe-haven score ${safeHaven?.score ?? 'n/a'}.`,
        },
        {
          region: 'Asia strategic risk',
          status: asiaStatus,
          driver: `Risk state ${crossAsset?.riskState ?? 'unknown'} with gold ${gold?.change ?? 'n/a'}% and VIX ${crossAsset?.supporting?.vix ?? 'n/a'}%.`,
        },
      ],
    };
  }, 300);
}
