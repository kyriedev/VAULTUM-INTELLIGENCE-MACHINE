type CalendarEventLike = {
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
  isUpcoming: boolean;
  minutesUntil: number | null;
  relevanceScore: number;
};

export type EconomicCalendarDeskNote = {
  title: string;
  detail: string;
};

export type EconomicCalendarPredictiveDriver = {
  key: string;
  event: string;
  state: 'up' | 'down';
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  releasedAt: string;
  note: string;
};

export type EconomicCalendarPrediction = {
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
};

type NormalizedEventKey =
  | 'average_hourly_earnings'
  | 'unemployment_rate'
  | 'job_openings'
  | 'jobless_claims'
  | 'pmi'
  | 'ism_services_pmi'
  | 'cpi_yoy'
  | 'cpi_mom'
  | 'retail_sales'
  | 'ppi'
  | 'new_home_sales'
  | 'consumer_confidence'
  | 'pce_price_index'
  | 'gdp_yoy'
  | 'gdp'
  | 'fed_rate'
  | 'crude_oil_inventories'
  | 'gasoline_inventories';

type DeskSignalKey =
  | 'average_hourly_earnings'
  | 'unemployment_rate'
  | 'job_openings'
  | 'jobless_claims'
  | 'pmi'
  | 'cpi'
  | 'retail_sales'
  | 'ppi'
  | 'new_home_sales'
  | 'consumer_confidence'
  | 'pce_price_index'
  | 'gdp'
  | 'fed_rate';

type RuleTarget =
  | 'pmi'
  | 'cpi'
  | 'retail_sales'
  | 'ppi'
  | 'new_home_sales'
  | 'jobless_claims'
  | 'consumer_confidence'
  | 'pce_price_index'
  | 'gdp';

type DriverRule = {
  key: DeskSignalKey;
  when: 'up' | 'down';
  weight: number;
  note: string;
  userHeuristic?: boolean;
};

type PredictionRule = {
  target: RuleTarget;
  direction: 'up' | 'down';
  drivers: DriverRule[];
};

type ReleasedSignal = {
  key: DeskSignalKey;
  rawKey: NormalizedEventKey;
  event: CalendarEventLike;
  state: 'up' | 'down';
  priorityScore: number;
};

