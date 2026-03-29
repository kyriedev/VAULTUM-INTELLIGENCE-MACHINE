import type {
  DecisionGuidance,
  EngineOutput,
  ExecutionSupportPlan,
  MarketContext,
  PanelSnapshot,
  RiskAssessment,
} from '@/types';

type QuoteLike = { symbol: string; price: number; change: number; sparkline?: number[] };

export interface MarketQuote {
  symbol: string;
  asset: string;
  price: number;
  change: number;
  sparkline: number[];
  sourceQuality: 'direct' | 'proxy' | 'estimated';
}

export interface CommodityQuote extends MarketQuote {}
export interface MacroSeries { id: string; latest: number | null; observations: Array<{ date: string; value: number | null }>; }
export interface RiskEvent { region: string; status: string; score: number; }
export interface TradeBarrier { name: string; marketEffect: string; }
export interface PredictionSignal { title: string; probability: number; volume: number; }
export interface GammaSnapshot { symbol: string; callWall: number | null; putWall: number | null; gammaFlip: number | null; netGamma: number | null; }
export interface DealerPressureSnapshot { symbol: string; bias: string; conclusion: string; pressureScore: number | null; }
export interface CotSnapshot { market: string; zScore: number | null; netPosition: number | null; crowdedRisk: string; }
export interface VolumeProfileSnapshot { market: string; poc: number | null; valueAreaHigh: number | null; valueAreaLow: number | null; mode: string; pocDistance: number | null; valueAreaPosition: string; }
export interface PivotPointSnapshot {
  market: string;
  pivot: number | null;
  supports: number[];
  resistances: number[];
  pivotDistance: number | null;
  structure: string;
  dynamicLevel: number | null;
  dynamicState: string;
  confluenceSummary: string;
  mappedSupport: { price: number; touches: number; role: string; power: number } | null;
  mappedResistance: { price: number; touches: number; role: string; power: number } | null;
  signalMap: {
    buySignal: boolean;
    sellSignal: boolean;
    bullSweep: boolean;
    bearSweep: boolean;
    bias: string;
    referenceLevel: number | null;
    referenceRole: string | null;
  };
  institutionalLevels: Array<{ price: number; touches: number; role: string; power: number; barsSinceLastHit: number }>;
}
export interface BennerCycleSnapshot { market: string; phase: string; bias: string; turnWindow: string; confidence: string; compatibility: string; }
export interface OrderflowSnapshot {
  market: string;
  mode: string;
  feedQuality: string;
  dominance: string;
  buySellPressure: number | null;
  bidAskPressureRatio: number | null;
  quoteImbalance: number | null;
  exhaustionSignal: string;
  absorptionSignal: string;
  structureState: string;
  priceDeltaDivergence: string;
  divergenceBias: 'bullish' | 'bearish' | 'neutral';
  divergenceDetail: string;
  priceTrend: 'rising' | 'falling' | 'flat';
  deltaTrend: 'rising' | 'falling' | 'flat';
  sourceLabel: string;
}
export interface BuyerSellerPressureSnapshot {
  market: string;
  mode: string;
  score: number | null;
  dominance: string;
  sourceLabel: string;
  price: number | null;
  priceChange: number | null;
  dailyTrend5d: number | null;
  rangeEfficiency: number | null;
  relativeVolume: number | null;
  intradayImpulse: number | null;
  cumulativePressure: number | null;
  vwapDeviation: number | null;
  rangeExpansion: number | null;
  structureState: string;
}

export interface FeatureStore {
  [key: string]: number | string | null;
}

export interface PipelineOutput {
  normalized: {
    marketQuotes: MarketQuote[];
    commodityQuotes: CommodityQuote[];
    macroSeries: MacroSeries[];
    riskEvents: RiskEvent[];
    tradeBarriers: TradeBarrier[];
    predictionSignals: PredictionSignal[];
    gammaSnapshot: GammaSnapshot;
    dealerPressureSnapshot: DealerPressureSnapshot;
    cotSnapshot: CotSnapshot;
    volumeProfileSnapshot: VolumeProfileSnapshot;
    pivotPointSnapshot: PivotPointSnapshot;
    bennerCycleSnapshot: BennerCycleSnapshot;
    orderflowSnapshot: OrderflowSnapshot;
    buyerSellerPressureSnapshot: BuyerSellerPressureSnapshot;
  };
  features: FeatureStore;
  engines: Record<string, EngineOutput>;
  marketContext: MarketContext;
  decision: DecisionGuidance;
  risk: RiskAssessment;
  execution: ExecutionSupportPlan;
}

export interface PipelineInputs {
  marketQuotes?: { quotes?: QuoteLike[] } | null;
  commodityQuotes?: { quotes?: QuoteLike[] } | null;
  sectorSummary?: { sectors?: Array<{ symbol: string; change: number }> } | null;
  macroSignals?: any;
  fred2y?: { observations?: Array<{ date: string; value: number | null }> } | null;
  fred10y?: { observations?: Array<{ date: string; value: number | null }> } | null;
  proxyTension?: { conclusion?: string; regions?: Array<{ region: string; status: string }> } | null;
  tradeBarriers?: { barriers?: Array<{ barrier: string; marketEffect: string }> } | null;
  prediction?: { markets?: Array<{ title: string; probability: number; volume: number }> } | null;
  gammaLevels?: any;
  dealerPressure?: any;
  cotSummary?: any;
  crossAssetRegime?: any;
  warnings: string[];
  bennerCycle?: any;
  volumeProfile?: any;
  pivotLevels?: any;
  orderflowEngine?: any;
  buyerSellerPressure?: any;
}

function findQuote(quotes: QuoteLike[], symbol: string): QuoteLike | null {
  return quotes.find((quote) => quote.symbol === symbol) ?? null;
}

function rocFromSparkline(quote: QuoteLike | null, periods = 5): number {
  const sparkline = quote?.sparkline ?? [];
  if (sparkline.length <= periods) return quote?.change ?? 0;
  const start = sparkline[sparkline.length - periods - 1];
  const end = sparkline[sparkline.length - 1];
  if (!start || !end) return quote?.change ?? 0;
  return Number((((end - start) / start) * 100).toFixed(2));
}

function percentileFromSparkline(quote: QuoteLike | null): number {
  const sparkline = [...(quote?.sparkline ?? [])].filter((value) => Number.isFinite(value));
  if (!sparkline.length) return 50;
  const current = sparkline[sparkline.length - 1];
  const lower = sparkline.filter((value) => value <= current).length;
  return Math.round((lower / sparkline.length) * 100);
}

