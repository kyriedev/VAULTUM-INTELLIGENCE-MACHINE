import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { ITS_MTV_AM, ITS_MTV_AX, WTO_MEMBER_CODES, wtoFetch } from './_shared';

export async function getTradeFlows(input: { reporter: string; partner: string }): Promise<any> {
  const reporter = input.reporter || '840';
  const partner = input.partner || '000';
  return getCachedOrCompute(cacheKey('trade', `flows:${reporter}:${partner}`), async () => {
    const year = new Date().getFullYear();
    const base = { r: reporter, p: partner, ps: `${year - 5}-${year}`, pc: 'TO', fmt: 'json', mode: 'full', max: '200' };
    const [exportsData, importsData] = await Promise.all([
      wtoFetch('/data', { ...base, i: ITS_MTV_AX }),
      wtoFetch('/data', { ...base, i: ITS_MTV_AM }),
    ]);
    if (!exportsData && !importsData) return { flows: [], unavailable: true };

    const byYear = new Map<number, { exports: number; imports: number }>();
    [...(exportsData?.Dataset ?? []), ...(importsData?.Dataset ?? [])].forEach((row: any) => {
      const yr = Number(row.Year ?? row.year ?? 0);
      const value = Number(row.Value ?? row.value ?? 0);
      if (!yr) return;
      const current = byYear.get(yr) ?? { exports: 0, imports: 0 };
      if ((row.Indicator ?? row.indicator) === ITS_MTV_AX) current.exports = value;
      if ((row.Indicator ?? row.indicator) === ITS_MTV_AM) current.imports = value;
      byYear.set(yr, current);
    });

    return {
      flows: [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([yr, values]) => ({
        year: yr,
        exports: values.exports,
        imports: values.imports,
        reporter: WTO_MEMBER_CODES[reporter] ?? reporter,
        partner: WTO_MEMBER_CODES[partner] ?? partner,
      })),
    };
  }, 21600);
}
