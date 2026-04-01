import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { fetchOfficialCotMarket } from './_cftc-shared';

function crowdingFromNetShare(netShare: number): { zScore: number; crowdedRisk: string; bias: string } {
  const zScore = Number((netShare / 8).toFixed(2));
  const crowdedRisk = Math.abs(netShare) >= 12 ? 'high' : Math.abs(netShare) >= 6 ? 'moderate' : 'low';
  const bias = netShare > 2 ? 'bullish' : netShare < -2 ? 'bearish' : 'neutral';
  return { zScore, crowdedRisk, bias };
}

function primaryLensForMarket(market: string): 'commercials' | 'speculative-crowding' {
  return market === 'GOLD' || market === 'WTI' || market === 'OIL' ? 'commercials' : 'speculative-crowding';
}

function signedContracts(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toLocaleString()}`;
}

function netPositionLabel(value: number): string {
  if (value > 0) return `net long ${value.toLocaleString()}`;
  if (value < 0) return `net short ${Math.abs(value).toLocaleString()}`;
  return 'flat';
}

function commercialShiftSentence(marketName: string, change: number, net: number): string {
  if (change > 0) {
    return `${marketName} commercials / hedgers increased their net position by ${signedContracts(change)} to ${netPositionLabel(net)}.`;
  }
  if (change < 0) {
    return `${marketName} commercials / hedgers reduced their net position by ${Math.abs(change).toLocaleString()} contracts to ${netPositionLabel(net)}.`;
  }
  return `${marketName} commercials / hedgers held a steady ${netPositionLabel(net)} posture this week.`;
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
  commercialChange: number;
  primaryLens: 'commercials' | 'speculative-crowding';
  commercialSummary: string;
  marketImpact: string;
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
        commercialChange: 0,
        primaryLens: primaryLensForMarket(market),
        commercialSummary: 'Commercial positioning unavailable.',
        marketImpact: 'COT market-impact read unavailable.',
      };
    }

    const netShare = (data.nonCommercialNet / data.openInterest) * 100;
    const regime = crowdingFromNetShare(netShare);
    const primaryLens = primaryLensForMarket(market);
    const commercialSummary = commercialShiftSentence(data.marketName, data.commercialChange, data.commercialNet);
    const marketImpact = primaryLens === 'commercials'
      ? `For ${market === 'GOLD' ? 'gold' : 'oil'}, the commercial / hedger shift is the lead weekly positioning read, while spec crowding stays secondary context.`
      : `Spec crowding remains the lead read here, while commercial positioning is secondary context.`;
    const summary = primaryLens === 'commercials'
      ? `${commercialSummary} Non-commercials remain ${netPositionLabel(data.nonCommercialNet)} with ${regime.crowdedRisk} crowding risk.`
      : `${data.marketName} COT is ${regime.bias} with non-commercial net ${data.nonCommercialNet.toLocaleString()} contracts and ${regime.crowdedRisk} crowding risk. Commercials sit ${netPositionLabel(data.commercialNet)} with weekly change ${signedContracts(data.commercialChange)}.`;

    return {
      market,
      zScore: regime.zScore,
      summary,
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
      commercialChange: data.commercialChange,
      primaryLens,
      commercialSummary,
      marketImpact,
    };
  }, 21600);
}
