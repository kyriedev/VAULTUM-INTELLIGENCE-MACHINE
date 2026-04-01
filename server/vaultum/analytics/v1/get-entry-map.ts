import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { getOrderflowEngine } from '../../orderflow/v1/get-engine';
import { getBuyerSellerPressure } from '../../pressure/v1/get-buyer-seller-pressure';
import { getLevels } from '../../pivots/v1/get-levels';
import { getProfile } from '../../volume/v1/get-profile';
import { getDealerPressure } from '../../options/v1/get-dealer-pressure';
import { getFlowProxy } from '../../options/v1/get-flow-proxy';

type Direction = 'long' | 'short' | 'neutral';
type BiasTone = 'bullish' | 'bearish' | 'neutral' | 'alert';
type ExecutionPhase = 'impulse' | 'correction' | 'continuation' | 'transition';
type ExecutionReadiness = 'ready' | 'watch' | 'stand-aside';
type BreakOfStructureState = 'confirmed' | 'building' | 'absent';
type InstitutionalReferenceType = 'order-block' | 'fair-value-gap' | 'fib';

type OrderflowSnapshot = Awaited<ReturnType<typeof getOrderflowEngine>>;
type PivotSnapshot = Awaited<ReturnType<typeof getLevels>>;
type VolumeProfileSnapshot = Awaited<ReturnType<typeof getProfile>>;
type RichBar = OrderflowSnapshot['recentBars'][number];
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
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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
    return {
      active: false,
      label: `${timeframe} order block`,
      summary: `${timeframe} order-block scan is waiting for more structure.`,
      low: null,
      high: null,
      relativeVolume: null,
      delta: null,
      inverseDelta: false,
      displacementAligned: false,
    };
  }

  const start = Math.max(0, bars.length - 12);
  for (let index = bars.length - 3; index >= start; index--) {
    const base = bars[index]!;
    const next = bars[index + 1]!;
    const follow = bars[index + 2]!;
    const displacementVolume = Math.max(next.relativeVolume ?? 0, follow.relativeVolume ?? 0);
    const inverseBullishDelta = base.delta > 0.12;
    const inverseBearishDelta = base.delta < -0.12;
    const highVolume = (base.relativeVolume ?? 1) >= 1.05;
    const bullishDisplacement =
      next.close > base.high
      && follow.high > next.high
      && (next.delta + follow.delta) >= 0
      && displacementVolume >= 1;
    const bearishDisplacement =
      next.close < base.low
      && follow.low < next.low
      && (next.delta + follow.delta) <= 0
      && displacementVolume >= 1;

    if (direction === 'long' && base.close < base.open && bullishDisplacement) {
      const zone = normalizedZone(base.low, Math.max(base.open, base.close));
      return {
        active: true,
        label: `${timeframe} bullish order block`,
        summary: `${timeframe} bullish order block is the last down candle before displacement from ${formatRange(zone.low, zone.high)} with ${highVolume ? 'elevated' : 'ordinary'} volume and ${inverseBullishDelta ? 'inverse buy delta' : 'delta that still needs cleaner buyer absorption'}.`,
        low: zone.low,
        high: zone.high,
        relativeVolume: Number((base.relativeVolume ?? 1).toFixed(2)),
        delta: Number(base.delta.toFixed(2)),
        inverseDelta: inverseBullishDelta,
        displacementAligned: bullishDisplacement,
      };
    }

    if (direction === 'short' && base.close > base.open && bearishDisplacement) {
      const zone = normalizedZone(Math.min(base.open, base.close), base.high);
      return {
        active: true,
        label: `${timeframe} bearish order block`,
        summary: `${timeframe} bearish order block is the last up candle before displacement from ${formatRange(zone.low, zone.high)} with ${highVolume ? 'elevated' : 'ordinary'} volume and ${inverseBearishDelta ? 'inverse sell delta' : 'delta that still needs cleaner seller absorption'}.`,
        low: zone.low,
        high: zone.high,
        relativeVolume: Number((base.relativeVolume ?? 1).toFixed(2)),
        delta: Number(base.delta.toFixed(2)),
        inverseDelta: inverseBearishDelta,
        displacementAligned: bearishDisplacement,
      };
    }
  }

  return {
    active: false,
    label: `${timeframe} order block`,
    summary: `${timeframe} order block is not clean enough yet, so the fib band remains the fallback reference.`,
    low: null,
    high: null,
    relativeVolume: null,
    delta: null,
    inverseDelta: false,
    displacementAligned: false,
  };
}

