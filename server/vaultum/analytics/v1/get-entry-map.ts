import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { getOrderflowEngine } from '../../orderflow/v1/get-engine';
import { getBuyerSellerPressure } from '../../pressure/v1/get-buyer-seller-pressure';
import { getLevels } from '../../pivots/v1/get-levels';
import { getProfile } from '../../volume/v1/get-profile';
import { getDealerPressure } from '../../options/v1/get-dealer-pressure';
import { getFlowProxy } from '../../options/v1/get-flow-proxy';
import { getMacroSignals } from '../../macro/v1/get-macro-signals';
import { getEconomicCalendar } from '../../calendar/v1/get-economic-calendar';
import { buildModelSelectionDecision } from '../../system/v1/_knowledge-base';

type Direction = 'long' | 'short' | 'neutral';
type BiasTone = 'bullish' | 'bearish' | 'neutral' | 'alert';
type StructureBias = 'bullish' | 'bearish' | 'range' | 'transition';
type StructureQuality = 'weak' | 'building' | 'clear';
type ExecutionPhase = 'impulse' | 'correction' | 'continuation' | 'reversal' | 'transition';
type ExecutionReadiness = 'ready' | 'watch' | 'stand-aside';
type BreakOfStructureState = 'confirmed' | 'building' | 'absent';
type InstitutionalReferenceType = 'order-block' | 'fair-value-gap' | 'fib';
type ZoneQualityLabel = 'weak' | 'building' | 'strong' | 'institutional';