const RULES: PredictionRule[] = [
  {
    target: 'pmi',
    direction: 'up',
    drivers: [
      { key: 'average_hourly_earnings', when: 'up', weight: 24, note: 'average hourly earnings high' },
      { key: 'unemployment_rate', when: 'down', weight: 28, note: 'unemployment rate low' },
    ],
  },
  {
    target: 'pmi',
    direction: 'down',
    drivers: [
      { key: 'average_hourly_earnings', when: 'down', weight: 24, note: 'average hourly earnings low' },
      { key: 'unemployment_rate', when: 'up', weight: 28, note: 'unemployment rate high' },
    ],
  },
  {
    target: 'cpi',
    direction: 'up',
    drivers: [
      { key: 'average_hourly_earnings', when: 'up', weight: 22, note: 'average hourly earnings high' },
      { key: 'unemployment_rate', when: 'down', weight: 18, note: 'unemployment rate low' },
      { key: 'pmi', when: 'up', weight: 14, note: 'PMI high / improving' },
      { key: 'fed_rate', when: 'down', weight: 12, note: 'interest-rate cuts / lower policy rate' },
    ],
  },
  {
    target: 'cpi',
    direction: 'down',
    drivers: [
      { key: 'average_hourly_earnings', when: 'down', weight: 22, note: 'average hourly earnings low' },
      { key: 'unemployment_rate', when: 'up', weight: 18, note: 'unemployment rate high' },
      { key: 'pmi', when: 'down', weight: 14, note: 'PMI low / softening' },
      { key: 'fed_rate', when: 'up', weight: 12, note: 'interest-rate increases / tighter policy' },
    ],
  },
  {
    target: 'retail_sales',
    direction: 'up',
    drivers: [
      { key: 'cpi', when: 'down', weight: 24, note: 'CPI down / softer inflation' },
      { key: 'pce_price_index', when: 'up', weight: 10, note: 'PCE firming', userHeuristic: true },
    ],
  },
  {
    target: 'retail_sales',
    direction: 'down',
    drivers: [
      { key: 'cpi', when: 'up', weight: 24, note: 'CPI up / hotter inflation' },
      { key: 'pce_price_index', when: 'down', weight: 10, note: 'PCE softening', userHeuristic: true },
    ],
  },
  {
    target: 'ppi',
    direction: 'up',
    drivers: [
      { key: 'average_hourly_earnings', when: 'up', weight: 24, note: 'average hourly earnings high' },
    ],
  },
  {
    target: 'ppi',
    direction: 'down',
    drivers: [
      { key: 'average_hourly_earnings', when: 'down', weight: 24, note: 'average hourly earnings low' },
    ],
  },
  {
    target: 'new_home_sales',
    direction: 'up',
    drivers: [
      { key: 'average_hourly_earnings', when: 'up', weight: 18, note: 'average hourly earnings up' },
      { key: 'unemployment_rate', when: 'down', weight: 18, note: 'unemployment rate low' },
      { key: 'fed_rate', when: 'down', weight: 22, note: 'interest rates down / cuts' },
    ],
  },
  {
    target: 'new_home_sales',
    direction: 'down',
    drivers: [
      { key: 'average_hourly_earnings', when: 'down', weight: 18, note: 'average hourly earnings down' },
      { key: 'unemployment_rate', when: 'up', weight: 18, note: 'unemployment rate high' },
      { key: 'fed_rate', when: 'up', weight: 22, note: 'interest rates up / hikes' },
    ],
  },
  {
    target: 'jobless_claims',
    direction: 'up',
    drivers: [
      { key: 'job_openings', when: 'down', weight: 26, note: 'job openings low' },
    ],
  },
  {
    target: 'jobless_claims',
    direction: 'down',
    drivers: [
      { key: 'job_openings', when: 'up', weight: 26, note: 'job openings high' },
    ],
  },
  {
    target: 'consumer_confidence',
    direction: 'up',
    drivers: [
      { key: 'cpi', when: 'down', weight: 18, note: 'CPI down' },
      { key: 'average_hourly_earnings', when: 'up', weight: 18, note: 'average hourly earnings high' },
      { key: 'unemployment_rate', when: 'up', weight: 10, note: 'unemployment rate high', userHeuristic: true },
    ],
  },
  {
    target: 'consumer_confidence',
    direction: 'down',
    drivers: [
      { key: 'cpi', when: 'up', weight: 18, note: 'CPI up' },
      { key: 'average_hourly_earnings', when: 'down', weight: 18, note: 'average hourly earnings low' },
      { key: 'unemployment_rate', when: 'down', weight: 10, note: 'unemployment rate low', userHeuristic: true },
    ],
  },
  {
    target: 'pce_price_index',
    direction: 'up',
    drivers: [
      { key: 'cpi', when: 'down', weight: 16, note: 'CPI down', userHeuristic: true },
      { key: 'average_hourly_earnings', when: 'up', weight: 18, note: 'average hourly earnings high' },
      { key: 'retail_sales', when: 'up', weight: 22, note: 'retail sales up' },
    ],
  },
  {
    target: 'pce_price_index',
    direction: 'down',
    drivers: [
      { key: 'cpi', when: 'up', weight: 16, note: 'CPI up', userHeuristic: true },
      { key: 'average_hourly_earnings', when: 'down', weight: 18, note: 'average hourly earnings low' },
      { key: 'retail_sales', when: 'down', weight: 22, note: 'retail sales down' },
    ],
  },
  {
    target: 'gdp',
    direction: 'down',
    drivers: [
      { key: 'cpi', when: 'down', weight: 10, note: 'CPI down', userHeuristic: true },
      { key: 'retail_sales', when: 'up', weight: 14, note: 'retail sales up', userHeuristic: true },
      { key: 'ppi', when: 'up', weight: 14, note: 'PPI up', userHeuristic: true },
    ],
  },
  {
    target: 'gdp',
    direction: 'up',
    drivers: [
      { key: 'cpi', when: 'up', weight: 10, note: 'CPI up', userHeuristic: true },
      { key: 'retail_sales', when: 'down', weight: 14, note: 'retail sales down', userHeuristic: true },
      { key: 'ppi', when: 'down', weight: 14, note: 'PPI down', userHeuristic: true },
    ],
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: string | null): number | null {
  if (!value) return null;
  const text = String(value).trim();
  const match = text.match(/[-+]?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0].replace(',', '.'));
  if (!Number.isFinite(numeric)) return null;
  const upper = text.toUpperCase();
  if (upper.includes('B')) return numeric * 1_000_000_000;
  if (upper.includes('M')) return numeric * 1_000_000;
  if (upper.includes('K')) return numeric * 1_000;
  return numeric;
}

