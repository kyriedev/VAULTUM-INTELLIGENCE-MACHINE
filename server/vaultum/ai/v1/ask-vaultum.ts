import { callVaultumAiTool, type VaultumAiToolName } from './tool-dispatch';
import { VAULTUM_SYSTEM_PROMPT, type VaultumAiStructuredAnswer, callChatProvider, discoverAiProviders } from './_shared';
import { classifyIntent, planTools } from './planner';
import { describeBrokerStack } from '../../_shared/feed-status';

function asLines(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((item) => String(item));
  return [String(value)];
}

function findToolData(toolResults: Array<{ name: string; data: any }>, name: string): any {
  return toolResults.find((tool) => tool.name === name)?.data ?? null;
}

function extractMentionedLevel(question: string): number | null {
  const matches = [...question.matchAll(/(\d{2,6}(?:\.\d+)?)/g)];
  if (!matches.length) return null;
  const value = Number(matches[matches.length - 1]?.[1]);
  return Number.isFinite(value) ? value : null;
}

function compactContext(toolResults: Array<{ name: string; data: any }>): { confirmed: string[]; inferred: string[]; estimated: string[]; missing: string[]; summary: string[] } {
  const confirmed: string[] = [];
  const inferred: string[] = [];
  const estimated: string[] = [];
  const missing: string[] = [];
  const summary: string[] = [];

  toolResults.forEach(({ name, data }) => {
    if (!data) {
      missing.push(`${name}: unavailable`);
      return;
    }

    if (name === 'macro.get_macro_signals') {
      confirmed.push(`macro regime ${data.regime ?? 'unknown'}`);
      confirmed.push(`gold bias ${data.goldBias ?? 'unknown'}`);
      inferred.push(`dollar liquidity pressure ${data.inferred?.dollarLiquidityPressure ?? 'unknown'}`);
      inferred.push(`carry stress ${data.inferred?.carryStress ?? 'unknown'}`);
      summary.push(`macro ${data.regime ?? 'unknown'} / gold ${data.goldBias ?? 'unknown'} / haven ${data.safeHavenPressure ?? 'unknown'}`);
    }

    if (name === 'market.list_market_quotes') {
      const quotes = data.quotes ?? [];
      const important = quotes.slice(0, 5).map((quote: any) => `${quote.symbol} ${quote.change >= 0 ? '+' : ''}${Number(quote.change).toFixed(2)}%`);
      confirmed.push(...important);
      if (data.rateLimited) missing.push('market quotes rate-limited');
    }

    if (name === 'calendar.get_economic_calendar') {
      if (data.summary) summary.push(data.summary);
      if (data.highImpactCount != null) inferred.push(`${data.highImpactCount} high-impact calendar events`);
      const nextEvent = data.events?.find((event: any) => event.isUpcoming);
      if (nextEvent) inferred.push(`next event ${nextEvent.currency} ${nextEvent.event}`);
    }

    if (name === 'market.list_commodity_quotes') {
      const quotes = data.quotes ?? [];
      confirmed.push(...quotes.slice(0, 3).map((quote: any) => `${quote.symbol} ${quote.change >= 0 ? '+' : ''}${Number(quote.change).toFixed(2)}%`));
    }

    if (name === 'market.get_sector_summary') {
      const leader = [...(data.sectors ?? [])].sort((a: any, b: any) => b.change - a.change)[0];
      if (leader) inferred.push(`sector leadership ${leader.symbol} ${leader.change >= 0 ? '+' : ''}${Number(leader.change).toFixed(2)}%`);
    }

    if (name === 'market.get_fear_greed_index') {
      confirmed.push(`sentiment ${data.compositeScore ?? 'n/a'} ${data.compositeLabel ?? ''}`.trim());
      inferred.push(`fear/greed stance ${data.stance ?? 'unknown'}`);
      summary.push(data.summary ?? 'market sentiment unavailable');
      if (Array.isArray(data.warnings)) inferred.push(...data.warnings.slice(0, 2));
    }

    if (name === 'prediction.list_prediction_markets') {
      const market = data.markets?.[0];
      if (market) inferred.push(`prediction market ${market.title} ${(market.probability * 100).toFixed(1)}%`);
      if (data.unavailable) missing.push('prediction market layer unavailable');
    }

    if (name === 'options.get_gamma_levels') {
      confirmed.push(`call wall ${data.callWall}`);
      confirmed.push(`put wall ${data.putWall}`);
      inferred.push(`gamma flip ${data.gammaFlip}`);
      estimated.push(data.sourceLabel ?? 'synthetic gamma engine');
    }

    if (name === 'options.get_flow_proxy') {
      inferred.push(data.explanation);
      confirmed.push(`options flow ${data.flowBias}`);
      estimated.push(data.sourceLabel ?? 'synthetic options flow');
    }

    if (name === 'orderflow.get_engine') {
      confirmed.push(`orderflow ${data.dominance ?? 'unknown'}`);
      inferred.push(`bid/ask ratio ${data.bidAskPressureRatio ?? 'n/a'} / imbalance ${data.quoteImbalance ?? 'n/a'}`);
      inferred.push(`absorption ${data.absorptionSignal ?? 'none'} / exhaustion ${data.exhaustionSignal ?? 'none'}`);
      if (data.priceDeltaDivergence && data.priceDeltaDivergence !== 'none') {
        inferred.push(`price/delta ${data.priceDeltaDivergence}`);
      }
      estimated.push(data.sourceLabel ?? 'orderflow proxy');
    }

    if (name === 'scenario.get_monte_carlo') {
      confirmed.push(`scenario ${data.pathBias ?? 'unknown'}`);
      inferred.push(`target hit ${data.targetHitProbability ?? 'n/a'}% / invalidation ${data.invalidationProbability ?? 'n/a'}%`);
      inferred.push(`support hold ${data.supportHoldProbability ?? 'n/a'}%`);
    }

    if (name === 'options.get_dealer_pressure') {
      inferred.push(data.conclusion);
    }

    if (name === 'positioning.get_cot_summary') {
      inferred.push(data.summary);
    }

    if (name === 'positioning.get_positioning_regime') {
      inferred.push(`positioning regime ${data.regime}`);
    }

    if (name.startsWith('liquidity.')) {
      summary.push(...asLines(data.conclusion ?? data.regime).slice(0, 1));
    }

    if (name === 'trade.get_trade_restrictions') {
      const top = data.restrictions?.[0];
      if (top) confirmed.push(`trade restriction proxy ${top.reporter} ${Number(top.tariffRate).toFixed(1)}%`);
      if (data.unavailable) missing.push('trade restriction layer unavailable');
    }

    if (name === 'intelligence.get_proxy_tension_status') {
      summary.push(data.conclusion);
    }

    if (name === 'intelligence.get_country_intel_brief') {
      summary.push(data.brief);
    }

    if (name === 'intelligence.get_market_brief') {
      summary.push(data.summary);
      inferred.push(data.actionPlan);
      if (data.riskWatch) inferred.push(data.riskWatch);
    }

    if (name === 'intelligence.search_news_documents') {
      inferred.push(...(data.results ?? []).slice(0, 2).map((result: any) => `${result.type}: ${result.title}`));
    }

    if (name === 'benner.get_cycle_state') {
      inferred.push(`benner cycle ${data.phase ?? 'unknown'} / ${data.bias ?? 'unknown'}`);
      summary.push(`cycle ${data.phase ?? 'unknown'} / turn ${data.turnWindow ?? 'unknown'}`);
    }

    if (name === 'volume.get_profile') {
      estimated.push(`volume profile ${data.mode ?? 'unknown'} mode`);
      confirmed.push(`value area ${data.valueAreaPosition ?? 'unknown'}`);
      inferred.push(`POC distance ${data.pocDistance ?? 'n/a'}`);
      if (data.unavailable) missing.push('volume profile unavailable');
    }

    if (name === 'pivots.get_levels') {
      confirmed.push(`pivot structure ${data.structure ?? 'unknown'}`);
      inferred.push(`pivot distance ${data.pivotDistance ?? 'n/a'}`);
      if (data.mappedSupport?.price != null) confirmed.push(`mapped support ${data.mappedSupport.price}`);
      if (data.mappedResistance?.price != null) confirmed.push(`mapped resistance ${data.mappedResistance.price}`);
      if (data.dynamicLevel != null) inferred.push(`dynamic level ${data.dynamicLevel} / ${data.dynamicState ?? 'unknown'}`);
      if (data.signalMap?.bias) inferred.push(`pivot map ${data.signalMap.bias}`);
      if (data.unavailable) missing.push('pivot structure unavailable');
    }

    if (name === 'pressure.get_buyer_seller_pressure') {
      estimated.push(`buyer/seller pressure ${data.mode ?? 'unknown'} mode`);
      inferred.push(`${data.dominance ?? 'unknown'} pressure`);
      inferred.push(`intraday impulse ${data.intradayImpulse ?? 'n/a'} / cumulative ${data.cumulativePressure ?? 'n/a'}`);
      if (data.mode !== 'direct') estimated.push(data.sourceLabel ?? 'proxy pressure only');
      if (data.unavailable) missing.push('buyer/seller pressure unavailable');
    }
  });

  return {
    confirmed: [...new Set(confirmed)].slice(0, 6),
    inferred: [...new Set(inferred)].slice(0, 6),
    estimated: [...new Set(estimated)].slice(0, 6),
    missing: [...new Set(missing)].slice(0, 6),
    summary: [...new Set(summary)].slice(0, 6),
  };
}

