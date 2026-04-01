export type VolumeCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type WeightedVolumePivotSettings = {
  mode: 'pivots';
  analyzeBars: number;
  rowCount: number;
  swingLength: number;
  keepPoc: true;
  showPreviousSessions: false;
  volumeWeighting: 'recent';
};

export type WeightedVolumeNode = {
  price: number;
  top: number;
  bottom: number;
  totalVolume: number;
  buyersVolume: number;
  sellersVolume: number;
  buyersPct: number;
  sellersPct: number;
  concentrationPct: number;
  dominantSide: 'buyers' | 'sellers' | 'balanced';
  role: 'support' | 'resistance' | 'balance';
  touches: number;
  power: number;
  volumeScore: number;
  barsSinceLastHit: number;
  isPoc: boolean;
};

export type WeightedVolumePivotAnalysis = {
  settings: WeightedVolumePivotSettings;
  sourceHasUsableVolume: boolean;
  price: number;
  top: number;
  bottom: number;
  rowSize: number;
  poc: number | null;
  valueAreaHigh: number | null;
  valueAreaLow: number | null;
  dominantBias: 'buyers' | 'sellers' | 'balanced';
  mappedSupport: WeightedVolumeNode | null;
  mappedResistance: WeightedVolumeNode | null;
  nodes: WeightedVolumeNode[];
  signalMap: {
    buySignal: boolean;
    sellSignal: boolean;
    bullSweep: boolean;
    bearSweep: boolean;
    bias: string;
    referenceLevel: number | null;
    referenceRole: 'support' | 'resistance' | 'balance' | null;
    entrySide: 'long' | 'short' | 'neutral';
    exitSignal: boolean;
    reentrySignal: boolean;
    concentrationPct: number | null;
  };
  alerts: string[];
  confluenceSummary: string;
};

const WEIGHT_IMPACT = 0.85;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function rowRole(price: number, currentPrice: number, rowSize: number): 'support' | 'resistance' | 'balance' {
  const balanceThreshold = rowSize * 0.75;
  if (Math.abs(price - currentPrice) <= balanceThreshold) return 'balance';
  return price < currentPrice ? 'support' : 'resistance';
}

function simpleAtr(candles: VolumeCandle[], period = 14): number {
  if (candles.length <= 1) return 0;
  const trs: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index]!;
    const previous = candles[index - 1]!;
    trs.push(Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    ));
  }
  return average(trs.slice(-period));
}

function recentWeight(volume: number, ageFromLatest: number): number {
  return ((volume * WEIGHT_IMPACT) / (ageFromLatest + 1)) + (volume * (1 - WEIGHT_IMPACT));
}

function intersects(candle: VolumeCandle, top: number, bottom: number): boolean {
  return !(candle.low > top || candle.high < bottom);
}

function resolveSettings(timeframe: string): WeightedVolumePivotSettings {
  const value = timeframe.toLowerCase();
  if (value === '15m') return { mode: 'pivots', analyzeBars: 160, rowCount: 24, swingLength: 5, keepPoc: true, showPreviousSessions: false, volumeWeighting: 'recent' };
  if (value === '30m') return { mode: 'pivots', analyzeBars: 180, rowCount: 28, swingLength: 6, keepPoc: true, showPreviousSessions: false, volumeWeighting: 'recent' };
  if (value === '4h') return { mode: 'pivots', analyzeBars: 260, rowCount: 36, swingLength: 12, keepPoc: true, showPreviousSessions: false, volumeWeighting: 'recent' };
  if (value === '1d') return { mode: 'pivots', analyzeBars: 320, rowCount: 42, swingLength: 18, keepPoc: true, showPreviousSessions: false, volumeWeighting: 'recent' };
  return { mode: 'pivots', analyzeBars: 220, rowCount: 30, swingLength: 8, keepPoc: true, showPreviousSessions: false, volumeWeighting: 'recent' };
}

type PivotPoint = { index: number; price: number };