function normalizeEventKey(event: CalendarEventLike): NormalizedEventKey | null {
  const text = `${event.event} ${event.category}`.toLowerCase();

  if (/average hourly earnings/.test(text)) return 'average_hourly_earnings';
  if (/unemployment rate/.test(text)) return 'unemployment_rate';
  if (/(job openings|jolts)/.test(text)) return 'job_openings';
  if (/(jobless claims|initial jobless claims|unemployment claims)/.test(text)) return 'jobless_claims';
  if (/(ism services pmi|services pmi)/.test(text)) return 'ism_services_pmi';
  if (/(manufacturing pmi|composite pmi|\bpmi\b)/.test(text)) return 'pmi';
  if (/(consumer price index|inflation rate|cpi)/.test(text) && /(y\/y|yy|year)/.test(text)) return 'cpi_yoy';
  if (/(consumer price index|inflation rate|cpi)/.test(text) && /(m\/m|mm|month)/.test(text)) return 'cpi_mom';
  if (/(consumer price index|inflation rate|cpi)/.test(text)) return 'cpi_yoy';
  if (/retail sales/.test(text)) return 'retail_sales';
  if (/(producer prices|producer price index|ppi)/.test(text)) return 'ppi';
  if (/new home sales/.test(text)) return 'new_home_sales';
  if (/(consumer confidence|consumer sentiment|michigan sentiment)/.test(text)) return 'consumer_confidence';
  if (/(pce price index|personal consumption expenditure.*price|core pce)/.test(text)) return 'pce_price_index';
  if (/(gross domestic product|gdp)/.test(text) && /(y\/y|yy|year)/.test(text)) return 'gdp_yoy';
  if (/(gross domestic product|gdp)/.test(text)) return 'gdp';
  if (/(interest rate decision|federal funds rate|fed funds target|fomc rate|benchmark interest rate)/.test(text)) return 'fed_rate';
  if (/crude oil inventories/.test(text)) return 'crude_oil_inventories';
  if (/gasoline inventories/.test(text)) return 'gasoline_inventories';
  return null;
}

function canonicalKey(key: NormalizedEventKey | null): DeskSignalKey | null {
  if (!key) return null;
  if (key === 'average_hourly_earnings') return 'average_hourly_earnings';
  if (key === 'unemployment_rate') return 'unemployment_rate';
  if (key === 'job_openings') return 'job_openings';
  if (key === 'jobless_claims') return 'jobless_claims';
  if (key === 'pmi' || key === 'ism_services_pmi') return 'pmi';
  if (key === 'cpi_yoy' || key === 'cpi_mom') return 'cpi';
  if (key === 'retail_sales') return 'retail_sales';
  if (key === 'ppi') return 'ppi';
  if (key === 'new_home_sales') return 'new_home_sales';
  if (key === 'consumer_confidence') return 'consumer_confidence';
  if (key === 'pce_price_index') return 'pce_price_index';
  if (key === 'gdp_yoy' || key === 'gdp') return 'gdp';
  if (key === 'fed_rate') return 'fed_rate';
  return null;
}

function variantBonus(key: NormalizedEventKey): number {
  if (key === 'cpi_yoy' || key === 'gdp_yoy') return 12;
  if (key === 'ism_services_pmi') return 10;
  if (key === 'cpi_mom') return 4;
  return 0;
}

function compareState(actual: number | null, baseline: number | null, tolerance = 0.0001): 'up' | 'down' | 'flat' | 'unknown' {
  if (actual == null || baseline == null) return 'unknown';
  if (Math.abs(actual - baseline) <= tolerance) return 'flat';
  return actual > baseline ? 'up' : 'down';
}