function normalizeInputs(input: PipelineInputs): PipelineOutput['normalized'] {
  const marketQuotes = (input.marketQuotes?.quotes ?? []).map((quote) => ({
    symbol: quote.symbol,
    asset: quote.symbol,
    price: quote.price,
    change: quote.change,
    sparkline: quote.sparkline ?? [],
    sourceQuality: quote.symbol.endsWith('=X') ? 'estimated' as const : 'proxy' as const,
  }));

  const commodityQuotes = (input.commodityQuotes?.quotes ?? []).map((quote) => ({
    symbol: quote.symbol,
    asset: quote.symbol,
    price: quote.price,
    change: quote.change,
    sparkline: quote.sparkline ?? [],
    sourceQuality: 'proxy' as const,
  }));

  return {
    marketQuotes,
    commodityQuotes,
    macroSeries: [
      { id: 'DGS2', latest: input.fred2y?.observations?.[0]?.value ?? null, observations: input.fred2y?.observations ?? [] },
      { id: 'DGS10', latest: input.fred10y?.observations?.[0]?.value ?? null, observations: input.fred10y?.observations ?? [] },
    ],
    riskEvents: (input.proxyTension?.regions ?? []).map((region) => ({
      region: region.region,
      status: region.status,
      score: /critical|high|elevated/i.test(region.status) ? 80 : /watch/i.test(region.status) ? 55 : 35,
    })),
    tradeBarriers: (input.tradeBarriers?.barriers ?? []).map((barrier) => ({
      name: barrier.barrier,
      marketEffect: barrier.marketEffect,
    })),
    predictionSignals: (input.prediction?.markets ?? []).map((market) => ({
      title: market.title,
      probability: market.probability,
      volume: market.volume,
    })),
    gammaSnapshot: {
      symbol: input.gammaLevels?.symbol ?? 'XAUUSD',
      callWall: input.gammaLevels?.callWall ?? null,
      putWall: input.gammaLevels?.putWall ?? null,
      gammaFlip: input.gammaLevels?.gammaFlip ?? null,
      netGamma: input.gammaLevels?.netGamma ?? null,
    },
    dealerPressureSnapshot: {
      symbol: input.dealerPressure?.symbol ?? 'XAUUSD',
      bias: input.dealerPressure?.bias ?? 'unknown',
      conclusion: input.dealerPressure?.conclusion ?? 'unknown',
      pressureScore: input.dealerPressure?.pressureScore ?? null,
    },
    cotSnapshot: {
      market: input.cotSummary?.market ?? 'GOLD',
      zScore: input.cotSummary?.zScore ?? null,
      netPosition: input.cotSummary?.netPosition ?? null,
      crowdedRisk: input.cotSummary?.crowdedRisk ?? 'unknown',
    },
    volumeProfileSnapshot: {
      market: input.volumeProfile?.market ?? 'XAUUSD',
      poc: input.volumeProfile?.poc ?? null,
      valueAreaHigh: input.volumeProfile?.valueAreaHigh ?? null,
      valueAreaLow: input.volumeProfile?.valueAreaLow ?? null,
      mode: input.volumeProfile?.mode ?? 'unknown',
      pocDistance: input.volumeProfile?.pocDistance ?? null,
      valueAreaPosition: input.volumeProfile?.valueAreaPosition ?? 'unknown',
    },
    pivotPointSnapshot: {
      market: input.pivotLevels?.market ?? 'XAUUSD',
      pivot: input.pivotLevels?.pivot ?? null,
      supports: input.pivotLevels?.supports ?? [],
      resistances: input.pivotLevels?.resistances ?? [],
      pivotDistance: input.pivotLevels?.pivotDistance ?? null,
      structure: input.pivotLevels?.structure ?? 'unknown',
      dynamicLevel: input.pivotLevels?.dynamicLevel ?? null,
      dynamicState: input.pivotLevels?.dynamicState ?? 'unknown',
      confluenceSummary: input.pivotLevels?.confluenceSummary ?? 'Institutional map unavailable.',
      mappedSupport: input.pivotLevels?.mappedSupport ?? null,
      mappedResistance: input.pivotLevels?.mappedResistance ?? null,
      signalMap: input.pivotLevels?.signalMap ?? {
        buySignal: false,
        sellSignal: false,
        bullSweep: false,
        bearSweep: false,
        bias: 'pivot signal unavailable',
        referenceLevel: null,
        referenceRole: null,
      },
      institutionalLevels: input.pivotLevels?.institutionalLevels ?? [],
    },
    bennerCycleSnapshot: {
      market: input.bennerCycle?.market ?? 'XAUUSD',
      phase: input.bennerCycle?.phase ?? 'unknown',
      bias: input.bennerCycle?.bias ?? 'unknown',
      turnWindow: input.bennerCycle?.turnWindow ?? 'unknown',
      confidence: input.bennerCycle?.confidence ?? 'low',
      compatibility: input.bennerCycle?.compatibility ?? 'unknown',
    },
    orderflowSnapshot: {
      market: input.orderflowEngine?.market ?? 'XAUUSD',
      mode: input.orderflowEngine?.mode ?? 'unavailable',
      feedQuality: input.orderflowEngine?.feedQuality ?? 'unknown',
      dominance: input.orderflowEngine?.dominance ?? 'unknown',
      buySellPressure: input.orderflowEngine?.buySellPressure ?? null,
      bidAskPressureRatio: input.orderflowEngine?.bidAskPressureRatio ?? null,
      quoteImbalance: input.orderflowEngine?.quoteImbalance ?? null,
      exhaustionSignal: input.orderflowEngine?.exhaustionSignal ?? 'none',
      absorptionSignal: input.orderflowEngine?.absorptionSignal ?? 'none',
      structureState: input.orderflowEngine?.structureState ?? 'unknown',
      priceDeltaDivergence: input.orderflowEngine?.priceDeltaDivergence ?? 'none',
      divergenceBias: input.orderflowEngine?.divergenceBias ?? 'neutral',
      divergenceDetail: input.orderflowEngine?.divergenceDetail ?? 'orderflow divergence unavailable',
      priceTrend: input.orderflowEngine?.priceTrend ?? 'flat',
      deltaTrend: input.orderflowEngine?.deltaTrend ?? 'flat',
      sourceLabel: input.orderflowEngine?.sourceLabel ?? 'unknown',
    },
    buyerSellerPressureSnapshot: {
      market: input.buyerSellerPressure?.market ?? 'XAUUSD',
      mode: input.buyerSellerPressure?.mode ?? 'unavailable',
      score: input.buyerSellerPressure?.score ?? null,
      dominance: input.buyerSellerPressure?.dominance ?? 'unknown',
      sourceLabel: input.buyerSellerPressure?.sourceLabel ?? 'unknown',
      price: input.buyerSellerPressure?.price ?? null,
      priceChange: input.buyerSellerPressure?.priceChange ?? null,
      dailyTrend5d: input.buyerSellerPressure?.dailyTrend5d ?? null,
      rangeEfficiency: input.buyerSellerPressure?.rangeEfficiency ?? null,
      relativeVolume: input.buyerSellerPressure?.relativeVolume ?? null,
      intradayImpulse: input.buyerSellerPressure?.intradayImpulse ?? null,
      cumulativePressure: input.buyerSellerPressure?.cumulativePressure ?? null,
      vwapDeviation: input.buyerSellerPressure?.vwapDeviation ?? null,
      rangeExpansion: input.buyerSellerPressure?.rangeExpansion ?? null,
      structureState: input.buyerSellerPressure?.structureState ?? 'unknown',
    },
  };
}

