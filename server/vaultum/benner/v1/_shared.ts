export type BennerRegimeCode = 'A' | 'B' | 'C';

export type BennerRegimeDescriptor = {
  code: BennerRegimeCode;
  title: string;
  shortLabel: string;
  phase: string;
  bias: string;
  compatibility: string;
  tone: 'bullish' | 'bearish' | 'alert' | 'neutral';
};

export type BennerEvent = {
  date: string;
  title: string;
  tag: string;
};

export const BENNER_BACKGROUND_PRIORITY = 'A > C > B';
export const BENNER_YEAR_MIN = 1900;
export const BENNER_YEAR_MAX = 2100;

export const BENNER_REGIMES: Record<BennerRegimeCode, BennerRegimeDescriptor> = {
  A: {
    code: 'A',
    title: 'Panic years',
    shortLabel: 'panic',
    phase: 'panic-year',
    bias: 'cautionary-to-bearish',
    compatibility: 'Treat A years as stress-sensitive timing windows where panic, liquidity breaks, and sharp repricing deserve more respect than trend extrapolation.',
    tone: 'alert',
  },
  B: {
    code: 'B',
    title: 'Good times / Sell years',
    shortLabel: 'good-times-sell',
    phase: 'good-times-sell',
    bias: 'constructive-but-late-cycle',
    compatibility: 'Treat B years as stronger expansion windows, but stay alert for distribution and harvest behavior once price gets stretched into resistance.',
    tone: 'bullish',
  },
  C: {
    code: 'C',
    title: 'Hard times / Buy-Accumulate years',
    shortLabel: 'hard-times-buy-accumulate',
    phase: 'hard-times-buy-accumulate',
    bias: 'adversity-to-accumulation',
    compatibility: 'Treat C years as adversity-heavy environments that can create accumulation opportunities only when macro, structure, and pressure begin to confirm.',
    tone: 'neutral',
  },
};

export const YEARS_A = [1927, 1945, 1965, 1981, 1999, 2019, 2035, 2053] as const;
export const YEARS_B = [1926, 1935, 1945, 1953, 1962, 1972, 1980, 1989, 1999, 2007, 2016, 2026, 2034, 2043, 2053] as const;
export const YEARS_C = [1924, 1931, 1942, 1951, 1958, 1969, 1978, 1985, 1996, 2005, 2012, 2023, 2032, 2039, 2050, 2059] as const;

export const BENNER_EVENTS: BennerEvent[] = [
  { date: '1929-10-29', title: 'Crash 1929', tag: 'Black Tuesday' },
  { date: '1973-10-17', title: 'Oil crisis', tag: 'OPEC era' },
  { date: '1987-10-19', title: 'Black Monday', tag: '1987 crash' },
  { date: '1998-08-17', title: 'Russia default', tag: 'LTCM era' },
  { date: '2001-09-11', title: '9/11 shock', tag: 'macro shock' },
  { date: '2008-09-15', title: 'Lehman collapse', tag: 'GFC' },
  { date: '2011-08-05', title: 'US downgrade', tag: 'risk shock' },
  { date: '2020-03-16', title: 'COVID crash', tag: 'capitulation' },
  { date: '2022-02-24', title: 'War shock', tag: 'Russia-Ukraine' },
  { date: '2023-03-10', title: 'Bank stress', tag: 'SVB' },
];

export function regimesForYear(year: number): BennerRegimeCode[] {
  const active: BennerRegimeCode[] = [];
  if (YEARS_A.includes(year as (typeof YEARS_A)[number])) active.push('A');
  if (YEARS_B.includes(year as (typeof YEARS_B)[number])) active.push('B');
  if (YEARS_C.includes(year as (typeof YEARS_C)[number])) active.push('C');
  return active;
}

export function primaryRegimeForYear(year: number): BennerRegimeCode | null {
  const active = regimesForYear(year);
  if (active.includes('A')) return 'A';
  if (active.includes('C')) return 'C';
  if (active.includes('B')) return 'B';
  return null;
}