function detectSwingPivots(candles: VolumeCandle[], swingLength: number): { highs: PivotPoint[]; lows: PivotPoint[] } {
  const highs: PivotPoint[] = [];
  const lows: PivotPoint[] = [];
  for (let index = swingLength; index < candles.length - swingLength; index += 1) {
    const candle = candles[index]!;
    let isHigh = true;
    let isLow = true;
    for (let offset = 1; offset <= swingLength; offset += 1) {
      const left = candles[index - offset]!;
      const right = candles[index + offset]!;
      if (candle.high <= left.high || candle.high <= right.high) isHigh = false;
      if (candle.low >= left.low || candle.low >= right.low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) highs.push({ index, price: candle.high });
    if (isLow) lows.push({ index, price: candle.low });
  }
  return { highs, lows };
}

function resolveProfileRange(candles: VolumeCandle[], settings: WeightedVolumePivotSettings): { top: number; bottom: number } {
  const scanWindow = candles.slice(-Math.min(candles.length, settings.analyzeBars + settings.swingLength * 4));
  const pivots = detectSwingPivots(scanWindow, settings.swingLength);
  const recentHigh = pivots.highs[pivots.highs.length - 1]?.price ?? Math.max(...scanWindow.map((candle) => candle.high));
  const recentLow = pivots.lows[pivots.lows.length - 1]?.price ?? Math.min(...scanWindow.map((candle) => candle.low));
  const fallbackHigh = Math.max(...scanWindow.map((candle) => candle.high));
  const fallbackLow = Math.min(...scanWindow.map((candle) => candle.low));
  const top = Math.max(recentHigh, fallbackHigh);
  const bottom = Math.min(recentLow, fallbackLow);
  return top > bottom ? { top, bottom } : { top: fallbackHigh, bottom: fallbackLow };
}

function chooseSupport(nodes: WeightedVolumeNode[], price: number): WeightedVolumeNode | null {
  return [...nodes]
    .filter((node) => node.price <= price && node.role !== 'resistance')
    .sort((left, right) =>
      ((right.buyersPct >= 70 ? 1 : 0) - (left.buyersPct >= 70 ? 1 : 0))
      || (right.buyersPct - left.buyersPct)
      || (right.volumeScore - left.volumeScore)
      || (right.price - left.price))
    [0] ?? null;
}

function chooseResistance(nodes: WeightedVolumeNode[], price: number): WeightedVolumeNode | null {
  return [...nodes]
    .filter((node) => node.price >= price && node.role !== 'support')
    .sort((left, right) =>
      ((right.sellersPct >= 70 ? 1 : 0) - (left.sellersPct >= 70 ? 1 : 0))
      || (right.sellersPct - left.sellersPct)
      || (right.volumeScore - left.volumeScore)
      || (left.price - right.price))
    [0] ?? null;
}

function nearLevel(price: number, node: WeightedVolumeNode | null, tolerance: number): boolean {
  return Boolean(node && Math.abs(price - node.price) <= tolerance);
}

export function analyzeWeightedVolumePivots(
  candles: VolumeCandle[],
  timeframe: string,
): WeightedVolumePivotAnalysis {
  const settings = resolveSettings(timeframe);
  const currentPrice = candles[candles.length - 1]?.close ?? 0;
  const volumeSeries = candles.map((candle) => candle.volume ?? 0);
  const usableVolumeBars = volumeSeries.filter((volume) => volume > 0).length;
  const sourceHasUsableVolume = usableVolumeBars >= Math.max(12, Math.floor(settings.analyzeBars * 0.25));

  if (!candles.length || !sourceHasUsableVolume) {
    return {
      settings,
      sourceHasUsableVolume: false,
      price: currentPrice,
      top: currentPrice,
      bottom: currentPrice,
      rowSize: 0,
      poc: null,
      valueAreaHigh: null,
      valueAreaLow: null,
      dominantBias: 'balanced',
      mappedSupport: null,
      mappedResistance: null,
      nodes: [],
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
      alerts: ['Weighted volume pivot map is unavailable because the active feed does not provide enough usable volume bars.'],
      confluenceSummary: 'Weighted volume pivot map unavailable due to missing or unusable volume.',
    };
  }

  const recent = candles.slice(-Math.min(settings.analyzeBars, candles.length));
  const globalStartIndex = candles.length - recent.length;
  const { top, bottom } = resolveProfileRange(candles, settings);
  const rowSize = Math.max((top - bottom) / settings.rowCount, Number.EPSILON);
  const rows = Array.from({ length: settings.rowCount }, (_, index) => ({
    top: top - (rowSize * index),
    bottom: top - (rowSize * (index + 1)),
    totalVolume: 0,
    buyersVolume: 0,
    sellersVolume: 0,
    touches: 0,
    lastHitIndex: globalStartIndex,
  }));

  recent.forEach((candle, index) => {
    const rawVolume = candle.volume ?? 0;
    if (rawVolume <= 0) return;
    const ageFromLatest = recent.length - 1 - index;
    const weightedVolume = recentWeight(rawVolume, ageFromLatest);
    rows.forEach((row) => {
      if (!intersects(candle, row.top, row.bottom)) return;
      row.totalVolume += weightedVolume;
      if (candle.close >= candle.open) row.buyersVolume += weightedVolume;
      else row.sellersVolume += weightedVolume;
      row.touches += 1;
      row.lastHitIndex = globalStartIndex + index;
    });
  });

  const maxVolume = Math.max(...rows.map((row) => row.totalVolume), 0);
  const pocRowIndex = rows.findIndex((row) => row.totalVolume === maxVolume);
  const pocRow = pocRowIndex >= 0 ? rows[pocRowIndex] : null;
  const activeRows = rows
    .map((row, index) => {
      const price = (row.top + row.bottom) / 2;
      const buyersPct = row.totalVolume > 0 ? (row.buyersVolume / row.totalVolume) * 100 : 50;
      const sellersPct = row.totalVolume > 0 ? (row.sellersVolume / row.totalVolume) * 100 : 50;
      const concentrationPct = Math.max(buyersPct, sellersPct);
      const dominantSide = buyersPct > sellersPct + 4 ? 'buyers' : sellersPct > buyersPct + 4 ? 'sellers' : 'balanced';
      const volumeScore = maxVolume > 0 ? row.totalVolume / maxVolume : 0;
      const power = (volumeScore * 6) + (concentrationPct / 25) + (Math.min(row.touches, 10) * 0.2);
      return {
        price: round(price),
        top: round(row.top),
        bottom: round(row.bottom),
        totalVolume: round(row.totalVolume, 0),
        buyersVolume: round(row.buyersVolume, 0),
        sellersVolume: round(row.sellersVolume, 0),
        buyersPct: round(buyersPct, 1),
        sellersPct: round(sellersPct, 1),
        concentrationPct: round(concentrationPct, 1),
        dominantSide,
        role: rowRole(price, currentPrice, rowSize),
        touches: row.touches,
        power: round(power, 2),
        volumeScore: round(volumeScore, 3),
        barsSinceLastHit: (candles.length - 1) - row.lastHitIndex,
        isPoc: index === pocRowIndex,
      } satisfies WeightedVolumeNode;
    })
    .filter((node) => node.totalVolume > 0)
    .sort((left, right) => (right.volumeScore - left.volumeScore) || (right.concentrationPct - left.concentrationPct))
    .slice(0, Math.min(settings.rowCount, 14));

  const mappedSupport = chooseSupport(activeRows, currentPrice);
  const mappedResistance = chooseResistance(activeRows, currentPrice);
  const poc = pocRow ? round((pocRow.top + pocRow.bottom) / 2) : null;

  const valueAreaRows = [...activeRows].sort((left, right) => right.totalVolume - left.totalVolume);
  const totalVolume = valueAreaRows.reduce((sum, row) => sum + row.totalVolume, 0);
  let accumulatedVolume = 0;
  const acceptedRows: WeightedVolumeNode[] = [];
  valueAreaRows.forEach((row) => {
    if (!totalVolume) return;
    if (accumulatedVolume / totalVolume >= 0.7) return;
    acceptedRows.push(row);
    accumulatedVolume += row.totalVolume;
  });
  const valueAreaHigh = acceptedRows.length ? Math.max(...acceptedRows.map((row) => row.top)) : null;
  const valueAreaLow = acceptedRows.length ? Math.min(...acceptedRows.map((row) => row.bottom)) : null;

  const dominantBias = !mappedSupport && !mappedResistance
    ? 'balanced'
    : (mappedSupport?.buyersPct ?? 0) > (mappedResistance?.sellersPct ?? 0) + 6
      ? 'buyers'
      : (mappedResistance?.sellersPct ?? 0) > (mappedSupport?.buyersPct ?? 0) + 6
        ? 'sellers'
        : 'balanced';

  const latest = candles[candles.length - 1]!;
  const atr = simpleAtr(candles);
  const tolerance = Math.max(rowSize * 1.2, atr * 0.25, currentPrice * 0.0012);
  const buySignal = Boolean(mappedSupport && mappedSupport.buyersPct >= 70 && nearLevel(currentPrice, mappedSupport, tolerance) && latest.close >= mappedSupport.price && latest.close >= latest.open);
  const sellSignal = Boolean(mappedResistance && mappedResistance.sellersPct >= 70 && nearLevel(currentPrice, mappedResistance, tolerance) && latest.close <= mappedResistance.price && latest.close <= latest.open);
  const bullSweep = Boolean(mappedSupport && mappedSupport.buyersPct >= 70 && latest.low < mappedSupport.bottom && latest.close > mappedSupport.price);
  const bearSweep = Boolean(mappedResistance && mappedResistance.sellersPct >= 70 && latest.high > mappedResistance.top && latest.close < mappedResistance.price);
  const exitSignal = Boolean(mappedResistance && mappedResistance.sellersPct >= 70 && nearLevel(currentPrice, mappedResistance, tolerance))
    || Boolean(mappedSupport && mappedSupport.buyersPct >= 70 && nearLevel(currentPrice, mappedSupport, tolerance) && dominantBias === 'sellers');
  const reentrySignal = Boolean(poc != null && mappedSupport && mappedSupport.buyersPct >= 70 && currentPrice > poc && nearLevel(currentPrice, mappedSupport, tolerance * 1.35))
    || Boolean(poc != null && mappedResistance && mappedResistance.sellersPct >= 70 && currentPrice < poc && nearLevel(currentPrice, mappedResistance, tolerance * 1.35));

  const bias = buySignal
    ? `buyer concentration ${mappedSupport?.buyersPct ?? 'n/a'}% at ${mappedSupport?.price.toFixed(2)}`
    : sellSignal
      ? `seller concentration ${mappedResistance?.sellersPct ?? 'n/a'}% at ${mappedResistance?.price.toFixed(2)}`
      : bullSweep
        ? `bullish sweep through buyer concentration ${mappedSupport?.buyersPct ?? 'n/a'}%`
        : bearSweep
          ? `bearish sweep through seller concentration ${mappedResistance?.sellersPct ?? 'n/a'}%`
          : dominantBias === 'buyers'
            ? `buyers dominate the weighted pivot stack (${mappedSupport?.buyersPct ?? 'n/a'}%)`
            : dominantBias === 'sellers'
              ? `sellers dominate the weighted pivot stack (${mappedResistance?.sellersPct ?? 'n/a'}%)`
              : 'weighted pivot stack is balanced';

  const alerts = [
    buySignal && mappedSupport ? `Buyer concentration ${mappedSupport.buyersPct}% is active near ${mappedSupport.price.toFixed(2)} for sharp long-entry watch.` : null,
    sellSignal && mappedResistance ? `Seller concentration ${mappedResistance.sellersPct}% is active near ${mappedResistance.price.toFixed(2)} for sharp short-entry watch.` : null,
    exitSignal && mappedResistance ? `Seller concentration ${mappedResistance.sellersPct}% near ${mappedResistance.price.toFixed(2)} is a trim / exit watch for longs.` : null,
    exitSignal && mappedSupport && dominantBias === 'sellers' ? `Buyer node ${mappedSupport.price.toFixed(2)} is losing control, so existing longs need tighter defense.` : null,
    reentrySignal && mappedSupport ? `Re-entry watch sits near buyer node ${mappedSupport.price.toFixed(2)} with POC ${poc != null ? poc.toFixed(2) : 'n/a'} acting as balance.` : null,
    reentrySignal && mappedResistance && currentPrice < (poc ?? currentPrice) ? `Re-entry watch sits near seller node ${mappedResistance.price.toFixed(2)} with POC ${poc != null ? poc.toFixed(2) : 'n/a'} as balance.` : null,
  ].filter((item): item is string => Boolean(item));

  const confluenceSummary = mappedSupport && mappedResistance
    ? `Weighted volume pivots frame ${mappedSupport.price.toFixed(2)} support with ${mappedSupport.buyersPct}% buyers against ${mappedResistance.price.toFixed(2)} resistance with ${mappedResistance.sellersPct}% sellers, with POC at ${poc != null ? poc.toFixed(2) : 'n/a'}.`
    : poc != null
      ? `Weighted volume pivots center around POC ${poc.toFixed(2)} with ${dominantBias} concentration bias.`
      : 'Weighted volume pivots found no actionable concentration cluster.';

  return {
    settings,
    sourceHasUsableVolume: true,
    price: round(currentPrice),
    top: round(top),
    bottom: round(bottom),
    rowSize: round(rowSize, 4),
    poc,
    valueAreaHigh: valueAreaHigh != null ? round(valueAreaHigh) : null,
    valueAreaLow: valueAreaLow != null ? round(valueAreaLow) : null,
    dominantBias,
    mappedSupport,
    mappedResistance,
    nodes: activeRows,
    signalMap: {
      buySignal,
      sellSignal,
      bullSweep,
      bearSweep,
      bias,
      referenceLevel: buySignal || bullSweep ? mappedSupport?.price ?? null : mappedResistance?.price ?? null,
      referenceRole: buySignal || bullSweep ? mappedSupport?.role ?? null : mappedResistance?.role ?? null,
      entrySide: buySignal ? 'long' : sellSignal ? 'short' : 'neutral',
      exitSignal,
      reentrySignal,
      concentrationPct: buySignal || bullSweep
        ? mappedSupport?.buyersPct ?? null
        : sellSignal || bearSweep
          ? mappedResistance?.sellersPct ?? null
          : dominantBias === 'buyers'
            ? mappedSupport?.buyersPct ?? null
            : mappedResistance?.sellersPct ?? null,
    },
    alerts,
    confluenceSummary,
  };
}