function generateFeatureStore(normalized: PipelineOutput['normalized'], input: PipelineInputs): FeatureStore {
  const combinedQuotes = [...normalized.marketQuotes, ...normalized.commodityQuotes];
  const dxy = findQuote(combinedQuotes, 'DX-Y.NYB');
  const us10y = findQuote(combinedQuotes, '^TNX');
  const vix = findQuote(combinedQuotes, '^VIX');
  const gold = findQuote(combinedQuotes, 'GC=F');
  const oil = findQuote(combinedQuotes, 'CL=F');
  const usdJpy = findQuote(combinedQuotes, 'USDJPY=X');
  const sectors = input.sectorSummary?.sectors ?? [];
  const xlk = sectors.find((sector) => sector.symbol === 'XLK')?.change ?? 0;
  const xlu = sectors.find((sector) => sector.symbol === 'XLU')?.change ?? 0;
  const topPrediction = normalized.predictionSignals[0];
  const conflictingSignalPenalty =
    (input.macroSignals?.goldBias === 'bullish' && (normalized.buyerSellerPressureSnapshot.score ?? 0) < 0)
      || ((normalized.gammaSnapshot.netGamma ?? 0) < 0 && input.crossAssetRegime?.riskState === 'risk-off')
      || ((normalized.orderflowSnapshot.buySellPressure ?? 0) < -12 && input.macroSignals?.goldBias === 'bullish')
      ? 18
      : 6;

  return {
    dxy_5d_roc: rocFromSparkline(dxy, 5),
    us10y_change_5d: rocFromSparkline(us10y, 5),
    vix_percentile: percentileFromSparkline(vix),
    gold_vs_yield_divergence: Number(((gold?.change ?? 0) - (us10y?.change ?? 0)).toFixed(2)),
    gold_safe_haven_score: Math.round(((gold?.change ?? 0) * 12) + ((vix?.change ?? 0) * 4) - ((dxy?.change ?? 0) * 6)),
    oil_supply_risk_score: Math.round(((oil?.change ?? 0) * 10) + normalized.riskEvents.reduce((sum, event) => sum + event.score, 0) / Math.max(normalized.riskEvents.length, 1) / 4),
    jpy_carry_stress_score: Math.round(((usdJpy?.change ?? 0) * 20) + ((vix?.change ?? 0) * 5)),
    macro_regime_score: input.macroSignals?.regime === 'risk-off tightening' ? -60 : input.macroSignals?.regime === 'risk-on easing' ? 55 : 8,
    sector_defensive_spread: Number((xlu - xlk).toFixed(2)),
    event_negativity_score: Math.round(normalized.riskEvents.reduce((sum, event) => sum + event.score, 0) / Math.max(normalized.riskEvents.length, 1)),
    geopolitical_escalation_score: Math.round(normalized.riskEvents.filter((event) => event.score >= 70).length * 25),
    gamma_flip_distance: normalized.gammaSnapshot.gammaFlip != null && gold?.price != null ? Number((gold.price - normalized.gammaSnapshot.gammaFlip).toFixed(2)) : null,
    call_wall_distance: normalized.gammaSnapshot.callWall != null && gold?.price != null ? Number((gold.price - normalized.gammaSnapshot.callWall).toFixed(2)) : null,
    put_wall_distance: normalized.gammaSnapshot.putWall != null && gold?.price != null ? Number((gold.price - normalized.gammaSnapshot.putWall).toFixed(2)) : null,
    dealer_pressure_bias: normalized.dealerPressureSnapshot.bias.includes('expansion') ? -35 : 10,
    cot_net_position_score: normalized.cotSnapshot.netPosition != null ? Math.round(normalized.cotSnapshot.netPosition / 5000) : null,
    cot_crowding_score: normalized.cotSnapshot.crowdedRisk === 'high' ? 72 : normalized.cotSnapshot.zScore != null ? Math.round(normalized.cotSnapshot.zScore * 20) : 40,
    benner_cycle_phase: normalized.bennerCycleSnapshot.phase,
    benner_cycle_bias: normalized.bennerCycleSnapshot.bias.includes('bullish') ? 30 : -20,
    pivot_distance: normalized.pivotPointSnapshot.pivotDistance,
    mapped_level_signal_score:
      normalized.pivotPointSnapshot.signalMap.buySignal ? 20 :
        normalized.pivotPointSnapshot.signalMap.sellSignal ? -20 :
          normalized.pivotPointSnapshot.signalMap.bullSweep ? 10 :
            normalized.pivotPointSnapshot.signalMap.bearSweep ? -10 : 0,
    weighted_volume_profile_poc_distance: normalized.volumeProfileSnapshot.pocDistance,
    value_area_position: normalized.volumeProfileSnapshot.valueAreaPosition,
    orderflow_pressure_score: normalized.orderflowSnapshot.buySellPressure,
    orderflow_quote_imbalance: normalized.orderflowSnapshot.quoteImbalance,
    orderflow_bid_ask_ratio: normalized.orderflowSnapshot.bidAskPressureRatio,
    orderflow_delta_divergence_score:
      normalized.orderflowSnapshot.divergenceBias === 'bullish' ? 18 :
        normalized.orderflowSnapshot.divergenceBias === 'bearish' ? -18 : 0,
    buyer_seller_pressure_score: normalized.buyerSellerPressureSnapshot.score,
    prediction_signal_score: topPrediction ? Math.round(topPrediction.probability * 100) : 50,
    data_freshness_penalty: input.warnings.length * 8,
    conflicting_signal_penalty: conflictingSignalPenalty,
  };
}

function confidenceFromScore(score: number): 'low' | 'medium' | 'high' {
  if (Math.abs(score) >= 60) return 'high';
  if (Math.abs(score) >= 30) return 'medium';
  return 'low';
}

function buildEngine(score: number, state: string, bias: string, supportingFeatures: string[], invalidationConditions: string[], freshnessWarnings: string[]): EngineOutput {
  return {
    score,
    state,
    bias,
    confidence: freshnessWarnings.length >= 3 ? 'low' : confidenceFromScore(score),
    supportingFeatures,
    invalidationConditions,
    freshnessWarnings,
  };
}

