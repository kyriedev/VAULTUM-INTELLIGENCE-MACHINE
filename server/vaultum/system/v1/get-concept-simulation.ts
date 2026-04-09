import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { normalizeVaultumTimeframe } from '../../_shared/timeframes';
import {
  buildStructureRegime,
  fetchPreferredStructureCandles,
  resolveStructureSymbol,
  type Candle,
} from '../../pivots/v1/_structure';
import {
  buildModelSelectionDecision,
  normalizeTradingDoctrineMarket,
  retrieveKnowledge,
} from './_knowledge-base';

type RegimeClass = 'trend' | 'mean-reversion' | 'unstable-noise';
type SignalDirection = 'bullish' | 'bearish';

type ConceptAggregate = {
  key: string;
  label: string;
  samples: number;
  wins: number;
  forwardAtrSum: number;
  mfeAtrSum: number;
  maeAtrSum: number;
  notes: Set<string>;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function atr(candles: Candle[], period = 14): number {
  if (candles.length <= 1) return 0;
  const window = candles.slice(-Math.max(2, period + 1));
  const ranges: number[] = [];
  for (let index = 1; index < window.length; index += 1) {
    const current = window[index]!;
    const previous = window[index - 1]!;
    ranges.push(Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    ));
  }
  return average(ranges);
}

function bodyRatio(candle: Candle): number {
  const range = Math.max(candle.high - candle.low, 0.000001);
  return Math.abs(candle.close - candle.open) / range;
}

function evaluateDirectionalSignal(entryPrice: number, forward: Candle[], atrValue: number, direction: SignalDirection): {
  success: boolean;
  forwardAtr: number;
  mfeAtr: number;
  maeAtr: number;
} {
  if (!forward.length || atrValue <= 0) {
    return { success: false, forwardAtr: 0, mfeAtr: 0, maeAtr: 0 };
  }

  const lastClose = forward[forward.length - 1]?.close ?? entryPrice;
  const bestMove = direction === 'bullish'
    ? Math.max(...forward.map((candle) => candle.high - entryPrice))
    : Math.max(...forward.map((candle) => entryPrice - candle.low));
  const worstMove = direction === 'bullish'
    ? Math.max(...forward.map((candle) => entryPrice - candle.low))
    : Math.max(...forward.map((candle) => candle.high - entryPrice));
  const finalMove = direction === 'bullish' ? lastClose - entryPrice : entryPrice - lastClose;

  const mfeAtr = bestMove / atrValue;
  const maeAtr = worstMove / atrValue;
  const forwardAtr = finalMove / atrValue;

  return {
    success: mfeAtr >= 0.7 && forwardAtr >= 0.25 && mfeAtr > maeAtr,
    forwardAtr: Number(forwardAtr.toFixed(2)),
    mfeAtr: Number(mfeAtr.toFixed(2)),
    maeAtr: Number(maeAtr.toFixed(2)),
  };
}

function classifyRealizedRegime(entryPrice: number, forward: Candle[], atrValue: number): RegimeClass {
  if (forward.length < 2 || atrValue <= 0) return 'mean-reversion';

  const closes = [entryPrice, ...forward.map((candle) => candle.close)];
  const stepMoves: number[] = [];
  for (let index = 1; index < closes.length; index += 1) {
    stepMoves.push(closes[index]! - closes[index - 1]!);
  }

  const netMove = closes[closes.length - 1]! - closes[0]!;
  const persistence = Math.abs(netMove) / Math.max(stepMoves.reduce((sum, value) => sum + Math.abs(value), 0), 0.000001);
  const pathHigh = Math.max(...forward.map((candle) => candle.high));
  const pathLow = Math.min(...forward.map((candle) => candle.low));
  const pathRangeAtr = (pathHigh - pathLow) / atrValue;
  const finalAtr = Math.abs(netMove) / atrValue;
  const stepStdAtr = standardDeviation(stepMoves) / atrValue;

  if (persistence >= 0.58 && finalAtr >= 0.55) return 'trend';
  if (pathRangeAtr >= 1.9 && (persistence < 0.45 || stepStdAtr >= 0.45)) return 'unstable-noise';
  return 'mean-reversion';
}

function inferPhase(primaryCode: string, secondaryCode: string): string {
  if (primaryCode === 'BREAKOUT') return 'impulse';
  if (primaryCode === 'RANGE') return 'correction';
  if (primaryCode === 'TRANSITION' || /EXHAUSTION/.test(secondaryCode)) return 'transition';
  return 'continuation';
}

