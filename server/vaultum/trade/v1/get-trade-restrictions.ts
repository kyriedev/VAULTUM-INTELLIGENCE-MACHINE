import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { WTO_MEMBER_CODES, wtoFetch } from './_shared';

const REPORTERS = ['840', '156', '276', '392', '826', '356', '643', '410'];

export async function getTradeRestrictions(): Promise<any> {
  return getCachedOrCompute(cacheKey('trade', 'restrictions'), async () => {
    const currentYear = new Date().getFullYear();
    const data = await wtoFetch('/data', {
      i: 'TP_A_0010',
      r: REPORTERS.join(','),
      ps: `${currentYear - 3}-${currentYear}`,
      fmt: 'json',
      mode: 'full',
      max: '100',
    });
    if (!data) return { restrictions: [], unavailable: true };

    const latestByCountry = new Map<string, any>();
    (data.Dataset ?? []).forEach((row: any) => {
      const code = String(row.ReportingEconomyCode ?? '');
      const year = Number(row.Year ?? row.year ?? 0);
      const existing = latestByCountry.get(code);
      if (!existing || year > Number(existing.Year ?? existing.year ?? 0)) latestByCountry.set(code, row);
    });

    const restrictions = [...latestByCountry.values()].map((row: any) => ({
      reporter: WTO_MEMBER_CODES[String(row.ReportingEconomyCode ?? '')] ?? String(row.ReportingEconomy ?? ''),
      year: Number(row.Year ?? row.year ?? 0),
      tariffRate: Number(row.Value ?? row.value ?? 0),
    })).sort((a, b) => b.tariffRate - a.tariffRate);

    return { restrictions };
  }, 21600);
}