type OrderflowSnapshot = Awaited<ReturnType<typeof getOrderflowEngine>>;
type PivotSnapshot = Awaited<ReturnType<typeof getLevels>>;
type VolumeProfileSnapshot = Awaited<ReturnType<typeof getProfile>>;
type MacroSnapshot = Awaited<ReturnType<typeof getMacroSignals>>;
type CalendarSnapshot = Awaited<ReturnType<typeof getEconomicCalendar>>;
type RichBar = OrderflowSnapshot['recentBars'][number];
type MacroFocusSnapshot = NonNullable<MacroSnapshot['focus']>;
type RankedExecutionLevel = {
  label: string;
  level: number;
  score: number;
  reason: string;
};
type ExecutionLayer = {
  broadLow: number | null;
  broadHigh: number | null;
  displacementOrigin: number | null;
  deepestFill: number | null;
  liquiditySweepLevel: number | null;
  structureBreakLevel: number | null;
  preferredEntryLevel: number | null;
  trueLiquidityLevel: number | null;
  microShiftLevel: number | null;
  rankedLevels: RankedExecutionLevel[];
  rankingSummary: string;
};
type InstitutionalZoneScan = {
  active: boolean;
  label: string;
  summary: string;
  low: number | null;
  high: number | null;
  relativeVolume: number | null;
  delta: number | null;
  inverseDelta: boolean;
  displacementAligned: boolean;
  qualityScore: number;
  qualityLabel: ZoneQualityLabel;
  sweepAligned: boolean;
  keyLevelAligned: boolean;
  structureBreakAligned: boolean;
  volatilityExpanded: boolean;
  participationClear: boolean;
  overlapClean: boolean;
  executionLayer: ExecutionLayer;
};
type InstitutionalReferenceSelection = {
  type: InstitutionalReferenceType;
  label: string;
  low: number;
  high: number;
  summary: string;
  qualityScore: number;
  qualityLabel: ZoneQualityLabel;
  executionLayer: ExecutionLayer;
};
type StructureMap = {
  timeframe: string;
  bias: StructureBias;
  direction: Direction;
  quality: StructureQuality;
  ladder: string;
  protectedLevel: number | null;
  dealingRangeLow: number | null;
  dealingRangeHigh: number | null;
  summary: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function firstFinite(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function formatPrice(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : 'n/a';
}

function formatRange(lower: number | null | undefined, upper: number | null | undefined): string {
  if (lower == null || upper == null || !Number.isFinite(lower) || !Number.isFinite(upper)) return 'n/a';
  const min = Math.min(lower, upper);
  const max = Math.max(lower, upper);
  return `${min.toFixed(2)} - ${max.toFixed(2)}`;
}

function confidenceLabel(score: number): 'low' | 'medium' | 'high' {
  if (score >= 72) return 'high';
  if (score >= 48) return 'medium';
  return 'low';
}

function directionFromScore(score: number): Direction {
  if (score >= 12) return 'long';
  if (score <= -12) return 'short';
  return 'neutral';
}

function toneFromDirection(direction: Direction, doNotExecute = false): BiasTone {
  if (doNotExecute) return 'alert';
  if (direction === 'long') return 'bullish';
  if (direction === 'short') return 'bearish';
  return 'neutral';
}

function directionLabel(direction: Direction): string {
  if (direction === 'long') return 'Long Bias';
  if (direction === 'short') return 'Short Bias';
  return 'Neutral Bias';
}

function signalTextScore(value: string | null | undefined): number {
  const text = String(value || '').toLowerCase();
  if (!text) return 0;
  if (/(strong buyers|buyers dominant|buyer|bullish|long|upside|bid)/.test(text)) return 18;
  if (/(strong sellers|sellers dominant|seller|bearish|short|downside|offer)/.test(text)) return -18;
  if (/(balanced|neutral|inside balance|mixed|two-way)/.test(text)) return 0;
  return 0;
}

function pivotSignalScore(snapshot: PivotSnapshot): number {
  const signalMap = snapshot?.signalMap;
  if (!signalMap) return 0;
  let score = signalTextScore(signalMap.bias);
  if (signalMap.buySignal) score += 18;
  if (signalMap.sellSignal) score -= 18;
  if (signalMap.bullSweep) score += 10;
  if (signalMap.bearSweep) score -= 10;
  if (signalMap.entrySide === 'long') score += 8;
  if (signalMap.entrySide === 'short') score -= 8;
  return clamp(score, -40, 40);
}

function currentSessionNote(market: string): string {
  const hour = new Date().getUTCHours();
  const goldLike = /(XAU|GOLD)/.test(market);
  if (goldLike) {
    if (hour >= 7 && hour < 13) return 'London flow is active. Gold pullback entries can trigger quickly when 5m delta re-expands.';
    if (hour >= 13 && hour < 21) return 'New York flow is active. Gold reacts harder to DXY and yield shifts during this window.';
    return 'Outside the main gold liquidity window. Demand cleaner 5m confirmation and lighter size if volume stays muted.';
  }
  if (hour >= 13 && hour < 21) return 'US cash-session liquidity is active, so continuation moves can accelerate if the trigger tape aligns.';
  if (hour >= 7 && hour < 13) return 'European session liquidity is active, so structure reactions tend to be cleaner.';
  return 'Liquidity is lighter right now, so favor confirmation over anticipation.';
}

function candleStats(bar: RichBar): {
  range: number;
  body: number;
  upperWick: number;
  lowerWick: number;
  closeNearHigh: number;
  closeNearLow: number;
} {
  const range = Math.max(bar.high - bar.low, 0.0001);
  const body = Math.abs(bar.close - bar.open);
  const upperWick = bar.high - Math.max(bar.open, bar.close);
  const lowerWick = Math.min(bar.open, bar.close) - bar.low;
  return {
    range,
    body,
    upperWick,
    lowerWick,
    closeNearHigh: (bar.close - bar.low) / range,
    closeNearLow: (bar.high - bar.close) / range,
  };
}

function normalizedZone(lower: number, upper: number): { low: number; high: number } {
  return {
    low: Number(Math.min(lower, upper).toFixed(2)),
    high: Number(Math.max(lower, upper).toFixed(2)),
  };
}

function zoneQualityLabel(score: number): ZoneQualityLabel {
  if (score >= 82) return 'institutional';
  if (score >= 68) return 'strong';
  if (score >= 50) return 'building';
  return 'weak';
}

function structureDirectionFromBias(bias: StructureBias): Direction {
  if (bias === 'bullish') return 'long';
  if (bias === 'bearish') return 'short';
  return 'neutral';
}

function structureBiasLabel(bias: StructureBias): string {
  if (bias === 'bullish') return 'bullish';
  if (bias === 'bearish') return 'bearish';
  if (bias === 'range') return 'balanced';
  return 'transitioning';
}

function detectStructureMap(input: {
  bars: RichBar[];
  timeframe: string;
  score: number;
  regime: any;
}): StructureMap {
  if (input.bars.length < 6) {
    return {
      timeframe: input.timeframe,
      bias: 'transition',
      direction: 'neutral',
      quality: 'weak',
      ladder: 'structure still loading',
      protectedLevel: null,
      dealingRangeLow: null,
      dealingRangeHigh: null,
      summary: `${input.timeframe} structure is still loading.`,
    };
  }

  const recent = input.bars.slice(-10);
  const split = Math.max(3, Math.floor(recent.length / 2));
  const early = recent.slice(0, split);
  const late = recent.slice(-split);
  const dealingRangeLow = Math.min(...recent.map((bar) => bar.low));
  const dealingRangeHigh = Math.max(...recent.map((bar) => bar.high));
  const earlyHigh = Math.max(...early.map((bar) => bar.high));
  const earlyLow = Math.min(...early.map((bar) => bar.low));
  const lateHigh = Math.max(...late.map((bar) => bar.high));
  const lateLow = Math.min(...late.map((bar) => bar.low));
  const latest = recent[recent.length - 1]!;
  const range = Math.max(dealingRangeHigh - dealingRangeLow, 0.01);
  const buffer = Math.max(range * 0.04, Math.abs(latest.close) * 0.00025, 0.05);
  const regimeCode = String(input.regime?.primaryCode || '').toUpperCase();
  const breakoutDirection = String(input.regime?.breakout?.direction || '').toLowerCase();
  const higherHighs = lateHigh > earlyHigh + (buffer * 0.35);
  const higherLows = lateLow > earlyLow - (buffer * 0.25);
  const lowerHighs = lateHigh < earlyHigh + (buffer * 0.25);
  const lowerLows = lateLow < earlyLow - (buffer * 0.35);
  const flatHighs = Math.abs(lateHigh - earlyHigh) <= buffer * 0.45;
  const flatLows = Math.abs(lateLow - earlyLow) <= buffer * 0.45;

  let bias: StructureBias = 'transition';
  if (regimeCode === 'TREND_UP') bias = 'bullish';
  else if (regimeCode === 'TREND_DOWN') bias = 'bearish';
  else if (regimeCode === 'RANGE') bias = 'range';
  else if (regimeCode === 'BREAKOUT') {
    if (breakoutDirection === 'up') bias = 'bullish';
    else if (breakoutDirection === 'down') bias = 'bearish';
  }

  if (bias === 'transition') {
    if (higherHighs && higherLows && input.score >= -8) bias = 'bullish';
    else if (lowerHighs && lowerLows && input.score <= 8) bias = 'bearish';
    else if (flatHighs && flatLows && Math.abs(input.score) < 14) bias = 'range';
  }

  const quality: StructureQuality =
    bias === 'range' || bias === 'transition'
      ? (Math.abs(input.score) >= 18 ? 'building' : 'weak')
      : Math.abs(input.score) >= 18 && (higherHighs || lowerLows)
        ? 'clear'
        : 'building';
  const protectedLevel = bias === 'bullish'
    ? Number(Math.min(...late.map((bar) => bar.low)).toFixed(2))
    : bias === 'bearish'
      ? Number(Math.max(...late.map((bar) => bar.high)).toFixed(2))
      : null;
  const ladder = bias === 'bullish'
    ? 'higher highs and higher lows'
    : bias === 'bearish'
      ? 'lower highs and lower lows'
      : bias === 'range'
        ? 'balanced range'
        : 'mixed / transitioning';
  const summary = bias === 'bullish'
    ? `${input.timeframe} structure is bullish. Protected low ${formatPrice(protectedLevel)}. Dealing range ${formatRange(dealingRangeLow, dealingRangeHigh)}.`
    : bias === 'bearish'
      ? `${input.timeframe} structure is bearish. Protected high ${formatPrice(protectedLevel)}. Dealing range ${formatRange(dealingRangeLow, dealingRangeHigh)}.`
      : bias === 'range'
        ? `${input.timeframe} structure is balanced inside ${formatRange(dealingRangeLow, dealingRangeHigh)}.`
        : `${input.timeframe} structure is transitioning inside ${formatRange(dealingRangeLow, dealingRangeHigh)}.`;

  return {
    timeframe: input.timeframe,
    bias,
    direction: structureDirectionFromBias(bias),
    quality,
    ladder,
    protectedLevel,
    dealingRangeLow: Number(dealingRangeLow.toFixed(2)),
    dealingRangeHigh: Number(dealingRangeHigh.toFixed(2)),
    summary,
  };
}

function averageRange(bars: RichBar[]): number {
  return average(bars.map((bar) => Math.max(bar.high - bar.low, 0.0001)));
}

function oppositeCandle(direction: Direction, bar: RichBar): boolean {
  if (direction === 'long') return bar.close < bar.open;
  if (direction === 'short') return bar.close > bar.open;
  return false;
}

function barClosesWithDirection(direction: Direction, bar: RichBar, closeThreshold = 0.64): boolean {
  const stats = candleStats(bar);
  if (direction === 'long') return bar.close > bar.open && stats.closeNearHigh >= closeThreshold;
  if (direction === 'short') return bar.close < bar.open && stats.closeNearLow >= closeThreshold;
  return false;
}

function emptyExecutionLayer(): ExecutionLayer {
  return {
    broadLow: null,
    broadHigh: null,
    displacementOrigin: null,
    deepestFill: null,
    liquiditySweepLevel: null,
    structureBreakLevel: null,
    preferredEntryLevel: null,
    trueLiquidityLevel: null,
    microShiftLevel: null,
    rankedLevels: [],
    rankingSummary: 'Execution layer is not available yet.',
  };
}

function rankExecutionLevels(input: {
  direction: Direction;
  zone: { low: number; high: number };
  displacementOrigin: number | null;
  deepestFill: number | null;
  liquiditySweepLevel: number | null;
  structureBreakLevel: number | null;
}): ExecutionLayer {
  const candidates: RankedExecutionLevel[] = [];
  const zone = normalizedZone(input.zone.low, input.zone.high);
  const push = (label: string, level: number | null, score: number, reason: string) => {
    if (level == null || !Number.isFinite(level)) return;
    const bounded = clamp(level, zone.low, zone.high);
    candidates.push({
      label,
      level: Number(bounded.toFixed(2)),
      score,
      reason,
    });
  };

  if (input.direction !== 'neutral') {
    push(
      'Deepest inefficiency fill',
      input.deepestFill,
      input.liquiditySweepLevel != null ? 92 : 84,
      'This is the deepest fill still inside the zone, where inefficiency completion and liquidity proximity overlap best.',
    );
    push(
      'Displacement origin',
      input.displacementOrigin,
      80,
      'This is where the real displacement launched from, so it matters more than a generic zone edge.',
    );
    if (input.liquiditySweepLevel != null) {
      const sweepReclaim = input.direction === 'long'
        ? Math.min(zone.high, input.liquiditySweepLevel + Math.max((zone.high - zone.low) * 0.18, 0.05))
        : Math.max(zone.low, input.liquiditySweepLevel - Math.max((zone.high - zone.low) * 0.18, 0.05));
      push(
        'Sweep reclaim',
        sweepReclaim,
        96,
        'Best-quality execution usually happens only after the sweep level is taken and then reclaimed with force.',
      );
    }
    if (input.structureBreakLevel != null) {
      push(
        'Micro shift confirm',
        input.structureBreakLevel,
        72,
        'Use this as the reclaim / micro-BOS confirmation level, not the anticipation price.',
      );
    }
  }

  const rankedLevels = candidates
    .sort((left, right) => right.score - left.score)
    .filter((candidate, index, array) =>
      array.findIndex((item) => Math.abs(item.level - candidate.level) <= 0.01 && item.label === candidate.label) === index)
    .slice(0, 4);

  return {
    broadLow: zone.low,
    broadHigh: zone.high,
    displacementOrigin: input.displacementOrigin != null ? Number(clamp(input.displacementOrigin, zone.low, zone.high).toFixed(2)) : null,
    deepestFill: input.deepestFill != null ? Number(clamp(input.deepestFill, zone.low, zone.high).toFixed(2)) : null,
    liquiditySweepLevel: input.liquiditySweepLevel != null ? Number(input.liquiditySweepLevel.toFixed(2)) : null,
    structureBreakLevel: input.structureBreakLevel != null ? Number(input.structureBreakLevel.toFixed(2)) : null,
    preferredEntryLevel: rankedLevels[0]?.level ?? null,
    trueLiquidityLevel: input.liquiditySweepLevel != null ? Number(input.liquiditySweepLevel.toFixed(2)) : null,
    microShiftLevel: input.structureBreakLevel != null ? Number(input.structureBreakLevel.toFixed(2)) : null,
    rankedLevels,
    rankingSummary: rankedLevels.length
      ? `${rankedLevels[0]!.label} at ${formatPrice(rankedLevels[0]!.level)} is the preferred execution level because ${rankedLevels[0]!.reason.toLowerCase()}`
      : 'Execution layer is waiting for a cleaner displacement origin, inefficiency fill, or sweep reclaim.',
  };
}

function macroSupportsDirection(direction: Direction, macroBias: string | null | undefined): boolean {
  if (direction === 'long') return macroBias === 'bullish';
  if (direction === 'short') return macroBias === 'bearish';
  return false;
}

function macroFightsDirection(direction: Direction, macroBias: string | null | undefined): boolean {
  if (direction === 'long') return macroBias === 'bearish';
  if (direction === 'short') return macroBias === 'bullish';
  return false;
}

function ratesSupportDirection(direction: Direction, ratesBias: string | null | undefined): boolean {
  if (direction === 'long') return ratesBias === 'bullish-base';
  if (direction === 'short') return ratesBias === 'bearish-base';
  return false;
}

function ratesFightDirection(direction: Direction, ratesBias: string | null | undefined): boolean {
  if (direction === 'long') return ratesBias === 'bearish-base';
  if (direction === 'short') return ratesBias === 'bullish-base';
  return false;
}

function nextPrimaryHighImpactEvent(calendar: CalendarSnapshot | null | undefined): CalendarSnapshot['events'][number] | null {
  const event = calendar?.events?.find((item: any) =>
    item?.isUpcoming
    && item?.impact === 'high'
    && item?.priority === 'primary',
  );
  return event ?? null;
}

function buildEntryLadder(input: {
  direction: Direction;
  institutionalReference: InstitutionalReferenceSelection;
  breakLevel: number | null;
  triggerAtr: number;
  invalidationLevel: number;
}): Array<{ label: string; level: string; note: string }> {
  if (input.direction === 'neutral') {
    return [
      { label: 'Sweep', level: 'n/a', note: 'Directional bias is still neutral, so there is no valid execution layer yet.' },
      { label: 'Execute', level: 'n/a', note: 'Do not anticipate inside a broad zone while structure is neutral.' },
      { label: 'Confirm', level: 'n/a', note: 'Wait for lower-timeframe structure to shift first.' },
      { label: 'Press', level: 'n/a', note: 'Do not pyramid without a directional read.' },
    ];
  }

  const zone = normalizedZone(input.institutionalReference.low, input.institutionalReference.high);
  const width = Math.max(zone.high - zone.low, input.triggerAtr * 0.4, 0.05);
  const sweepLevel = input.institutionalReference.executionLayer.liquiditySweepLevel
    ?? (input.direction === 'long' ? zone.low : zone.high);
  const executeLevel = input.institutionalReference.executionLayer.preferredEntryLevel
    ?? (input.direction === 'long'
      ? Number((zone.low + (width * 0.22)).toFixed(2))
      : Number((zone.high - (width * 0.22)).toFixed(2)));
  const confirmLevel = input.institutionalReference.executionLayer.microShiftLevel
    ?? input.breakLevel
    ?? (input.direction === 'long' ? zone.high : zone.low);
  const pressReference = input.breakLevel != null
    ? (input.direction === 'long' ? Math.max(confirmLevel, input.breakLevel) : Math.min(confirmLevel, input.breakLevel))
    : confirmLevel;
  const pressLevel = input.direction === 'long'
    ? Number((pressReference + (input.triggerAtr * 0.15)).toFixed(2))
    : Number((pressReference - (input.triggerAtr * 0.15)).toFixed(2));

  return [
    {
      label: 'Sweep',
      level: formatPrice(sweepLevel),
      note: `Watch this liquidity level first. A sweep here is context, not an automatic entry, and it should happen before trusting the zone.`,
    },
    {
      label: 'Execute',
      level: formatPrice(executeLevel),
      note: `Specific execution price inside the ${input.institutionalReference.label}; wait for sweep plus rejection with displacement before using it.`,
    },
    {
      label: 'Confirm',
      level: formatPrice(confirmLevel),
      note: 'Micro-structure shift or reclaim level that validates the turn before any meaningful size is added.',
    },
    {
      label: 'Press',
      level: formatPrice(pressLevel),
      note: 'Winner-only add level after price accepts away from the execution layer and continuation is obvious.',
    },
  ];
}

function zoneContainsPrice(
  lower: number | null | undefined,
  upper: number | null | undefined,
  price: number,
  tolerance = 0,
): boolean {
  if (lower == null || upper == null || !Number.isFinite(lower) || !Number.isFinite(upper)) return false;
  const zone = normalizedZone(lower, upper);
  return price >= (zone.low - tolerance) && price <= (zone.high + tolerance);
}

function intersectZones(
  leftLower: number,
  leftUpper: number,
  rightLower: number,
  rightUpper: number,
): { low: number; high: number } | null {
  const left = normalizedZone(leftLower, leftUpper);
  const right = normalizedZone(rightLower, rightUpper);
  const low = Math.max(left.low, right.low);
  const high = Math.min(left.high, right.high);
  if (low > high) return null;
  return normalizedZone(low, high);
}

function recentBars(orderflow: OrderflowSnapshot | null | undefined): RichBar[] {
  return (orderflow?.footprintBars ?? orderflow?.recentBars ?? []).filter(Boolean);
}

function inactiveZoneScan(label: string, summary: string): InstitutionalZoneScan {
  return {
    active: false,
    label,
    summary,
    low: null,
    high: null,
    relativeVolume: null,
    delta: null,
    inverseDelta: false,
    displacementAligned: false,
    qualityScore: 0,
    qualityLabel: 'weak',
    sweepAligned: false,
    keyLevelAligned: false,
    structureBreakAligned: false,
    volatilityExpanded: false,
    participationClear: false,
    overlapClean: false,
    executionLayer: emptyExecutionLayer(),
  };
}

function detectBreakOfStructure(
  bars: RichBar[],
  direction: Direction,
  timeframe: string,
): { state: BreakOfStructureState; level: number | null; summary: string } {
  if (direction === 'neutral' || bars.length < 6) {
    return {
      state: 'absent',
      level: null,
      summary: `${timeframe} break-of-structure is unavailable until more bars print.`,
    };
  }

  const recent = bars.slice(-7);
  const latest = recent[recent.length - 1]!;
  const prior = recent.slice(0, -1);
  const priorHigh = Math.max(...prior.map((bar) => bar.high));
  const priorLow = Math.min(...prior.map((bar) => bar.low));
  const swingLevel = direction === 'long' ? priorHigh : priorLow;
  const buffer = Math.max((priorHigh - priorLow) * 0.04, Math.abs(latest.close) * 0.00025, 0.05);

  if (direction === 'long') {
    if (latest.close > (priorHigh + buffer)) {
      return {
        state: 'confirmed',
        level: Number(priorHigh.toFixed(2)),
        summary: `${timeframe} BOS is confirmed above ${formatPrice(priorHigh)} after price closed through the prior swing high.`,
      };
    }
    if (latest.high > priorHigh) {
      return {
        state: 'building',
        level: Number(priorHigh.toFixed(2)),
        summary: `${timeframe} is probing the prior swing high near ${formatPrice(priorHigh)}, but the close has not fully confirmed BOS yet.`,
      };
    }
  } else {
    if (latest.close < (priorLow - buffer)) {
      return {
        state: 'confirmed',
        level: Number(priorLow.toFixed(2)),
        summary: `${timeframe} BOS is confirmed below ${formatPrice(priorLow)} after price closed through the prior swing low.`,
      };
    }
    if (latest.low < priorLow) {
      return {
        state: 'building',
        level: Number(priorLow.toFixed(2)),
        summary: `${timeframe} is probing the prior swing low near ${formatPrice(priorLow)}, but the close has not fully confirmed BOS yet.`,
      };
    }
  }

  return {
    state: 'absent',
    level: Number(swingLevel.toFixed(2)),
    summary: `${timeframe} has not broken the prior ${direction === 'long' ? 'swing high' : 'swing low'} at ${formatPrice(swingLevel)} yet.`,
  };
}

function detectOrderBlock(
  bars: RichBar[],
  direction: Direction,
  timeframe: string,
): InstitutionalZoneScan {
  if (direction === 'neutral' || bars.length < 4) {
    return inactiveZoneScan(`${timeframe} order block`, `${timeframe} order-block scan is waiting for more structure.`);
  }

  const start = Math.max(3, bars.length - 14);
  const recentAverageRange = averageRange(bars.slice(-12));
  let bestCandidate: InstitutionalZoneScan | null = null;

  for (let index = bars.length - 3; index >= start; index--) {
    const base = bars[index]!;
    const next = bars[index + 1]!;
    const follow = bars[index + 2]!;
    const prior = bars.slice(Math.max(0, index - 6), index);
    if (prior.length < 3 || !oppositeCandle(direction, base)) continue;

    const priorHigh = Math.max(...prior.map((bar) => bar.high));
    const priorLow = Math.min(...prior.map((bar) => bar.low));
    const priorAverageRange = averageRange(prior);
    const localThreshold = Math.max(priorAverageRange * 0.12, Math.abs(base.close) * 0.00035, 0.05);
    const displacementVolume = Math.max(next.relativeVolume ?? 0, follow.relativeVolume ?? 0);
    const displacementIntensity = Math.max(next.intensity ?? 0, follow.intensity ?? 0);
    const displacementRange = Math.max(next.high - next.low, follow.high - follow.low);
    const displacementStats = direction === 'long'
      ? candleStats(next.close >= follow.close ? next : follow)
      : candleStats(next.close <= follow.close ? next : follow);
    const structureBreakLevel = direction === 'long' ? priorHigh : priorLow;
    const sweepAligned = direction === 'long'
      ? (base.low < priorLow - localThreshold || next.low < priorLow - localThreshold)
      : (base.high > priorHigh + localThreshold || next.high > priorHigh + localThreshold);
    const keyLevelAligned = direction === 'long'
      ? Math.abs(base.low - priorLow) <= localThreshold * 1.35
      : Math.abs(base.high - priorHigh) <= localThreshold * 1.35;
    const structureBreakAligned = direction === 'long'
      ? Math.max(next.close, follow.close) > structureBreakLevel + localThreshold
      : Math.min(next.close, follow.close) < structureBreakLevel - localThreshold;
    const volatilityExpanded = displacementRange >= recentAverageRange * 1.22;
    const participationClear =
      displacementVolume >= 1.08
      || displacementIntensity >= 58
      || Math.abs(next.delta) + Math.abs(follow.delta) >= 0.46;
    const overlapClean = direction === 'long'
      ? Math.min(next.low, follow.low) >= (Math.min(base.open, base.close) - localThreshold * 0.4)
      : Math.max(next.high, follow.high) <= (Math.max(base.open, base.close) + localThreshold * 0.4);
    const displacementAligned =
      structureBreakAligned
      && volatilityExpanded
      && participationClear
      && displacementStats.body / Math.max(displacementStats.range, 0.0001) >= 0.52
      && barClosesWithDirection(direction, next, 0.58);

    if (!(displacementAligned && (sweepAligned || keyLevelAligned) && overlapClean)) continue;

    const zone = direction === 'long'
      ? normalizedZone(base.low, Math.max(base.open, base.close))
      : normalizedZone(Math.min(base.open, base.close), base.high);
    const associatedGap = direction === 'long'
      ? (follow.low > base.high ? normalizedZone(base.high, follow.low) : null)
      : (follow.high < base.low ? normalizedZone(follow.high, base.low) : null);
    const displacementOrigin = direction === 'long'
      ? Math.max(base.open, base.close)
      : Math.min(base.open, base.close);
    const deepestFill = direction === 'long'
      ? (associatedGap?.low ?? zone.low)
      : (associatedGap?.high ?? zone.high);
    const liquiditySweepLevel = direction === 'long'
      ? Math.min(base.low, priorLow)
      : Math.max(base.high, priorHigh);
    const executionLayer = rankExecutionLevels({
      direction,
      zone,
      displacementOrigin,
      deepestFill,
      liquiditySweepLevel: sweepAligned ? liquiditySweepLevel : (keyLevelAligned ? (direction === 'long' ? priorLow : priorHigh) : null),
      structureBreakLevel,
    });
    executionLayer.trueLiquidityLevel = Number((sweepAligned ? liquiditySweepLevel : (direction === 'long' ? priorLow : priorHigh)).toFixed(2));

    const inverseDelta = direction === 'long' ? base.delta > 0.12 : base.delta < -0.12;
    const qualityScore = clamp(
      32
      + (sweepAligned ? 18 : 0)
      + (keyLevelAligned ? 8 : 0)
      + (structureBreakAligned ? 16 : 0)
      + (volatilityExpanded ? 10 : 0)
      + (participationClear ? 10 : 0)
      + (inverseDelta ? 8 : 0)
      + ((base.relativeVolume ?? 1) >= 1.02 ? 6 : 0)
      + (overlapClean ? 6 : 0),
      0,
      100,
    );
    const summary = `${timeframe} ${direction === 'long' ? 'bullish' : 'bearish'} order block is valid because it formed from ${sweepAligned ? 'a liquidity sweep' : 'a defended key level'}, caused displacement that ${direction === 'long' ? 'broke higher' : 'broke lower'} through ${formatPrice(structureBreakLevel)}, and showed ${participationClear ? 'clear participation' : 'soft participation'} with volatility expansion from ${formatRange(zone.low, zone.high)}.`;

    const candidate: InstitutionalZoneScan = {
      active: qualityScore >= 62,
      label: `${timeframe} ${direction === 'long' ? 'bullish' : 'bearish'} order block`,
      summary,
      low: zone.low,
      high: zone.high,
      relativeVolume: Number((Math.max(base.relativeVolume ?? 1, displacementVolume)).toFixed(2)),
      delta: Number(base.delta.toFixed(2)),
      inverseDelta,
      displacementAligned,
      qualityScore,
      qualityLabel: zoneQualityLabel(qualityScore),
      sweepAligned,
      keyLevelAligned,
      structureBreakAligned,
      volatilityExpanded,
      participationClear,
      overlapClean,
      executionLayer,
    };

    if (!bestCandidate || candidate.qualityScore > bestCandidate.qualityScore) {
      bestCandidate = candidate;
    }
  }

  return bestCandidate ?? inactiveZoneScan(
    `${timeframe} order block`,
    `${timeframe} order block is not clean enough yet because the recent candles did not show sweep-led displacement with structure break and clear participation.`,
  );
}

function detectFairValueGap(
  bars: RichBar[],
  direction: Direction,
  timeframe: string,
): InstitutionalZoneScan {
  if (direction === 'neutral' || bars.length < 3) {
    return inactiveZoneScan(`${timeframe} fair value gap`, `${timeframe} fair value-gap scan is waiting for more candles.`);
  }

  const start = Math.max(4, bars.length - 12);
  const recentAverageRange = averageRange(bars.slice(-12));
  let bestCandidate: InstitutionalZoneScan | null = null;

  for (let index = bars.length - 1; index >= start; index--) {
    const first = bars[index - 2]!;
    const middle = bars[index - 1]!;
    const last = bars[index]!;
    const prior = bars.slice(Math.max(0, index - 7), index - 2);
    if (prior.length < 3) continue;

    const priorHigh = Math.max(...prior.map((bar) => bar.high));
    const priorLow = Math.min(...prior.map((bar) => bar.low));
    const priorAverageRange = averageRange(prior);
    const gapThreshold = Math.max(priorAverageRange * 0.18, Math.abs(last.close) * 0.00035, 0.06);
    const middleStats = candleStats(middle);
    const lastStats = candleStats(last);
    const maxRelativeVolume = Math.max(middle.relativeVolume ?? 0, last.relativeVolume ?? 0);
    const maxIntensity = Math.max(middle.intensity ?? 0, last.intensity ?? 0);
    const displacementRange = Math.max(middle.high - middle.low, last.high - last.low);
    const volatilityExpanded = displacementRange >= recentAverageRange * 1.22;
    const participationClear = maxRelativeVolume >= 1.08 || maxIntensity >= 60 || Math.abs(middle.delta) + Math.abs(last.delta) >= 0.48;

    if (direction === 'long') {
      const gapSize = last.low - first.high;
      const sweepAligned = first.low < priorLow - gapThreshold * 0.6;
      const structureBreakAligned = Math.max(middle.close, last.close) > priorHigh + gapThreshold * 0.4;
      const overlapClean =
        gapSize > gapThreshold
        && middle.low >= first.high - gapThreshold * 0.15
        && last.low > first.high;
      const strongDisplacement =
        barClosesWithDirection('long', middle, 0.6)
        && (middleStats.body / middleStats.range) >= 0.58
        && (lastStats.body / lastStats.range) >= 0.36;
      const displacementAligned = (structureBreakAligned || sweepAligned) && volatilityExpanded && participationClear && strongDisplacement && overlapClean;
      if (!displacementAligned) continue;

      const zone = normalizedZone(first.high, last.low);
      const executionLayer = rankExecutionLevels({
        direction,
        zone,
        displacementOrigin: first.high,
        deepestFill: zone.low,
        liquiditySweepLevel: sweepAligned ? priorLow : null,
        structureBreakLevel: priorHigh,
      });
      executionLayer.trueLiquidityLevel = Number((sweepAligned ? priorLow : zone.low).toFixed(2));

      const qualityScore = clamp(
        34
        + (sweepAligned ? 12 : 0)
        + (structureBreakAligned ? 18 : 0)
        + (volatilityExpanded ? 12 : 0)
        + (participationClear ? 10 : 0)
        + (overlapClean ? 8 : 0)
        + (gapSize > gapThreshold * 1.4 ? 6 : 0),
        0,
        100,
      );
      const candidate: InstitutionalZoneScan = {
        active: qualityScore >= 62,
        label: `${timeframe} bullish fair value gap`,
        summary: `${timeframe} bullish FVG is valid because the gap from ${formatRange(zone.low, zone.high)} came from strong displacement, ${structureBreakAligned ? 'broke structure' : 'took liquidity'}, and printed with volatility expansion instead of a slow overlapping drift.`,
        low: zone.low,
        high: zone.high,
        relativeVolume: Number(maxRelativeVolume.toFixed(2)),
        delta: Number((middle.delta + last.delta).toFixed(2)),
        inverseDelta: false,
        displacementAligned: true,
        qualityScore,
        qualityLabel: zoneQualityLabel(qualityScore),
        sweepAligned,
        keyLevelAligned: false,
        structureBreakAligned,
        volatilityExpanded,
        participationClear,
        overlapClean,
        executionLayer,
      };
      if (!bestCandidate || candidate.qualityScore > bestCandidate.qualityScore) bestCandidate = candidate;
      continue;
    }

    const gapSize = first.low - last.high;
    const sweepAligned = first.high > priorHigh + gapThreshold * 0.6;
    const structureBreakAligned = Math.min(middle.close, last.close) < priorLow - gapThreshold * 0.4;
    const overlapClean =
      gapSize > gapThreshold
      && middle.high <= first.low + gapThreshold * 0.15
      && last.high < first.low;
    const strongDisplacement =
      barClosesWithDirection('short', middle, 0.6)
      && (middleStats.body / middleStats.range) >= 0.58
      && (lastStats.body / lastStats.range) >= 0.36;
    const displacementAligned = (structureBreakAligned || sweepAligned) && volatilityExpanded && participationClear && strongDisplacement && overlapClean;
    if (!displacementAligned) continue;

    const zone = normalizedZone(last.high, first.low);
    const executionLayer = rankExecutionLevels({
      direction,
      zone,
      displacementOrigin: first.low,
      deepestFill: zone.high,
      liquiditySweepLevel: sweepAligned ? priorHigh : null,
      structureBreakLevel: priorLow,
    });
    executionLayer.trueLiquidityLevel = Number((sweepAligned ? priorHigh : zone.high).toFixed(2));

    const qualityScore = clamp(
      34
      + (sweepAligned ? 12 : 0)
      + (structureBreakAligned ? 18 : 0)
      + (volatilityExpanded ? 12 : 0)
      + (participationClear ? 10 : 0)
      + (overlapClean ? 8 : 0)
      + (gapSize > gapThreshold * 1.4 ? 6 : 0),
      0,
      100,
    );
    const candidate: InstitutionalZoneScan = {
      active: qualityScore >= 62,
      label: `${timeframe} bearish fair value gap`,
      summary: `${timeframe} bearish FVG is valid because the gap from ${formatRange(zone.low, zone.high)} came from strong displacement, ${structureBreakAligned ? 'broke structure' : 'took liquidity'}, and printed with volatility expansion instead of a slow overlapping drift.`,
      low: zone.low,
      high: zone.high,
      relativeVolume: Number(maxRelativeVolume.toFixed(2)),
      delta: Number((middle.delta + last.delta).toFixed(2)),
      inverseDelta: false,
      displacementAligned: true,
      qualityScore,
      qualityLabel: zoneQualityLabel(qualityScore),
      sweepAligned,
      keyLevelAligned: false,
      structureBreakAligned,
      volatilityExpanded,
      participationClear,
      overlapClean,
      executionLayer,
    };
    if (!bestCandidate || candidate.qualityScore > bestCandidate.qualityScore) bestCandidate = candidate;
  }

  return bestCandidate ?? inactiveZoneScan(
    `${timeframe} fair value gap`,
    `${timeframe} fair value gap is not active right now because the recent gaps were too weak, overlapping, slow, or lacked a true displacement break.`,
  );
}

function selectInstitutionalReference(input: {
  direction: Direction;
  mainFibZone: { low: number; high: number; label: string };
  minorFibZone: { low: number; high: number; label: string };
  orderBlock: InstitutionalZoneScan;
  fairValueGap: InstitutionalZoneScan;
}): InstitutionalReferenceSelection {
  const directionalLabel = input.direction === 'short' ? 'bearish' : 'bullish';
  const structureZone = intersectZones(input.mainFibZone.low, input.mainFibZone.high, input.minorFibZone.low, input.minorFibZone.high)
    ?? normalizedZone(input.mainFibZone.low, input.mainFibZone.high);
  const structureZoneLabel = structureZone.low === input.mainFibZone.low && structureZone.high === input.mainFibZone.high
    ? input.mainFibZone.label
    : `${input.mainFibZone.label} refined by ${input.minorFibZone.label}`;
  const candidates: InstitutionalReferenceSelection[] = [];
  const pushCandidate = (type: InstitutionalReferenceType, scan: InstitutionalZoneScan) => {
    if (!scan.active || scan.low == null || scan.high == null) return;
    const overlap = intersectZones(structureZone.low, structureZone.high, scan.low, scan.high);
    if (!overlap) return;
    const zone = overlap;
    const executionLayer = rankExecutionLevels({
      direction: input.direction,
      zone,
      displacementOrigin: scan.executionLayer.displacementOrigin,
      deepestFill: scan.executionLayer.deepestFill,
      liquiditySweepLevel: scan.executionLayer.liquiditySweepLevel,
      structureBreakLevel: scan.executionLayer.structureBreakLevel,
    });
    executionLayer.trueLiquidityLevel = scan.executionLayer.trueLiquidityLevel;
    executionLayer.microShiftLevel = scan.executionLayer.microShiftLevel;
    candidates.push({
      type,
      label: `${directionalLabel} ${type === 'order-block' ? 'order block' : 'fair value gap'}`,
      low: zone.low,
      high: zone.high,
      summary: `${scan.summary} It supports the structure-first area ${formatRange(structureZone.low, structureZone.high)} from ${structureZoneLabel}, so execution is refined to ${formatRange(zone.low, zone.high)} with ${formatPrice(executionLayer.preferredEntryLevel)} as the preferred price.`,
      qualityScore: scan.qualityScore + 14 + (scan.executionLayer.preferredEntryLevel != null ? 4 : 0),
      qualityLabel: zoneQualityLabel(scan.qualityScore + 14),
      executionLayer,
    });
  };

  pushCandidate('order-block', input.orderBlock);
  pushCandidate('fair-value-gap', input.fairValueGap);

  if (candidates.length) {
    return candidates.sort((left, right) => right.qualityScore - left.qualityScore)[0]!;
  }

  const zone = normalizedZone(structureZone.low, structureZone.high);
  return {
    type: 'fib',
    label: structureZoneLabel,
    low: zone.low,
    high: zone.high,
    summary: `No valid order block or fair value gap is supporting the structure area yet, so the structure-first zone from ${structureZoneLabel} remains the base map. Execution inside it should still wait for a sweep, rejection, and micro structure shift.`,
    qualityScore: 30,
    qualityLabel: 'weak',
    executionLayer: rankExecutionLevels({
      direction: input.direction,
      zone,
      displacementOrigin: input.direction === 'long' ? zone.low + ((zone.high - zone.low) * 0.35) : zone.high - ((zone.high - zone.low) * 0.35),
      deepestFill: input.direction === 'long' ? zone.low : zone.high,
      liquiditySweepLevel: input.direction === 'long' ? zone.low : zone.high,
      structureBreakLevel: null,
    }),
  };
}

function absorptionMatchesDirection(direction: Direction, absorptionSignal: string | null | undefined): boolean {
  if (direction === 'long') return absorptionSignal === 'sell-side absorption';
  if (direction === 'short') return absorptionSignal === 'buy-side absorption';
  return false;
}

function bullishBearishLabel(direction: Direction): string {
  return direction === 'short' ? 'bearish' : 'bullish';
}

function modelTwoConfluenceLabel(score: number): 'weak' | 'building' | 'strong' | 'sniper-ready' {
  if (score >= 82) return 'sniper-ready';
  if (score >= 64) return 'strong';
  if (score >= 42) return 'building';
  return 'weak';
}

function buildModelTwoConfluence(input: {
  direction: Direction;
  breakConfirmed: boolean;
  price: number;
  zoneTolerance: number;
  institutionalReference: InstitutionalReferenceSelection;
  orderBlock: InstitutionalZoneScan;
  fairValueGap: InstitutionalZoneScan;
  triggerOrderflow: OrderflowSnapshot;
  minorOrderflow: OrderflowSnapshot;
  minorProfile: VolumeProfileSnapshot;
  minorPivots: PivotSnapshot;
  primaryTarget: number | null;
  priceInsideInstitutionalReference: boolean;
  priceInsideFibZone: boolean;
  triggerAligned: boolean;
  patternAligned: boolean;
  liquidityInteractionActive: boolean;
  rejectionWithDisplacement: boolean;
  microShiftConfirmed: boolean;
  lowVolatilityEnvironment: boolean;
  overlappingStructure: boolean;
  participationClear: boolean;
}): {
  score: number;
  label: 'weak' | 'building' | 'strong' | 'sniper-ready';
  summary: string;
  footprintConfluence: string;
  liquidityTargetContext: string;
  absorptionContext: string;
  supportingChecks: string[];
  blockingChecks: string[];
} {
  if (input.direction === 'neutral') {
    return {
      score: 0,
      label: 'weak',
      summary: 'Model 2 is idle because directional structure is still neutral.',
      footprintConfluence: 'Footprint confluence is waiting for a directional break of structure.',
      liquidityTargetContext: 'Liquidity target context is not actionable yet.',
      absorptionContext: 'Absorption context is neutral.',
      supportingChecks: [],
      blockingChecks: ['Directional bias is neutral.'],
    };
  }

  const directionalLabel = bullishBearishLabel(input.direction);
  const absorptionAligned = absorptionMatchesDirection(input.direction, input.triggerOrderflow?.absorptionSignal);
  const hVNAligned = [
    input.minorProfile?.poc,
    input.minorPivots?.dynamicLevel,
    input.direction === 'long' ? input.minorPivots?.mappedSupport?.price : input.minorPivots?.mappedResistance?.price,
  ]
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .some((value) => zoneContainsPrice(input.institutionalReference.low, input.institutionalReference.high, value, input.zoneTolerance));
  const zoneImbalance = (input.triggerOrderflow?.imbalanceLadder ?? [])
    .filter((level) => zoneContainsPrice(input.institutionalReference.low, input.institutionalReference.high, level.price, input.zoneTolerance * 1.5))
    .sort((left, right) => right.intensity - left.intensity)[0] ?? null;
  const imbalanceAligned =
    Boolean(zoneImbalance)
    && Math.abs(zoneImbalance.delta) >= 0.18
    && (input.direction === 'long' ? zoneImbalance.delta > 0 : zoneImbalance.delta < 0);
  const divergenceTarget = input.direction === 'long' ? 'bullish' : 'bearish';
  const divergenceAligned =
    input.triggerOrderflow?.divergenceBias === divergenceTarget
    || input.minorOrderflow?.divergenceBias === divergenceTarget;
  const inverseDeltaOrderBlock =
    input.institutionalReference.type === 'order-block'
    && input.orderBlock.active
    && input.orderBlock.inverseDelta;
  const highVolumeOrderBlock =
    input.institutionalReference.type === 'order-block'
    && input.orderBlock.active
    && (input.orderBlock.relativeVolume ?? 0) >= 1.05;
  const displacementFvg =
    input.institutionalReference.type === 'fair-value-gap'
    && input.fairValueGap.active
    && input.fairValueGap.displacementAligned
    && (input.fairValueGap.relativeVolume ?? 0) >= 1;
  const liquidityTargetAligned = input.primaryTarget != null
    && (input.direction === 'long' ? input.primaryTarget > input.price : input.primaryTarget < input.price);
  const priceInsideExecutionLayer = input.institutionalReference.executionLayer.preferredEntryLevel != null
    && Math.abs(input.price - input.institutionalReference.executionLayer.preferredEntryLevel) <= Math.max(input.zoneTolerance, 0.08);
  const highQualityReference = input.institutionalReference.qualityScore >= 68;

  let score = 0;
  if (input.breakConfirmed) score += 12;
  if (input.priceInsideInstitutionalReference) score += 8;
  if (priceInsideExecutionLayer) score += 10;
  if (input.priceInsideFibZone) score += 6;
  if (highQualityReference) score += 14;
  if (inverseDeltaOrderBlock) score += 14;
  if (highVolumeOrderBlock) score += 10;
  if (displacementFvg) score += 12;
  if (hVNAligned) score += 8;
  if (imbalanceAligned) score += 8;
  if (absorptionAligned) score += 8;
  if (divergenceAligned) score += 6;
  if (input.triggerAligned) score += 8;
  if (input.patternAligned) score += 8;
  if (input.liquidityInteractionActive) score += 14;
  if (input.rejectionWithDisplacement) score += 14;
  if (input.microShiftConfirmed) score += 12;
  if (input.participationClear) score += 8;
  if (liquidityTargetAligned) score += 8;
  if (input.lowVolatilityEnvironment) score -= 12;
  if (input.overlappingStructure) score -= 10;
  score = clamp(score, 0, 100);

  const footprintConfluence = zoneImbalance
    ? `${directionalLabel} footprint imbalance is active near ${formatPrice(zoneImbalance.price)} with delta ${zoneImbalance.delta.toFixed(2)} and intensity ${zoneImbalance.intensity}%.`
    : `No clear footprint imbalance is sitting inside the ${input.institutionalReference.label} yet.`;
  const absorptionContext = absorptionAligned
    ? `${input.triggerOrderflow.absorptionSignal} is aligned with the reversal idea.`
    : `Absorption is ${input.triggerOrderflow?.absorptionSignal ?? 'not present'}, so the tape still needs a cleaner reversal signature.`;
  const liquidityTargetContext = liquidityTargetAligned
    ? `Opposing liquidity is clearly defined near ${formatPrice(input.primaryTarget)}, so the setup has a realistic phase-3 objective.`
    : 'Opposing liquidity is not clean enough yet, so target quality is still soft.';
  const supportingChecks = [
    input.breakConfirmed ? `Confirmed BOS on the refinement timeframe.` : null,
    input.priceInsideInstitutionalReference ? `Price is inside the ${input.institutionalReference.label}.` : null,
    priceInsideExecutionLayer ? `Price is trading near the preferred execution level ${formatPrice(input.institutionalReference.executionLayer.preferredEntryLevel)}.` : null,
    input.priceInsideFibZone ? `Price is in the preferred ${input.direction === 'long' ? 'discount' : 'premium'} pocket.` : null,
    highQualityReference ? `${input.institutionalReference.label} meets the strict quality filter with ${input.institutionalReference.qualityLabel} quality.` : null,
    inverseDeltaOrderBlock ? `Order block shows inverse delta on the origin candle.` : null,
    highVolumeOrderBlock ? `Order block carries elevated relative volume.` : null,
    displacementFvg ? `FVG was created by a true displacement leg.` : null,
    hVNAligned ? `A high-volume node / balance reference overlaps the zone.` : null,
    imbalanceAligned ? `Footprint imbalance inside the zone favors ${directionalLabel} continuation.` : null,
    absorptionAligned ? `${input.triggerOrderflow.absorptionSignal} is supporting the turn.` : null,
    divergenceAligned ? `Delta divergence is leaning ${directionalLabel}.` : null,
    input.liquidityInteractionActive ? `Liquidity was swept and reclaimed before the execution decision.` : null,
    input.rejectionWithDisplacement ? `Rejection came with displacement instead of a weak bounce.` : null,
    input.microShiftConfirmed ? `Lower-timeframe micro structure shift is confirmed.` : null,
    input.participationClear ? `Participation is clear enough to trust the zone.` : null,
    input.patternAligned ? `Trigger candle is aligned with the setup.` : null,
    liquidityTargetAligned ? `Opposing liquidity target is clean.` : null,
  ].filter((value): value is string => Boolean(value));
  const blockingChecks = [
    !input.breakConfirmed ? 'Break of structure is not confirmed yet.' : null,
    !input.priceInsideInstitutionalReference ? `Price has not tapped the ${input.institutionalReference.label} yet.` : null,
    !priceInsideExecutionLayer ? `Price is not yet interacting with the preferred execution layer inside the zone.` : null,
    !input.priceInsideFibZone ? `Price is still outside the preferred ${input.direction === 'long' ? 'discount' : 'premium'} pocket.` : null,
    !highQualityReference ? `${input.institutionalReference.label} is still too generic; the quality filter prefers sweep-led displacement and clearer structure break.` : null,
    input.institutionalReference.type === 'order-block' && !inverseDeltaOrderBlock ? 'Order block still lacks the inverse-delta signature you want.' : null,
    input.institutionalReference.type === 'order-block' && !highVolumeOrderBlock ? 'Order block volume is not exceptional enough yet.' : null,
    input.institutionalReference.type === 'fair-value-gap' && !displacementFvg ? 'FVG displacement is still too soft.' : null,
    !hVNAligned ? 'No high-volume node is reinforcing the zone yet.' : null,
    !imbalanceAligned ? 'The footprint imbalance at the zone is not decisive yet.' : null,
    !absorptionAligned ? 'Absorption is not confirming the reversal yet.' : null,
    !input.liquidityInteractionActive ? 'No liquidity sweep / stop run has happened at the zone yet.' : null,
    !input.rejectionWithDisplacement ? 'Price has not rejected the zone with clean displacement yet.' : null,
    !input.microShiftConfirmed ? 'Lower-timeframe micro structure has not shifted yet.' : null,
    !input.participationClear ? 'Participation is still too soft or noisy for a real institutional read.' : null,
    !input.patternAligned ? 'The 5m trigger candle is still missing.' : null,
    input.lowVolatilityEnvironment ? 'Volatility is too soft, so the structure can overlap and fake out.' : null,
    input.overlappingStructure ? 'Structure is overlapping or still rotating inside balance, so the zone is not executable yet.' : null,
    !liquidityTargetAligned ? 'Opposing liquidity is not well defined yet.' : null,
  ].filter((value): value is string => Boolean(value));
  const label = modelTwoConfluenceLabel(score);
  const summary = label === 'sniper-ready'
    ? `Model 2 is sniper-ready: sweep-led execution, rejection with displacement, micro shift, and a high-quality ${input.institutionalReference.label} are all stacked.`
    : label === 'strong'
      ? `Model 2 is strong: the execution layer is live and most of the footprint / liquidity confluence is already in place.`
      : label === 'building'
        ? `Model 2 is building: the zone is valid, but the sweep / rejection / micro-shift sequence is not fully complete yet.`
        : `Model 2 is weak right now because the zone is still broad, noisy, or missing real execution confirmation.`;

  return {
    score,
    label,
    summary,
    footprintConfluence,
    liquidityTargetContext,
    absorptionContext,
    supportingChecks,
    blockingChecks,
  };
}

function detectTriggerPattern(bars: RichBar[]): { bias: Direction; label: string; score: number; summary: string } {
  if (bars.length < 2) {
    return {
      bias: 'neutral',
      label: 'Trigger pending',
      score: 0,
      summary: 'Not enough 5m bars are available to evaluate the trigger candle.',
    };
  }

  const latest = bars[bars.length - 1]!;
  const previous = bars[bars.length - 2]!;
  const latestStats = candleStats(latest);
  const previousStats = candleStats(previous);
  const bullishEngulfing =
    latest.close > latest.open
    && previous.close < previous.open
    && latest.close >= previous.open
    && latest.open <= previous.close;
  const bearishEngulfing =
    latest.close < latest.open
    && previous.close > previous.open
    && latest.close <= previous.open
    && latest.open >= previous.close;
  const bullishRejection =
    latestStats.lowerWick > latestStats.body * 1.8
    && latestStats.closeNearHigh >= 0.62
    && latest.delta >= 0;
  const bearishRejection =
    latestStats.upperWick > latestStats.body * 1.8
    && latestStats.closeNearLow >= 0.62
    && latest.delta <= 0;
  const bullishExpansion =
    latest.close > previous.high
    && latest.delta > previous.delta
    && latest.relativeVolume >= 1.05;
  const bearishExpansion =
    latest.close < previous.low
    && latest.delta < previous.delta
    && latest.relativeVolume >= 1.05;

  if (bullishEngulfing) {
    return { bias: 'long', label: 'Bullish Engulfing', score: 24, summary: '5m engulfing candle reclaimed the prior body and reintroduced upside aggression.' };
  }
  if (bearishEngulfing) {
    return { bias: 'short', label: 'Bearish Engulfing', score: -24, summary: '5m engulfing candle consumed the prior body and reintroduced downside aggression.' };
  }
  if (bullishRejection) {
    return { bias: 'long', label: 'Bullish Rejection', score: 18, summary: '5m rejection candle swept lower prices and closed back near the high.' };
  }
  if (bearishRejection) {
    return { bias: 'short', label: 'Bearish Rejection', score: -18, summary: '5m rejection candle swept higher prices and closed back near the low.' };
  }
  if (bullishExpansion && previousStats.closeNearHigh >= 0.55) {
    return { bias: 'long', label: 'Bullish Expansion', score: 16, summary: '5m price broke the prior high on expanding delta and volume.' };
  }
  if (bearishExpansion && previousStats.closeNearLow >= 0.55) {
    return { bias: 'short', label: 'Bearish Expansion', score: -16, summary: '5m price broke the prior low on expanding delta and volume.' };
  }

  return {
    bias: 'neutral',
    label: 'Trigger forming',
    score: 0,
    summary: '5m candles have not produced a clear engulfing, rejection, or expansion trigger yet.',
  };
}

function detectLiquidityInteraction(input: {
  bars: RichBar[];
  direction: Direction;
  reference: InstitutionalReferenceSelection;
  zoneTolerance: number;
}): { active: boolean; swept: boolean; level: number | null; summary: string } {
  if (input.direction === 'neutral' || input.bars.length < 3) {
    return { active: false, swept: false, level: null, summary: 'Liquidity interaction is idle while direction is neutral.' };
  }

  const recent = input.bars.slice(-3);
  const latest = recent[recent.length - 1]!;
  const prior = recent.slice(0, -1);
  const sweepLevel = input.reference.executionLayer.liquiditySweepLevel
    ?? input.reference.executionLayer.trueLiquidityLevel
    ?? (input.direction === 'long' ? input.reference.low : input.reference.high);
  const touchedZone = recent.some((bar) => zoneContainsPrice(input.reference.low, input.reference.high, bar.close, input.zoneTolerance)
    || zoneContainsPrice(input.reference.low, input.reference.high, bar.low, input.zoneTolerance)
    || zoneContainsPrice(input.reference.low, input.reference.high, bar.high, input.zoneTolerance));

  if (input.direction === 'long') {
    const priorLow = Math.min(...prior.map((bar) => bar.low));
    const swept = latest.low <= sweepLevel + input.zoneTolerance && latest.close > latest.low + ((latest.high - latest.low) * 0.55);
    const stopRun = latest.low < priorLow - input.zoneTolerance && latest.close > priorLow;
    return {
      active: touchedZone && (swept || stopRun),
      swept: swept || stopRun,
      level: Number(sweepLevel.toFixed(2)),
      summary: touchedZone
        ? ((swept || stopRun)
          ? `Liquidity was taken below ${formatPrice(sweepLevel)} and price reclaimed back into the execution layer.`
          : `Price touched the zone but did not yet sweep or reclaim liquidity below ${formatPrice(sweepLevel)}.`)
        : 'Price has not interacted with the execution layer yet.',
    };
  }

  const priorHigh = Math.max(...prior.map((bar) => bar.high));
  const swept = latest.high >= sweepLevel - input.zoneTolerance && latest.close < latest.high - ((latest.high - latest.low) * 0.55);
  const stopRun = latest.high > priorHigh + input.zoneTolerance && latest.close < priorHigh;
  return {
    active: touchedZone && (swept || stopRun),
    swept: swept || stopRun,
    level: Number(sweepLevel.toFixed(2)),
    summary: touchedZone
      ? ((swept || stopRun)
        ? `Liquidity was taken above ${formatPrice(sweepLevel)} and price rejected back into the execution layer.`
        : `Price touched the zone but did not yet sweep or reject liquidity above ${formatPrice(sweepLevel)}.`)
      : 'Price has not interacted with the execution layer yet.',
  };
}

function detectRejectionWithDisplacement(input: {
  bars: RichBar[];
  direction: Direction;
}): { active: boolean; level: number | null; summary: string } {
  if (input.direction === 'neutral' || input.bars.length < 2) {
    return { active: false, level: null, summary: 'Rejection-with-displacement is idle while direction is neutral.' };
  }

  const latest = input.bars[input.bars.length - 1]!;
  const previous = input.bars[input.bars.length - 2]!;
  const latestStats = candleStats(latest);
  const latestBodyRatio = latestStats.body / Math.max(latestStats.range, 0.0001);
  const expansion = latest.high - latest.low > (previous.high - previous.low) * 1.12;
  const relativeVolume = latest.relativeVolume ?? 1;

  if (input.direction === 'long') {
    const rejection = latestStats.lowerWick > latestStats.body * 1.5 && latestStats.closeNearHigh >= 0.64;
    const displacement = latest.close > previous.high && latest.delta > previous.delta && latestBodyRatio >= 0.5;
    const active = relativeVolume >= 1.02 && expansion && (rejection || displacement);
    return {
      active,
      level: active ? Number(latest.close.toFixed(2)) : null,
      summary: active
        ? 'Lower-timeframe rejection printed with displacement and participation, so the zone is no longer just a broad area.'
        : 'Lower-timeframe rejection still lacks clean displacement or participation.',
    };
  }

  const rejection = latestStats.upperWick > latestStats.body * 1.5 && latestStats.closeNearLow >= 0.64;
  const displacement = latest.close < previous.low && latest.delta < previous.delta && latestBodyRatio >= 0.5;
  const active = relativeVolume >= 1.02 && expansion && (rejection || displacement);
  return {
    active,
    level: active ? Number(latest.close.toFixed(2)) : null,
    summary: active
      ? 'Lower-timeframe rejection printed with displacement and participation, so the zone is no longer just a broad area.'
      : 'Lower-timeframe rejection still lacks clean displacement or participation.',
  };
}

function deriveLiquidityInvalidation(input: {
  direction: Direction;
  reference: InstitutionalReferenceSelection;
  triggerAtr: number;
  support: number;
  resistance: number;
  stopClusterBelow: number | null | undefined;
  stopClusterAbove: number | null | undefined;
  mappedSupport: number | null | undefined;
  mappedResistance: number | null | undefined;
}): { liquidityLevel: number; invalidationLevel: number; note: string } {
  const zone = normalizedZone(input.reference.low, input.reference.high);
  const buffer = Math.max(input.triggerAtr * 0.18, 0.05);

  if (input.direction === 'short') {
    const candidates = [
      input.reference.executionLayer.trueLiquidityLevel,
      input.reference.executionLayer.liquiditySweepLevel,
      input.stopClusterAbove,
      input.mappedResistance,
      input.resistance,
    ]
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= zone.high)
      .sort((left, right) => left - right);
    const liquidityLevel = Number((candidates[0] ?? zone.high).toFixed(2));
    return {
      liquidityLevel,
      invalidationLevel: Number((liquidityLevel + buffer).toFixed(2)),
      note: `Stop belongs above true liquidity at ${formatPrice(liquidityLevel)}, not just above the zone edge.`,
    };
  }

  const candidates = [
    input.reference.executionLayer.trueLiquidityLevel,
    input.reference.executionLayer.liquiditySweepLevel,
    input.stopClusterBelow,
    input.mappedSupport,
    input.support,
  ]
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value <= zone.low)
    .sort((left, right) => right - left);
  const liquidityLevel = Number((candidates[0] ?? zone.low).toFixed(2));
  return {
    liquidityLevel,
    invalidationLevel: Number((liquidityLevel - buffer).toFixed(2)),
    note: `Stop belongs below true liquidity at ${formatPrice(liquidityLevel)}, not just below the zone edge.`,
  };
}