function detectFairValueGap(
  bars: RichBar[],
  direction: Direction,
  timeframe: string,
): InstitutionalZoneScan {
  if (direction === 'neutral' || bars.length < 3) {
    return {
      active: false,
      label: `${timeframe} fair value gap`,
      summary: `${timeframe} fair value-gap scan is waiting for more candles.`,
      low: null,
      high: null,
      relativeVolume: null,
      delta: null,
      inverseDelta: false,
      displacementAligned: false,
    };
  }

  const start = Math.max(2, bars.length - 10);
  for (let index = bars.length - 1; index >= start; index--) {
    const first = bars[index - 2]!;
    const middle = bars[index - 1]!;
    const last = bars[index]!;

    if (direction === 'long') {
      const bullishGap =
        last.low > first.high
        && middle.close >= middle.open
        && Math.max(middle.relativeVolume ?? 0, last.relativeVolume ?? 0) >= 1;
      if (bullishGap) {
        const zone = normalizedZone(first.high, last.low);
        return {
          active: true,
          label: `${timeframe} bullish fair value gap`,
          summary: `${timeframe} bullish FVG spans ${formatRange(zone.low, zone.high)} and marks the imbalance left by the upside impulse.`,
          low: zone.low,
          high: zone.high,
          relativeVolume: Number(Math.max(middle.relativeVolume ?? 1, last.relativeVolume ?? 1).toFixed(2)),
          delta: Number((middle.delta + last.delta).toFixed(2)),
          inverseDelta: false,
          displacementAligned: true,
        };
      }
    } else {
      const bearishGap =
        last.high < first.low
        && middle.close <= middle.open
        && Math.max(middle.relativeVolume ?? 0, last.relativeVolume ?? 0) >= 1;
      if (bearishGap) {
        const zone = normalizedZone(last.high, first.low);
        return {
          active: true,
          label: `${timeframe} bearish fair value gap`,
          summary: `${timeframe} bearish FVG spans ${formatRange(zone.low, zone.high)} and marks the imbalance left by the downside impulse.`,
          low: zone.low,
          high: zone.high,
          relativeVolume: Number(Math.max(middle.relativeVolume ?? 1, last.relativeVolume ?? 1).toFixed(2)),
          delta: Number((middle.delta + last.delta).toFixed(2)),
          inverseDelta: false,
          displacementAligned: true,
        };
      }
    }
  }

  return {
    active: false,
    label: `${timeframe} fair value gap`,
    summary: `${timeframe} fair value gap is not active right now, so the pullback will rely on structure plus the fib pocket.`,
    low: null,
    high: null,
    relativeVolume: null,
    delta: null,
    inverseDelta: false,
    displacementAligned: false,
  };
}