function buildMarketFeedTrace(toolResults: Array<{ name: string; data: any }>): string[] {
  const feeds: string[] = [
    'TradingView is chart UI only; live quotes come from backend feeds rather than the widget itself.',
    ...describeBrokerStack(),
  ];

  const marketQuotes = findToolData(toolResults, 'market.list_market_quotes');
  if (marketQuotes?.sourceSummary?.length) {
    feeds.push(...marketQuotes.sourceSummary);
  } else if (marketQuotes) {
    feeds.push(
      marketQuotes?.skipReason?.includes('FINNHUB_API_KEY')
        ? 'Yahoo Finance covered the market quote request because Finnhub is not configured.'
        : 'Finnhub is the primary quote feed for cash equities and ETFs when configured.',
    );
    feeds.push('Yahoo Finance backs indices, futures, FX, DXY, and missed Finnhub symbols.');
    if (marketQuotes.rateLimited) feeds.push('Yahoo Finance signaled a rate-limit condition on the quote request.');
  }

  const commodities = findToolData(toolResults, 'market.list_commodity_quotes');
  if (commodities?.sourceSummary?.length) {
    feeds.push(...commodities.sourceSummary);
  } else if (commodities) {
    feeds.push('Commodity futures are sourced from Yahoo Finance chart endpoints.');
  }

  const sectors = findToolData(toolResults, 'market.get_sector_summary');
  if (sectors?.sourceSummary?.length) {
    feeds.push(...sectors.sourceSummary);
  } else if (sectors) {
    feeds.push('Sector summary uses Finnhub first, then Yahoo Finance if Finnhub is missing or incomplete.');
  }

  const pressure = findToolData(toolResults, 'pressure.get_buyer_seller_pressure');
  if (pressure?.sourceLabel) {
    feeds.push(pressure.sourceLabel);
  }

  const flowProxy = findToolData(toolResults, 'options.get_flow_proxy');
  if (flowProxy?.sourceLabel) {
    feeds.push(flowProxy.sourceLabel);
  }

  const orderflow = findToolData(toolResults, 'orderflow.get_engine');
  if (orderflow?.sourceLabel) {
    feeds.push(orderflow.sourceLabel);
  }

  return [...new Set(feeds)];
}