function runQuantEngines(features: FeatureStore, input: PipelineInputs): Record<string, EngineOutput> {
  const warnings = input.warnings;
  const macroScore = Number(features.macro_regime_score ?? 0);
  const goldScore = Number(features.gold_safe_haven_score ?? 0) + Number(features.dealer_pressure_bias ?? 0) + Number(features.buyer_seller_pressure_score ?? 0) / 3 + Number(features.orderflow_pressure_score ?? 0) / 3 - Number(features.conflicting_signal_penalty ?? 0);
  const oilScore = Number(features.oil_supply_risk_score ?? 0) - Number(features.data_freshness_penalty ?? 0);
  const liquidityScore = Number(features.jpy_carry_stress_score ?? 0) + Number(features.vix_percentile ?? 0) / 2;
  const geoScore = Number(features.geopolitical_escalation_score ?? 0) + Number(features.event_negativity_score ?? 0) / 2;
  const volumeScore = (features.value_area_position === 'above-value' ? 25 : features.value_area_position === 'inside-value' ? 8 : -18) - Math.abs(Number(features.weighted_volume_profile_poc_distance ?? 0)) / 2;
  const pivotScore = (Number(features.pivot_distance ?? 0) >= 0 ? 16 : -16) + Number(features.mapped_level_signal_score ?? 0);
  const pressureScore = Number(features.buyer_seller_pressure_score ?? 0);
  const orderflowScore = Number(features.orderflow_pressure_score ?? 0);
  const bennerScore = Number(features.benner_cycle_bias ?? 0);
  const gammaScore = -Math.abs(Number(features.gamma_flip_distance ?? 0)) + Number(features.dealer_pressure_bias ?? 0);
  const cotScore = Number(features.cot_crowding_score ?? 0) - 50;

  return {
    MacroEngine: buildEngine(macroScore, macroScore < -20 ? 'risk-off' : macroScore > 20 ? 'risk-on' : 'mixed', macroScore < 0 ? 'defensive' : 'constructive', ['macro_regime_score', 'dxy_5d_roc', 'us10y_change_5d'], ['DXY and yields stop confirming', 'VIX percentile compresses materially'], warnings),
    GoldEngine: buildEngine(goldScore, goldScore > 25 ? 'supported' : goldScore < -20 ? 'pressured' : 'mixed', goldScore > 0 ? 'bullish' : goldScore < 0 ? 'bearish' : 'neutral', ['gold_safe_haven_score', 'dealer_pressure_bias', 'buyer_seller_pressure_score', 'benner_cycle_bias'], ['Gold loses pivot/value-area support', 'DXY and yields rise together'], warnings),
    FxEngine: buildEngine(Number(features.jpy_carry_stress_score ?? 0), Number(features.jpy_carry_stress_score ?? 0) > 25 ? 'carry-stressed' : 'balanced', Number(features.dxy_5d_roc ?? 0) > 0 ? 'usd-firm' : 'usd-soft', ['dxy_5d_roc', 'jpy_carry_stress_score', 'sector_defensive_spread'], ['JPY stress fades', 'DXY momentum reverses'], warnings),
    OilEngine: buildEngine(oilScore, oilScore > 20 ? 'supply-premium-rising' : 'growth-dragging', oilScore > 0 ? 'bullish' : 'bearish', ['oil_supply_risk_score', 'geopolitical_escalation_score'], ['Geopolitical premium fades', 'Demand proxies weaken'], warnings),
    LiquidityEngine: buildEngine(liquidityScore, liquidityScore > 40 ? 'stressed' : 'contained', liquidityScore > 40 ? 'risk-off' : 'neutral', ['jpy_carry_stress_score', 'vix_percentile', 'dxy_5d_roc'], ['VIX compresses', 'JPY stabilizes'], warnings),
    GeopoliticalImpactEngine: buildEngine(geoScore, geoScore > 45 ? 'elevated-impact' : 'watch', geoScore > 45 ? 'risk-negative' : 'mixed', ['event_negativity_score', 'geopolitical_escalation_score'], ['Regional tension falls back'], warnings),
    TradeImpactEngine: buildEngine(Number(features.event_negativity_score ?? 0) - 20, Number(features.event_negativity_score ?? 0) > 55 ? 'trade-friction-elevated' : 'structural', Number(features.event_negativity_score ?? 0) > 55 ? 'headwind' : 'neutral', ['event_negativity_score', 'sector_defensive_spread'], ['Restriction pressure softens'], warnings),
    PredictionContextEngine: buildEngine(Number(features.prediction_signal_score ?? 50) - 50, Number(features.prediction_signal_score ?? 50) > 60 ? 'crowd-bias-strong' : 'crowd-bias-moderate', Number(features.prediction_signal_score ?? 50) > 50 ? 'supportive' : 'skeptical', ['prediction_signal_score'], ['Prediction probability mean-reverts'], warnings),
    GammaEngine: buildEngine(gammaScore, gammaScore < -10 ? 'short-gamma-fragile' : 'pinning-risk', gammaScore < 0 ? 'bearish-vol' : 'neutral', ['gamma_flip_distance', 'call_wall_distance', 'put_wall_distance'], ['Net gamma flips positive'], warnings),
    DealerPressureEngine: buildEngine(Number(features.dealer_pressure_bias ?? 0), Number(features.dealer_pressure_bias ?? 0) < 0 ? 'expansion-bias' : 'contained', Number(features.dealer_pressure_bias ?? 0) < 0 ? 'risk-negative' : 'neutral', ['dealer_pressure_bias'], ['Dealer pressure score relaxes'], warnings),
    CotEngine: buildEngine(cotScore, cotScore > 10 ? 'crowded' : 'balanced', cotScore > 10 ? 'contrarian-risk' : 'neutral', ['cot_net_position_score', 'cot_crowding_score'], ['Crowding score drops'], warnings),
    VolumeProfileEngine: buildEngine(volumeScore, features.value_area_position === 'above-value' ? 'acceptance-above-poc' : features.value_area_position === 'below-value' ? 'rejection-below-poc' : 'inside-value', volumeScore > 0 ? 'constructive' : 'fragile', ['weighted_volume_profile_poc_distance', 'value_area_position'], ['Price loses value-area acceptance'], warnings),
    PivotEngine: buildEngine(pivotScore, Number(features.pivot_distance ?? 0) >= 0 ? 'above-pivot' : 'below-pivot', Number(features.pivot_distance ?? 0) >= 0 ? 'constructive' : 'defensive', ['pivot_distance'], ['Price reclaims or loses pivot structure'], warnings),
    BennerCycleEngine: buildEngine(bennerScore, String(features.benner_cycle_phase ?? 'unknown'), bennerScore > 0 ? 'constructive' : 'cautionary', ['benner_cycle_phase', 'benner_cycle_bias'], ['Cycle window rolls over'], warnings),
    BuyerSellerPressureEngine: buildEngine(pressureScore, pressureScore > 15 ? 'buyers-dominant' : pressureScore < -15 ? 'sellers-dominant' : 'balanced', pressureScore > 0 ? 'bullish' : pressureScore < 0 ? 'bearish' : 'neutral', ['buyer_seller_pressure_score'], ['Pressure score flips'], warnings),
    OrderflowEngine: buildEngine(orderflowScore, orderflowScore > 18 ? 'buyers-controlling' : orderflowScore < -18 ? 'sellers-controlling' : 'balanced-auction', orderflowScore > 0 ? 'bullish' : orderflowScore < 0 ? 'bearish' : 'neutral', ['orderflow_pressure_score', 'orderflow_quote_imbalance', 'orderflow_bid_ask_ratio'], ['Orderflow pressure and imbalance roll over'], warnings),
    CrossAssetRegimeEngine: buildEngine(macroScore + liquidityScore / 2, input.crossAssetRegime?.regime ?? 'mixed-transition', input.crossAssetRegime?.riskState === 'risk-off' ? 'defensive' : 'constructive', ['macro_regime_score', 'vix_percentile', 'sector_defensive_spread'], ['Cross-asset confirmation weakens'], warnings),
  };
}

