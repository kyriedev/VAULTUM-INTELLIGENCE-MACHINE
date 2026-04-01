import { cacheKey } from '../../../_shared/cache-keys';
import { CHROME_UA } from '../../../_shared/constants';
import { getCachedOrCompute } from '../../../_shared/redis';
import {
  buildUsEconomicCalendarHeuristics,
  type EconomicCalendarDeskNote,
  type EconomicCalendarPrediction,
} from './_us-desk-heuristics';

type CalendarImpact = 'holiday' | 'low' | 'medium' | 'high';
type CalendarPriority = 'primary' | 'strategic' | 'secondary';
type CalendarTheme =
  | 'central-bank'
  | 'inflation'
  | 'jobs'
  | 'growth'
  | 'industry'
  | 'retail'
  | 'energy'
  | 'banking'
  | 'trade'
  | 'other';

type CalendarEvent = {
  date: string;
  country: string;
  currency: string;
  event: string;
  category: string;
  impact: CalendarImpact;
  importance: number;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  source: string | null;
  isUpcoming: boolean;
  minutesUntil: number | null;
  priority: CalendarPriority;
  theme: CalendarTheme;
  relevanceScore: number;
};

type FocusRegion = { currency: string; country: string };
type CalendarFocusSpec = {
  market: string;
  primary: FocusRegion[];
  strategic: FocusRegion[];
  watchThemes: CalendarTheme[];
};

const CORE_G10: FocusRegion[] = [
  { currency: 'USD', country: 'United States' },
  { currency: 'EUR', country: 'Euro Area' },
  { currency: 'GBP', country: 'United Kingdom' },
  { currency: 'JPY', country: 'Japan' },
];

function apiKey(): string {
  return (process.env.TRADINGECONOMICS_API_KEY || '').trim() || 'guest:guest';
}

function uniqueRegions(items: FocusRegion[]): FocusRegion[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.currency}:${item.country}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildFocusSpec(market: string): CalendarFocusSpec {
  const upper = String(market || 'XAUUSD').toUpperCase();
  const sharedThemes: CalendarTheme[] = ['central-bank', 'inflation', 'jobs', 'growth', 'industry', 'energy', 'banking'];

  const primaryMap: Record<string, FocusRegion[]> = {
    XAUUSD: [{ currency: 'USD', country: 'United States' }],
    GOLD: [{ currency: 'USD', country: 'United States' }],
    DXY: [{ currency: 'USD', country: 'United States' }],
    EURUSD: [{ currency: 'EUR', country: 'Euro Area' }, { currency: 'USD', country: 'United States' }],
    GBPUSD: [{ currency: 'GBP', country: 'United Kingdom' }, { currency: 'USD', country: 'United States' }],
    USDJPY: [{ currency: 'USD', country: 'United States' }, { currency: 'JPY', country: 'Japan' }],
    EURJPY: [{ currency: 'EUR', country: 'Euro Area' }, { currency: 'JPY', country: 'Japan' }],
    GBPJPY: [{ currency: 'GBP', country: 'United Kingdom' }, { currency: 'JPY', country: 'Japan' }],
    SPX: [{ currency: 'USD', country: 'United States' }],
    NDX: [{ currency: 'USD', country: 'United States' }],
    VIX: [{ currency: 'USD', country: 'United States' }],
    US30: [{ currency: 'USD', country: 'United States' }],
    WTI: [{ currency: 'USD', country: 'United States' }, { currency: 'CAD', country: 'Canada' }],
    OIL: [{ currency: 'USD', country: 'United States' }, { currency: 'CAD', country: 'Canada' }],
    BTCUSD: [{ currency: 'USD', country: 'United States' }],
  };

  const primary = uniqueRegions(primaryMap[upper] ?? [{ currency: 'USD', country: 'United States' }]);
  const strategicBase =
    upper === 'XAUUSD' || upper === 'GOLD'
      ? [...CORE_G10, { currency: 'CNY', country: 'China' }]
      : upper === 'WTI' || upper === 'OIL'
        ? [...CORE_G10, { currency: 'CAD', country: 'Canada' }]
        : CORE_G10;

  return {
    market: upper,
    primary,
    strategic: uniqueRegions([...primary, ...strategicBase]),
    watchThemes: sharedThemes,
  };
}