function selectInstitutionalReference(input: {
  direction: Direction;
  fibZone: { low: number; high: number; label: string };
  orderBlock: InstitutionalZoneScan;
  fairValueGap: InstitutionalZoneScan;
}): {
  type: InstitutionalReferenceType;
  label: string;
  low: number;
  high: number;
  summary: string;
} {
  const directionalLabel = input.direction === 'short' ? 'bearish' : 'bullish';
  const orderBlockOverlap =
    input.orderBlock.active && input.orderBlock.low != null && input.orderBlock.high != null
      ? intersectZones(input.fibZone.low, input.fibZone.high, input.orderBlock.low, input.orderBlock.high)
      : null;
  if (orderBlockOverlap) {
    return {
      type: 'order-block',
      label: `${directionalLabel} order block`,
      low: orderBlockOverlap.low,
      high: orderBlockOverlap.high,
      summary: `${input.orderBlock.summary} The preferred entry is the overlap between that order block and the ${input.fibZone.label}.`,
    };
  }

  const fairValueGapOverlap =
    input.fairValueGap.active && input.fairValueGap.low != null && input.fairValueGap.high != null
      ? intersectZones(input.fibZone.low, input.fibZone.high, input.fairValueGap.low, input.fairValueGap.high)
      : null;
  if (fairValueGapOverlap) {
    return {
      type: 'fair-value-gap',
      label: `${directionalLabel} fair value gap`,
      low: fairValueGapOverlap.low,
      high: fairValueGapOverlap.high,
      summary: `${input.fairValueGap.summary} The preferred entry is the overlap between that FVG and the ${input.fibZone.label}.`,
    };
  }

  if (input.orderBlock.active && input.orderBlock.low != null && input.orderBlock.high != null) {
    return {
      type: 'order-block',
      label: `${directionalLabel} order block`,
      low: input.orderBlock.low,
      high: input.orderBlock.high,
      summary: input.orderBlock.summary,
    };
  }

  if (input.fairValueGap.active && input.fairValueGap.low != null && input.fairValueGap.high != null) {
    return {
      type: 'fair-value-gap',
      label: `${directionalLabel} fair value gap`,
      low: input.fairValueGap.low,
      high: input.fairValueGap.high,
      summary: input.fairValueGap.summary,
    };
  }

  return {
    type: 'fib',
    label: input.fibZone.label,
    low: input.fibZone.low,
    high: input.fibZone.high,
    summary: `No clean order block or fair value gap is active, so the ${input.fibZone.label} becomes the institutional reference.`,
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
  institutionalReference: { type: InstitutionalReferenceType; label: string; low: number; high: number; summary: string };
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

  let score = 0;
  if (input.breakConfirmed) score += 16;
  if (input.priceInsideInstitutionalReference) score += 14;
  if (input.priceInsideFibZone) score += 10;
  if (inverseDeltaOrderBlock) score += 14;
  if (highVolumeOrderBlock) score += 10;
  if (displacementFvg) score += 12;
  if (hVNAligned) score += 10;
  if (imbalanceAligned) score += 10;
  if (absorptionAligned) score += 10;
  if (divergenceAligned) score += 6;
  if (input.triggerAligned) score += 10;
  if (input.patternAligned) score += 10;
  if (liquidityTargetAligned) score += 8;
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
    input.priceInsideFibZone ? `Price is in the preferred ${input.direction === 'long' ? 'discount' : 'premium'} pocket.` : null,
    inverseDeltaOrderBlock ? `Order block shows inverse delta on the origin candle.` : null,
    highVolumeOrderBlock ? `Order block carries elevated relative volume.` : null,
    displacementFvg ? `FVG was created by a true displacement leg.` : null,
    hVNAligned ? `A high-volume node / balance reference overlaps the zone.` : null,
    imbalanceAligned ? `Footprint imbalance inside the zone favors ${directionalLabel} continuation.` : null,
    absorptionAligned ? `${input.triggerOrderflow.absorptionSignal} is supporting the turn.` : null,
    divergenceAligned ? `Delta divergence is leaning ${directionalLabel}.` : null,
    input.patternAligned ? `Trigger candle is aligned with the setup.` : null,
    liquidityTargetAligned ? `Opposing liquidity target is clean.` : null,
  ].filter((value): value is string => Boolean(value));
  const blockingChecks = [
    !input.breakConfirmed ? 'Break of structure is not confirmed yet.' : null,
    !input.priceInsideInstitutionalReference ? `Price has not tapped the ${input.institutionalReference.label} yet.` : null,
    !input.priceInsideFibZone ? `Price is still outside the preferred ${input.direction === 'long' ? 'discount' : 'premium'} pocket.` : null,
    input.institutionalReference.type === 'order-block' && !inverseDeltaOrderBlock ? 'Order block still lacks the inverse-delta signature you want.' : null,
    input.institutionalReference.type === 'order-block' && !highVolumeOrderBlock ? 'Order block volume is not exceptional enough yet.' : null,
    input.institutionalReference.type === 'fair-value-gap' && !displacementFvg ? 'FVG displacement is still too soft.' : null,
    !hVNAligned ? 'No high-volume node is reinforcing the zone yet.' : null,
    !imbalanceAligned ? 'The footprint imbalance at the zone is not decisive yet.' : null,
    !absorptionAligned ? 'Absorption is not confirming the reversal yet.' : null,
    !input.patternAligned ? 'The 5m trigger candle is still missing.' : null,
    !liquidityTargetAligned ? 'Opposing liquidity is not well defined yet.' : null,
  ].filter((value): value is string => Boolean(value));
  const label = modelTwoConfluenceLabel(score);
  const summary = label === 'sniper-ready'
    ? `Model 2 is sniper-ready: BOS, ${input.institutionalReference.label}, footprint imbalance, volume-node alignment, and liquidity target structure are all stacked.`
    : label === 'strong'
      ? `Model 2 is strong: the institutional retracement is live and most of the footprint / liquidity confluence is already in place.`
      : label === 'building'
        ? `Model 2 is building: the structure is there, but one or two of the footprint / volume / target confirmations are still missing.`
        : `Model 2 is weak right now because the institutional zone and footprint confluence are not stacked yet.`;

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

function deriveFibZone(direction: Direction, support: number, resistance: number): {
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
      label: '0.382 - 0.618 premium retracement',
    };
  }

  return {
    low: Number((resistance - (range * 0.618)).toFixed(2)),
    high: Number((resistance - (range * 0.382)).toFixed(2)),
    extension1272: Number((resistance + (range * 0.272)).toFixed(2)),
    extension1618: Number((resistance + (range * 0.618)).toFixed(2)),
    label: '0.382 - 0.618 discount retracement',
  };
}

