import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { BIS_COUNTRIES, BIS_COUNTRY_KEYS, fetchBisCSV, parseBisCSV, parseBisNumber } from './_bis-shared';

export async function getBisExchangeRates(): Promise<{ pairs: Array<{ pair: string; bias: string; realEer: number; realChange: number; date: string }> }> {
  return getCachedOrCompute(cacheKey('macro', 'bis-exchange-rates'), async () => {
    try {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const startPeriod = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}`;

      const csv = await fetchBisCSV('WS_EER', `M.R.B.${BIS_COUNTRY_KEYS}?startPeriod=${startPeriod}&detail=dataonly`);
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

      const pairs = [...byCountry.entries()].flatMap(([country, observations]) => {
        const info = BIS_COUNTRIES[country];
        if (!info) return [];

        observations.sort((left, right) => left.date.localeCompare(right.date));
        const latest = observations[observations.length - 1];
        const previous = observations[observations.length - 2] ?? latest;
        if (!latest || !previous) return [];

        const realChange = previous.value !== 0 ? ((latest.value - previous.value) / previous.value) * 100 : 0;
        return [{
          pair: info.name,
          bias: realChange >= 0 ? 'real effective strength' : 'real effective softness',
          realEer: Number(latest.value.toFixed(2)),
          realChange: Number(realChange.toFixed(1)),
          date: latest.date,
        }];
      });

      return { pairs };
    } catch {
      return { pairs: [] };
    }
  }, 21600);
}