function aggregateMarketContext(engines: Record<string, EngineOutput>): MarketContext {
  return {
    marketRegime: engines.CrossAssetRegimeEngine.state,
    goldBias: engines.GoldEngine.bias,
    fxBiasMap: {
      EURUSD: engines.FxEngine.bias === 'usd-firm' ? 'neutral-to-bearish' : 'neutral-to-bullish',
      GBPUSD: engines.FxEngine.bias === 'usd-firm' ? 'bearish' : 'neutral',
      USDJPY: engines.LiquidityEngine.state === 'stressed' ? 'carry-stress-elevated' : 'mixed',
      GBPJPY: engines.LiquidityEngine.state === 'stressed' ? 'fragile' : 'constructive',
      EURJPY: engines.LiquidityEngine.state === 'stressed' ? 'fragile' : 'constructive',
    },
    volatilityState: engines.GammaEngine.state,
    geopoliticalPressureState: engines.GeopoliticalImpactEngine.state,
    positioningState: engines.CotEngine.state,
    optionsState: `${engines.DealerPressureEngine.state} / ${engines.OrderflowEngine.state}`,
    executionCautionState: engines.LiquidityEngine.state === 'stressed' || engines.CotEngine.state === 'crowded' ? 'high-caution' : 'normal-caution',
  };
}

function runDecisionEngine(features: FeatureStore, context: MarketContext, engines: Record<string, EngineOutput>): DecisionGuidance {
  const alignmentScore =
    (engines.GoldEngine.score > 0 ? 1 : -1)
    + (engines.VolumeProfileEngine.score > 0 ? 1 : -1)
    + (engines.PivotEngine.score > 0 ? 1 : -1)
    + (engines.BuyerSellerPressureEngine.score > 0 ? 1 : -1)
    + (engines.OrderflowEngine.score > 0 ? 1 : -1);

  return {
    directionalBias: engines.GoldEngine.bias === 'bullish' ? 'long-bias' : engines.GoldEngine.bias === 'bearish' ? 'short-bias' : 'neutral',
    regimeFit: context.marketRegime,
    setupQuality: alignmentScore >= 2 ? 'high' : alignmentScore >= 0 ? 'medium' : 'low',
    confirmationChecklist: [
      'Macro regime and cross-asset regime remain aligned',
      'Price accepts above pivot / value area for longs or below for shorts',
      'Buyer/seller pressure stays supportive in current mode',
      'Orderflow engine confirms the same directional auction',
    ],
    invalidationChecklist: [
      'Pressure score flips materially against the thesis',
      'Orderflow imbalance and bid/ask pressure ratio reverse',
      'DXY and yields move against the setup together',
      'Price loses pivot and POC acceptance',
    ],
    bestConditionsForEntry: [
      context.executionCautionState === 'high-caution' ? 'Wait for post-event stabilization before entry' : 'Prefer pullbacks into pivot/POC support or resistance retests',
      'Enter only when volume structure and regime bias point the same direction',
    ],
    avoidTradeConditions: [
      'Fresh geopolitical headlines without price confirmation',
      'Conflicting options, pressure, and macro signals',
      `Freshness penalty above ${features.data_freshness_penalty ?? 0}`,
    ],
    confidenceBand: alignmentScore >= 2 ? 'medium-high' : alignmentScore >= 0 ? 'medium' : 'low',
  };
}

function runRiskEngine(features: FeatureStore, engines: Record<string, EngineOutput>, warnings: string[]): RiskAssessment {
  const riskScore = Math.max(0, Math.min(100, Number(features.event_negativity_score ?? 0) / 2 + Number(features.cot_crowding_score ?? 0) / 3 + Number(features.data_freshness_penalty ?? 0) + Number(features.conflicting_signal_penalty ?? 0) + (engines.LiquidityEngine.state === 'stressed' ? 18 : 6)));
  const cautionLevel = riskScore >= 80 ? 'extreme' : riskScore >= 60 ? 'high' : riskScore >= 35 ? 'moderate' : 'low';
  const reasonCodes = [
    cautionLevel === 'extreme' || cautionLevel === 'high' ? 'VOLATILITY_RISK' : null,
    warnings.length ? 'DATA_QUALITY_RISK' : null,
    Number(features.cot_crowding_score ?? 0) >= 70 ? 'POSITIONING_CROWDING' : null,
    Number(features.conflicting_signal_penalty ?? 0) >= 15 ? 'SIGNAL_CONFLICT' : null,
    engines.LiquidityEngine.state === 'stressed' ? 'LIQUIDITY_STRESS' : null,
  ].filter((value): value is string => Boolean(value));

  return {
    riskScore: Math.round(riskScore),
    cautionLevel,
    sizeAdjustmentHint: cautionLevel === 'extreme' ? 'stand down' : cautionLevel === 'high' ? 'trade smaller / wider confirmation needed' : cautionLevel === 'moderate' ? 'reduced size' : 'normal size subject to setup quality',
    tradeSuppressionFlag: cautionLevel === 'extreme' || warnings.length >= 4,
    reasonCodes,
  };
}

function buildExecutionSupport(normalized: PipelineOutput['normalized'], decision: DecisionGuidance, risk: RiskAssessment): ExecutionSupportPlan {
  const pivot = normalized.pivotPointSnapshot.pivot;
  const poc = normalized.volumeProfileSnapshot.poc;
  const resistance = normalized.pivotPointSnapshot.mappedResistance?.price ?? normalized.pivotPointSnapshot.resistances[0];
  const support = normalized.pivotPointSnapshot.mappedSupport?.price ?? normalized.pivotPointSnapshot.supports[0];
  const valueLow = normalized.volumeProfileSnapshot.valueAreaLow;
  const valueHigh = normalized.volumeProfileSnapshot.valueAreaHigh;
  const feedQuality = normalized.orderflowSnapshot.feedQuality;
  const dynamicLevel = normalized.pivotPointSnapshot.dynamicLevel;
  const entryFloor = [support, valueLow, pivot, poc, dynamicLevel].filter((value): value is number => value != null);
  const trimCeiling = [resistance, valueHigh, normalized.gammaSnapshot.callWall, dynamicLevel].filter((value): value is number => value != null);
  const noTradeBand = [normalized.gammaSnapshot.gammaFlip, pivot, poc, dynamicLevel].filter((value): value is number => value != null);

  return {
    entryZone: entryFloor.length ? `${Math.min(...entryFloor).toFixed(2)} - ${Math.max(...entryFloor).toFixed(2)}` : 'structure unavailable',
    trimZone: trimCeiling.length ? trimCeiling.slice(0, 3).map((value) => value.toFixed(2)).join(' / ') : 'use resistance and call-wall cluster',
    noTradeZone: noTradeBand.length ? noTradeBand.slice(0, 3).map((value) => value.toFixed(2)).join(' / ') : 'avoid mid-value chop',
    invalidationLevel: support != null ? `${support.toFixed(2)}` : 'use structural invalidation below value support',
    targetLogic: resistance != null ? `First objective toward ${resistance.toFixed(2)}; then reassess at overhead resistance / call-wall cluster.` : 'Use value-area edge and gamma walls as first target logic.',
    tradeThesisSummary: `${decision.directionalBias} aligned with ${decision.regimeFit}, ${normalized.bennerCycleSnapshot.phase} cycle context, ${normalized.buyerSellerPressureSnapshot.dominance}, ${normalized.orderflowSnapshot.dominance}, and ${normalized.pivotPointSnapshot.signalMap.bias}.`,
    feedQuality,
    orderflowSummary: `${normalized.orderflowSnapshot.dominance} / ratio ${normalized.orderflowSnapshot.bidAskPressureRatio ?? 'n/a'} / imbalance ${normalized.orderflowSnapshot.quoteImbalance ?? 'n/a'} / divergence ${normalized.orderflowSnapshot.priceDeltaDivergence} / ${normalized.orderflowSnapshot.absorptionSignal}.`,
    executionChecklist: ['Wait for structure confirmation at pivot / POC', 'Confirm pressure mode and direction', 'Confirm orderflow engine is aligned with the thesis', `Respect risk engine caution level: ${risk.cautionLevel}`],
    alertConditions: ['Price reclaims / loses pivot', 'Pressure score crosses balance threshold', 'Orderflow imbalance rolls over', 'Macro or geopolitical headline shifts regime state'],
    sessionTimingNotes: ['Favor liquid overlap windows for FX execution', 'Avoid initiating into unscheduled geopolitical shock volatility'],
    doNotExecute: risk.tradeSuppressionFlag,
  };
}

