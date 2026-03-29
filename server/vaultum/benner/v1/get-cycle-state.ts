import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import {
  BENNER_BACKGROUND_PRIORITY,
  BENNER_EVENTS,
  BENNER_REGIMES,
  BENNER_YEAR_MAX,
  BENNER_YEAR_MIN,
  primaryRegimeForYear,
  regimesForYear,
  type BennerRegimeCode,
} from './_shared';

type BennerTimelineYear = {
  year: number;
  regimes: Array<{
    code: BennerRegimeCode;
    title: string;
    tone: 'bullish' | 'bearish' | 'alert' | 'neutral';
  }>;
  label: string;
  isCurrent: boolean;
};

type BennerEventLens = {
  date: string;
  title: string;
  tag: string;
  year: number;
  yearsFromCurrent: number;
};

type BennerUpcomingWindow = {
  year: number;
  code: BennerRegimeCode;
  title: string;
  phase: string;
  yearsAhead: number;
};

function buildTimeline(currentYear: number, yearsBack: number, yearsForward: number): BennerTimelineYear[] {
  const timeline: BennerTimelineYear[] = [];
  for (let year = currentYear - yearsBack; year <= currentYear + yearsForward; year += 1) {
    if (year < BENNER_YEAR_MIN || year > BENNER_YEAR_MAX) continue;
    const active = regimesForYear(year).map((code) => ({
      code,
      title: BENNER_REGIMES[code].title,
      tone: BENNER_REGIMES[code].tone,
    }));

    timeline.push({
      year,
      regimes: active,
      label: active.length ? active.map((item) => item.code).join('/') : 'none',
      isCurrent: year === currentYear,
    });
  }
  return timeline;
}

function buildEventLens(currentYear: number): BennerEventLens[] {
  return BENNER_EVENTS
    .map((event) => {
      const year = Number(event.date.slice(0, 4));
      return {
        ...event,
        year,
        yearsFromCurrent: year - currentYear,
      };
    })
    .sort((left, right) => Math.abs(left.yearsFromCurrent) - Math.abs(right.yearsFromCurrent));
}

function buildUpcomingWindows(currentYear: number, limit: number): BennerUpcomingWindow[] {
  const windows: BennerUpcomingWindow[] = [];
  for (let year = currentYear; year <= BENNER_YEAR_MAX; year += 1) {
    const active = regimesForYear(year);
    active.forEach((code) => {
      windows.push({
        year,
        code,
        title: BENNER_REGIMES[code].title,
        phase: BENNER_REGIMES[code].phase,
        yearsAhead: year - currentYear,
      });
    });
  }
  return windows.slice(0, limit);
}

export async function getCycleState(input: { market: string }): Promise<any> {
  const market = (input.market || 'XAUUSD').toUpperCase();
  return getCachedOrCompute(cacheKey('benner', `cycle-map:${market}`), async () => {
    const currentYear = new Date().getUTCFullYear();
    const activeCodes = regimesForYear(currentYear);
    const primaryCode = primaryRegimeForYear(currentYear);
    const primaryDescriptor = primaryCode ? BENNER_REGIMES[primaryCode] : null;
    const timeline = buildTimeline(currentYear, 8, 14);
    const events = buildEventLens(currentYear);
    const upcoming = buildUpcomingWindows(currentYear, 8);
    const overlapCount = activeCodes.length;

    return {
      market,
      year: currentYear,
      regimeCode: primaryCode ?? 'none',
      regimeLabel: primaryDescriptor ? primaryDescriptor.title : 'No Benner regime for this year',
      activeRegimes: activeCodes.map((code) => ({
        code,
        title: BENNER_REGIMES[code].title,
        phase: BENNER_REGIMES[code].phase,
        tone: BENNER_REGIMES[code].tone,
      })),
      overlapCount,
      overlapLabel: overlapCount <= 1 ? 'No overlap' : `Overlap (${overlapCount})`,
      phase: primaryDescriptor?.phase ?? 'out-of-cycle-window',
      bias: primaryDescriptor?.bias ?? 'neutral / no mapped Benner year',
      turnWindow: upcoming.length
        ? upcoming.slice(0, 3).map((item) => `${item.code} ${item.year}`).join(' -> ')
        : 'No future Benner windows in the loaded map',
      confidence: primaryCode ? 'medium' : 'low',
      compatibility: primaryDescriptor?.compatibility ?? 'Benner is quiet for the current year, so let macro, structure, and live pressure dominate.',
      backgroundPriority: BENNER_BACKGROUND_PRIORITY,
      legend: Object.values(BENNER_REGIMES).map((regime) => ({
        code: regime.code,
        title: regime.title,
        phase: regime.phase,
        tone: regime.tone,
      })),
      timeline,
      macroEvents: events.slice(0, 6),
      upcomingRegimes: upcoming,
      educationalNotice: 'Benner is a temporal overlay for context, not a standalone trading signal or prediction engine.',
      notes: [
        'The year map is taken directly from the Benner A/B/C calendar structure supplied in the Pine script.',
        'Macro events are historical anchor points for context, not causal proof of the cycle.',
        'Use the map alongside macro regime, positioning, structure, and orderflow before acting.',
      ],
    };
  }, 3600);
}