function compareNear(level: number | null, reference: number | null | undefined, tolerance: number): boolean {
  return level != null && reference != null && Math.abs(level - reference) <= tolerance;
}

function buildExecutionLens(question: string, intent: string, toolResults: Array<{ name: string; data: any }>): {
  conclusion: string | null;
  supportingSignals: string[];
  caveats: string[];
  watchItems: string[];
  guidance: string[];
  promptLines: string[];
  confidence: 'low' | 'medium' | 'high' | null;
} {
  const level = extractMentionedLevel(question);
  const q = question.toLowerCase();
  const pressure = findToolData(toolResults, 'pressure.get_buyer_seller_pressure');
  const orderflow = findToolData(toolResults, 'orderflow.get_engine');
  const profile = findToolData(toolResults, 'volume.get_profile');
  const pivots = findToolData(toolResults, 'pivots.get_levels');
  const macro = findToolData(toolResults, 'macro.get_macro_signals');
  const flow = findToolData(toolResults, 'options.get_flow_proxy');
  const calendar = findToolData(toolResults, 'calendar.get_economic_calendar');
  const scenario = findToolData(toolResults, 'scenario.get_monte_carlo');

  if (!(intent === 'execution-guidance' || level != null)) {
    return { conclusion: null, supportingSignals: [], caveats: [], watchItems: [], guidance: [], promptLines: [], confidence: null };
  }

  const currentPrice = flow?.price ?? pressure?.price ?? pivots?.price ?? null;
  const atr = flow?.atr14 ?? (currentPrice != null ? Math.max(currentPrice * 0.004, 0.5) : 1);
  const tolerance = Math.max(atr * 0.2, currentPrice != null ? currentPrice * 0.0015 : 0.5, 0.5);
  const zones = [
    { label: 'put wall', value: flow?.putWall ?? null, kind: 'support' },
    { label: 'mapped support', value: pivots?.mappedSupport?.price ?? null, kind: 'support' },
    { label: 'value area low', value: profile?.valueAreaLow ?? null, kind: 'support' },
    { label: 'support S1', value: pivots?.supports?.[0] ?? null, kind: 'support' },
    { label: 'pivot', value: pivots?.pivot ?? null, kind: 'balance' },
    { label: 'POC', value: profile?.poc ?? null, kind: 'balance' },
    { label: 'dynamic level', value: pivots?.dynamicLevel ?? null, kind: 'balance' },
    { label: 'gamma flip', value: flow?.gammaFlip ?? null, kind: 'balance' },
    { label: 'value area high', value: profile?.valueAreaHigh ?? null, kind: 'resistance' },
    { label: 'resistance R1', value: pivots?.resistances?.[0] ?? null, kind: 'resistance' },
    { label: 'mapped resistance', value: pivots?.mappedResistance?.price ?? null, kind: 'resistance' },
    { label: 'call wall', value: flow?.callWall ?? null, kind: 'resistance' },
  ].filter((zone) => zone.value != null) as Array<{ label: string; value: number; kind: 'support' | 'balance' | 'resistance' }>;

  const nearest = level == null || !zones.length
    ? null
    : [...zones].sort((left, right) => Math.abs(level - left.value) - Math.abs(level - right.value))[0];

  const isExit = /(exit|take profit|tp|trim|close)/.test(q);
  const wantsShort = /(short|sell)/.test(q) && !/(exit short|cover)/.test(q);
  const wantsLong = /(long|buy)/.test(q) || (!wantsShort && !isExit);
  const supportiveMacro = macro?.goldBias === 'bullish' || macro?.regime === 'risk-off with haven support';
  const hostileMacro = macro?.goldBias === 'bearish';
  const bullishPressure = ((pressure?.score ?? 0) > 12) || ((orderflow?.buySellPressure ?? 0) > 15);
  const bearishPressure = ((pressure?.score ?? 0) < -12) || ((orderflow?.buySellPressure ?? 0) < -15);
  const bullishFlow = (flow?.netFlowScore ?? 0) > 10;
  const bearishFlow = (flow?.netFlowScore ?? 0) < -10;
  const resistanceCluster = level != null && (
    compareNear(level, pivots?.mappedResistance?.price, tolerance)
    || compareNear(level, profile?.valueAreaHigh, tolerance)
    || compareNear(level, pivots?.resistances?.[0], tolerance)
    || compareNear(level, flow?.callWall, tolerance)
  );
  const supportCluster = level != null && (
    compareNear(level, pivots?.mappedSupport?.price, tolerance)
    || compareNear(level, profile?.valueAreaLow, tolerance)
    || compareNear(level, pivots?.supports?.[0], tolerance)
    || compareNear(level, flow?.putWall, tolerance)
  );

  const supportingSignals = [
    currentPrice != null ? `current price ${currentPrice.toFixed(2)}` : null,
    nearest ? `nearest structure ${nearest.label} ${nearest.value.toFixed(2)}` : null,
    pressure?.score != null ? `pressure ${pressure.dominance} (${pressure.score})` : null,
    orderflow?.buySellPressure != null ? `orderflow ${orderflow.dominance} (${orderflow.buySellPressure})` : null,
    orderflow?.priceDeltaDivergence && orderflow.priceDeltaDivergence !== 'none' ? `${orderflow.priceDeltaDivergence} (${orderflow.divergenceDetail})` : null,
    scenario?.targetHitProbability != null ? `MC target ${scenario.targetHitProbability}% / invalidation ${scenario.invalidationProbability}%` : null,
    pivots?.signalMap?.bias ? `pivot map ${pivots.signalMap.bias}` : null,
    flow?.flowBias ? `options flow ${flow.flowBias}` : null,
    flow?.dealerPositioning ? `dealer posture ${flow.dealerPositioning}` : null,
  ].filter((value): value is string => Boolean(value));

  const caveats = [
    pressure?.mode && pressure.mode !== 'direct' ? `pressure is ${pressure.mode}, not true aggressor tape` : null,
    orderflow?.feedQuality === 'weak' ? 'orderflow feed quality is weak here, so footprint-style readings are estimated rather than tape-true' : null,
    flow?.mode === 'synthetic-live' ? 'options flow is synthetic and inferred from live market behavior, not from a paid OPRA-style feed' : null,
    scenario?.sourceLabel ? scenario.sourceLabel : null,
    nearest && level != null && Math.abs(level - nearest.value) > (tolerance * 1.8) ? 'the requested level is not tightly aligned with the main nearby structure cluster' : null,
  ].filter((value): value is string => Boolean(value));

  const watchItems = [
    supportCluster ? 'watch for acceptance back above support cluster after the touch' : null,
    resistanceCluster ? 'watch for rejection or stalling into the resistance cluster' : null,
    pressure?.structureState ? `watch whether price stays ${pressure.structureState}` : null,
    orderflow?.absorptionSignal && orderflow.absorptionSignal !== 'none' ? `watch ${orderflow.absorptionSignal}` : null,
    orderflow?.exhaustionSignal && orderflow.exhaustionSignal !== 'none' ? `watch ${orderflow.exhaustionSignal}` : null,
    orderflow?.priceDeltaDivergence && orderflow.priceDeltaDivergence !== 'none' ? `watch ${orderflow.divergenceDetail}` : null,
    calendar?.summary ? `watch calendar risk: ${calendar.summary}` : null,
    flow?.squeezeRisk ? `watch squeeze risk ${flow.squeezeRisk} around gamma walls` : null,
  ].filter((value): value is string => Boolean(value));

  let conclusion = 'Execution is mixed; structure and pressure are not clean enough to call this an obvious action zone.';
  let confidence: 'low' | 'medium' | 'high' = 'medium';

  if (level == null) {
    const entryFloor = [profile?.valueAreaLow, pivots?.pivot, profile?.poc].filter((value): value is number => value != null);
    const entryZone = entryFloor.length ? `${Math.min(...entryFloor).toFixed(2)} - ${Math.max(...entryFloor).toFixed(2)}` : 'structure unavailable';
    const trimZone = [profile?.valueAreaHigh, pivots?.resistances?.[0], flow?.callWall].filter((value): value is number => value != null);
    conclusion = `Best active entry reference is ${entryZone}; trim or reassess into ${trimZone.length ? trimZone.slice(0, 3).map((value) => value.toFixed(2)).join(' / ') : 'the next resistance cluster'}.`;
    confidence = bullishPressure || bearishPressure || Math.abs(flow?.netFlowScore ?? 0) > 14 ? 'medium' : 'low';
  } else if (isExit) {
    if (resistanceCluster && !(bullishPressure && bullishFlow)) {
      conclusion = `Level ${level.toFixed(2)} reads like a reasonable trim or exit zone because it is pressing into resistance structure while follow-through is not overwhelmingly supportive.`;
      confidence = 'high';
    } else if (supportCluster && bullishPressure && !hostileMacro) {
      conclusion = `Level ${level.toFixed(2)} is closer to support than to a natural exit pocket, so a full exit there looks premature unless this is your invalidation line.`;
      confidence = 'medium';
    } else {
      conclusion = `Level ${level.toFixed(2)} is usable for a tactical reduction, but it is not the cleanest structural exit on the board right now.`;
      confidence = 'medium';
    }
  } else if (wantsShort) {
    if (resistanceCluster && bearishPressure && bearishFlow) {
      conclusion = `Level ${level.toFixed(2)} is a credible short-entry zone because it sits near resistance and the live pressure / flow stack is leaning bearish.`;
      confidence = 'high';
    } else if (supportCluster) {
      conclusion = `Level ${level.toFixed(2)} is too close to support for a clean fresh short unless you are trading a confirmed breakdown through that shelf.`;
      confidence = 'medium';
    } else {
      conclusion = `Level ${level.toFixed(2)} is not a poor short level, but you still need rejection behavior because the structure cluster is not decisive yet.`;
      confidence = 'medium';
    }
  } else if (wantsLong) {
    if (supportCluster && bullishPressure && (bullishFlow || !bearishFlow) && !hostileMacro) {
      conclusion = `Level ${level.toFixed(2)} is a credible long-entry zone because it sits near support while live pressure is constructive and options flow is not fighting the idea.`;
      confidence = 'high';
    } else if (resistanceCluster && !bullishPressure) {
      conclusion = `Level ${level.toFixed(2)} looks more like a chase zone than a clean long entry because it is already near overhead resistance with limited structural edge.`;
      confidence = 'high';
    } else {
      conclusion = `Level ${level.toFixed(2)} is tradable only if price shows acceptance there first; without that, the level is more neutral than high-conviction.`;
      confidence = 'medium';
    }
  }

  const guidance = [
    currentPrice != null ? `Spot reference: ${currentPrice.toFixed(2)}.` : null,
    nearest ? `Nearest structure: ${nearest.label} ${nearest.value.toFixed(2)}.` : null,
    pivots?.supports?.[0] != null ? `Harder invalidation sits below ${pivots.supports[0].toFixed(2)}.` : null,
    pivots?.resistances?.[0] != null ? `First overhead reaction zone is ${pivots.resistances[0].toFixed(2)}.` : null,
    pivots?.mappedSupport?.price != null ? `Mapped institutional support sits at ${pivots.mappedSupport.price.toFixed(2)}.` : null,
    pivots?.mappedResistance?.price != null ? `Mapped institutional resistance sits at ${pivots.mappedResistance.price.toFixed(2)}.` : null,
    flow?.callWall != null && flow?.putWall != null ? `Gamma map is ${flow.putWall.toFixed(2)} / ${flow.gammaFlip.toFixed(2)} / ${flow.callWall.toFixed(2)}.` : null,
  ].filter((value): value is string => Boolean(value));

  return {
    conclusion,
    supportingSignals,
    caveats,
    watchItems,
    guidance,
    promptLines: [
      `Level under review: ${level != null ? level.toFixed(2) : 'none explicitly provided'}`,
      `Current price: ${currentPrice != null ? currentPrice.toFixed(2) : 'unknown'}`,
      `Nearest structure: ${nearest ? `${nearest.label} ${nearest.value.toFixed(2)}` : 'unknown'}`,
      `Pressure: ${pressure?.dominance ?? 'unknown'} / ${pressure?.score ?? 'n/a'} / ${pressure?.structureState ?? 'unknown'}`,
      `Pivot map: ${pivots?.signalMap?.bias ?? 'unknown'} / dynamic ${pivots?.dynamicState ?? 'unknown'}`,
      `Orderflow: ${orderflow?.dominance ?? 'unknown'} / ${orderflow?.buySellPressure ?? 'n/a'} / ratio ${orderflow?.bidAskPressureRatio ?? 'n/a'} / imbalance ${orderflow?.quoteImbalance ?? 'n/a'} / divergence ${orderflow?.priceDeltaDivergence ?? 'none'}`,
      `Flow proxy: ${flow?.flowBias ?? 'unknown'} / ${flow?.dealerPositioning ?? 'unknown'} / squeeze ${flow?.squeezeRisk ?? 'unknown'}`,
      `Monte Carlo: ${scenario?.pathBias ?? 'unknown'} / target ${scenario?.targetHitProbability ?? 'n/a'}% / invalidation ${scenario?.invalidationProbability ?? 'n/a'}% / support ${scenario?.supportHoldProbability ?? 'n/a'}%`,
      `Calendar: ${calendar?.summary ?? 'calendar unavailable'}`,
    ],
    confidence,
  };
}