function impactFrom(event: any): { impact: CalendarImpact; importance: number } {
  const name = String(event?.Event || event?.Category || '').toLowerCase();
  const rawImportance = Number(event?.Importance ?? 0);
  if (/holiday/.test(name)) return { impact: 'holiday', importance: 0 };
  if (rawImportance >= 3) return { impact: 'high', importance: rawImportance };
  if (rawImportance === 2) return { impact: 'medium', importance: rawImportance };
  return { impact: 'low', importance: rawImportance };
}

function themeFrom(row: any): CalendarTheme {
  const text = `${String(row?.Event || '')} ${String(row?.Category || '')}`.toLowerCase();
  if (/(fed|ecb|boj|boe|interest rate|rate decision|fomc|minutes|speaker|powell|lagarde|ueda|bailey|policy)/.test(text)) return 'central-bank';
  if (/(cpi|inflation|ppi|pce|prices|core inflation)/.test(text)) return 'inflation';
  if (/(non farm|non-farm|payroll|employment|jobless|jobs|labor|wage|unemployment)/.test(text)) return 'jobs';
  if (/(gdp|pmi|ism|services pmi|manufacturing pmi|growth|confidence|sentiment)/.test(text)) return 'growth';
  if (/(industrial|factory|capacity|manufacturing production|production)/.test(text)) return 'industry';
  if (/(retail|consumer spending|household|sales)/.test(text)) return 'retail';
  if (/(crude|oil|energy|inventories|eia|api)/.test(text)) return 'energy';
  if (/(bank|loan|credit|financial stability|stress test)/.test(text)) return 'banking';
  if (/(trade balance|exports|imports|current account)/.test(text)) return 'trade';
  return 'other';
}

function priorityFor(rowCountry: string, rowCurrency: string, spec: CalendarFocusSpec): CalendarPriority {
  const normalizedCountry = rowCountry.toLowerCase();
  const normalizedCurrency = rowCurrency.toUpperCase();
  const primary = spec.primary.some((item) => item.country.toLowerCase() === normalizedCountry || item.currency === normalizedCurrency);
  if (primary) return 'primary';
  const strategic = spec.strategic.some((item) => item.country.toLowerCase() === normalizedCountry || item.currency === normalizedCurrency);
  return strategic ? 'strategic' : 'secondary';
}

function themeWeight(theme: CalendarTheme): number {
  if (theme === 'central-bank') return 30;
  if (theme === 'inflation') return 24;
  if (theme === 'jobs') return 24;
  if (theme === 'growth') return 18;
  if (theme === 'industry') return 16;
  if (theme === 'retail') return 14;
  if (theme === 'energy') return 14;
  if (theme === 'banking') return 13;
  if (theme === 'trade') return 10;
  return 6;
}

function priorityWeight(priority: CalendarPriority): number {
  if (priority === 'primary') return 36;
  if (priority === 'strategic') return 18;
  return 6;
}

