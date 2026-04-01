export type ReportPeriod = 'daily' | 'weekly' | 'quarterly';

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
};

type CalendarDay = {
  year: number;
  month: number;
  day: number;
};

export type VaultumReportWindow = {
  period: ReportPeriod;
  label: string;
  timeframe: string;
  anchorKey: string;
  coveredLabel: string;
  readyAt: string;
  readyLocalLabel: string;
  anchorLocalLabel: string;
  timezoneLabel: string;
  status: 'ready' | 'pending';
};

const NAIROBI_TZ = 'Africa/Nairobi';
const NEW_YORK_TZ = 'America/New_York';

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '0';

  return {
    year: Number(pick('year')),
    month: Number(pick('month')),
    day: Number(pick('day')),
    hour: Number(pick('hour')),
    minute: Number(pick('minute')),
    second: Number(pick('second')),
    weekday: pick('weekday'),
  };
}

function toUtcLike(parts: CalendarDay & { hour: number; minute: number; second?: number }): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second ?? 0);
}

function makeZonedDate(parts: CalendarDay & { hour: number; minute: number; second?: number }, timeZone: string): Date {
  let guess = new Date(toUtcLike(parts));
  for (let index = 0; index < 5; index += 1) {
    const actual = zonedParts(guess, timeZone);
    const diffMs = toUtcLike(parts) - toUtcLike(actual);
    if (diffMs === 0) break;
    guess = new Date(guess.getTime() + diffMs);
  }
  return guess;
}

function shiftDay(parts: CalendarDay, delta: number): CalendarDay {
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  next.setUTCDate(next.getUTCDate() + delta);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function weekdayFor(parts: CalendarDay, timeZone: string): string {
  return zonedParts(makeZonedDate({ ...parts, hour: 12, minute: 0 }, timeZone), timeZone).weekday.toLowerCase();
}

function isBusinessDay(parts: CalendarDay): boolean {
  const weekday = weekdayFor(parts, NEW_YORK_TZ);
  return weekday !== 'sat' && weekday !== 'sun';
}

function previousBusinessDay(parts: CalendarDay): CalendarDay {
  let cursor = shiftDay(parts, -1);
  while (!isBusinessDay(cursor)) {
    cursor = shiftDay(cursor, -1);
  }
  return cursor;
}

function lastBusinessDayOnOrBefore(parts: CalendarDay): CalendarDay {
  let cursor = parts;
  while (!isBusinessDay(cursor)) {
    cursor = shiftDay(cursor, -1);
  }
  return cursor;
}

function formatLocal(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    ...options,
  }).format(date);
}