function nearestDirectionalTarget(direction: Direction, price: number, values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!filtered.length) return null;
  if (direction === 'long') {
    const above = filtered.filter((value) => value > price).sort((left, right) => left - right);
    return above[0] ?? null;
  }
  if (direction === 'short') {
    const below = filtered.filter((value) => value < price).sort((left, right) => right - left);
    return below[0] ?? null;
  }
  return null;
}

function deriveFibZone(direction: Direction, support: number, resistance: number, scope: 'main' | 'minor' = 'main'): {
  low: number;
  high: number;
  extension1272: number;
  extension1618: number;
  label: string;
} {
  const range = Math.max(resistance - support, 0.01);
  if (direction === 'short') {
    return {
      low: Number((support + (range * 0.382)).toFixed(2)),
      high: Number((support + (range * 0.618)).toFixed(2)),
      extension1272: Number((support - (range * 0.272)).toFixed(2)),
      extension1618: Number((support - (range * 0.618)).toFixed(2)),
      label: `${scope} fib 0.382 - 0.618 premium retracement`,
    };
  }

  return {
    low: Number((resistance - (range * 0.618)).toFixed(2)),
    high: Number((resistance - (range * 0.382)).toFixed(2)),
    extension1272: Number((resistance + (range * 0.272)).toFixed(2)),
    extension1618: Number((resistance + (range * 0.618)).toFixed(2)),
    label: `${scope} fib 0.382 - 0.618 discount retracement`,
  };
}

