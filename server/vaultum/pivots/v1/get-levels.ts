import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { analyzeWeightedVolumePivots } from '../../_shared/weighted-volume-pivots';
import { buildStructureRegime, fetchPreferredStructureCandles, resolveStructureSymbol, type Candle } from './_structure';

function computeClassicPivot(candles: Candle[]): {
  pivot: number;
  supports: number[];
  resistances: number[];
  price: number;
  pivotDistance: number;
  structure: string;
} {
  const reference = candles[candles.length - 2] ?? candles[candles.length - 1];
  const price = candles[candles.length - 1]?.close ?? reference.close;
  const pivot = Number((((reference.high + reference.low + reference.close) / 3)).toFixed(2));
  const r1 = Number((2 * pivot - reference.low).toFixed(2));
  const s1 = Number((2 * pivot - reference.high).toFixed(2));
  const r2 = Number((pivot + (reference.high - reference.low)).toFixed(2));
  const s2 = Number((pivot - (reference.high - reference.low)).toFixed(2));

  return {
    pivot,
    supports: [s1, s2],
    resistances: [r1, r2],
    price,
    pivotDistance: Number((price - pivot).toFixed(2)),
    structure: price > pivot ? 'above-pivot' : price < pivot ? 'below-pivot' : 'at-pivot',
  };
}

export async function getLevels(input: { market: string; timeframe?: string }): Promise<any> {
  const market = (input.market || 'XAUUSD').toUpperCase();
  const timeframe = input.timeframe || '1d';
  const symbol = resolveStructureSymbol(market);

  return getCachedOrCompute(cacheKey('pivots', `${market}:${timeframe}`), async () => {
    try {
      const preferred = await fetchPreferredStructureCandles(market, symbol, timeframe);
      const candles = preferred.candles.filter((candle) =>
        Number.isFinite(candle.open)
        && Number.isFinite(candle.high)
        && Number.isFinite(candle.low)
        && Number.isFinite(candle.close));
      if (candles.length < 20) throw new Error('No OHLC available');

      const classic = computeClassicPivot(candles);
      const regime = buildStructureRegime(candles, preferred, symbol);
      const weighted = analyzeWeightedVolumePivots(candles, timeframe);
      if (!weighted.sourceHasUsableVolume) {
        throw new Error('Weighted volume pivots require usable volume and the active feed does not provide enough of it.');
      }

      const mappedSupport = weighted.mappedSupport;
      const mappedResistance = weighted.mappedResistance;
      const sourceLabel = `${preferred.sourceLabel} Weighted volume pivots use recent weighting with ATR-adaptive rows so the map behaves more like a live orderflow profile than a static pivot table.`;

      return {
        market,
        symbol,
        timeframe,
        matchedSourceSymbol: preferred.matchedSymbolId,
        volumeClass: preferred.volumeClass,
        mode: preferred.mode,
        feedQuality: preferred.quality,
        pivot: classic.pivot,
        supports: classic.supports,
        resistances: classic.resistances,
        price: classic.price,
        pivotDistance: classic.pivotDistance,
        structure: classic.structure,
        sourceLabel,
        dynamicLevel: weighted.poc,
        dynamicState: weighted.poc == null
          ? 'poc unavailable'
          : classic.price > weighted.poc
            ? 'above POC'
            : classic.price < weighted.poc
              ? 'below POC'
              : 'at POC',
        confluenceSummary: weighted.confluenceSummary,
        mappedSupport,
        mappedResistance,
        signalMap: weighted.signalMap,
        institutionalLevels: weighted.nodes,
        boxes: regime.boxes,
        regime,
        pocLine: weighted.poc != null ? { price: weighted.poc, keepPast: true } : null,
        dominantVolumeBias: weighted.dominantBias,
        valueAreaHigh: weighted.valueAreaHigh,
        valueAreaLow: weighted.valueAreaLow,
        analysisSettings: weighted.settings,
        alerts: weighted.alerts,
        volumeRequired: true,
        volumeBacked: true,
        providerTrace: preferred.providerTrace,
        warnings: preferred.warnings,
      };
    } catch (error) {
      return {
        market,
        symbol,
        timeframe,
        matchedSourceSymbol: null,
        volumeClass: 'estimated-volume',
        mode: 'estimated',
        feedQuality: 'weak',
        pivot: null,
        supports: [],
        resistances: [],
        price: null,
        pivotDistance: null,
        structure: 'unknown',
        sourceLabel: 'Weighted volume profile pivots unavailable.',
        dynamicLevel: null,
        dynamicState: 'unknown',
        confluenceSummary: 'Weighted volume pivot map unavailable.',
        mappedSupport: null,
        mappedResistance: null,
        signalMap: {
          buySignal: false,
          sellSignal: false,
          bullSweep: false,
          bearSweep: false,
          bias: 'weighted volume pivots unavailable',
          referenceLevel: null,
          referenceRole: null,
          entrySide: 'neutral',
          exitSignal: false,
          reentrySignal: false,
          concentrationPct: null,
        },
        institutionalLevels: [],
        boxes: {
          short: { upper: null, lower: null },
          mid: { upper: null, lower: null },
          long: { upper: null, lower: null },
        },
        regime: {
          sourceLabel: 'Structure regime unavailable.',
          emaAlignment: 'mixed',
          regimeLevel: 'standard',
          primaryCode: 'TRANSITION',
          primaryLabel: 'Transition',
          secondaryCode: 'TR_TOP_FORMING',
          secondaryLabel: 'Top Forming',
          adx: 0,
          atr14: 0,
          atrPct: 0,
          bollWidthPct: 0,
          rsi14: 50,
          macdHistogram: 0,
          volatilityState: 'normal',
          rangePosition: 'middle',
          breakout: { level: 'none', direction: 'none', state: 'inside', guidance: 'neutral' },
          boxes: {
            short: { upper: 0, lower: 0 },
            mid: { upper: 0, lower: 0 },
            long: { upper: 0, lower: 0 },
          },
          summary: 'Structure regime unavailable.',
        },
        pocLine: null,
        dominantVolumeBias: 'balanced',
        valueAreaHigh: null,
        valueAreaLow: null,
        analysisSettings: {
          mode: 'pivots',
          analyzeBars: 0,
          rowCount: 0,
          swingLength: 0,
          keepPoc: true,
          showPreviousSessions: false,
          volumeWeighting: 'recent',
          rowHeightModel: 'atr-adaptive',
        },
        alerts: [],
        volumeRequired: true,
        volumeBacked: false,
        providerTrace: [],
        warnings: [],
        unavailable: true,
        error: error instanceof Error ? error.message : 'Unknown pivot error',
      };
    }
  }, 600);
}
