import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { fetchOfficialCotMarket } from './_cftc-shared';

function crowdingFromNetShare(netShare: number): { zScore: number; crowdedRisk: string; bias: string } {
  const zScore = Number((netShare / 8).toFixed(2));
  const crowdedRisk = Math.abs(netShare) >= 12 ? 'high' : Math.abs(netShare) >= 6 ? 'moderate' : 'low';
  const bias = netShare > 2 ? 'bullish' : netShare < -2 ? 'bearish' : 'neutral';
  return { zScore, crowdedRisk, bias };
}

export async function getCotSummary(input: { market: string }): Promise<{
  market: string;
  zScore: number;
  summary: string;
  nonCommercialLong: number;
  nonCommercialShort: number;
  commercialLong: number;
  commercialShort: number;
  nonReportableLong: number;
  nonReportableShort: number;
  spreading: number;
  netPosition: number;
  commercialNetPosition: number;
  crowdedRisk: string;
  longShortRatio: number;
  reportDate: string;
  source: string;
  change: number;
}> {
  const market = (input.market || 'GOLD').toUpperCase();

  return getCachedOrCompute(cacheKey('positioning', `cot:${market}`), async () => {
    const data = await fetchOfficialCotMarket(market);
    if (!data || !data.openInterest) {
      return {
        market,
        zScore: 0,
        summary: 'Official CFTC COT data unavailable for the selected market.',
        nonCommercialLong: 0,
        nonCommercialShort: 0,
        commercialLong: 0,
        commercialShort: 0,
        nonReportableLong: 0,
        nonReportableShort: 0,
        spreading: 0,
        netPosition: 0,
        commercialNetPosition: 0,
        crowdedRisk: 'unknown',
        longShortRatio: 0,
        reportDate: '',
        source: 'CFTC unavailable',
        change: 0,
      };
    }

    const netShare = (data.nonCommercialNet / data.openInterest) * 100;
    const regime = crowdingFromNetShare(netShare);

    return {
      market,
      zScore: regime.zScore,
      summary: `${data.marketName} COT is ${regime.bias} with non-commercial net ${data.nonCommercialNet.toLocaleString()} contracts and ${regime.crowdedRisk} crowding risk.`,
      nonCommercialLong: data.nonCommercialLong,
      nonCommercialShort: data.nonCommercialShort,
      commercialLong: data.commercialLong,
      commercialShort: data.commercialShort,
      nonReportableLong: data.nonReportableLong,
      nonReportableShort: data.nonReportableShort,
      spreading: data.spreading,
      netPosition: data.nonCommercialNet,
      commercialNetPosition: data.commercialNet,
      crowdedRisk: regime.crowdedRisk,
      longShortRatio: data.longShortRatio,
      reportDate: data.reportDate,
      source: 'CFTC Disaggregated COT',
      change: data.nonCommercialChange,
    };
  }, 21600);
}
