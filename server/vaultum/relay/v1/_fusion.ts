import type {
  BinanceSymbolSnapshot,
  MacroIndicatorPoint,
  RelayLiquiditySnapshot,
  RelayMacroSnapshot,
  RelayOrderflowSnapshot,
  RelayProviderStatus,
  RelayUnifiedPoint,
  TradingViewUnofficialSnapshot,
} from './_types.ts';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function weightedAverage(entries: Array<{ value: number; weight: number }>): number | null {
  const usable = entries.filter((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0);
  if (!usable.length) return null;
  const totalWeight = usable.reduce((sum, entry) => sum + entry.weight, 0);
  if (!totalWeight) return null;
  return usable.reduce((sum, entry) => sum + (entry.value * entry.weight), 0) / totalWeight;
}

function latestValue(point?: MacroIndicatorPoint | null): number | null {
  return point?.value ?? null;
}

function changeValue(point?: MacroIndicatorPoint | null): number {
  return point?.change ?? 0;
}

function sum(values: Array<number | null | undefined>): number {
  return values.reduce<number>((total, value) => total + (Number.isFinite(value) ? Number(value) : 0), 0);
}

function aggregatePoint(asset: string, normalized: RelayUnifiedPoint[]): RelayUnifiedPoint {
  const volume = sum(normalized.map((point) => point.volume));
  const buyVolume = sum(normalized.map((point) => point.buy_volume));
  const sellVolume = sum(normalized.map((point) => point.sell_volume));
  const weightedPrice = weightedAverage(normalized.flatMap((point) => {
    if (point.price == null) return [];
    return [{ value: point.price, weight: Math.max(point.volume ?? 1, 1) }];
  }));

  return {
    timestamp: normalized[0]?.timestamp ?? new Date().toISOString(),
    asset,
    price: weightedPrice != null ? Number(weightedPrice.toFixed(6)) : null,
    volume: Number(volume.toFixed(4)),
    buy_volume: Number(buyVolume.toFixed(4)),
    sell_volume: Number(sellVolume.toFixed(4)),
    source: 'relay-fusion',
  };
}

function directionalBias(volumeDelta: number, liquidityImbalance: number): RelayOrderflowSnapshot['directionalBias'] {
  if (volumeDelta > 0 && liquidityImbalance > 4) return 'buyers-dominant';
  if (volumeDelta < 0 && liquidityImbalance < -4) return 'sellers-dominant';
  return 'balanced';
}

function normalizeScore(value: number, divisor: number, bonus = 0): number {
  return clamp((value / divisor) + bonus, -100, 100);
}

function macroDirectionScore(macro: RelayMacroSnapshot): { score: number; summary: string } {
  const dgs2 = latestValue(macro.indicators.fred.DGS2);
  const dgs10 = latestValue(macro.indicators.fred.DGS10);
  const dfii10 = latestValue(macro.indicators.fred.DFII10);
  const usGrowth = latestValue(macro.indicators.worldBank['US:NY.GDP.MKTP.KD.ZG']) ?? latestValue(macro.indicators.imf['US:NGDP_RPCH']);
  const cnGrowth = latestValue(macro.indicators.worldBank['CN:NY.GDP.MKTP.KD.ZG']) ?? latestValue(macro.indicators.imf['CN:NGDP_RPCH']);
  const jpInflation = latestValue(macro.indicators.worldBank['JP:FP.CPI.TOTL.ZG']) ?? latestValue(macro.indicators.imf['JP:PCPIPCH']);

  let score = 0;
  if (dgs2 != null) score -= clamp((dgs2 - 3) * 8, -25, 25);
  if (dgs10 != null) score -= clamp((dgs10 - 3.75) * 6, -20, 20);
  if (dfii10 != null) score -= clamp((dfii10 - 1.5) * 7, -20, 20);
  if (usGrowth != null) score += clamp((usGrowth - 2) * 4, -20, 20);
  if (cnGrowth != null) score += clamp((cnGrowth - 4) * 3, -15, 15);
  if (jpInflation != null) score -= clamp((jpInflation - 2) * 2, -10, 10);

  score += clamp(changeValue(macro.indicators.fred.DGS2) * -25, -8, 8);
  score += clamp(changeValue(macro.indicators.fred.DGS10) * -20, -8, 8);
  score += clamp(changeValue(macro.indicators.fred.DFII10) * -15, -6, 6);

  const optionalPenalty = sum(Object.values(macro.indicators.optional).map((point) =>
    point.value != null ? clamp(point.value / 25, 0, 8) : 0));
  score -= optionalPenalty;

  const summaryParts = [
    dgs2 != null ? `US2Y ${dgs2.toFixed(2)}` : null,
    dgs10 != null ? `US10Y ${dgs10.toFixed(2)}` : null,
    dfii10 != null ? `real-yield ${dfii10.toFixed(2)}` : null,
    usGrowth != null ? `US growth ${usGrowth.toFixed(2)}` : null,
    cnGrowth != null ? `China growth ${cnGrowth.toFixed(2)}` : null,
  ].filter(Boolean);

  return {
    score: clamp(score, -100, 100),
    summary: summaryParts.length
      ? `Macro backdrop leans ${score >= 12 ? 'supportive' : score <= -12 ? 'restrictive' : 'mixed'} with ${summaryParts.join(', ')}.`
      : 'Macro backdrop is mixed because the relay has only partial macro coverage right now.',
  };
}

function technicalBias(snapshot: TradingViewUnofficialSnapshot | null): number {
  if (!snapshot) return 0;
  if (snapshot.recommendation === 'strong-buy') return 16;
  if (snapshot.recommendation === 'buy') return 8;
  if (snapshot.recommendation === 'strong-sell') return -16;
  if (snapshot.recommendation === 'sell') return -8;
  return 0;
}

export function buildOrderflowSnapshot(
  requestedAsset: string,
  proxySymbols: string[],
  symbolSnapshots: BinanceSymbolSnapshot[],
  cacheState: RelayOrderflowSnapshot['cacheState'],
  stale: boolean,
  warnings: string[],
): RelayOrderflowSnapshot {
  const normalized = symbolSnapshots.flatMap((snapshot) => snapshot.records);
  const aggregate = aggregatePoint(requestedAsset, normalized);
  const volumeDelta = sum(normalized.map((point) => (point.buy_volume ?? 0) - (point.sell_volume ?? 0)));
  const liquidityImbalance = weightedAverage(symbolSnapshots.map((snapshot) => ({
    value: snapshot.liquidityImbalance,
    weight: Math.max(snapshot.volume, 1),
  }))) ?? 0;
  const providers = Object.fromEntries(symbolSnapshots.map((snapshot) => [
    snapshot.symbol,
    snapshot.provider,
  ]));
  const providerWarnings = symbolSnapshots
    .filter((snapshot) => snapshot.provider.state !== 'live')
    .map((snapshot) => `${snapshot.symbol} is running in ${snapshot.provider.state} mode.`);

  return {
    requestedAsset,
    proxySymbols,
    timestamp: aggregate.timestamp,
    aggregate,
    normalized,
    cacheState,
    stale,
    price: aggregate.price,
    tradeCount: symbolSnapshots.reduce((sum, snapshot) => sum + snapshot.tradeCount, 0),
    volumeDelta: Number(volumeDelta.toFixed(4)),
    liquidityImbalance: Number(liquidityImbalance.toFixed(2)),
    directionalBias: directionalBias(volumeDelta, liquidityImbalance),
    bidNotional: Number(symbolSnapshots.reduce((sum, snapshot) => sum + snapshot.bidNotional, 0).toFixed(2)),
    askNotional: Number(symbolSnapshots.reduce((sum, snapshot) => sum + snapshot.askNotional, 0).toFixed(2)),
    providers,
    warnings: [...warnings, ...providerWarnings],
  };
}

export function buildLiquiditySnapshot(
  orderflow: RelayOrderflowSnapshot,
  macro: RelayMacroSnapshot,
  unofficialTechnical: TradingViewUnofficialSnapshot | null,
  warnings: string[],
): RelayLiquiditySnapshot {
  const macroSignal = macroDirectionScore(macro);
  const volumeDeltaPct = orderflow.aggregate.volume
    ? (orderflow.volumeDelta / Math.max(orderflow.aggregate.volume, 0.0001)) * 100
    : 0;
  const cryptoVolumeScore = normalizeScore(volumeDeltaPct, 0.45, orderflow.tradeCount > 120 ? 8 : 0);
  const tickScore = normalizeScore(orderflow.liquidityImbalance, 1.15);
  const macroWeight = macroSignal.score;
  const liquidityScore = clamp((cryptoVolumeScore * 0.45) + (tickScore * 0.35) + (macroWeight * 0.20), -100, 100);
  const directionScore = clamp(
    (volumeDeltaPct * 1.4)
    + (orderflow.directionalBias === 'buyers-dominant' ? 12 : orderflow.directionalBias === 'sellers-dominant' ? -12 : 0)
    + technicalBias(unofficialTechnical),
    -100,
    100,
  );

  const technicalLine = unofficialTechnical?.recommendation && unofficialTechnical.recommendation !== 'unavailable'
    ? `Unofficial TradingView sidecar is ${unofficialTechnical.recommendation}.`
    : 'Unofficial TradingView sidecar is unavailable or neutral.';

  const syntheticFxVolumeScore = clamp(
    (liquidityScore * 0.55)
    + (directionScore * 0.35)
    + (orderflow.stale ? -6 : 0)
    + (macro.stale ? -6 : 0),
    -100,
    100,
  );
  const syntheticFxVolumeLabel: RelayLiquiditySnapshot['syntheticFxVolumeLabel'] =
    Math.abs(syntheticFxVolumeScore) >= 22 ? 'expanding' :
      Math.abs(syntheticFxVolumeScore) <= 8 ? 'stable' :
        'contracting';
  const syntheticFxDirection: RelayLiquiditySnapshot['syntheticFxDirection'] =
    directionScore >= 12 ? 'bullish' :
      directionScore <= -12 ? 'bearish' :
        'neutral';

  return {
    requestedAsset: orderflow.requestedAsset,
    proxySymbols: orderflow.proxySymbols,
    timestamp: orderflow.timestamp,
    aggregate: orderflow.aggregate,
    normalized: orderflow.normalized,
    cacheState: orderflow.cacheState,
    stale: orderflow.stale || macro.stale,
    volumeDelta: orderflow.volumeDelta,
    liquidityImbalance: orderflow.liquidityImbalance,
    syntheticFxVolumeScore: Number(syntheticFxVolumeScore.toFixed(1)),
    syntheticFxVolumeLabel,
    syntheticFxDirection,
    macroSummary: `${macroSignal.summary} ${technicalLine}`,
    unofficialTechnical,
    breakdown: {
      cryptoVolumeScore: Number(cryptoVolumeScore.toFixed(1)),
      tickScore: Number(tickScore.toFixed(1)),
      macroWeight: Number(macroWeight.toFixed(1)),
      liquidityScore: Number(liquidityScore.toFixed(1)),
      directionScore: Number(directionScore.toFixed(1)),
    },
    providers: {
      ...orderflow.providers,
      ...macro.providers,
      ...(unofficialTechnical ? { tradingviewUnofficial: unofficialTechnical.provider } : {}),
    },
    warnings: [
      ...warnings,
      ...orderflow.warnings,
      ...macro.warnings,
      ...(unofficialTechnical?.warnings ?? []),
    ],
  };
}