function impactWeight(impact: CalendarImpact): number {
  if (impact === 'high') return 30;
  if (impact === 'medium') return 18;
  if (impact === 'low') return 8;
  return 0;
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
  primaryCurrencies: string[];
  primaryCountries: string[];
  focusCurrencies: string[];
  focusCountries: string[];
  strategicCurrencies: string[];
  strategicCountries: string[];
  source: string;
  timezone: string;
  summary: string;
  heuristicsSummary: string;
  upcomingCount: number;
  highImpactCount: number;
  primaryHighImpactCount: number;
  strategicHighImpactCount: number;
  predictiveSignals: EconomicCalendarPrediction[];
  deskNotes: EconomicCalendarDeskNote[];
  events: CalendarEvent[];
}> {
  const spec = buildFocusSpec(input.market || 'XAUUSD');
  const focusCountries = uniqueRegions(spec.strategic).map((item) => item.country);
  const focusCurrencies = uniqueRegions(spec.strategic).map((item) => item.currency);
  const primaryCountries = uniqueRegions(spec.primary).map((item) => item.country);
  const primaryCurrencies = uniqueRegions(spec.primary).map((item) => item.currency);
  const baseDate = input.date ? new Date(input.date) : new Date();
  const start = new Date(baseDate);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const now = Date.now();

  return getCachedOrCompute(cacheKey('calendar', `${spec.market}:${isoDate(start)}`), async () => {
    const rows = await fetchTradingEconomicsCalendar(focusCountries, isoDate(start), isoDate(end));
    const events = rows.reduce<CalendarEvent[]>((accumulator: CalendarEvent[], row: any) => {
      const date = new Date(row?.Date || row?.date || '');
      if (Number.isNaN(date.getTime())) return accumulator;

      const country = String(row?.Country || row?.country || 'Unknown');
      const currency = String(row?.Currency || spec.strategic.find((item) => item.country === country)?.currency || 'N/A').toUpperCase();
      const { impact, importance } = impactFrom(row);
      const theme = themeFrom(row);
      const priority = priorityFor(country, currency, spec);
      const minutesUntil = Math.round((date.getTime() - now) / 60000);
      const relevanceScore = priorityWeight(priority) + impactWeight(impact) + themeWeight(theme) + Math.min(importance * 3, 9);

      accumulator.push({
        date: date.toISOString(),
        country,
        currency,
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
        priority,
        theme,
        relevanceScore,
      });
      return accumulator;
    }, [])
      .sort((left: CalendarEvent, right: CalendarEvent) => {
        if (left.isUpcoming !== right.isUpcoming) return left.isUpcoming ? -1 : 1;
        if (left.relevanceScore !== right.relevanceScore) return right.relevanceScore - left.relevanceScore;
        return new Date(left.date).getTime() - new Date(right.date).getTime();
      });

    const upcomingCount = events.filter((event: CalendarEvent) => event.isUpcoming).length;
    const highImpactCount = events.filter((event: CalendarEvent) => event.impact === 'high').length;
    const primaryHighImpactCount = events.filter((event: CalendarEvent) => event.impact === 'high' && event.priority === 'primary').length;
    const strategicHighImpactCount = events.filter((event: CalendarEvent) => event.impact === 'high' && event.priority !== 'secondary').length;
    const nextEvent = events.find((event: CalendarEvent) => event.isUpcoming);
    const heuristics = buildUsEconomicCalendarHeuristics(events);

    return {
      market: spec.market,
      primaryCurrencies,
      primaryCountries,
      focusCurrencies,
      focusCountries,
      strategicCurrencies: focusCurrencies,
      strategicCountries: focusCountries,
      source: apiKey() === 'guest:guest'
        ? 'Trading Economics economic calendar via guest access'
        : 'Trading Economics economic calendar via configured API key',
      timezone: 'Africa/Nairobi',
      summary: nextEvent
        ? `${nextEvent.currency} ${nextEvent.event} is next; ${primaryHighImpactCount} primary high-impact and ${strategicHighImpactCount} primary/strategic high-impact releases are on deck for ${primaryCurrencies.join('/')} and the core watch list today.`
        : `No more scheduled primary or strategic releases found for ${primaryCurrencies.join('/')} today.`,
      heuristicsSummary: heuristics.summary,
      upcomingCount,
      highImpactCount,
      primaryHighImpactCount,
      strategicHighImpactCount,
      predictiveSignals: heuristics.predictions,
      deskNotes: heuristics.notes,
      events,
    };
  }, 300);
}