function buildDeterministicAnswer(
  question: string,
  intent: string,
  context: ReturnType<typeof compactContext>,
  provider: string,
  toolsUsed: string[],
  providerTrace: string[],
  marketDataTrace: string[],
  executionLens: ReturnType<typeof buildExecutionLens>,
): VaultumAiStructuredAnswer {
  const fallbackConclusion =
    context.summary[0]
      ?? context.confirmed[0]
      ?? `Question assessed under ${intent} with partial market context.`;

  const conclusion = executionLens.conclusion ?? fallbackConclusion;
  const supportingSignals = [...executionLens.supportingSignals, ...context.confirmed, ...context.inferred].filter(Boolean).slice(0, 6);
  const caveats = [...executionLens.caveats, ...(context.missing.length ? context.missing : ['No major missing-data warning surfaced in the selected tool set.'])].slice(0, 6);
  const watchItems = [
    ...executionLens.watchItems,
    'Watch whether price action confirms the regime rather than diverges from it.',
    'Watch dollar, yields, and volatility together for confirmation or invalidation.',
    'Watch options and positioning only as market-structure context, not certainty.',
    'Watch execution quality only when structure, pressure, and regime line up together.',
  ].slice(0, 6);
  const executionGuidance = executionLens.guidance.length
    ? executionLens.guidance
    : [
      'Prefer entries when price is aligned with regime, pivot structure, and pressure state.',
      'Avoid fresh execution when risk proxies are elevated or the data mix is degraded.',
    ];

  const confidence = executionLens.confidence ?? (context.missing.length >= 2 ? 'low' : 'medium');
  const answer = [
    `Conclusion: ${conclusion}`,
    `Strongest supporting signals: ${supportingSignals.join(' | ') || 'insufficient live signals'}`,
    `Caveats: ${caveats.join(' | ')}`,
    `Estimated/proxy signals: ${context.estimated.join(' | ') || 'none'}`,
    `Confirm / invalidate: follow price acceptance around pivots, POC, value-area edges, and gamma walls.`,
    `What to watch: ${watchItems.join(' | ')}`,
    `Execution guidance: ${executionGuidance.join(' | ')}`,
    `Confidence: ${confidence}`,
  ].join('\n');

  return {
    provider,
    providerTrace,
    marketDataTrace,
    intent: intent as VaultumAiStructuredAnswer['intent'],
    toolsUsed,
    confidence,
    conclusion,
    supportingSignals,
    caveats,
    watchItems,
    confirmedSignals: context.confirmed,
    inferredImplications: context.inferred,
    estimatedSignals: context.estimated,
    missingData: context.missing,
    answer,
    contextSnapshot: [
      `Question: ${question}`,
      `Intent: ${intent}`,
      `Confirmed: ${context.confirmed.join('; ') || 'none'}`,
      `Inferred: ${context.inferred.join('; ') || 'none'}`,
      `Estimated: ${context.estimated.join('; ') || 'none'}`,
      `Missing: ${context.missing.join('; ') || 'none'}`,
      ...executionLens.promptLines,
    ].join('\n'),
  };
}