function inferReadiness(primaryCode: string): string {
  if (primaryCode === 'TRANSITION') return 'stand-aside';
  if (primaryCode === 'BREAKOUT') return 'watch';
  return 'ready';
}

function inferConfidence(primaryCode: string, adx: number, volatilityState: string): number {
  if (primaryCode === 'TRANSITION') return 42;
  if (primaryCode === 'RANGE') return volatilityState.includes('high') ? 52 : 60;
  if (primaryCode === 'BREAKOUT') return adx >= 24 ? 71 : 64;
  return adx >= 28 ? 77 : 68;
}

function inferMacroReflexivity(secondaryCode: string): string {
  if (/PARABOLIC|CAPITULATION/.test(secondaryCode)) return 'self-reinforcing';
  if (/EXHAUSTION/.test(secondaryCode)) return 'exhaustion watch';
  return 'neutral';
}

function recordConceptOutcome(
  aggregate: ConceptAggregate,
  outcome: { success: boolean; forwardAtr: number; mfeAtr: number; maeAtr: number },
  note?: string,
): void {
  aggregate.samples += 1;
  if (outcome.success) aggregate.wins += 1;
  aggregate.forwardAtrSum += outcome.forwardAtr;
  aggregate.mfeAtrSum += outcome.mfeAtr;
  aggregate.maeAtrSum += outcome.maeAtr;
  if (note && aggregate.notes.size < 3) aggregate.notes.add(note);
}

