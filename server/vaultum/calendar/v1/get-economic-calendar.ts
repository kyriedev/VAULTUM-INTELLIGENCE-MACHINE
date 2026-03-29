import { cacheKey } from '../../../_shared/cache-keys';
import { CHROME_UA } from '../../../_shared/constants';
import { getCachedOrCompute } from '../../../_shared/redis';

type CalendarEvent = {
  date: string;
  country: string;
  currency: string;
  event: string;
  category: string;
  impact: 'holiday' | 'low' | 'medium' | 'high';
  importance: number;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  source: string | null;
  isUpcoming: boolean;
  minutesUntil: number | null;
};

function apiKey(): string {
  return (process.env.TRADINGECONOMICS_API_KEY || '').trim() || 'guest:guest';
}

function countriesForMarket(market: string): Array<{ currency: string; country: string }> {
  const upper = (market || 'XAUUSD').toUpperCase();
  const map: Record<string, Array<{ currency: string; country: string }>> = {
    XAUUSD: [{ currency: 'USD', country: 'United States' }],
    GOLD: [{ currency: 'USD', country: 'United States' }],
    WTI: [{ currency: 'USD', country: 'United States' }],
    OIL: [{ currency: 'USD', country: 'United States' }],
    DXY: [{ currency: 'USD', country: 'United States' }],
    SPX: [{ currency: 'USD', country: 'United States' }],
    NDX: [{ currency: 'USD', country: 'United States' }],
    VIX: [{ currency: 'USD', country: 'United States' }],
    BTCUSD: [{ currency: 'USD', country: 'United States' }],
    EURUSD: [{ currency: 'EUR', country: 'Euro Area' }, { currency: 'USD', country: 'United States' }],
    GBPUSD: [{ currency: 'GBP', country: 'United Kingdom' }, { currency: 'USD', country: 'United States' }],
    USDJPY: [{ currency: 'USD', country: 'United States' }, { currency: 'JPY', country: 'Japan' }],
    GBPJPY: [{ currency: 'GBP', country: 'United Kingdom' }, { currency: 'JPY', country: 'Japan' }],
    EURJPY: [{ currency: 'EUR', country: 'Euro Area' }, { currency: 'JPY', country: 'Japan' }],
  };
  return map[upper] ?? [{ currency: 'USD', country: 'United States' }];
}

function impactFrom(event: any): { impact: 'holiday' | 'low' | 'medium' | 'high'; importance: number } {
  const name = String(event?.Event || event?.Category || '').toLowerCase();
  const rawImportance = Number(event?.Importance ?? 0);
  if (/holiday/.test(name)) return { impact: 'holiday', importance: 0 };
  if (rawImportance >= 3) return { impact: 'high', importance: rawImportance };
  if (rawImportance === 2) return { impact: 'medium', importance: rawImportance };
  return { impact: 'low', importance: rawImportance };
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function fetchTradingEconomicsCalendar(countries: string[], startDate: string, endDate: string): Promise<any[]> {
  const encodedCountries = countries.map((country) => encodeURIComponent(country)).join(',');
  const url = `https://api.tradingeconomics.com/calendar/country/${encodedCountries}/${startDate}/${endDate}?c=${encodeURIComponent(apiKey())}&f=json`;
  const response = await fetch(url, {
    headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Economic calendar upstream ${response.status}`);
  const payload = await response.json() as any[];
  return Array.isArray(payload) ? payload : [];
}

export async function getEconomicCalendar(input: { market?: string; date?: string }): Promise<{
  market: string;
  focusCurrencies: string[];
  focusCountries: string[];
  source: string;
  summary: string;
  upcomingCount: number;
  highImpactCount: number;
  events: CalendarEvent[];
}> {
  const market = String(input.market || 'XAUUSD').toUpperCase();
  const focus = countriesForMarket(market);
  const focusCountries = focus.map((item) => item.country);
  const focusCurrencies = focus.map((item) => item.currency);
  const baseDate = input.date ? new Date(input.date) : new Date();
  const start = new Date(baseDate);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const now = Date.now();

  return getCachedOrCompute(cacheKey('calendar', `${market}:${isoDate(start)}`), async () => {
    const rows = await fetchTradingEconomicsCalendar(focusCountries, isoDate(start), isoDate(end));
    const events = rows.reduce<CalendarEvent[]>((accumulator, row) => {
        const date = new Date(row?.Date || row?.date || '');
        if (Number.isNaN(date.getTime())) return accumulator;
        const { impact, importance } = impactFrom(row);
        const minutesUntil = Math.round((date.getTime() - now) / 60000);
        accumulator.push({
          date: date.toISOString(),
          country: String(row?.Country || row?.country || 'Unknown'),
          currency: String(row?.Currency || focus.find((item) => item.country === String(row?.Country || row?.country))?.currency || 'N/A'),
          event: String(row?.Event || row?.Category || 'Event'),
          category: String(row?.Category || row?.Event || 'Macro'),
          impact,
          importance,
          actual: row?.Actual != null ? String(row.Actual) : null,
          forecast: row?.Forecast != null ? String(row.Forecast) : null,
          previous: row?.Previous != null ? String(row.Previous) : null,
          source: row?.Source != null ? String(row.Source) : null,
          isUpcoming: minutesUntil >= -30,
          minutesUntil,
        });
        return accumulator;
      }, [])
      .sort((left, right) => {
        if (left.isUpcoming !== right.isUpcoming) return left.isUpcoming ? -1 : 1;
        if (left.importance !== right.importance) return right.importance - left.importance;
        return new Date(left.date).getTime() - new Date(right.date).getTime();
      });

    const upcomingCount = events.filter((event) => event.isUpcoming).length;
    const highImpactCount = events.filter((event) => event.impact === 'high').length;
    const nextEvent = events.find((event) => event.isUpcoming);

    return {
      market,
      focusCurrencies,
      focusCountries,
      source: apiKey() === 'guest:guest'
        ? 'Trading Economics economic calendar via guest access'
        : 'Trading Economics economic calendar via configured API key',
      summary: nextEvent
        ? `${nextEvent.currency} ${nextEvent.event} is the next scheduled release; ${highImpactCount} high-impact events are on deck for ${focusCurrencies.join('/')} today.`
        : `No more scheduled releases found for ${focusCurrencies.join('/')} today.`,
      upcomingCount,
      highImpactCount,
      events,
    };
  }, 300);
}