export function runVaultumPipeline(input: PipelineInputs): PipelineOutput {
  const normalized = normalizeInputs(input);
  const features = generateFeatureStore(normalized, input);
  const engines = runQuantEngines(features, input);
  const marketContext = aggregateMarketContext(engines);
  const decision = runDecisionEngine(features, marketContext, engines);
  const risk = runRiskEngine(features, engines, input.warnings);
  const execution = buildExecutionSupport(normalized, decision, risk);

  return {
    normalized,
    features,
    engines,
    marketContext,
    decision,
    risk,
    execution,
  };
}

export function buildPipelinePanels(pipeline: PipelineOutput): Record<string, PanelSnapshot> {
  const { normalized, engines, marketContext, decision, risk, execution } = pipeline;
  const pressureMode = normalized.buyerSellerPressureSnapshot.mode;
  const profileMode = normalized.volumeProfileSnapshot.mode;

  return {
    'market-radar': {
      conclusion: `${marketContext.marketRegime} with ${marketContext.executionCautionState}; decision bias ${decision.directionalBias}.`,
      status: risk.tradeSuppressionFlag ? 'stale' : 'confirmed',
      metrics: [
        { label: 'Regime', value: marketContext.marketRegime, tone: marketContext.marketRegime.includes('risk-off') ? 'alert' : 'bullish' },
        { label: 'Setup', value: decision.setupQuality, tone: decision.setupQuality === 'high' ? 'bullish' : decision.setupQuality === 'low' ? 'bearish' : 'neutral' },
        { label: 'Risk', value: `${risk.riskScore}`, tone: risk.cautionLevel === 'high' || risk.cautionLevel === 'extreme' ? 'alert' : 'neutral' },
        { label: 'Execute', value: execution.doNotExecute ? 'blocked' : 'allowed', tone: execution.doNotExecute ? 'bearish' : 'bullish' },
      ],
      table: {
        columns: ['Context', 'State'],
        rows: [['Gold Bias', marketContext.goldBias], ['Volatility', marketContext.volatilityState], ['Positioning', marketContext.positioningState], ['Options', marketContext.optionsState]],
      },
      bullets: [`Directional bias: ${decision.directionalBias}.`, `Setup quality: ${decision.setupQuality} with confidence ${decision.confidenceBand}.`, `Risk caution: ${risk.cautionLevel} / size hint ${risk.sizeAdjustmentHint}.`],
      alerts: execution.doNotExecute ? ['Do not execute: risk engine is suppressing new entries until signal conflict / event risk improves.'] : [],
    },
    'gold-engine': {
      conclusion: `Gold engine is ${engines.GoldEngine.state} with ${normalized.bennerCycleSnapshot.phase} cycle context and ${normalized.buyerSellerPressureSnapshot.dominance} pressure.`,
      status: 'confirmed',
      metrics: [
        { label: 'Gold Bias', value: engines.GoldEngine.bias, tone: engines.GoldEngine.bias === 'bullish' ? 'bullish' : 'bearish' },
        { label: 'Cycle', value: normalized.bennerCycleSnapshot.phase, tone: normalized.bennerCycleSnapshot.bias.includes('bullish') ? 'bullish' : 'alert' },
        { label: 'Pressure', value: normalized.buyerSellerPressureSnapshot.dominance, tone: (normalized.buyerSellerPressureSnapshot.score ?? 0) > 0 ? 'bullish' : 'bearish' },
        { label: 'Pivot', value: normalized.pivotPointSnapshot.structure, tone: normalized.pivotPointSnapshot.structure === 'above-pivot' ? 'bullish' : 'bearish' },
      ],
      table: {
        columns: ['Gold Overlay', 'Reading'],
        rows: [['Volume Profile', `${profileMode} / ${normalized.volumeProfileSnapshot.valueAreaPosition}`], ['POC Distance', `${normalized.volumeProfileSnapshot.pocDistance ?? 'n/a'}`], ['Pivot Distance', `${normalized.pivotPointSnapshot.pivotDistance ?? 'n/a'}`], ['Turn Window', normalized.bennerCycleSnapshot.turnWindow]],
      },
      bullets: [`Execution zone: ${execution.entryZone}.`, `Invalidation: ${execution.invalidationLevel}.`, `Target logic: ${execution.targetLogic}.`],
      alerts: normalized.buyerSellerPressureSnapshot.mode !== 'direct' ? [`Pressure is ${pressureMode}; it is not true aggressor flow and must be treated as proxy structure.`] : [],
    },
    'execution-playbook': {
      conclusion: execution.tradeThesisSummary,
      status: execution.doNotExecute ? 'stale' : 'confirmed',
      metrics: [
        { label: 'Entry', value: execution.entryZone, tone: 'bullish' },
        { label: 'Trim', value: execution.trimZone, tone: 'neutral' },
        { label: 'No Trade', value: execution.noTradeZone, tone: 'alert' },
        { label: 'Invalidation', value: execution.invalidationLevel, tone: 'bearish' },
        { label: 'Feed', value: execution.feedQuality, tone: execution.feedQuality === 'strong' ? 'bullish' : execution.feedQuality === 'usable' ? 'neutral' : 'alert' },
        { label: 'Execute', value: execution.doNotExecute ? 'blocked' : 'active', tone: execution.doNotExecute ? 'bearish' : 'bullish' },
      ],
      table: {
        columns: ['Execution Lens', 'Reading'],
        rows: [
          ['Target Logic', execution.targetLogic],
          ['Orderflow', execution.orderflowSummary],
          ['Risk', risk.cautionLevel],
          ['Setup', decision.setupQuality],
        ],
      },
      bullets: [
        `Checklist: ${execution.executionChecklist.join(' | ')}.`,
        `Alert conditions: ${execution.alertConditions.join(' | ')}.`,
        `Session notes: ${execution.sessionTimingNotes.join(' | ')}.`,
      ],
      alerts: execution.doNotExecute ? ['Do not execute new positions until signal conflict and risk caution improve.'] : [],
    },
    'fx-board': {
      conclusion: `FX board reads ${marketContext.fxBiasMap.EURUSD} in EURUSD and ${marketContext.fxBiasMap.USDJPY} in USDJPY under ${engines.FxEngine.state}.`,
      status: 'mixed',
      metrics: [
        { label: 'EURUSD', value: marketContext.fxBiasMap.EURUSD, tone: marketContext.fxBiasMap.EURUSD.includes('bullish') ? 'bullish' : 'bearish' },
        { label: 'GBPUSD', value: marketContext.fxBiasMap.GBPUSD, tone: marketContext.fxBiasMap.GBPUSD.includes('bullish') ? 'bullish' : 'bearish' },
        { label: 'USDJPY', value: marketContext.fxBiasMap.USDJPY, tone: marketContext.fxBiasMap.USDJPY.includes('elevated') ? 'alert' : 'neutral' },
        { label: 'JPY Stress', value: engines.LiquidityEngine.state, tone: engines.LiquidityEngine.state === 'stressed' ? 'alert' : 'neutral' },
      ],
      bullets: ['FX bias is driven by dollar liquidity, carry stress, and structure overlays.', `Pivot/volume context: ${normalized.pivotPointSnapshot.structure} / ${normalized.volumeProfileSnapshot.valueAreaPosition}.`, `Pressure mode: ${pressureMode}.`],
    },
    commodities: {
      conclusion: `Commodities sit in ${engines.OilEngine.state} for oil and ${engines.GoldEngine.state} for gold.`,
      status: 'mixed',
      metrics: [
        { label: 'Oil', value: engines.OilEngine.bias, tone: engines.OilEngine.bias === 'bullish' ? 'alert' : 'bearish' },
        { label: 'Gold', value: engines.GoldEngine.bias, tone: engines.GoldEngine.bias === 'bullish' ? 'bullish' : 'bearish' },
        { label: 'Geo', value: engines.GeopoliticalImpactEngine.state, tone: 'alert' },
        { label: 'Volume', value: normalized.volumeProfileSnapshot.valueAreaPosition, tone: normalized.volumeProfileSnapshot.valueAreaPosition === 'above-value' ? 'bullish' : 'bearish' },
      ],
      bullets: ['Oil should be read through supply risk and shipping/sanctions channels.', 'Gold should be read through real-rate, haven, positioning, and structure channels.', `Buyer/seller pressure mode: ${pressureMode}.`],
    },
    'liquidity-stress': {
      conclusion: `${engines.LiquidityEngine.state} with ${risk.cautionLevel} caution and ${marketContext.executionCautionState}.`,
      status: risk.cautionLevel === 'high' || risk.cautionLevel === 'extreme' ? 'confirmed' : 'mixed',
      metrics: [
        { label: 'Liquidity', value: engines.LiquidityEngine.state, tone: engines.LiquidityEngine.state === 'stressed' ? 'alert' : 'neutral' },
        { label: 'Risk', value: risk.cautionLevel, tone: risk.cautionLevel === 'high' || risk.cautionLevel === 'extreme' ? 'alert' : 'neutral' },
        { label: 'Crowding', value: normalized.cotSnapshot.crowdedRisk, tone: normalized.cotSnapshot.crowdedRisk === 'high' ? 'alert' : 'neutral' },
        { label: 'Suppression', value: execution.doNotExecute ? 'yes' : 'no', tone: execution.doNotExecute ? 'bearish' : 'bullish' },
      ],
      bullets: [`Risk reasons: ${risk.reasonCodes.join(', ') || 'none material'}.`, `Size adjustment: ${risk.sizeAdjustmentHint}.`, `Execution note: ${execution.tradeThesisSummary}.`],
    },
    'benner-cycle': {
      conclusion: `Benner cycle is in ${normalized.bennerCycleSnapshot.phase} with ${normalized.bennerCycleSnapshot.bias} interpretation.`,
      status: 'mixed',
      metrics: [
        { label: 'Phase', value: normalized.bennerCycleSnapshot.phase, tone: normalized.bennerCycleSnapshot.bias.includes('bullish') ? 'bullish' : 'alert' },
        { label: 'Bias', value: normalized.bennerCycleSnapshot.bias, tone: normalized.bennerCycleSnapshot.bias.includes('bullish') ? 'bullish' : 'bearish' },
        { label: 'Turn', value: normalized.bennerCycleSnapshot.turnWindow, tone: 'neutral' },
        { label: 'Confidence', value: normalized.bennerCycleSnapshot.confidence, tone: normalized.bennerCycleSnapshot.confidence === 'high' ? 'bullish' : 'neutral' },
      ],
      bullets: [normalized.bennerCycleSnapshot.compatibility, 'Use Benner as a temporal overlay, not a standalone trigger.', 'Cross-check the cycle window with macro regime and live structure.'],
    },
    'volume-profile': {
      conclusion: `Volume profile is ${normalized.volumeProfileSnapshot.valueAreaPosition} with pivot structure ${normalized.pivotPointSnapshot.structure} and ${normalized.pivotPointSnapshot.signalMap.bias}.`,
      status: normalized.volumeProfileSnapshot.poc != null ? 'confirmed' : 'stale',
      metrics: [
        { label: 'POC', value: `${normalized.volumeProfileSnapshot.poc ?? 'n/a'}`, tone: 'neutral' },
        { label: 'VAH', value: `${normalized.volumeProfileSnapshot.valueAreaHigh ?? 'n/a'}`, tone: 'neutral' },
        { label: 'VAL', value: `${normalized.volumeProfileSnapshot.valueAreaLow ?? 'n/a'}`, tone: 'neutral' },
        { label: 'Pivot', value: `${normalized.pivotPointSnapshot.pivot ?? 'n/a'}`, tone: normalized.pivotPointSnapshot.structure === 'above-pivot' ? 'bullish' : 'bearish' },
        { label: 'Mapped S', value: normalized.pivotPointSnapshot.mappedSupport?.price != null ? `${normalized.pivotPointSnapshot.mappedSupport.price}` : 'n/a', tone: 'bullish' },
        { label: 'Mapped R', value: normalized.pivotPointSnapshot.mappedResistance?.price != null ? `${normalized.pivotPointSnapshot.mappedResistance.price}` : 'n/a', tone: 'bearish' },
      ],
      table: {
        columns: ['Structure', 'Reading'],
        rows: [
          ['Profile Mode', profileMode],
          ['Value Area', normalized.volumeProfileSnapshot.valueAreaPosition],
          ['Pivot Distance', `${normalized.pivotPointSnapshot.pivotDistance ?? 'n/a'}`],
          ['POC Distance', `${normalized.volumeProfileSnapshot.pocDistance ?? 'n/a'}`],
          ['Dynamic Level', `${normalized.pivotPointSnapshot.dynamicLevel ?? 'n/a'} / ${normalized.pivotPointSnapshot.dynamicState}`],
          ['Institutional Map', normalized.pivotPointSnapshot.confluenceSummary],
          ['Latest Signal', normalized.pivotPointSnapshot.signalMap.bias],
        ],
      },
      bullets: [
        `Acceptance/rejection engine bias: ${engines.VolumeProfileEngine.bias}.`,
        `Pivot engine bias: ${engines.PivotEngine.bias}.`,
        normalized.pivotPointSnapshot.confluenceSummary,
        'Use structure for entry timing, not as a standalone macro call.',
      ],
      alerts: profileMode !== 'proxy' ? [] : ['Volume profile is proxy-derived from current source mix; OTC FX should be treated as estimated structure.'],
    },
    'buyer-seller-pressure': {
      conclusion: `${normalized.buyerSellerPressureSnapshot.dominance} with mode ${pressureMode}.`,
      status: pressureMode === 'unavailable' ? 'stale' : 'mixed',
      metrics: [
        { label: 'Mode', value: pressureMode, tone: pressureMode === 'direct' ? 'bullish' : pressureMode === 'proxy' ? 'alert' : 'bearish' },
        { label: 'Score', value: `${normalized.buyerSellerPressureSnapshot.score ?? 'n/a'}`, tone: (normalized.buyerSellerPressureSnapshot.score ?? 0) > 0 ? 'bullish' : 'bearish' },
        { label: 'Dominance', value: normalized.buyerSellerPressureSnapshot.dominance, tone: (normalized.buyerSellerPressureSnapshot.score ?? 0) > 0 ? 'bullish' : 'bearish' },
        { label: 'Engine', value: engines.BuyerSellerPressureEngine.state, tone: 'neutral' },
        { label: 'rVol', value: normalized.buyerSellerPressureSnapshot.relativeVolume != null ? normalized.buyerSellerPressureSnapshot.relativeVolume.toFixed(2) : 'n/a', tone: (normalized.buyerSellerPressureSnapshot.relativeVolume ?? 1) >= 1.1 ? 'alert' : 'neutral' },
        { label: 'VWAP Dev', value: normalized.buyerSellerPressureSnapshot.vwapDeviation != null ? `${normalized.buyerSellerPressureSnapshot.vwapDeviation >= 0 ? '+' : ''}${normalized.buyerSellerPressureSnapshot.vwapDeviation.toFixed(2)}%` : 'n/a', tone: (normalized.buyerSellerPressureSnapshot.vwapDeviation ?? 0) > 0 ? 'bullish' : 'bearish' },
      ],
      charts: normalized.buyerSellerPressureSnapshot.score != null ? [
        {
          label: 'Pressure Stack',
          points: [
            normalized.buyerSellerPressureSnapshot.intradayImpulse ?? 0,
            normalized.buyerSellerPressureSnapshot.cumulativePressure ?? 0,
            normalized.buyerSellerPressureSnapshot.rangeEfficiency ?? 0,
            normalized.buyerSellerPressureSnapshot.score ?? 0,
          ],
          tone: (normalized.buyerSellerPressureSnapshot.score ?? 0) > 0 ? 'bullish' : 'bearish',
        },
      ] : [],
      table: {
        columns: ['Pressure Lens', 'Reading'],
        rows: [
          ['Source', normalized.buyerSellerPressureSnapshot.sourceLabel],
          ['Structure', normalized.buyerSellerPressureSnapshot.structureState],
          ['Volume Profile', normalized.volumeProfileSnapshot.valueAreaPosition],
          ['Pivot Structure', normalized.pivotPointSnapshot.structure],
          ['Intraday Impulse', `${normalized.buyerSellerPressureSnapshot.intradayImpulse ?? 'n/a'}`],
          ['Cumulative Pressure', `${normalized.buyerSellerPressureSnapshot.cumulativePressure ?? 'n/a'}`],
          ['Execution Bias', decision.directionalBias],
        ],
      },
      bullets: [
        'Buyer/seller pressure is capability-aware and never presented as direct flow unless the source supports it.',
        `Current pressure supports ${decision.directionalBias}.`,
        `5d trend ${normalized.buyerSellerPressureSnapshot.dailyTrend5d ?? 'n/a'}% / session VWAP deviation ${normalized.buyerSellerPressureSnapshot.vwapDeviation ?? 'n/a'}%.`,
        `Execution block: ${execution.doNotExecute ? 'active' : 'inactive'}.`,
      ],
      alerts: pressureMode !== 'direct' ? [`Pressure is ${pressureMode}; it is a proxy-derived estimate, not true bid/ask aggressor flow.`] : [],
    },
    'orderflow-engine': {
      conclusion: `${normalized.orderflowSnapshot.dominance} with ${normalized.orderflowSnapshot.feedQuality} feed quality, ${normalized.orderflowSnapshot.structureState}, and ${normalized.orderflowSnapshot.priceDeltaDivergence}.`,
      status: normalized.orderflowSnapshot.buySellPressure != null ? 'mixed' : 'stale',
      metrics: [
        { label: 'Feed', value: normalized.orderflowSnapshot.feedQuality, tone: normalized.orderflowSnapshot.feedQuality === 'strong' ? 'bullish' : normalized.orderflowSnapshot.feedQuality === 'usable' ? 'neutral' : 'alert' },
        { label: 'Pressure', value: `${normalized.orderflowSnapshot.buySellPressure ?? 'n/a'}`, tone: (normalized.orderflowSnapshot.buySellPressure ?? 0) > 0 ? 'bullish' : 'bearish' },
        { label: 'B/A Ratio', value: normalized.orderflowSnapshot.bidAskPressureRatio != null ? normalized.orderflowSnapshot.bidAskPressureRatio.toFixed(2) : 'n/a', tone: (normalized.orderflowSnapshot.bidAskPressureRatio ?? 1) > 1 ? 'bullish' : 'bearish' },
        { label: 'Imbalance', value: `${normalized.orderflowSnapshot.quoteImbalance ?? 'n/a'}`, tone: (normalized.orderflowSnapshot.quoteImbalance ?? 0) > 0 ? 'bullish' : 'bearish' },
        { label: 'Divergence', value: normalized.orderflowSnapshot.priceDeltaDivergence, tone: normalized.orderflowSnapshot.divergenceBias === 'bullish' ? 'bullish' : normalized.orderflowSnapshot.divergenceBias === 'bearish' ? 'bearish' : 'neutral' },
        { label: 'Absorption', value: normalized.orderflowSnapshot.absorptionSignal, tone: normalized.orderflowSnapshot.absorptionSignal === 'none' ? 'neutral' : 'alert' },
        { label: 'Exhaustion', value: normalized.orderflowSnapshot.exhaustionSignal, tone: normalized.orderflowSnapshot.exhaustionSignal === 'none' ? 'neutral' : 'alert' },
      ],
      bullets: [
        normalized.orderflowSnapshot.sourceLabel,
        `Auction state: ${normalized.orderflowSnapshot.structureState}.`,
        `Price trend ${normalized.orderflowSnapshot.priceTrend} while delta trend is ${normalized.orderflowSnapshot.deltaTrend}.`,
        normalized.orderflowSnapshot.divergenceDetail,
        `This is a live proxy engine, not raw exchange bid/ask tape.`,
      ],
      alerts: normalized.orderflowSnapshot.feedQuality === 'weak' ? ['Footprint-style readings are estimated for this asset because the feed does not provide a true centralized tape.'] : [],
    },
  };
}