export async function getConceptSimulation(input: {
  market?: string;
  timeframe?: string;
  lookbackBars?: number;
  horizonBars?: number;
}): Promise<any> {
  const market = normalizeTradingDoctrineMarket(input.market);
  const timeframe = normalizeVaultumTimeframe(input.timeframe, '1h');
  const lookbackBars = clamp(Number(input.lookbackBars || 180), 120, 260);
  const horizonBars = clamp(Number(input.horizonBars || 6), 3, 24);

  return getCachedOrCompute(cacheKey('system', `concept-simulation:${market}:${timeframe}:${lookbackBars}:${horizonBars}`), async () => {
    const symbol = resolveStructureSymbol(market);
    const preferred = await fetchPreferredStructureCandles(market, symbol, timeframe);
    const warmupBars = 90;
    const requiredBars = lookbackBars + horizonBars + warmupBars;
    const candles = preferred.candles.slice(-Math.min(preferred.candles.length, requiredBars));

    if (candles.length < warmupBars + horizonBars + 20) {
      throw new Error(`Not enough candle history for concept simulation on ${market} ${timeframe}.`);
    }

    const conceptAggregates = new Map<string, ConceptAggregate>([
      ['major-structure', { key: 'major-structure', label: 'Major structure bias', samples: 0, wins: 0, forwardAtrSum: 0, mfeAtrSum: 0, maeAtrSum: 0, notes: new Set<string>() }],
      ['minor-structure', { key: 'minor-structure', label: 'Minor structure confirmation', samples: 0, wins: 0, forwardAtrSum: 0, mfeAtrSum: 0, maeAtrSum: 0, notes: new Set<string>() }],
      ['liquidity-sweep', { key: 'liquidity-sweep', label: 'Liquidity sweep response', samples: 0, wins: 0, forwardAtrSum: 0, mfeAtrSum: 0, maeAtrSum: 0, notes: new Set<string>() }],
      ['displacement', { key: 'displacement', label: 'Displacement follow-through', samples: 0, wins: 0, forwardAtrSum: 0, mfeAtrSum: 0, maeAtrSum: 0, notes: new Set<string>() }],
      ['premium-discount', { key: 'premium-discount', label: 'Premium/discount positioning', samples: 0, wins: 0, forwardAtrSum: 0, mfeAtrSum: 0, maeAtrSum: 0, notes: new Set<string>() }],
      ['continuation', { key: 'continuation', label: 'Continuation alignment', samples: 0, wins: 0, forwardAtrSum: 0, mfeAtrSum: 0, maeAtrSum: 0, notes: new Set<string>() }],
      ['reversal', { key: 'reversal', label: 'Reversal handoff', samples: 0, wins: 0, forwardAtrSum: 0, mfeAtrSum: 0, maeAtrSum: 0, notes: new Set<string>() }],
      ['regime-transition', { key: 'regime-transition', label: 'Regime-transition caution', samples: 0, wins: 0, forwardAtrSum: 0, mfeAtrSum: 0, maeAtrSum: 0, notes: new Set<string>() }],
    ]);

    const predictedRegimeStats = new Map<RegimeClass, { samples: number; matches: number }>([
      ['trend', { samples: 0, matches: 0 }],
      ['mean-reversion', { samples: 0, matches: 0 }],
      ['unstable-noise', { samples: 0, matches: 0 }],
    ]);
    const realizedRegimeStats = new Map<RegimeClass, number>([
      ['trend', 0],
      ['mean-reversion', 0],
      ['unstable-noise', 0],
    ]);

    let totalModelSamples = 0;
    let totalModelMatches = 0;

    for (let index = warmupBars; index < candles.length - horizonBars; index += 1) {
      const history = candles.slice(0, index + 1);
      const current = history[history.length - 1]!;
      const previousWindow = history.slice(-13, -1);
      const forward = candles.slice(index + 1, index + 1 + horizonBars);
      const atrValue = atr(history, 14);
      if (atrValue <= 0 || previousWindow.length < 8) continue;

      const regime = buildStructureRegime(history, {
        source: preferred.source,
        sourceLabel: preferred.sourceLabel,
        volumeClass: preferred.volumeClass,
      }, symbol);

      const phase = inferPhase(regime.primaryCode, regime.secondaryCode);
      const decision = buildModelSelectionDecision({
        market,
        phase,
        readiness: inferReadiness(regime.primaryCode),
        confidence: inferConfidence(regime.primaryCode, regime.adx, regime.volatilityState),
        macroReflexivity: inferMacroReflexivity(regime.secondaryCode),
        eventRisk: 'clear',
      });

      const realizedRegime = classifyRealizedRegime(current.close, forward, atrValue);
      totalModelSamples += 1;
      if (decision.regimeClass === realizedRegime) totalModelMatches += 1;
      predictedRegimeStats.get(decision.regimeClass)!.samples += 1;
      if (decision.regimeClass === realizedRegime) predictedRegimeStats.get(decision.regimeClass)!.matches += 1;
      realizedRegimeStats.set(realizedRegime, (realizedRegimeStats.get(realizedRegime) ?? 0) + 1);

      const averageRange = average(previousWindow.map((candle) => candle.high - candle.low));
      const averageVolume = average(previousWindow.map((candle) => candle.volume ?? 0).filter((value) => value > 0));
      const relativeVolume = averageVolume > 0 && (current.volume ?? 0) > 0 ? (current.volume ?? 0) / averageVolume : 1;
      const priorHigh = Math.max(...previousWindow.map((candle) => candle.high));
      const priorLow = Math.min(...previousWindow.map((candle) => candle.low));
      const shortRange = Math.max(regime.boxes.short.upper - regime.boxes.short.lower, current.close * 0.0001);
      const shortMid = regime.boxes.short.lower + shortRange / 2;
      const discount = current.close <= regime.boxes.short.lower + shortRange * 0.45;
      const premium = current.close >= regime.boxes.short.upper - shortRange * 0.45;
      const bullishSweep = current.low < priorLow && current.close > priorLow && bodyRatio(current) >= 0.25;
      const bearishSweep = current.high > priorHigh && current.close < priorHigh && bodyRatio(current) >= 0.25;
      const bullishDisplacement =
        current.high - current.low >= averageRange * 1.35
        && bodyRatio(current) >= 0.55
        && current.close >= current.low + (current.high - current.low) * 0.7
        && (averageVolume === 0 || relativeVolume >= 0.9);
      const bearishDisplacement =
        current.high - current.low >= averageRange * 1.35
        && bodyRatio(current) >= 0.55
        && current.close <= current.high - (current.high - current.low) * 0.7
        && (averageVolume === 0 || relativeVolume >= 0.9);
      const bullishBos = current.close > priorHigh && bullishDisplacement;
      const bearishBos = current.close < priorLow && bearishDisplacement;
      const majorBull = regime.emaAlignment === 'bullish' && (regime.primaryCode === 'TREND_UP' || regime.breakout.direction === 'up');
      const majorBear = regime.emaAlignment === 'bearish' && (regime.primaryCode === 'TREND_DOWN' || regime.breakout.direction === 'down');
      const continuationBull = majorBull && (discount || regime.rangePosition === 'middle') && (bullishBos || bullishDisplacement || current.close > shortMid);
      const continuationBear = majorBear && (premium || regime.rangePosition === 'middle') && (bearishBos || bearishDisplacement || current.close < shortMid);
      const reversalBull = (regime.primaryCode === 'TRANSITION' || regime.secondaryCode === 'TR_BOTTOM_FORMING') && (bullishSweep || bullishBos);
      const reversalBear = (regime.primaryCode === 'TRANSITION' || regime.secondaryCode === 'TR_TOP_FORMING') && (bearishSweep || bearishBos);
      const transitionCaution = regime.primaryCode === 'TRANSITION' || /EXHAUSTION/.test(regime.secondaryCode);

      if (majorBull) {
        recordConceptOutcome(
          conceptAggregates.get('major-structure')!,
          evaluateDirectionalSignal(current.close, forward, atrValue, 'bullish'),
          'Higher-timeframe bias stayed bullish enough for follow-through.',
        );
      } else if (majorBear) {
        recordConceptOutcome(
          conceptAggregates.get('major-structure')!,
          evaluateDirectionalSignal(current.close, forward, atrValue, 'bearish'),
          'Higher-timeframe bias stayed bearish enough for follow-through.',
        );
      }

      if (bullishBos) {
        recordConceptOutcome(
          conceptAggregates.get('minor-structure')!,
          evaluateDirectionalSignal(current.close, forward, atrValue, 'bullish'),
          'Minor structure confirmed with close-through and displacement.',
        );
      } else if (bearishBos) {
        recordConceptOutcome(
          conceptAggregates.get('minor-structure')!,
          evaluateDirectionalSignal(current.close, forward, atrValue, 'bearish'),
          'Minor structure confirmed with close-through and displacement.',
        );
      }

      if (bullishSweep) {
        recordConceptOutcome(
          conceptAggregates.get('liquidity-sweep')!,
          evaluateDirectionalSignal(current.close, forward, atrValue, 'bullish'),
          'Sweep reclaimed prior lows and asked for reversal follow-through.',
        );
      } else if (bearishSweep) {
        recordConceptOutcome(
          conceptAggregates.get('liquidity-sweep')!,
          evaluateDirectionalSignal(current.close, forward, atrValue, 'bearish'),
          'Sweep reclaimed prior highs and asked for reversal follow-through.',
        );
      }

      if (bullishDisplacement) {
        recordConceptOutcome(
          conceptAggregates.get('displacement')!,
          evaluateDirectionalSignal(current.close, forward, atrValue, 'bullish'),
          'Displacement was accepted and tested for continuation.',
        );
      } else if (bearishDisplacement) {
        recordConceptOutcome(
          conceptAggregates.get('displacement')!,
          evaluateDirectionalSignal(current.close, forward, atrValue, 'bearish'),
          'Displacement was accepted and tested for continuation.',
        );
      }

      if (discount && (majorBull || bullishSweep)) {
        recordConceptOutcome(
          conceptAggregates.get('premium-discount')!,
          evaluateDirectionalSignal(current.close, forward, atrValue, 'bullish'),
          'Discount location was only counted when it aligned with bullish structure or sweep recovery.',
        );
      } else if (premium && (majorBear || bearishSweep)) {
        recordConceptOutcome(
          conceptAggregates.get('premium-discount')!,
          evaluateDirectionalSignal(current.close, forward, atrValue, 'bearish'),
          'Premium location was only counted when it aligned with bearish structure or sweep recovery.',
        );
      }

      if (continuationBull) {
        recordConceptOutcome(
          conceptAggregates.get('continuation')!,
          evaluateDirectionalSignal(current.close, forward, atrValue, 'bullish'),
          'Continuation required major bias plus pullback or displacement confirmation.',
        );
      } else if (continuationBear) {
        recordConceptOutcome(
          conceptAggregates.get('continuation')!,
          evaluateDirectionalSignal(current.close, forward, atrValue, 'bearish'),
          'Continuation required major bias plus pullback or displacement confirmation.',
        );
      }

      if (reversalBull) {
        recordConceptOutcome(
          conceptAggregates.get('reversal')!,
          evaluateDirectionalSignal(current.close, forward, atrValue, 'bullish'),
          'Reversal handoff was counted only when transition and sweep/BOS logic agreed.',
        );
      } else if (reversalBear) {
        recordConceptOutcome(
          conceptAggregates.get('reversal')!,
          evaluateDirectionalSignal(current.close, forward, atrValue, 'bearish'),
          'Reversal handoff was counted only when transition and sweep/BOS logic agreed.',
        );
      }

      if (transitionCaution) {
        const noiseSuccess = realizedRegime === 'unstable-noise' || (Math.abs(forward[forward.length - 1]!.close - current.close) / atrValue <= 0.35);
        recordConceptOutcome(
          conceptAggregates.get('regime-transition')!,
          {
            success: noiseSuccess,
            forwardAtr: Number(((forward[forward.length - 1]!.close - current.close) / atrValue).toFixed(2)),
            mfeAtr: Number((((Math.max(...forward.map((candle) => candle.high)) - current.close)) / atrValue).toFixed(2)),
            maeAtr: Number((((current.close - Math.min(...forward.map((candle) => candle.low)))) / atrValue).toFixed(2)),
          },
          'Transition was scored as a caution concept rather than a directional setup.',
        );
      }
    }

    const conceptPerformance = [...conceptAggregates.values()]
      .map((aggregate) => {
        const successRate = aggregate.samples ? (aggregate.wins / aggregate.samples) * 100 : 0;
        const avgForwardAtr = aggregate.samples ? aggregate.forwardAtrSum / aggregate.samples : 0;
        const avgMfeAtr = aggregate.samples ? aggregate.mfeAtrSum / aggregate.samples : 0;
        const avgMaeAtr = aggregate.samples ? aggregate.maeAtrSum / aggregate.samples : 0;
        const assessment =
          aggregate.samples < 8
            ? 'thin'
            : successRate >= 62 && avgMfeAtr > avgMaeAtr
              ? 'stable'
              : successRate >= 48
                ? 'watch'
                : 'fragile';
        return {
          key: aggregate.key,
          label: aggregate.label,
          samples: aggregate.samples,
          successRate: Number(successRate.toFixed(1)),
          avgForwardAtr: Number(avgForwardAtr.toFixed(2)),
          avgMfeAtr: Number(avgMfeAtr.toFixed(2)),
          avgMaeAtr: Number(avgMaeAtr.toFixed(2)),
          assessment,
          notes: [...aggregate.notes],
        };
      })
      .sort((left, right) => right.samples - left.samples);

    const modelSelection = {
      overallMatchRate: totalModelSamples ? Number(((totalModelMatches / totalModelSamples) * 100).toFixed(1)) : 0,
      byPredictedRegime: [...predictedRegimeStats.entries()].map(([regimeClass, stats]) => ({
        regimeClass,
        samples: stats.samples,
        matchRate: stats.samples ? Number(((stats.matches / stats.samples) * 100).toFixed(1)) : 0,
      })),
      byRealizedRegime: [...realizedRegimeStats.entries()].map(([regimeClass, samples]) => ({
        regimeClass,
        samples,
      })),
      unstableFlags: [
        totalModelSamples < 24 ? 'Historical window is still small, so model-routing stability should be treated as directional evidence rather than full research proof.' : null,
        totalModelSamples > 0 && (totalModelMatches / totalModelSamples) < 0.52 ? 'Model selection is still noisy on this window and should stay as a routing aid, not certainty language.' : null,
        conceptPerformance.some((item) => item.assessment === 'fragile') ? 'At least one concept is fragile on the recent window, so the execution stack should lean harder on explainability and missing-conditions output.' : null,
      ].filter((item): item is string => Boolean(item)),
    };

    const stableConcepts = conceptPerformance.filter((item) => item.assessment === 'stable').map((item) => item.label);
    const fragileConcepts = conceptPerformance.filter((item) => item.assessment === 'fragile').map((item) => item.label);

    return {
      generatedAt: new Date().toISOString(),
      market,
      timeframe,
      summary: `${market} concept simulation replayed ${Math.max(0, candles.length - warmupBars - horizonBars)} recent decision points on ${timeframe}. Stable concepts: ${stableConcepts.slice(0, 3).join(', ') || 'none yet'}. Fragile concepts: ${fragileConcepts.slice(0, 3).join(', ') || 'none flagged'}.`,
      simulationWindow: {
        lookbackBars,
        horizonBars,
        barsAnalyzed: Math.max(0, candles.length - warmupBars - horizonBars),
        startedAt: candles[warmupBars]?.time ?? candles[0]?.time ?? null,
        endedAt: candles[candles.length - 1]?.time ?? null,
      },
      source: {
        provider: preferred.source,
        matchedSymbolId: preferred.matchedSymbolId,
        volumeClass: preferred.volumeClass,
        quality: preferred.quality,
        sourceLabel: preferred.sourceLabel,
        warnings: preferred.warnings,
      },
      conceptPerformance,
      modelSelection,
      blindspots: [
        'This hook replays price, volatility, and available participation data; it does not yet replay a full historical macro/news tape for every bar.',
        preferred.volumeClass !== 'exchange-volume'
          ? `Volume context is ${preferred.volumeClass}, so orderflow-style readings stay proxy-aware rather than true centralized tape.`
          : 'Volume context is exchange-backed on this replay window.',
        'Image-heavy PDFs improved the ontology and rulebooks, but some CHOCH / OB / FVG nuance still depends on operational heuristics rather than perfect document extraction.',
      ],
      retrieval: retrieveKnowledge({
        market,
        question: `${market} simulation backtest validation checklist model selection`,
        topN: 6,
      }),
    };
  }, 300);
}
