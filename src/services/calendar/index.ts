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
  priority: 'primary' | 'strategic' | 'secondary';
  theme: 'central-bank' | 'inflation' | 'jobs' | 'growth' | 'industry' | 'retail' | 'energy' | 'banking' | 'trade' | 'other';
  relevanceScore: number;
}

export interface EconomicCalendarPredictiveDriver {
  key: string;
  event: string;
  state: 'up' | 'down';
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  releasedAt: string;
  note: string;
}

export interface EconomicCalendarPrediction {
  targetKey: string;
  targetEvent: string;
  targetCurrency: string;
  targetDate: string;
  direction: 'up' | 'down' | 'mixed';
  confidence: 'low' | 'medium' | 'high';
  confidenceScore: number;
  summary: string;
  note: string;
  drivers: EconomicCalendarPredictiveDriver[];
}

export interface EconomicCalendarDeskNote {
  title: string;
  detail: string;
}

export interface EconomicCalendarResponse {
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
  events: EconomicCalendarEvent[];
}

export async function fetchEconomicCalendar(market: string): Promise<EconomicCalendarResponse | null> {
  return invokeVaultumRpc<EconomicCalendarResponse>('calendar', 'get-economic-calendar', { market });
}