export async function getEntryMap(input: {
  market?: string;
  chartTimeframe?: string;
  majorTimeframe?: string;
  minorTimeframe?: string;
  triggerTimeframe?: string;
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
    const triggerBars = recentBars(triggerOrderflow);
    const minorBars = recentBars(minorOrderflow);
    const triggerPattern = detectTriggerPattern(triggerBars);
    const triggerScore = clamp(
      (safeNumber(triggerPressure?.score, 0) * 0.42)
      + (safeNumber(triggerOrderflow?.buySellPressure, 0) * 0.38)
      + (triggerPattern.score * 0.20),
      -100,
      100,
    );
    const compositeScore = clamp((structuralComposite * 0.75) + (triggerScore * 0.25), -100, 100);
    const direction = directionFromScore(compositeScore === 0 ? structuralComposite : compositeScore);
    const fibZone = deriveFibZone(direction === 'neutral' ? 'long' : direction, support, resistance);
    const breakOfStructure = detectBreakOfStructure(minorBars, direction, minorTimeframe);
    const orderBlock = detectOrderBlock(minorBars, direction, minorTimeframe);
    const fairValueGap = detectFairValueGap(minorBars, direction, minorTimeframe);
    const institutionalReference = selectInstitutionalReference({
      direction: direction === 'neutral' ? 'long' : direction,
      fibZone,
      orderBlock,
      fairValueGap,
    });
    const zoneTolerance = Math.max(triggerAtr * 0.25, Math.abs(price) * 0.00035, 0.1);
    const priceInsideFibZone = price >= (fibZone.low - zoneTolerance) && price <= (fibZone.high + zoneTolerance);
    const priceInsideInstitutionalReference = zoneContainsPrice(
      institutionalReference.low,
      institutionalReference.high,
      price,
      zoneTolerance,
    );
    const majorMinorAligned =
      direction !== 'neutral'
      && Math.sign(majorScore) === Math.sign(minorScore)
      && Math.abs(majorScore) >= 12
      && Math.abs(minorScore) >= 12;
    const breakConfirmed = direction !== 'neutral' && breakOfStructure.state === 'confirmed';
    const triggerAligned =
      direction !== 'neutral'
      && Math.sign(triggerScore) === Math.sign(compositeScore || structuralComposite)
      && Math.abs(triggerScore) >= 10;
    const patternAligned = direction !== 'neutral' && triggerPattern.bias === direction;

    let phase: ExecutionPhase = 'transition';
    if (majorMinorAligned && breakConfirmed && priceInsideFibZone && priceInsideInstitutionalReference && triggerAligned && patternAligned) phase = 'continuation';
    else if (majorMinorAligned && breakConfirmed && priceInsideFibZone && priceInsideInstitutionalReference) phase = 'correction';
    else if (majorMinorAligned && breakConfirmed) phase = 'impulse';

    const noTradeReasons: string[] = [];
    if (!majorMinorAligned) noTradeReasons.push('4H and 15m structure are not aligned yet.');
    if (!breakConfirmed) noTradeReasons.push(`${minorTimeframe} break of structure is not confirmed yet.`);
    if (!priceInsideFibZone) noTradeReasons.push(`Price is outside the preferred ${fibZone.label} entry zone.`);
    if (!priceInsideInstitutionalReference) noTradeReasons.push(`Price has not retraced into the selected ${institutionalReference.label} reference yet.`);
    if (!patternAligned) noTradeReasons.push(`5m trigger has not confirmed with a ${direction === 'short' ? 'bearish' : 'bullish'} activation candle yet.`);
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
      + (institutionalReference.type !== 'fib' ? 6 : 0)
      + (patternAligned ? 12 : 0)
      + (safeNumber(triggerPressure?.relativeVolume, 1) >= 1.1 ? 8 : 0)
      - (conflictCount * 10),
      0,
      100,
    );
    const invalidationBuffer = Math.max(triggerAtr * 0.35, 0.12);
    const invalidationLevel = direction === 'short'
      ? Math.max(fibZone.high, resistance) + invalidationBuffer
      : Math.min(fibZone.low, support) - invalidationBuffer;
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
    });
    modelTwoConfluence.blockingChecks.slice(0, 3).forEach((reason) => {
      if (!noTradeReasons.includes(reason)) noTradeReasons.push(reason);
    });
    const confidence = clamp(baseConfidence + (modelTwoConfluence.score * 0.16), 0, 100);
    const readiness: ExecutionReadiness =
      direction === 'neutral' || confidence < 48 || noTradeReasons.length >= 4
        ? 'stand-aside'
        : phase === 'continuation' && modelTwoConfluence.label !== 'weak'
          ? 'ready'
          : 'watch';
    const doNotExecute = readiness === 'stand-aside';
    const secondaryTarget = direction === 'short' ? fibZone.extension1272 : fibZone.extension1272;
    const tertiaryTarget = direction === 'short' ? fibZone.extension1618 : fibZone.extension1618;
    const trimZone = [
      primaryTarget != null ? formatPrice(primaryTarget) : null,
      formatPrice(secondaryTarget),
      formatPrice(tertiaryTarget),
    ].filter((value): value is string => Boolean(value)).join(' / ');
    const premiumDiscountState = direction === 'neutral'
      ? 'Balanced / unconfirmed'
      : priceInsideFibZone
        ? `Price is inside the preferred ${direction === 'long' ? 'discount' : 'premium'} pocket.`
        : `Price is still outside the preferred ${direction === 'long' ? 'discount' : 'premium'} pocket.`;

    const tradeThesisSummary = direction === 'neutral'
      ? `Major structure, minor structure, and trigger flow are not aligned enough to justify an institutional-style entry yet.`
      : `${direction === 'long' ? '4H upside structure' : '4H downside structure'} is being refined by a ${minorTimeframe} break-of-structure read, and the preferred retracement is a ${direction === 'long' ? 'discount' : 'premium'} return into the ${institutionalReference.label} at ${formatRange(institutionalReference.low, institutionalReference.high)} before phase-3 continuation toward opposing liquidity. ${modelTwoConfluence.summary}`;
    const targetLogic = direction === 'neutral'
      ? 'Wait for the three-phase model to line up before setting targets.'
      : `Phase 3 continuation targets ${direction === 'long' ? 'overhead' : 'downside'} liquidity near ${formatPrice(primaryTarget)} first, then Fibonacci extensions ${formatPrice(secondaryTarget)} and ${formatPrice(tertiaryTarget)} if the move keeps displacing away from the ${institutionalReference.label}. ${modelTwoConfluence.liquidityTargetContext}`;
    const feedQuality = `Orderflow ${majorOrderflow?.feedQuality ?? 'n/a'}/${minorOrderflow?.feedQuality ?? 'n/a'}/${triggerOrderflow?.feedQuality ?? 'n/a'} across ${majorTimeframe}/${minorTimeframe}/${triggerTimeframe}. Pressure engine remains multi-factor: ${triggerPressure?.pressureFormula ?? majorPressure?.pressureFormula ?? 'momentum + volume + structure + macro + volatility'}.`;
    const orderflowSummary = `${majorTimeframe} ${majorOrderflow?.dominance ?? 'n/a'} | ${minorTimeframe} ${minorOrderflow?.dominance ?? 'n/a'} | ${triggerTimeframe} ${triggerOrderflow?.dominance ?? 'n/a'} | ratio ${triggerOrderflow?.bidAskPressureRatio ?? 'n/a'} | imbalance ${triggerOrderflow?.quoteImbalance ?? 'n/a'} | absorption ${triggerOrderflow?.absorptionSignal ?? 'none'} | dealer ${flowProxy?.dealerPositioning ?? 'n/a'}.`;
    const executionRead = doNotExecute
      ? `Stand aside until ${breakOfStructure.state === 'confirmed' ? `price revisits the ${institutionalReference.label}` : `the ${minorTimeframe} BOS confirms`} and the 5m trigger aligns with the broader ${majorTimeframe} structure. Model 2 confluence is only ${modelTwoConfluence.label} right now.`
      : readiness === 'ready'
        ? `${direction === 'long' ? 'Long' : 'Short'} continuation is active: ${minorTimeframe} BOS is confirmed and ${triggerPattern.label} has aligned from the ${institutionalReference.label} inside the preferred ${fibZone.label} zone, with model 2 confluence ${modelTwoConfluence.label}.`
        : `Bias is ${direction === 'long' ? 'up' : 'down'}, but phase 2 is still developing. Wait for price to tap the ${institutionalReference.label} inside the preferred ${fibZone.label} zone and print a 5m trigger while model 2 confluence improves beyond ${modelTwoConfluence.label}.`;
    const dealerContext = `${flowProxy?.dealerPositioning ?? 'Dealer posture unavailable'} with ${flowProxy?.squeezeRisk ?? 'unknown'} squeeze risk, net flow ${formatPrice(flowProxy?.netFlowScore ?? null)}, and dealer pressure ${formatPrice(dealerPressure?.pressureScore ?? null)}.`;
    const volumeContext = minorProfile?.volumeBacked
      ? `15m volume profile shows POC ${formatPrice(minorProfile?.poc)}, value ${formatRange(minorProfile?.valueAreaLow, minorProfile?.valueAreaHigh)}, and ${minorProfile?.dominantBias ?? 'balanced'} participation. ${modelTwoConfluence.supportingChecks.some((item) => /high-volume node/i.test(item)) ? 'A high-volume node is reinforcing the institutional zone.' : 'A clean high-volume-node overlap is still missing.'}`
      : `15m volume profile is running in proxy/estimated mode, so weight value-area references with some caution.`;
    const structureContext = `${majorTimeframe} ${majorPivots?.regime?.primaryCode ?? 'structure'} / ${majorPivots?.regime?.secondaryCode ?? 'context'} with ${minorTimeframe} bias ${minorPivots?.signalMap?.bias ?? 'pending'}.`;
    const expectedTrigger = direction === 'short' ? 'bearish engulfing or bearish rejection' : 'bullish engulfing or bullish rejection';
    const phaseSummary = phase === 'continuation'
      ? `Phase 3 continuation is active after a confirmed ${minorTimeframe} BOS, retracement into the ${institutionalReference.label}, and a live ${triggerTimeframe} trigger.`
      : phase === 'correction'
        ? `Phase 2 correction is active as price retraces into the ${institutionalReference.label} inside the preferred ${fibZone.label}.`
        : phase === 'impulse'
          ? `Phase 1 impulse is active because ${minorTimeframe} BOS has printed and the market is waiting for the institutional pullback.`
          : 'The three-phase model is not cleanly aligned yet.';
    const contextLines = [
      `${phaseSummary} ${tradeThesisSummary}`,
      `Break of structure: ${breakOfStructure.summary}`,
      `Institutional reference: ${institutionalReference.summary}`,
      `Model 2 confluence: ${modelTwoConfluence.summary}`,
      `Footprint: ${modelTwoConfluence.footprintConfluence}`,
      `Absorption: ${modelTwoConfluence.absorptionContext}`,
      `Fib zone: ${formatRange(fibZone.low, fibZone.high)} (${fibZone.label}).`,
      `Trigger pattern: ${triggerPattern.label}. ${triggerPattern.summary}`,
      `Structure: ${structureContext}`,
      `Orderflow: ${orderflowSummary}`,
      `Volume: ${volumeContext}`,
      `Dealer flow: ${dealerContext}`,
      `No-trade triggers: ${(noTradeReasons.length ? noTradeReasons : ['None material right now.']).join(' | ')}`,
    ];

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
      fibZone: formatRange(fibZone.low, fibZone.high),
      trimZone: trimZone || 'n/a',
      noTradeZone: noTradeBand,
      invalidationLevel: formatPrice(invalidationLevel),
      targetLogic,
      tradeThesisSummary,
      feedQuality,
      orderflowSummary,
      executionChecklist: [
        `Phase 1 impulse: require ${minorTimeframe} BOS through ${formatPrice(breakOfStructure.level)} while ${majorTimeframe} ${direction === 'neutral' ? 'structure stays neutral' : direction === 'long' ? 'higher-high / higher-low behavior' : 'lower-high / lower-low behavior'} remains intact.`,
        `Phase 2 correction: wait for price to retrace into ${formatRange(institutionalReference.low, institutionalReference.high)} (${institutionalReference.label}) without losing the preferred ${fibZone.label}.`,
        `Phase 2 activation: require a ${triggerTimeframe} ${expectedTrigger} from the ${institutionalReference.label} with delta back in the ${direction === 'short' ? 'sellers' : 'buyers'}' favor.`,
        `Order-block / FVG quality: demand ${institutionalReference.type === 'order-block' ? 'inverse delta plus exceptional volume on the origin candle' : institutionalReference.type === 'fair-value-gap' ? 'clear displacement and visible imbalance through the gap' : 'a cleaner institutional reference than fib alone'} before sizing up.`,
        `Footprint confirmation: look for imbalance and ${direction === 'long' ? 'sell-side absorption' : 'buy-side absorption'} to appear inside the reference zone rather than away from it.`,
        `Volume confirmation: 5m relative volume should ideally stay above 1.05x while price reacts from the zone.`,
        `Dealer and flow confirmation: avoid forcing the trade if ${flowProxy?.dealerPositioning ?? 'dealer posture'} starts leaning against the setup.`,
      ],
      alertConditions: [
        `Lose ${formatPrice(invalidationLevel)} and the current thesis is void.`,
        `If 5m pressure rolls back toward ${direction === 'short' ? 'buyers' : 'sellers'}, stand down and reassess.`,
        `If price rotates back through ${noTradeBand}, treat it as balance rather than continuation.`,
        `If DXY, yields, or dealer flow flip against the move, downgrade the entry.`,
      ],
      sessionTimingNotes: [
        currentSessionNote(market),
        `Major structure stays on ${majorTimeframe}, refinement stays on ${minorTimeframe}, and entries stay on ${triggerTimeframe}.`,
        `Scale profits into opposing liquidity instead of waiting for the entire move to mature at once.`,
      ],
      doNotExecute,
      executionRead,
      triggerPattern: triggerPattern.label,
      phaseSummary,
      biasContext: phaseSummary,
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
        `${majorTimeframe} score ${majorScore.toFixed(1)}`,
        `${minorTimeframe} score ${minorScore.toFixed(1)}`,
        `${triggerTimeframe} score ${triggerScore.toFixed(1)}`,
        `Flow score ${flowScore.toFixed(1)}`,
        `Model 2 ${modelTwoConfluence.label} ${modelTwoConfluence.score.toFixed(0)}`,
      ],
      noTradeReasons,
      sourceLabel: `Live entry map combines ${majorTimeframe}/${minorTimeframe}/${triggerTimeframe} pressure, orderflow, pivots, order-block/FVG structure scans, footprint imbalance, absorption, 15m volume profile, and synthetic-live dealer positioning. Outputs are computed from current feeds, not static templates.`,
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