export async function getEntryMap(input: {
  market?: string;
  chartTimeframe?: string;
  majorTimeframe?: string;
  minorTimeframe?: string;
  triggerTimeframe?: string;
  operatorAdaptiveProfile?: {
    precisionThreshold?: number;
    participationThreshold?: number;
    preferredFamilies?: string[];
    avoidFamilies?: string[];
  };
}): Promise<any> {
  const market = String(input.market || 'XAUUSD').toUpperCase();
  const chartTimeframe = String(input.chartTimeframe || '1h').toLowerCase();
  const majorTimeframe = String(input.majorTimeframe || '4h').toLowerCase();
  const minorTimeframe = String(input.minorTimeframe || '15m').toLowerCase();
  const triggerTimeframe = String(input.triggerTimeframe || '5m').toLowerCase();

  return getCachedOrCompute(cacheKey('analytics', `entry-map:${market}:${chartTimeframe}:${majorTimeframe}:${minorTimeframe}:${triggerTimeframe}`), async () => {
    const [
      majorOrderflow,
      minorOrderflow,
      triggerOrderflow,
      majorPressure,
      minorPressure,
      triggerPressure,
      majorPivots,
      minorPivots,
      minorProfile,
      dealerPressure,
      flowProxy,
      macroSignals,
      calendar,
    ] = await Promise.all([
      getOrderflowEngine({ market, timeframe: majorTimeframe }),
      getOrderflowEngine({ market, timeframe: minorTimeframe }),
      getOrderflowEngine({ market, timeframe: triggerTimeframe }),
      getBuyerSellerPressure({ market, timeframe: majorTimeframe, mode: 'auto' }),
      getBuyerSellerPressure({ market, timeframe: minorTimeframe, mode: 'auto' }),
      getBuyerSellerPressure({ market, timeframe: triggerTimeframe, mode: 'auto' }),
      getLevels({ market, timeframe: majorTimeframe }),
      getLevels({ market, timeframe: minorTimeframe }),
      getProfile({ market, timeframe: minorTimeframe }),
      getDealerPressure({ symbol: market }),
      getFlowProxy({ symbol: market }),
      getMacroSignals({ market }),
      getEconomicCalendar({ market }),
    ]);

    const price = firstFinite(
      safeNumber(triggerOrderflow?.price, Number.NaN),
      safeNumber(minorOrderflow?.price, Number.NaN),
      safeNumber(majorOrderflow?.price, Number.NaN),
      safeNumber(minorPivots?.price, Number.NaN),
      safeNumber(dealerPressure?.price, Number.NaN),
    ) ?? 0;
    const triggerAtr = Math.max(
      safeNumber(triggerPressure?.atr14, 0),
      Math.abs(price) * 0.0015,
      0.15,
    );
    const volumeCenter = firstFinite(minorProfile?.poc, minorPivots?.dynamicLevel, minorPivots?.pivot, price) ?? price;
    let support = firstFinite(
      minorPivots?.mappedSupport?.price,
      minorPivots?.supports?.[0],
      minorProfile?.valueAreaLow,
      minorPivots?.dynamicLevel,
      price - triggerAtr,
    ) ?? (price - triggerAtr);
    let resistance = firstFinite(
      minorPivots?.mappedResistance?.price,
      minorPivots?.resistances?.[0],
      minorProfile?.valueAreaHigh,
      minorPivots?.dynamicLevel,
      price + triggerAtr,
    ) ?? (price + triggerAtr);
    if (support >= resistance) {
      support = price - triggerAtr;
      resistance = price + triggerAtr;
    }

    const majorScore = clamp(
      (safeNumber(majorPressure?.score, 0) * 0.46)
      + (safeNumber(majorOrderflow?.buySellPressure, 0) * 0.34)
      + (pivotSignalScore(majorPivots) * 0.20),
      -100,
      100,
    );
    const minorScore = clamp(
      (safeNumber(minorPressure?.score, 0) * 0.42)
      + (safeNumber(minorOrderflow?.buySellPressure, 0) * 0.33)
      + (pivotSignalScore(minorPivots) * 0.25),
      -100,
      100,
    );
    const flowScore = clamp(
      (safeNumber(flowProxy?.netFlowScore, 0) * 0.55)
      + (safeNumber(dealerPressure?.pressureScore, 0) * 0.45),
      -100,
      100,
    );
    const structuralComposite = clamp((majorScore * 0.44) + (minorScore * 0.36) + (flowScore * 0.20), -100, 100);
    const majorBars = recentBars(majorOrderflow);
    const minorBars = recentBars(minorOrderflow);
    const triggerBars = recentBars(triggerOrderflow);
    const triggerPattern = detectTriggerPattern(triggerBars);
    const triggerScore = clamp(
      (safeNumber(triggerPressure?.score, 0) * 0.42)
      + (safeNumber(triggerOrderflow?.buySellPressure, 0) * 0.38)
      + (triggerPattern.score * 0.20),
      -100,
      100,
    );
    const compositeScore = clamp((structuralComposite * 0.75) + (triggerScore * 0.25), -100, 100);
    const scoreDirection = directionFromScore(compositeScore === 0 ? structuralComposite : compositeScore);
    const majorStructure = detectStructureMap({
      bars: majorBars,
      timeframe: majorTimeframe,
      score: majorScore,
      regime: majorPivots?.regime,
    });
    const minorStructure = detectStructureMap({
      bars: minorBars,
      timeframe: minorTimeframe,
      score: minorScore,
      regime: minorPivots?.regime,
    });
    const triggerStructure = detectStructureMap({
      bars: triggerBars,
      timeframe: triggerTimeframe,
      score: triggerScore,
      regime: minorPivots?.regime,
    });
    const macroFocus = (macroSignals?.focus ?? null) as MacroFocusSnapshot | null;
    const ratesFocus = macroSignals?.ratesDifferentials?.focus ?? null;
    const macroBias = macroFocus?.bias ?? 'neutral';
    const macroReflexivity = macroFocus?.reflexivityState ?? 'neutral';
    const minorBosLong = detectBreakOfStructure(minorBars, 'long', minorTimeframe);
    const minorBosShort = detectBreakOfStructure(minorBars, 'short', minorTimeframe);
    const triggerBosLong = detectBreakOfStructure(triggerBars, 'long', triggerTimeframe);
    const triggerBosShort = detectBreakOfStructure(triggerBars, 'short', triggerTimeframe);
    const majorDirection = majorStructure.direction;
    const minorDirection = minorStructure.direction;
    const majorExhaustion = /(EXHAUSTION|TOP_FORMING|BOTTOM_FORMING)/.test(String(majorPivots?.regime?.secondaryCode || ''));
    const reversalDirection =
      majorDirection !== 'neutral'
      && minorDirection !== 'neutral'
      && majorDirection !== minorDirection
      && (
        minorDirection === 'long'
          ? (minorBosLong.state === 'confirmed' || triggerBosLong.state === 'confirmed')
          : (minorBosShort.state === 'confirmed' || triggerBosShort.state === 'confirmed')
      )
      && (
        macroFightsDirection(majorDirection, macroBias)
        || ratesFightDirection(majorDirection, ratesFocus?.directionalBias)
        || majorExhaustion
      )
        ? minorDirection
        : null;
    const direction = reversalDirection
      ?? (majorDirection !== 'neutral'
        ? majorDirection
        : minorDirection !== 'neutral'
          ? minorDirection
          : scoreDirection);
    const structureDirection = direction === 'neutral' ? 'long' : direction;
    const mainFibZone = deriveFibZone(structureDirection, support, resistance, 'main');
    const minorWindow = minorBars.slice(-8);
    const minorSupport = minorWindow.length
      ? Math.min(...minorWindow.map((bar) => bar.low))
      : support;
    const minorResistance = minorWindow.length
      ? Math.max(...minorWindow.map((bar) => bar.high))
      : resistance;
    const minorFibZone = deriveFibZone(structureDirection, minorSupport, minorResistance, 'minor');
    const structureZone = intersectZones(mainFibZone.low, mainFibZone.high, minorFibZone.low, minorFibZone.high)
      ?? normalizedZone(mainFibZone.low, mainFibZone.high);
    const breakOfStructure = direction === 'long'
      ? minorBosLong
      : direction === 'short'
        ? minorBosShort
        : detectBreakOfStructure(minorBars, direction, minorTimeframe);
    const orderBlock = detectOrderBlock(minorBars, direction, minorTimeframe);
    const fairValueGap = detectFairValueGap(minorBars, direction, minorTimeframe);
    const institutionalReference = selectInstitutionalReference({
      direction: structureDirection,
      mainFibZone,
      minorFibZone,
      orderBlock,
      fairValueGap,
    });
    const selectedReferenceScan =
      institutionalReference.type === 'order-block'
        ? orderBlock
        : institutionalReference.type === 'fair-value-gap'
          ? fairValueGap
          : null;
    const zoneTolerance = Math.max(triggerAtr * 0.25, Math.abs(price) * 0.00035, 0.1);
    const priceInsideMainFibZone = price >= (mainFibZone.low - zoneTolerance) && price <= (mainFibZone.high + zoneTolerance);
    const priceInsideMinorFibZone = price >= (minorFibZone.low - zoneTolerance) && price <= (minorFibZone.high + zoneTolerance);
    const priceInsideFibZone = priceInsideMainFibZone;
    const priceInsideStructureZone = zoneContainsPrice(structureZone.low, structureZone.high, price, zoneTolerance);
    const priceInsideInstitutionalReference = zoneContainsPrice(
      institutionalReference.low,
      institutionalReference.high,
      price,
      zoneTolerance,
    );
    const priceInsideExecutionLayer = institutionalReference.executionLayer.preferredEntryLevel != null
      && Math.abs(price - institutionalReference.executionLayer.preferredEntryLevel) <= Math.max(zoneTolerance, 0.08);
    const majorMinorAligned =
      direction !== 'neutral'
      && majorStructure.direction === direction
      && (
        minorStructure.direction === direction
        || minorStructure.bias === 'transition'
        || minorStructure.bias === 'range'
        || priceInsideStructureZone
      );
    const correctionContext =
      direction !== 'neutral'
      && majorStructure.direction === direction
      && minorStructure.direction !== 'neutral'
      && minorStructure.direction !== direction;
    const reversalContext = reversalDirection === direction;
    const breakConfirmed = direction !== 'neutral' && breakOfStructure.state === 'confirmed';
    const triggerAligned =
      direction !== 'neutral'
      && Math.sign(triggerScore) === (direction === 'long' ? 1 : -1)
      && Math.abs(triggerScore) >= 10;
    const patternAligned =
      direction !== 'neutral'
      && (triggerPattern.bias === direction || (triggerStructure.direction === direction && Math.abs(triggerScore) >= 8));
    const microStructureShift = direction === 'long'
      ? triggerBosLong
      : direction === 'short'
        ? triggerBosShort
        : detectBreakOfStructure(triggerBars, direction, triggerTimeframe);
    const liquidityInteraction = detectLiquidityInteraction({
      bars: triggerBars,
      direction,
      reference: institutionalReference,
      zoneTolerance,
    });
    const rejectionWithDisplacement = detectRejectionWithDisplacement({
      bars: triggerBars,
      direction,
    });
    const lowVolatilityEnvironment =
      safeNumber(triggerPressure?.relativeVolume, 1) < 0.94
      || safeNumber(triggerOrderflow?.rangeExpansion, 1) < 1.01;
    const overlappingStructure =
      minorProfile?.valueAreaPosition === 'inside-value'
      && breakOfStructure.state !== 'confirmed'
      && Math.abs(safeNumber(triggerOrderflow?.buySellPressure, 0)) < 14;
    const participationClear =
      Boolean(selectedReferenceScan?.participationClear)
      || safeNumber(triggerPressure?.relativeVolume, 1) >= 1.02
      || Math.abs(safeNumber(triggerOrderflow?.buySellPressure, 0)) >= 16;
    const executionSequenceComplete =
      liquidityInteraction.active
      && rejectionWithDisplacement.active
      && microStructureShift.state === 'confirmed';

    let phase: ExecutionPhase = 'transition';
    if (
      reversalContext
      && breakConfirmed
      && priceInsideMainFibZone
      && priceInsideInstitutionalReference
      && !lowVolatilityEnvironment
      && participationClear
    ) phase = 'reversal';
    else if (
      majorMinorAligned
      && breakConfirmed
      && priceInsideStructureZone
      && priceInsideInstitutionalReference
      && executionSequenceComplete
      && triggerAligned
      && patternAligned
      && !lowVolatilityEnvironment
      && !overlappingStructure
      && participationClear
    ) phase = 'continuation';
    else if ((correctionContext || (majorStructure.direction === direction && priceInsideMainFibZone)) && priceInsideInstitutionalReference) phase = 'correction';
    else if (majorStructure.direction === direction && breakConfirmed) phase = 'impulse';

    const noTradeReasons: string[] = [];
    if (!majorMinorAligned && !reversalContext) noTradeReasons.push('Major and minor structure are not aligned yet.');
    if (!breakConfirmed) noTradeReasons.push(`${minorTimeframe} break of structure is not confirmed yet.`);
    if (!priceInsideMainFibZone) noTradeReasons.push(`Price is outside the preferred ${mainFibZone.label} entry zone.`);
    if (!priceInsideMinorFibZone) noTradeReasons.push(`Price is outside the internal ${minorFibZone.label} refinement zone.`);
    if (!priceInsideStructureZone) noTradeReasons.push(`Price is outside the structure-first area ${formatRange(structureZone.low, structureZone.high)}.`);
    if (!priceInsideInstitutionalReference) noTradeReasons.push(`Price has not retraced into the selected ${institutionalReference.label} reference yet.`);
    if (!priceInsideExecutionLayer) noTradeReasons.push(`Price has not reached the preferred execution layer near ${formatPrice(institutionalReference.executionLayer.preferredEntryLevel)} yet.`);
    if (!liquidityInteraction.active) noTradeReasons.push(liquidityInteraction.summary);
    if (!rejectionWithDisplacement.active) noTradeReasons.push(rejectionWithDisplacement.summary);
    if (microStructureShift.state !== 'confirmed') noTradeReasons.push(`${triggerTimeframe} micro structure has not shifted yet.`);
    if (!patternAligned) noTradeReasons.push(`5m trigger has not confirmed with a ${direction === 'short' ? 'bearish' : 'bullish'} activation candle yet.`);
    if (lowVolatilityEnvironment) noTradeReasons.push('Volatility is too soft right now, so the setup can overlap and fake out.');
    if (overlappingStructure) noTradeReasons.push('Structure is still overlapping inside value, so the zone is not executable yet.');
    if (!participationClear) noTradeReasons.push('Participation is still too weak or noisy to trust the zone.');
    if (safeNumber(triggerPressure?.relativeVolume, 1) < 0.95) noTradeReasons.push('5m relative volume is still soft for a sharp continuation entry.');
    if (direction === 'long' && flowScore < -10) noTradeReasons.push('Dealer and options-flow posture are leaning against the long idea.');
    if (direction === 'short' && flowScore > 10) noTradeReasons.push('Dealer and options-flow posture are leaning against the short idea.');
    if (minorProfile?.valueAreaPosition === 'inside-value' && Math.abs(safeNumber(triggerOrderflow?.buySellPressure, 0)) < 12) {
      noTradeReasons.push('Price is still rotating inside value, which raises chop risk.');
    }

    const alignmentCount = [majorScore, minorScore, triggerScore, flowScore]
      .filter((value) => Math.sign(value) === Math.sign(compositeScore || structuralComposite) && Math.abs(value) >= 12)
      .length;
    const conflictCount = [majorScore, minorScore, triggerScore, flowScore]
      .filter((value) => Math.sign(value) !== 0 && Math.sign(value) !== Math.sign(compositeScore || structuralComposite) && Math.abs(value) >= 12)
      .length;
    const baseConfidence = clamp(
      (Math.abs(compositeScore) * 0.82)
      + (alignmentCount * 12)
      + (breakConfirmed ? 12 : breakOfStructure.state === 'building' ? 4 : 0)
      + (priceInsideFibZone ? 10 : 0)
      + (priceInsideInstitutionalReference ? 10 : 0)
      + (priceInsideExecutionLayer ? 8 : 0)
      + (institutionalReference.type !== 'fib' ? 6 : 0)
      + (institutionalReference.qualityScore * 0.12)
      + (liquidityInteraction.active ? 10 : 0)
      + (rejectionWithDisplacement.active ? 10 : 0)
      + (microStructureShift.state === 'confirmed' ? 10 : microStructureShift.state === 'building' ? 4 : 0)
      + (patternAligned ? 12 : 0)
      + (safeNumber(triggerPressure?.relativeVolume, 1) >= 1.1 ? 8 : 0)
      - (lowVolatilityEnvironment ? 8 : 0)
      - (overlappingStructure ? 8 : 0)
      - (conflictCount * 10),
      0,
      100,
    );
    const invalidationPlan = deriveLiquidityInvalidation({
      direction,
      reference: institutionalReference,
      triggerAtr,
      support,
      resistance,
      stopClusterBelow: triggerOrderflow?.stopClusterBelow ?? minorOrderflow?.stopClusterBelow,
      stopClusterAbove: triggerOrderflow?.stopClusterAbove ?? minorOrderflow?.stopClusterAbove,
      mappedSupport: minorPivots?.mappedSupport?.price,
      mappedResistance: minorPivots?.mappedResistance?.price,
    });
    const invalidationLevel = invalidationPlan.invalidationLevel;
    const noTradeBand = formatRange(volumeCenter - (triggerAtr * 0.35), volumeCenter + (triggerAtr * 0.35));
    const primaryTarget = nearestDirectionalTarget(direction, price, [
      direction === 'long' ? triggerOrderflow?.stopClusterAbove : triggerOrderflow?.stopClusterBelow,
      direction === 'long' ? minorPivots?.mappedResistance?.price : minorPivots?.mappedSupport?.price,
      direction === 'long' ? minorProfile?.valueAreaHigh : minorProfile?.valueAreaLow,
      direction === 'long' ? flowProxy?.callWall : flowProxy?.putWall,
      direction === 'long' ? majorPivots?.mappedResistance?.price : majorPivots?.mappedSupport?.price,
    ]);
    const modelTwoConfluence = buildModelTwoConfluence({
      direction,
      breakConfirmed,
      price,
      zoneTolerance,
      institutionalReference,
      orderBlock,
      fairValueGap,
      triggerOrderflow,
      minorOrderflow,
      minorProfile,
      minorPivots,
      primaryTarget,
      priceInsideInstitutionalReference,
      priceInsideFibZone,
      triggerAligned,
      patternAligned,
      liquidityInteractionActive: liquidityInteraction.active,
      rejectionWithDisplacement: rejectionWithDisplacement.active,
      microShiftConfirmed: microStructureShift.state === 'confirmed',
      lowVolatilityEnvironment,
      overlappingStructure,
      participationClear,
    });
    modelTwoConfluence.blockingChecks.slice(0, 3).forEach((reason) => {
      if (!noTradeReasons.includes(reason)) noTradeReasons.push(reason);
    });
    const macroAligned = macroSupportsDirection(direction, macroBias);
    const macroHostile = macroFightsDirection(direction, macroBias);
    const ratesAligned = ratesSupportDirection(direction, ratesFocus?.directionalBias);
    const ratesHostile = ratesFightDirection(direction, ratesFocus?.directionalBias);
    const ratesCounterTrend = ratesFocus?.alignment === 'counter-trend';
    const primaryEvent = nextPrimaryHighImpactEvent(calendar);
    const eventRiskMinutes = primaryEvent?.minutesUntil ?? null;
    const eventRiskLive = eventRiskMinutes != null && eventRiskMinutes >= -15 && eventRiskMinutes <= 45;
    const eventRiskSoon = eventRiskMinutes != null && eventRiskMinutes > 45 && eventRiskMinutes <= 180;

    if (macroHostile) {
      noTradeReasons.push(`Macro focus is ${macroBias} with ${macroReflexivity}, so the broader backdrop is fighting this ${direction} idea.`);
    }
    if (macroReflexivity === 'exhaustion watch') {
      noTradeReasons.push('Macro reflexivity is at exhaustion watch, so avoid treating continuation as automatic.');
    }
    if (ratesHostile && ratesFocus?.pair) {
      noTradeReasons.push(`Rates differential scoreboard for ${ratesFocus.pair} is ${ratesFocus.directionalBias}, so policy spread is fighting this ${direction} idea.`);
    }
    if (ratesCounterTrend && ratesFocus?.pair) {
      noTradeReasons.push(`${ratesFocus.pair} spot is trading against the policy-rate gap, so repricing risk is elevated until price and rates re-align.`);
    }
    if (eventRiskLive && primaryEvent) {
      noTradeReasons.push(`High-impact ${primaryEvent.currency} ${primaryEvent.event} is too close (${primaryEvent.minutesUntil}m), so wait for post-release repricing.`);
    }

    const macroAdjustment =
      (macroAligned ? 8 : 0)
      + (macroHostile ? -12 : 0)
      + (ratesAligned ? 5 : 0)
      + (ratesHostile ? -7 : 0)
      + (ratesCounterTrend ? -6 : 0)
      + (macroReflexivity === 'self-reinforcing bullish' || macroReflexivity === 'self-reinforcing bearish' ? 6 : 0)
      + (macroReflexivity === 'exhaustion watch' ? -8 : 0)
      + (eventRiskLive ? -12 : eventRiskSoon ? -4 : 0)
      + ((macroFocus?.convictionScore ?? 50) >= 74 ? 4 : (macroFocus?.convictionScore ?? 50) <= 48 ? -4 : 0);
    const confidence = clamp(baseConfidence + (modelTwoConfluence.score * 0.16) + macroAdjustment, 0, 100);
    const preferredEntryLevel = institutionalReference.executionLayer.preferredEntryLevel;
    const readiness: ExecutionReadiness =
      direction === 'neutral'
      || confidence < 48
      || noTradeReasons.length >= 4
      || eventRiskLive
      || lowVolatilityEnvironment
      || overlappingStructure
        ? 'stand-aside'
        : phase === 'continuation' && modelTwoConfluence.label !== 'weak' && executionSequenceComplete
          ? 'ready'
          : 'watch';
    const doNotExecute = readiness === 'stand-aside';
    const secondaryTarget = mainFibZone.extension1272;
    const tertiaryTarget = mainFibZone.extension1618;
    const trimZone = [
      primaryTarget != null ? formatPrice(primaryTarget) : null,
      formatPrice(secondaryTarget),
      formatPrice(tertiaryTarget),
    ].filter((value): value is string => Boolean(value)).join(' / ');
    const premiumDiscountState = direction === 'neutral'
      ? 'Balanced / unconfirmed'
      : priceInsideMainFibZone
        ? `Price is inside the preferred main ${direction === 'long' ? 'discount' : 'premium'} pocket.`
        : `Price is still outside the preferred main ${direction === 'long' ? 'discount' : 'premium'} pocket.`;
    const entryLadder = buildEntryLadder({
      direction,
      institutionalReference,
      breakLevel: breakOfStructure.level,
      triggerAtr,
      invalidationLevel,
    });
    const precisionEntryPlan = direction === 'neutral'
      ? 'Precision entry plan is idle until the directional structure clears.'
      : `Execution layer: plot ${formatRange(structureZone.low, structureZone.high)}, watch liquidity at ${entryLadder[0]?.level ?? 'n/a'}, execute near ${entryLadder[1]?.level ?? 'n/a'} only after sweep plus rejection, confirm through ${entryLadder[2]?.level ?? 'n/a'}, then press winners above ${entryLadder[3]?.level ?? 'n/a'}. No first-touch entries inside the broad zone.`;
    const pyramidingPlan = direction === 'neutral'
      ? 'No pyramiding plan until the market stops reading neutral.'
      : `${macroFocus?.pyramiding?.summary ?? 'Use a test entry first and add only to winners.'} Current ladder is sweep ${entryLadder[0]?.level ?? 'n/a'} -> execute ${entryLadder[1]?.level ?? 'n/a'} -> confirm ${entryLadder[2]?.level ?? 'n/a'} -> press ${entryLadder[3]?.level ?? 'n/a'}, with ${formatPrice(invalidationLevel)} as the hard stop beyond true liquidity.`;
    const macroContext = [
      macroFocus?.summary
        ?? `Macro regime ${macroSignals?.regime ?? 'unknown'} with dollar ${macroSignals?.inferred?.dollarRegime ?? 'unknown'}, real-yield pressure ${macroSignals?.inferred?.realYieldPressure ?? 'unknown'}, and carry stress ${macroSignals?.inferred?.carryStress ?? 'unknown'}.`,
      ratesFocus?.summary ?? null,
    ].filter((value): value is string => Boolean(value)).join(' ');
    const macroBlindspots = [
      ...(macroFocus?.blindspots ?? []),
      ...(ratesFocus?.blindspots ?? []),
      eventRiskSoon && primaryEvent
        ? `A high-impact ${primaryEvent.currency} ${primaryEvent.event} is due in ${primaryEvent.minutesUntil} minutes, so macro repricing risk is still close.`
        : null,
    ].filter((value): value is string => Boolean(value)).slice(0, 3);
    const sweepPresent = Boolean(minorPivots?.signalMap?.bullSweep || minorPivots?.signalMap?.bearSweep);
    const displacementStrong = Boolean(orderBlock.displacementAligned || fairValueGap.displacementAligned || modelTwoConfluence.score >= 70);
    const majorStructureSentence = direction === 'neutral'
      ? 'Structure is unclear.'
      : `${direction === 'long' ? 'Bullish' : 'Bearish'} major structure.`;
    const minorStructureSentence = phase === 'reversal'
      ? `Minor reversal is taking shape inside ${formatRange(structureZone.low, structureZone.high)}.`
      : phase === 'continuation'
        ? `Minor correction is complete and price is trying to continue from the structure area.`
        : phase === 'correction'
          ? `Minor correction is pulling into ${direction === 'long' ? 'demand' : 'supply'} inside the structure area.`
          : phase === 'impulse'
            ? `Impulse is active, so the next job is to wait for correction rather than chase.`
            : `Minor structure is not clean enough yet.`;
    const actionWord = direction === 'short' ? 'sell' : 'buy';
    const chartDirective = direction === 'neutral'
      ? 'No trade. Structure is unclear.'
      : doNotExecute && !priceInsideInstitutionalReference
        ? `Zone is valid, but price has not reacted yet. Plot zone ${formatRange(institutionalReference.low, institutionalReference.high)}. Wait for reaction. Best ${actionWord} price ${formatPrice(preferredEntryLevel)}.`
        : doNotExecute && phase === 'transition'
          ? 'No trade. Structure is unclear.'
          : readiness === 'ready'
            ? `${majorStructureSentence} Plot zone ${formatRange(institutionalReference.low, institutionalReference.high)}. ${actionWord === 'buy' ? 'Buy' : 'Sell'} from ${formatPrice(preferredEntryLevel)}.`
            : `${majorStructureSentence} ${minorStructureSentence} Plot zone ${formatRange(institutionalReference.low, institutionalReference.high)}. Wait for reaction. Best ${actionWord} price ${formatPrice(preferredEntryLevel)}.`;
    const operatorChecklist = [
      {
        key: 'major-structure',
        label: 'Major structure bias',
        status: majorStructure.direction === direction && majorStructure.quality === 'clear' ? 'pass' : majorStructure.direction !== 'neutral' ? 'watch' : 'fail',
        detail: `${majorStructure.summary} Ladder ${majorStructure.ladder}.`,
      },
      {
        key: 'minor-structure',
        label: 'Minor structure confirmation',
        status: breakOfStructure.state === 'confirmed' && microStructureShift.state === 'confirmed' ? 'pass' : breakOfStructure.state === 'confirmed' || microStructureShift.state === 'building' ? 'watch' : 'fail',
        detail: `${minorStructure.summary} ${breakOfStructure.summary} ${triggerTimeframe} micro shift is ${microStructureShift.state}${microStructureShift.level != null ? ` near ${formatPrice(microStructureShift.level)}` : ''}.`,
      },
      {
        key: 'liquidity-sweep',
        label: 'Liquidity sweep response',
        status: liquidityInteraction.active || sweepPresent ? 'pass' : priceInsideInstitutionalReference ? 'watch' : 'fail',
        detail: liquidityInteraction.active ? liquidityInteraction.summary : (sweepPresent ? `${minorTimeframe} sweep logic is active through the live pivot map.` : 'No clean live sweep response is active right now.'),
      },
      {
        key: 'displacement',
        label: 'Displacement strength',
        status: rejectionWithDisplacement.active && displacementStrong ? 'pass' : displacementStrong || modelTwoConfluence.score >= 55 ? 'watch' : 'fail',
        detail: rejectionWithDisplacement.active ? rejectionWithDisplacement.summary : (displacementStrong ? 'Displacement exists, but the lower-timeframe rejection is not fully proven yet.' : 'Displacement is still building or too weak to justify pressing size.'),
      },
      {
        key: 'premium-discount',
        label: 'Premium/discount positioning',
        status: priceInsideMainFibZone && priceInsideMinorFibZone && priceInsideExecutionLayer ? 'pass' : priceInsideInstitutionalReference ? 'watch' : 'fail',
        detail: `${premiumDiscountState} Main fib ${formatRange(mainFibZone.low, mainFibZone.high)}. Minor fib ${formatRange(minorFibZone.low, minorFibZone.high)}. Preferred execution is ${formatPrice(preferredEntryLevel)} inside the broad zone.`,
      },
      {
        key: 'macro-alignment',
        label: 'Macro alignment',
        status: macroHostile || ratesHostile ? 'fail' : macroAligned || ratesAligned ? 'pass' : 'watch',
        detail: macroContext,
      },
    ];
    const explainability = {
      whyValid: operatorChecklist.filter((item) => item.status === 'pass').map((item) => `${item.label}: ${item.detail}`).slice(0, 4),
      whatIsMissing: [
        ...operatorChecklist.filter((item) => item.status !== 'pass').map((item) => `${item.label}: ${item.detail}`),
        ...macroBlindspots,
      ].slice(0, 5),
      whatInvalidates: [
        `Lose ${formatPrice(invalidationLevel)} and the thesis is invalid.`,
        ...noTradeReasons.slice(0, 3),
      ],
    };
    const modelSelectionDecision = buildModelSelectionDecision({
      market,
      phase,
      readiness,
      confidence,
      macroReflexivity,
      eventRisk: eventRiskLive ? 'live' : eventRiskSoon ? 'soon' : 'clear',
    });

    const tradeThesisSummary = direction === 'neutral'
      ? `No trade. Major and minor structure are not aligned enough yet.`
      : `${majorStructure.summary} ${minorStructure.summary} Main fib ${formatRange(mainFibZone.low, mainFibZone.high)}. Minor fib ${formatRange(minorFibZone.low, minorFibZone.high)}. Structure-first area ${formatRange(structureZone.low, structureZone.high)}. ${institutionalReference.type === 'fib' ? 'No valid OB/FVG is supporting the zone yet.' : `${institutionalReference.label} is only valid because it supports that structure area.`} Preferred ${actionWord} price ${formatPrice(preferredEntryLevel)} only after liquidity interaction, rejection with displacement, and ${triggerTimeframe} micro shift. ${macroContext}`;
    const opposingDisplacementLevel = nearestDirectionalTarget(direction, price, [
      direction === 'long' ? minorPivots?.mappedResistance?.price : minorPivots?.mappedSupport?.price,
      direction === 'long' ? majorPivots?.mappedResistance?.price : majorPivots?.mappedSupport?.price,
      direction === 'long' ? minorProfile?.valueAreaHigh : minorProfile?.valueAreaLow,
    ]);
    const slowdownSignals = [
      triggerOrderflow?.priceDeltaDivergence && triggerOrderflow.priceDeltaDivergence !== 'none' ? `${triggerTimeframe} ${triggerOrderflow.priceDeltaDivergence}` : null,
      triggerOrderflow?.exhaustionSignal && triggerOrderflow.exhaustionSignal !== 'none' ? triggerOrderflow.exhaustionSignal : null,
      minorProfile?.valueAreaPosition === 'inside-value' ? 'acceptance back inside value' : null,
    ].filter((value): value is string => Boolean(value));
    const stopLogic = direction === 'neutral'
      ? 'Stop logic is idle until direction is no longer neutral.'
      : `${invalidationPlan.note} The execution idea is wrong on a clean loss of ${formatPrice(invalidationLevel)}.`;
    const targetLogic = direction === 'neutral'
      ? 'Wait for the three-phase model to line up before setting targets.'
      : `Primary exit is opposing liquidity near ${formatPrice(primaryTarget)}. Secondary management uses opposing displacement / structure near ${formatPrice(opposingDisplacementLevel)} and only reaches for extensions ${formatPrice(secondaryTarget)} / ${formatPrice(tertiaryTarget)} if price keeps accepting away from the ${institutionalReference.label}. If ${slowdownSignals.join(', ') || 'structure slowdown'} appears early, trim instead of waiting for fixed TP only. ${modelTwoConfluence.liquidityTargetContext}`;
    const feedQuality = `Orderflow ${majorOrderflow?.feedQuality ?? 'n/a'}/${minorOrderflow?.feedQuality ?? 'n/a'}/${triggerOrderflow?.feedQuality ?? 'n/a'} across ${majorTimeframe}/${minorTimeframe}/${triggerTimeframe}. Pressure engine remains multi-factor: ${triggerPressure?.pressureFormula ?? majorPressure?.pressureFormula ?? 'momentum + volume + structure + macro + volatility'}.`;
    const orderflowSummary = `${majorTimeframe} ${majorOrderflow?.dominance ?? 'n/a'} | ${minorTimeframe} ${minorOrderflow?.dominance ?? 'n/a'} | ${triggerTimeframe} ${triggerOrderflow?.dominance ?? 'n/a'} | ratio ${triggerOrderflow?.bidAskPressureRatio ?? 'n/a'} | imbalance ${triggerOrderflow?.quoteImbalance ?? 'n/a'} | absorption ${triggerOrderflow?.absorptionSignal ?? 'none'} | dealer ${flowProxy?.dealerPositioning ?? 'n/a'}.`;
    const executionRead = doNotExecute && eventRiskLive && primaryEvent
      ? `${chartDirective} High-impact ${primaryEvent.currency} ${primaryEvent.event} is too close.`
      : chartDirective;
    const dealerContext = `${flowProxy?.dealerPositioning ?? 'Dealer posture unavailable'} with ${flowProxy?.squeezeRisk ?? 'unknown'} squeeze risk, net flow ${formatPrice(flowProxy?.netFlowScore ?? null)}, and dealer pressure ${formatPrice(dealerPressure?.pressureScore ?? null)}.`;
    const volumeContext = minorProfile?.volumeBacked
      ? `15m volume profile on ${minorProfile?.matchedSourceSymbol ?? market} (${minorProfile?.volumeClass ?? minorProfile?.mode ?? 'unknown'}) shows POC ${formatPrice(minorProfile?.poc)}, value ${formatRange(minorProfile?.valueAreaLow, minorProfile?.valueAreaHigh)}, and ${minorProfile?.dominantBias ?? 'balanced'} participation. ${modelTwoConfluence.supportingChecks.some((item) => /high-volume node/i.test(item)) ? 'A high-volume node is reinforcing the institutional zone.' : 'A clean high-volume-node overlap is still missing.'}`
      : `15m volume profile is running in proxy or estimated mode, so weight value-area references with some caution.`;
    const structureContext = `${majorStructure.summary} ${minorStructure.summary} Trigger structure is ${structureBiasLabel(triggerStructure.bias)}. Main fib ${formatRange(mainFibZone.low, mainFibZone.high)}. Minor fib ${formatRange(minorFibZone.low, minorFibZone.high)}. Structure area ${formatRange(structureZone.low, structureZone.high)}.`;
    const expectedTrigger = direction === 'short' ? 'bearish engulfing or bearish rejection' : 'bullish engulfing or bullish rejection';
    const phaseSummary = phase === 'continuation'
      ? `Continuation setup. ${majorStructureSentence} Minor structure has re-aligned and the execution layer is live.`
      : phase === 'correction'
        ? `Correction setup. ${majorStructureSentence} Minor structure is pulling into the structure area but the reaction is not complete yet.`
        : phase === 'impulse'
          ? `Impulse active. ${majorStructureSentence} Wait for correction into the structure area before looking for entry.`
          : phase === 'reversal'
            ? `Reversal setup. Minor structure has flipped against the old ladder and needs disciplined confirmation.`
            : 'No trade. Structure is unclear.';
    const contextLines = [
      `${phaseSummary} ${tradeThesisSummary}`,
      `Macro: ${macroContext}`,
      `Reflexivity: ${macroReflexivity}. ${macroFocus?.executionFocus ?? 'Execution should follow the validated macro-feedback loop, not anticipate it.'}`,
      ratesFocus?.executionFocus ? `Rates differential: ${ratesFocus.executionFocus}` : null,
      `Precision ladder: ${precisionEntryPlan}`,
      `Stop logic: ${stopLogic}`,
      `Pyramiding: ${pyramidingPlan}`,
      `Break of structure: ${breakOfStructure.summary}`,
      `Institutional reference: ${institutionalReference.summary}`,
      `Execution layer: ${institutionalReference.executionLayer.rankingSummary}`,
      `Model 2 confluence: ${modelTwoConfluence.summary}`,
      `Footprint: ${modelTwoConfluence.footprintConfluence}`,
      `Absorption: ${modelTwoConfluence.absorptionContext}`,
      `Main fib: ${formatRange(mainFibZone.low, mainFibZone.high)} (${mainFibZone.label}).`,
      `Minor fib: ${formatRange(minorFibZone.low, minorFibZone.high)} (${minorFibZone.label}).`,
      `Structure zone: ${formatRange(structureZone.low, structureZone.high)}.`,
      `Trigger pattern: ${triggerPattern.label}. ${triggerPattern.summary}`,
      `Structure: ${structureContext}`,
      `Orderflow: ${orderflowSummary}`,
      `Volume: ${volumeContext}`,
      `Dealer flow: ${dealerContext}`,
      `Checklist: ${operatorChecklist.map((item) => `${item.label} ${item.status}`).join(' | ')}`,
      `Model selection: ${modelSelectionDecision.regimeClass} / ${modelSelectionDecision.selectedModels.map((item) => item.label).join(' / ')}`,
      `Macro blindspots: ${(macroBlindspots.length ? macroBlindspots : ['No new macro blindspot surfaced.']).join(' | ')}`,
      `No-trade triggers: ${(noTradeReasons.length ? noTradeReasons : ['None material right now.']).join(' | ')}`,
    ].filter((value): value is string => Boolean(value));
    const adaptiveProfileContext = [
      input.operatorAdaptiveProfile?.precisionThreshold != null || input.operatorAdaptiveProfile?.participationThreshold != null
        ? `Adaptive profile gates: precision ${input.operatorAdaptiveProfile?.precisionThreshold ?? 'n/a'} / participation ${input.operatorAdaptiveProfile?.participationThreshold ?? 'n/a'}.`
        : null,
      input.operatorAdaptiveProfile?.preferredFamilies?.length
        ? `Preferred adaptive families: ${input.operatorAdaptiveProfile.preferredFamilies.join(', ')}.`
        : null,
      input.operatorAdaptiveProfile?.avoidFamilies?.length
        ? `Adaptive avoid list: ${input.operatorAdaptiveProfile.avoidFamilies.join(', ')}.`
        : null,
    ].filter((value): value is string => Boolean(value));

    return {
      market,
      chartTimeframe,
      price: Number(price.toFixed(2)),
      timeframes: {
        major: majorTimeframe,
        minor: minorTimeframe,
        trigger: triggerTimeframe,
      },
      biasLabel: directionLabel(direction),
      biasTone: toneFromDirection(direction, doNotExecute),
      direction,
      phase,
      readiness,
      confidence: Number(confidence.toFixed(0)),
      confidenceLabel: confidenceLabel(confidence),
      entryZone: formatRange(institutionalReference.low, institutionalReference.high),
      fibZone: formatRange(mainFibZone.low, mainFibZone.high),
      minorFibZone: formatRange(minorFibZone.low, minorFibZone.high),
      structureZone: formatRange(structureZone.low, structureZone.high),
      trimZone: trimZone || 'n/a',
      noTradeZone: noTradeBand,
      invalidationLevel: formatPrice(invalidationLevel),
      targetLogic,
      tradeThesisSummary,
      feedQuality,
      orderflowSummary,
      executionChecklist: [
        ...adaptiveProfileContext,
        `Major structure first: ${majorStructure.summary}`,
        `Minor structure second: ${minorStructure.summary}`,
        `Main fib area: ${formatRange(mainFibZone.low, mainFibZone.high)} (${mainFibZone.label}).`,
        `Minor fib refinement: ${formatRange(minorFibZone.low, minorFibZone.high)} (${minorFibZone.label}).`,
        `Structure-first zone: plot ${formatRange(structureZone.low, structureZone.high)} before worrying about OB/FVG labels.`,
        `Execution layer: use ${formatPrice(preferredEntryLevel)} as the preferred ${actionWord} price only after liquidity interaction near ${formatPrice(institutionalReference.executionLayer.liquiditySweepLevel)} and ${triggerTimeframe} ${expectedTrigger} with displacement through ${formatPrice(microStructureShift.level)}.`,
        `Order-block / FVG filter: demand ${institutionalReference.type === 'order-block' ? 'a sweep or key level that launches displacement and breaks structure' : institutionalReference.type === 'fair-value-gap' ? 'strong displacement, minimal overlap, and a structure break or liquidity take' : 'a valid structure-first zone even if no OB/FVG survives'} before sizing up.`,
        `Footprint confirmation: look for imbalance and ${direction === 'long' ? 'sell-side absorption' : 'buy-side absorption'} to appear inside the reference zone rather than away from it.`,
        `Volume confirmation: 5m relative volume should ideally stay above 1.05x while price reacts from the zone.`,
        `Dealer and flow confirmation: avoid forcing the trade if ${flowProxy?.dealerPositioning ?? 'dealer posture'} starts leaning against the setup.`,
        `Macro confirmation: ${macroContext}`,
        ratesFocus?.executionFocus ? `Rates scoreboard confirmation: ${ratesFocus.executionFocus}` : null,
        `Precision ladder: ${precisionEntryPlan}`,
        `Stop logic: ${stopLogic}`,
        `Pyramiding rule: ${pyramidingPlan}`,
      ].filter((value): value is string => Boolean(value)),
      alertConditions: [
        ...(input.operatorAdaptiveProfile?.avoidFamilies?.length ? [`Adaptive caution: if this setup maps to ${input.operatorAdaptiveProfile.avoidFamilies.join(', ')}, require stronger confirmation before acting.`] : []),
        `Bias invalidated. Recalculate structure on a clean loss of ${formatPrice(invalidationLevel)}.`,
        `Do not execute on the first touch of ${formatRange(institutionalReference.low, institutionalReference.high)}; wait for the execution layer at ${formatPrice(preferredEntryLevel)} to confirm.`,
        `If 5m pressure rolls back toward ${direction === 'short' ? 'buyers' : 'sellers'}, stand down and reassess.`,
        `If price rotates back through ${noTradeBand}, treat it as balance rather than continuation.`,
        `If DXY, yields, or dealer flow flip against the move, downgrade the entry.`,
        ratesCounterTrend && ratesFocus?.pair ? `${ratesFocus.pair} is trading against the policy-rate gap, so treat continuation as fragile until the spread and spot re-align.` : null,
        primaryEvent ? `High-impact event watch: ${primaryEvent.currency} ${primaryEvent.event} ${primaryEvent.minutesUntil != null ? `in ${primaryEvent.minutesUntil}m` : 'is approaching'}.` : null,
      ].filter((value): value is string => Boolean(value)),
      sessionTimingNotes: [
        currentSessionNote(market),
        `Major structure stays on ${majorTimeframe}, refinement stays on ${minorTimeframe}, and entries stay on ${triggerTimeframe}.`,
        `Scale profits into opposing liquidity instead of waiting for the entire move to mature at once.`,
        ratesFocus?.summary ? ratesFocus.summary : null,
        eventRiskSoon && primaryEvent ? `A high-impact ${primaryEvent.currency} release is within ${primaryEvent.minutesUntil} minutes, so execution quality can degrade fast.` : `Macro reflexivity reads ${macroReflexivity}.`,
      ].filter((value): value is string => Boolean(value)),
      doNotExecute,
      executionRead,
      chartDirective,
      triggerPattern: triggerPattern.label,
      phaseSummary,
      biasContext: phaseSummary,
      macroContext,
      macroReflexivity,
      macroBlindspots,
      operatorChecklist,
      explainability,
      modelSelection: modelSelectionDecision,
      precisionEntryPlan,
      pyramidingPlan,
      entryLadder,
      preferredEntryLevel: formatPrice(preferredEntryLevel),
      executionLayer: {
        broadZone: formatRange(institutionalReference.executionLayer.broadLow, institutionalReference.executionLayer.broadHigh),
        displacementOrigin: formatPrice(institutionalReference.executionLayer.displacementOrigin),
        deepestFill: formatPrice(institutionalReference.executionLayer.deepestFill),
        liquiditySweepLevel: formatPrice(institutionalReference.executionLayer.liquiditySweepLevel),
        trueLiquidityLevel: formatPrice(institutionalReference.executionLayer.trueLiquidityLevel),
        microShiftLevel: formatPrice(microStructureShift.level ?? institutionalReference.executionLayer.microShiftLevel),
        rankingSummary: institutionalReference.executionLayer.rankingSummary,
        rankedLevels: institutionalReference.executionLayer.rankedLevels.map((item) => ({
          label: item.label,
          level: formatPrice(item.level),
          score: item.score,
          reason: item.reason,
        })),
      },
      stopLogic,
      majorStructure: majorStructure.summary,
      minorStructure: minorStructure.summary,
      breakOfStructure: breakOfStructure.summary,
      institutionalReference: institutionalReference.label,
      institutionalReferenceZone: formatRange(institutionalReference.low, institutionalReference.high),
      premiumDiscountState,
      modelTwoConfluenceScore: Number(modelTwoConfluence.score.toFixed(0)),
      modelTwoConfluenceLabel: modelTwoConfluence.label,
      modelTwoConfluenceSummary: modelTwoConfluence.summary,
      footprintConfluence: modelTwoConfluence.footprintConfluence,
      absorptionContext: modelTwoConfluence.absorptionContext,
      liquidityTargetContext: modelTwoConfluence.liquidityTargetContext,
      dealerContext,
      volumeContext,
      structureContext,
      contextLines,
      supportingSignals: [
        ...(adaptiveProfileContext.length ? ['Adaptive profile active'] : []),
        `${majorTimeframe} ${structureBiasLabel(majorStructure.bias)} structure`,
        `${minorTimeframe} ${structureBiasLabel(minorStructure.bias)} structure`,
        `${majorTimeframe} score ${majorScore.toFixed(1)}`,
        `${minorTimeframe} score ${minorScore.toFixed(1)}`,
        `${triggerTimeframe} score ${triggerScore.toFixed(1)}`,
        `${phase} setup`,
        `Flow score ${flowScore.toFixed(1)}`,
        `Model 2 ${modelTwoConfluence.label} ${modelTwoConfluence.score.toFixed(0)}`,
        `Reference ${institutionalReference.qualityLabel} ${institutionalReference.qualityScore}`,
        `Execute ${formatPrice(preferredEntryLevel)}`,
        `Checklist ${operatorChecklist.filter((item) => item.status === 'pass').length}/${operatorChecklist.length} pass`,
        `Model routing ${modelSelectionDecision.regimeClass}`,
        `Macro ${macroBias} ${macroFocus?.convictionScore ?? 'n/a'}`,
        ratesFocus?.pair ? `Rates ${ratesFocus.pair} ${ratesFocus.directionalBias} ${ratesFocus.alignment}` : null,
        `Reflexivity ${macroReflexivity}`,
      ].filter((value): value is string => Boolean(value)),
      noTradeReasons,
      sourceLabel: `Live entry map is structure-first: ${majorTimeframe}/${minorTimeframe}/${triggerTimeframe} structure, main/minor fib location, structure-zone mapping, strict order-block/FVG quality scans, execution-layer refinement, footprint imbalance, absorption, 15m volume profile, market-specific macro reflexivity, cross-country rates differentials when relevant, economic-calendar event risk, and synthetic-live dealer positioning.${adaptiveProfileContext.length ? ' Approved adaptive profile preferences are layered in as advisory context only.' : ''} Outputs are computed from current feeds, not static templates.`,
      scores: {
        major: Number(majorScore.toFixed(1)),
        minor: Number(minorScore.toFixed(1)),
        trigger: Number(triggerScore.toFixed(1)),
        flow: Number(flowScore.toFixed(1)),
        composite: Number(compositeScore.toFixed(1)),
      },
    };
  }, 10);
}
