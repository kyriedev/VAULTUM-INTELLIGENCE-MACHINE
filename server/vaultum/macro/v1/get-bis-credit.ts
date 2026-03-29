import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { BIS_COUNTRIES, BIS_COUNTRY_KEYS, fetchBisCSV, parseBisCSV, parseBisNumber } from './_bis-shared';

export async function getBisCredit(): Promise<{ credit: Array<{ country: string; regime: string; ratio: number; previousRatio: number; date: string }> }> {
  return getCachedOrCompute(cacheKey('macro', 'bis-credit'), async () => {
    try {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const startPeriod = `${twoYearsAgo.getFullYear()}-Q1`;

      const csv = await fetchBisCSV('WS_TC', `Q.${BIS_COUNTRY_KEYS}.C.A.M.770.A?startPeriod=${startPeriod}&detail=dataonly`);
      const rows = parseBisCSV(csv);

      const byCountry = new Map<string, Array<{ date: string; value: number }>>();
      rows.forEach((row) => {
        const country = row.REF_AREA || row['Reference area'] || '';
        const date = row.TIME_PERIOD || row['Time period'] || '';
        const value = parseBisNumber(row.OBS_VALUE || row['Observation value']);
        if (!country || !date || value == null) return;
        if (!byCountry.has(country)) byCountry.set(country, []);
        byCountry.get(country)?.push({ date, value });
      });

      const credit = [...byCountry.entries()].flatMap(([country, observations]) => {
        const info = BIS_COUNTRIES[country];
        if (!info) return [];

        observations.sort((left, right) => left.date.localeCompare(right.date));
        const latest = observations[observations.length - 1];
        const previous = observations[observations.length - 2] ?? latest;
        if (!latest || !previous) return [];

        const change = latest.value - previous.value;
        const regime = change > 2
          ? 'credit accelerating'
          : change < -2
            ? 'credit cooling'
            : 'credit broadly stable';

        return [{
          country: info.name,
          regime,
          ratio: Number(latest.value.toFixed(1)),
          previousRatio: Number(previous.value.toFixed(1)),
          date: latest.date,
        }];
      });

      return { credit };
    } catch {
      return { credit: [] };
    }
  }, 43200);
}
