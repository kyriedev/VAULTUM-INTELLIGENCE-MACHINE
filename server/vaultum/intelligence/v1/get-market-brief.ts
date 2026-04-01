import { getTraderReport } from '../../analytics/v1/get-trader-report';

export async function getMarketBrief(input: { market?: string; timeframe?: string }): Promise<any> {
  return getTraderReport({ market: input.market, timeframe: input.timeframe, reportStyle: 'desk' });
}