export async function askVaultum(input: { question: string }): Promise<VaultumAiStructuredAnswer> {
  const question = (input.question || '').trim();
  const intent = classifyIntent(question || 'macro regime');
  const plannedTools = planTools(question, intent);

  const toolResults = await Promise.all(
    plannedTools.map(async (tool) => ({
      name: tool.name,
      data: await callVaultumAiTool(tool.name as VaultumAiToolName, tool.input),
    })),
  );

  const context = compactContext(toolResults);
  const configuredProviders = discoverAiProviders().map((provider) => `${provider.provider}:${provider.model}`);
  const marketDataTrace = buildMarketFeedTrace(toolResults);
  const executionLens = buildExecutionLens(question, intent, toolResults);

  const external = await callChatProvider(
    VAULTUM_SYSTEM_PROMPT,
    [
      `Question: ${question}`,
      `Intent: ${intent}`,
      `Tools used: ${plannedTools.map((tool) => tool.name).join(', ')}`,
      `Confirmed signal: ${context.confirmed.join(' | ') || 'none'}`,
      `Inferred implication: ${context.inferred.join(' | ') || 'none'}`,
      `Estimated/proxy signal: ${context.estimated.join(' | ') || 'none'}`,
      `Missing/uncertain data: ${context.missing.join(' | ') || 'none'}`,
      ...executionLens.promptLines,
      'Return the answer in terminal analyst style with conclusion, strongest supporting signals, caveats, confirm/invalidate levels, what to watch, confidence, and execution guidance if relevant.',
    ].join('\n'),
  );

  const structured = buildDeterministicAnswer(
    question,
    intent,
    context,
    external.provider ?? 'deterministic-fallback:vaultum-rule-engine',
    plannedTools.map((tool) => tool.name),
    external.attempted.length ? external.attempted : configuredProviders,
    marketDataTrace,
    executionLens,
  );

  if (!external.content || !external.provider) return structured;

  return {
    ...structured,
    provider: external.provider,
    answer: external.content,
  };
}
