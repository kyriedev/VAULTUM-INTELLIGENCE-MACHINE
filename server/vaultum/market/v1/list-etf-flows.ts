import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { CHROME_UA, yahooGate } from '../../../_shared/constants';

const ETF_LIST = [
  { ticker: 'GLD', issuer: 'State Street' },
  { ticker: 'IAU', issuer: 'iShares' },
  { ticker: 'USO', issuer: 'United States Oil Fund' },
  { ticker: 'UUP', issuer: 'Invesco Dollar Index' },
  { ticker: 'FXE', issuer: 'Invesco Euro Trust' }
];

async function fetchEtfChart(ticker: string): Promise<any | null> {
  try {
    await yahooGate();
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=5d&interval=1d`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function listEtfFlows(): Promise<{ summary: { netDirection: string }; flows: Array<{ ticker: string; issuer: string; priceChange: number; volumeRatio: number; direction: string }> }> {
  return getCachedOrCompute(cacheKey('market', 'etf-flows'), async () => {
    const flows: Array<{ ticker: string; issuer: string; priceChange: number; volumeRatio: number; direction: string }> = [];
    for (const etf of ETF_LIST) {
      const chart = await fetchEtfChart(etf.ticker);
      const result = chart?.chart?.result?.[0];
      const quote = result?.indicators?.quote?.[0];
      const closes = (quote?.close ?? []).filter((value: number | null) => value != null);
      const volumes = (quote?.volume ?? []).filter((value: number | null) => value != null);
      if (closes.length < 2 || volumes.length < 2) continue;

      const latestPrice = closes[closes.length - 1];
      const prevPrice = closes[closes.length - 2];
      const latestVolume = volumes[volumes.length - 1];
      const avgVolume = volumes.slice(0, -1).reduce((sum: number, value: number) => sum + value, 0) / (volumes.length - 1);
      const priceChange = prevPrice ? ((latestPrice - prevPrice) / prevPrice) * 100 : 0;
      flows.push({
        ticker: etf.ticker,
        issuer: etf.issuer,
        priceChange: Number(priceChange.toFixed(2)),
        volumeRatio: Number((latestVolume / avgVolume).toFixed(2)),
        direction: priceChange > 0.1 ? 'inflow-bias' : priceChange < -0.1 ? 'outflow-bias' : 'flat',
      });
    }

    const net = flows.reduce((sum, flow) => sum + flow.priceChange, 0);
    return {
      summary: { netDirection: net > 0 ? 'NET INFLOW BIAS' : net < 0 ? 'NET OUTFLOW BIAS' : 'NEUTRAL' },
      flows,
    };
  }, 600);
}