function releasedState(event: CalendarEventLike, key: NormalizedEventKey): 'up' | 'down' | 'flat' | 'unknown' {
  const actual = toNumber(event.actual);
  const forecast = toNumber(event.forecast);
  const previous = toNumber(event.previous);
  const text = `${event.event} ${event.category}`.toLowerCase();

  if (key === 'ism_services_pmi' || key === 'pmi') {
    if (actual == null) return 'unknown';
    return actual > 50 ? 'up' : 'down';
  }

  if (key === 'fed_rate') {
    const baseline = previous ?? forecast;
    return compareState(actual, baseline, 0.001);
  }

  if (/(inventories|stocks change)/.test(text)) {
    return compareState(actual, forecast ?? previous, 0.001);
  }

  const state = compareState(actual, forecast ?? previous, 0.001);
  if (state !== 'unknown') return state;
  return compareState(actual, previous, 0.001);
}

function priorityScore(event: CalendarEventLike, key: NormalizedEventKey): number {
  const timestamp = new Date(event.date).getTime();
  return (event.relevanceScore * 10) + (event.importance * 8) + variantBonus(key) + Math.min(timestamp / 1_000_000_000_000, 100);
}

function isReleased(event: CalendarEventLike): boolean {
  const timestamp = new Date(event.date).getTime();
  return Boolean(event.actual) && Number.isFinite(timestamp) && timestamp <= Date.now();
}

function targetLabel(target: RuleTarget): string {
  if (target === 'pmi') return 'PMI';
  if (target === 'cpi') return 'CPI / inflation';
  if (target === 'retail_sales') return 'Retail Sales';
  if (target === 'ppi') return 'PPI';
  if (target === 'new_home_sales') return 'New Home Sales';
  if (target === 'jobless_claims') return 'Jobless Claims';
  if (target === 'consumer_confidence') return 'Consumer Confidence';
  if (target === 'pce_price_index') return 'PCE Price Index';
  return 'GDP';
}

function isRuleTarget(key: DeskSignalKey): key is RuleTarget {
  return (
    key === 'pmi'
    || key === 'cpi'
    || key === 'retail_sales'
    || key === 'ppi'
    || key === 'new_home_sales'
    || key === 'jobless_claims'
    || key === 'consumer_confidence'
    || key === 'pce_price_index'
    || key === 'gdp'
  );
}

function buildDriverMap(events: CalendarEventLike[]): Map<DeskSignalKey, ReleasedSignal> {
  const map = new Map<DeskSignalKey, ReleasedSignal>();

  for (const event of events) {
    if (event.country !== 'United States' && event.currency !== 'USD') continue;
    const rawKey = normalizeEventKey(event);
    const key = canonicalKey(rawKey);
    if (!rawKey || !key || !isReleased(event)) continue;

    const state = releasedState(event, rawKey);
    if (state !== 'up' && state !== 'down') continue;

    const candidate: ReleasedSignal = {
      key,
      rawKey,
      event,
      state,
      priorityScore: priorityScore(event, rawKey),
    };

    const existing = map.get(key);
    if (!existing || candidate.priorityScore >= existing.priorityScore) {
      map.set(key, candidate);
    }
  }

  return map;
}

function confidenceBand(score: number): 'low' | 'medium' | 'high' {
  if (score >= 72) return 'high';
  if (score >= 48) return 'medium';
  return 'low';
}

