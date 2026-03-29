import { invokeVaultumRpc } from '@/services/rpc';

export interface EconomicCalendarEvent {
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
}

export interface EconomicCalendarResponse {
  market: string;
  focusCurrencies: string[];
  focusCountries: string[];
  source: string;
  summary: string;
  upcomingCount: number;
  highImpactCount: number;
  events: EconomicCalendarEvent[];
}

export async function fetchEconomicCalendar(market: string): Promise<EconomicCalendarResponse | null> {
  return invokeVaultumRpc<EconomicCalendarResponse>('calendar', 'get-economic-calendar', { market });
}