function formatDay(parts: CalendarDay): string {
  return formatLocal(makeZonedDate({ ...parts, hour: 12, minute: 0 }, NEW_YORK_TZ), NEW_YORK_TZ, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function resolveDailyWindow(now: Date): VaultumReportWindow {
  const nyNow = zonedParts(now, NEW_YORK_TZ);
  let anchorDay: CalendarDay = { year: nyNow.year, month: nyNow.month, day: nyNow.day };
  const todayClose = makeZonedDate({ ...anchorDay, hour: 17, minute: 10 }, NEW_YORK_TZ);
  if (!isBusinessDay(anchorDay) || now.getTime() < todayClose.getTime()) {
    anchorDay = previousBusinessDay(anchorDay);
  }
  const anchorClose = makeZonedDate({ ...anchorDay, hour: 17, minute: 10 }, NEW_YORK_TZ);
  const readyAt = new Date(anchorClose.getTime() + 10 * 60_000);
  return {
    period: 'daily',
    label: 'Daily Close Report',
    timeframe: '1h',
    anchorKey: `${anchorDay.year}-${String(anchorDay.month).padStart(2, '0')}-${String(anchorDay.day).padStart(2, '0')}`,
    coveredLabel: `Daily close for ${formatDay(anchorDay)}`,
    readyAt: readyAt.toISOString(),
    readyLocalLabel: formatLocal(readyAt, NAIROBI_TZ, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
    anchorLocalLabel: formatLocal(anchorClose, NAIROBI_TZ, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
    timezoneLabel: 'Africa/Nairobi (UTC+3)',
    status: now.getTime() >= readyAt.getTime() ? 'ready' : 'pending',
  };
}

function resolveWeeklyWindow(now: Date): VaultumReportWindow {
  const nyNow = zonedParts(now, NEW_YORK_TZ);
  let anchorDay: CalendarDay = { year: nyNow.year, month: nyNow.month, day: nyNow.day };
  const weekday = weekdayFor(anchorDay, NEW_YORK_TZ);
  const todayClose = makeZonedDate({ ...anchorDay, hour: 17, minute: 20 }, NEW_YORK_TZ);
  if (weekday !== 'fri' || now.getTime() < todayClose.getTime()) {
    anchorDay = shiftDay(anchorDay, -1);
  }
  while (weekdayFor(anchorDay, NEW_YORK_TZ) !== 'fri') {
    anchorDay = shiftDay(anchorDay, -1);
  }
  const anchorClose = makeZonedDate({ ...anchorDay, hour: 17, minute: 20 }, NEW_YORK_TZ);
  const readyAt = new Date(anchorClose.getTime() + 15 * 60_000);
  return {
    period: 'weekly',
    label: 'Weekly Flow & Positioning Report',
    timeframe: '4h',
    anchorKey: `${anchorDay.year}-W-${String(anchorDay.month).padStart(2, '0')}-${String(anchorDay.day).padStart(2, '0')}`,
    coveredLabel: `Week ended ${formatDay(anchorDay)}`,
    readyAt: readyAt.toISOString(),
    readyLocalLabel: formatLocal(readyAt, NAIROBI_TZ, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
    anchorLocalLabel: formatLocal(anchorClose, NAIROBI_TZ, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
    timezoneLabel: 'Africa/Nairobi (UTC+3)',
    status: now.getTime() >= readyAt.getTime() ? 'ready' : 'pending',
  };
}

function quarterEndFor(year: number, quarter: number): CalendarDay {
  const month = quarter === 1 ? 3 : quarter === 2 ? 6 : quarter === 3 ? 9 : 12;
  const end = new Date(Date.UTC(year, month, 0, 12, 0, 0));
  return {
    year: end.getUTCFullYear(),
    month: end.getUTCMonth() + 1,
    day: end.getUTCDate(),
  };
}

function previousQuarter(year: number, quarter: number): { year: number; quarter: number } {
  if (quarter > 1) return { year, quarter: quarter - 1 };
  return { year: year - 1, quarter: 4 };
}

function resolveQuarterlyWindow(now: Date): VaultumReportWindow {
  const nyNow = zonedParts(now, NEW_YORK_TZ);
  let year = nyNow.year;
  let quarter = Math.floor((nyNow.month - 1) / 3) + 1;
  let rawQuarterEnd = quarterEndFor(year, quarter);
  let anchorDay = lastBusinessDayOnOrBefore(rawQuarterEnd);
  let anchorClose = makeZonedDate({ ...anchorDay, hour: 17, minute: 30 }, NEW_YORK_TZ);
  if (now.getTime() < anchorClose.getTime()) {
    const prior = previousQuarter(year, quarter);
    year = prior.year;
    quarter = prior.quarter;
    rawQuarterEnd = quarterEndFor(year, quarter);
    anchorDay = lastBusinessDayOnOrBefore(rawQuarterEnd);
    anchorClose = makeZonedDate({ ...anchorDay, hour: 17, minute: 30 }, NEW_YORK_TZ);
  }
  const readyAt = new Date(anchorClose.getTime() + 20 * 60_000);
  return {
    period: 'quarterly',
    label: `Quarterly Regime Report Q${quarter}`,
    timeframe: '1d',
    anchorKey: `${year}-Q${quarter}`,
    coveredLabel: `Quarter ended Q${quarter} ${year} close (${formatDay(anchorDay)})`,
    readyAt: readyAt.toISOString(),
    readyLocalLabel: formatLocal(readyAt, NAIROBI_TZ, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
    anchorLocalLabel: formatLocal(anchorClose, NAIROBI_TZ, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
    timezoneLabel: 'Africa/Nairobi (UTC+3)',
    status: now.getTime() >= readyAt.getTime() ? 'ready' : 'pending',
  };
}

export function resolveVaultumReportWindow(period: ReportPeriod, now = new Date()): VaultumReportWindow {
  if (period === 'weekly') return resolveWeeklyWindow(now);
  if (period === 'quarterly') return resolveQuarterlyWindow(now);
  return resolveDailyWindow(now);
}

export function resolveAllVaultumReportWindows(now = new Date()): VaultumReportWindow[] {
  return [
    resolveVaultumReportWindow('daily', now),
    resolveVaultumReportWindow('weekly', now),
    resolveVaultumReportWindow('quarterly', now),
  ];
}