function inferPrediction(event: CalendarEventLike, drivers: Map<DeskSignalKey, ReleasedSignal>): EconomicCalendarPrediction | null {
  const rawKey = normalizeEventKey(event);
  const target = canonicalKey(rawKey);
  if (!rawKey || !target || !isRuleTarget(target)) return null;

  const eventRules = RULES.filter((rule) => rule.target === target);
  if (!eventRules.length) return null;

  const scored = eventRules.map((rule) => {
    let score = 0;
    let availableDrivers = 0;
    let userHeuristicCount = 0;
    const matchedDrivers: EconomicCalendarPredictiveDriver[] = [];

    rule.drivers.forEach((driverRule) => {
      const released = drivers.get(driverRule.key);
      if (!released) return;
      availableDrivers += 1;
      if (driverRule.userHeuristic) userHeuristicCount += 1;

      if (released.state === driverRule.when) {
        score += driverRule.weight;
        matchedDrivers.push({
          key: driverRule.key,
          event: released.event.event,
          state: released.state,
          actual: released.event.actual,
          forecast: released.event.forecast,
          previous: released.event.previous,
          releasedAt: released.event.date,
          note: driverRule.note,
        });
      } else {
        score -= Math.round(driverRule.weight * 0.55);
      }
    });

    return {
      rule,
      score,
      availableDrivers,
      userHeuristicCount,
      matchedDrivers,
    };
  });

  const best = [...scored].sort((left, right) => right.score - left.score)[0];
  const runnerUp = [...scored].sort((left, right) => right.score - left.score)[1];
  if (!best || best.availableDrivers === 0 || !best.matchedDrivers.length) return null;

  const directionalGap = best.score - (runnerUp?.score ?? 0);
  const baseScore = clamp(best.score + Math.min(directionalGap, 18) + Math.min(best.availableDrivers * 6, 18), 18, 92);
  const confidenceScore = clamp(baseScore - (best.userHeuristicCount * 2), 18, 92);
  const direction = directionalGap <= 6 ? 'mixed' : best.rule.direction;
  const confidence = confidenceBand(confidenceScore);
  const matchedNotes = best.matchedDrivers.map((driver) => `${driver.event} ${driver.state}`);
  const yoyWeight = rawKey === 'cpi_yoy' || rawKey === 'gdp_yoy';
  const noteParts = [
    'Vaultum U.S. desk chain: uses already released U.S. events to frame later releases.',
    yoyWeight ? 'This target gets extra weight because the y/y version matters more than m/m on the desk map.' : null,
    best.userHeuristicCount ? 'Part of this read comes from user-supplied desk heuristics rather than hard macro law.' : null,
  ].filter((value): value is string => Boolean(value));

  const headline = targetLabel(target);
  return {
    targetKey: rawKey,
    targetEvent: event.event,
    targetCurrency: event.currency,
    targetDate: event.date,
    direction,
    confidence,
    confidenceScore,
    summary:
      direction === 'mixed'
        ? `${headline} is mixed ahead of release; the desk chain is split across ${matchedNotes.join(', ')}.`
        : `${headline} desk chain leans ${direction} ahead of release from ${matchedNotes.join(', ')}.`,
    note: noteParts.join(' '),
    drivers: best.matchedDrivers,
  };
}

export function buildUsEconomicCalendarHeuristics(events: CalendarEventLike[]): {
  summary: string;
  predictions: EconomicCalendarPrediction[];
  notes: EconomicCalendarDeskNote[];
} {
  const drivers = buildDriverMap(events);
  const predictions = events
    .filter((event) => (event.country === 'United States' || event.currency === 'USD') && event.isUpcoming)
    .map((event) => inferPrediction(event, drivers))
    .filter((event): event is EconomicCalendarPrediction => Boolean(event))
    .sort((left, right) => {
      if (left.confidenceScore !== right.confidenceScore) return right.confidenceScore - left.confidenceScore;
      return new Date(left.targetDate).getTime() - new Date(right.targetDate).getTime();
    });

  const notes: EconomicCalendarDeskNote[] = [
    {
      title: 'Desk Chain',
      detail: 'Heuristic predictions only activate when precursor U.S. releases have already printed earlier in the day.',
    },
    {
      title: 'YoY Priority',
      detail: 'CPI y/y and GDP y/y are weighted above m/m when both versions exist because they tend to carry more desk impact.',
    },
    {
      title: 'PMI Threshold',
      detail: 'PMI above 50 is treated as expansion, while 50 or below is treated as contraction in this map.',
    },
    {
      title: 'Energy Timing',
      detail: 'U.S. crude and gasoline inventory releases are watched closely around Wednesday and Thursday energy tape.',
    },
  ];

  return {
    summary: predictions[0]
      ? `${predictions[0].targetCurrency} ${predictions[0].targetEvent} currently has a ${predictions[0].confidence} confidence desk-chain lean ${predictions[0].direction}.`
      : 'No same-day U.S. precursor chain has enough released data yet to form a desk prediction.',
    predictions,
    notes,
  };
}
