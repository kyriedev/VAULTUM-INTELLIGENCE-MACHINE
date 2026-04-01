import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { analyzeWeightedVolumePivots } from '../../_shared/weighted-volume-pivots';
import { fetchPreferredStructureCandles, resolveStructureSymbol } from '../../pivots/v1/_structure';

export async function getProfile(input: { market: string; timeframe?: string }): Promise<any> {
  const market = (input.market || 'XAUUSD').toUpperCase();
  const timeframe = input.timeframe || '1d';
  const symbol = resolveStructureSymbol(market);

  return getCachedOrCompute(cacheKey('volume', `${market}:${timeframe}`), async () => {
    try {
      const preferred = await fetchPreferredStructureCandles(market, symbol, timeframe);
      const candles = preferred.candles.filter((candle) =>
        Number.isFinite(candle.open)
        && Number.isFinite(candle.high)
        && Number.isFinite(candle.low)
        && Number.isFinite(candle.close));
      if (candles.length < 20) throw new Error('No volume candles available');

      const weighted = analyzeWeightedVolumePivots(candles, timeframe);
      if (!weighted.sourceHasUsableVolume) {
        throw new Error('Volume profile requires usable volume, and the active feed does not provide enough of it.');
      }

      return {
        market,
        symbol,
        timeframe,
        mode: preferred.source === 'oanda' ? 'proxy' : /=X$/.test(symbol) ? 'estimated' : 'volume-backed',
        sourceLabel: preferred.source === 'oanda'
          ? 'Recent-weighted volume profile is built from OANDA broker activity for supported symbols. This is broker-volume context, not centralized exchange volume.'
          : 'Recent-weighted volume profile is built from live traded candles and only runs when usable volume is present.',
        poc: weighted.poc,
        valueAreaHigh: weighted.valueAreaHigh,
        valueAreaLow: weighted.valueAreaLow,
        highVolumeNodes: weighted.nodes.slice(0, 3).map((node) => node.price),
        lowVolumeNodes: [...weighted.nodes].slice(-3).map((node) => node.price),
        pocDistance: weighted.poc != null ? Number((weighted.price - weighted.poc).toFixed(2)) : null,
        valueAreaPosition:
          weighted.valueAreaHigh != null && weighted.price > weighted.valueAreaHigh
            ? 'above-value'
            : weighted.valueAreaLow != null && weighted.price < weighted.valueAreaLow
              ? 'below-value'
              : 'inside-value',
        dominantBias: weighted.dominantBias,
        nodes: weighted.nodes,
        alerts: weighted.alerts,
        settings: weighted.settings,
        volumeBacked: true,
      };
    } catch (error) {
      return {
        market,
        symbol,
        timeframe,
        mode: 'estimated',
        sourceLabel: 'Volume profile unavailable; weighted volume profile requires usable volume from the active feed.',
        poc: null,
        valueAreaHigh: null,
        valueAreaLow: null,
        highVolumeNodes: [],
        lowVolumeNodes: [],
        pocDistance: null,
        valueAreaPosition: 'unknown',
        dominantBias: 'balanced',
        nodes: [],
        alerts: [],
        settings: {
          mode: 'pivots',
          analyzeBars: 0,
          rowCount: 0,
          swingLength: 0,
          keepPoc: true,
          showPreviousSessions: false,
          volumeWeighting: 'recent',
        },
        volumeBacked: false,
        unavailable: true,
        error: error instanceof Error ? error.message : 'Unknown volume profile error',
      };
    }
  }, 600);
}
