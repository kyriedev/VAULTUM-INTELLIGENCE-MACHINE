import { callVaultumAiTool, type VaultumAiToolName } from './tool-dispatch';
import { VAULTUM_SYSTEM_PROMPT, type VaultumAiStructuredAnswer, callChatProvider, discoverAiProviders } from './_shared';
import { classifyIntent, planTools } from './planner';
import { describeBrokerStack } from '../../_shared/feed-status';
import { recallSituationMemories } from '../../analytics/v1/_situation-memory';

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

    if (name === 'monitor.get_institutional_monitor') {
      if (data.summary) summary.push(data.summary);
      if (Array.isArray(data.items)) {
        confirmed.push(
          ...data.items
            .filter((item: any) => item.confidence === 'high')
            .slice(0, 4)
            .map((item: any) => `${item.label} ${item.state} ${item.confidenceScore}`),
        );
        inferred.push(
          ...data.items
            .filter((item: any) => item.confidence !== 'low')
            .slice(0, 4)
            .map((item: any) => item.summary),
        );
        estimated.push(
          ...data.items
            .filter((item: any) => item.status === 'estimated')
            .slice(0, 3)
            .map((item: any) => `${item.label} ${item.state} ${item.confidenceScore}`),
        );
      }
      if (Array.isArray(data.alerts)) {
        inferred.push(...data.alerts.slice(0, 3));
      }
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
      const predictiveEvent = data.predictiveSignals?.[0];
      if (predictiveEvent) {
        inferred.push(`calendar chain ${predictiveEvent.targetCurrency} ${predictiveEvent.targetEvent} ${predictiveEvent.direction} ${predictiveEvent.confidence}`);
        summary.push(predictiveEvent.summary);
        estimated.push('calendar chain uses desk heuristics from earlier released events');
      }
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

    if (name === 'market.get_tradingview_research') {
      if (data.summary) summary.push(data.summary);
      if (data.selectedRecommendation && data.selectedRecommendation !== 'unavailable') {
        inferred.push(`tradingview ${data.selectedTimeframe} ${data.selectedRecommendation}`);
      }
      if (data.consensus) inferred.push(`tradingview consensus ${data.consensus}`);
      if (data.matchedSymbolId) confirmed.push(`tradingview match ${data.matchedSymbolId}`);
      if (Array.isArray(data.warnings)) estimated.push(...data.warnings.slice(0, 2));
      if (data.unavailable) missing.push('tradingview research sidecar unavailable');
    }

    if (name === 'market.get_twelve_data_research') {
      if (data.summary) summary.push(data.summary);
      if (data.selectedRecommendation && data.selectedRecommendation !== 'unavailable') {
        inferred.push(`twelve data ${data.selectedInterval} ${data.selectedRecommendation}`);
      }
      if (data.consensus) inferred.push(`twelve data consensus ${data.consensus}`);
      if (data.marketStateLabel) confirmed.push(`twelve data session ${data.marketStateLabel}`);
      if (data.matchedSymbolId) confirmed.push(`twelve data match ${data.matchedSymbolId}`);
      if (data.percentChange != null) confirmed.push(`twelve data change ${data.percentChange >= 0 ? '+' : ''}${Number(data.percentChange).toFixed(2)}%`);
      const rsi = data.indicators?.rsi;
      const adx = data.indicators?.adx;
      const macdHist = data.indicators?.macdHist;
      if (rsi != null) inferred.push(`twelve data RSI ${Number(rsi).toFixed(1)}`);
      if (adx != null) inferred.push(`twelve data ADX ${Number(adx).toFixed(1)}`);
      if (macdHist != null) inferred.push(`twelve data MACD hist ${Number(macdHist).toFixed(3)}`);
      if (Array.isArray(data.warnings)) estimated.push(...data.warnings.slice(0, 2));
      if (data.unavailable) missing.push('twelve data research sidecar unavailable');
    }

    if (name === 'market.get_yahoo_research') {
      if (data.summary) summary.push(data.summary);
      if (data.matchedSymbolId) confirmed.push(`yahoo match ${data.matchedSymbolId}`);
      if (data.percentChange != null) confirmed.push(`yahoo move ${data.percentChange >= 0 ? '+' : ''}${Number(data.percentChange).toFixed(2)}%`);
      if (data.sentiment && data.sentiment !== 'unavailable') inferred.push(`yahoo catalyst ${data.sentiment}`);
      if (Array.isArray(data.headlines) && data.headlines.length) inferred.push(`yahoo headlines ${data.headlines.length}`);
      if (Array.isArray(data.boards) && data.boards.length) inferred.push(`yahoo boards ${data.boards.map((board: any) => board.label).join('/')}`);
      if (Array.isArray(data.warnings)) estimated.push(...data.warnings.slice(0, 2));
      if (data.unavailable) missing.push('yahoo research sidecar unavailable');
    }

    if (name === 'market.get_finnhub_research') {
      if (data.summary) summary.push(data.summary);
      if (data.matchedSymbolId) confirmed.push(`finnhub match ${data.matchedSymbolId}`);
      if (data.percentChange != null) confirmed.push(`finnhub move ${data.percentChange >= 0 ? '+' : ''}${Number(data.percentChange).toFixed(2)}%`);
      if (data.sessionLabel) confirmed.push(`finnhub session ${data.sessionLabel}`);
      if (data.technicalSignal && data.technicalSignal !== 'unavailable') inferred.push(`finnhub ${data.selectedResolution} ${data.technicalSignal}`);
      if (data.technicalBias && data.technicalBias !== 'unavailable') inferred.push(`finnhub bias ${data.technicalBias}`);
      if (data.levels?.support != null) inferred.push(`finnhub support ${Number(data.levels.support).toFixed(2)}`);
      if (data.levels?.resistance != null) inferred.push(`finnhub resistance ${Number(data.levels.resistance).toFixed(2)}`);
      if (data.pattern?.name) inferred.push(`finnhub pattern ${data.pattern.name} ${data.pattern.bias ?? 'neutral'}`);
      if (data.sentiment?.bullishPercent != null) inferred.push(`finnhub bull ${Number(data.sentiment.bullishPercent).toFixed(1)}% / bear ${Number(data.sentiment?.bearishPercent ?? 0).toFixed(1)}%`);
      if (data.upcomingEvent?.date) inferred.push(`finnhub event ${data.upcomingEvent.label} ${data.upcomingEvent.date}`);
      if (Array.isArray(data.headlines) && data.headlines.length) inferred.push(`finnhub headlines ${data.headlines.length}`);
      if (Array.isArray(data.warnings)) estimated.push(...data.warnings.slice(0, 2));
      if (data.unavailable) missing.push('finnhub research sidecar unavailable');
    }

    if (name === 'prediction.list_prediction_markets') {
      const market = data.markets?.[0];
      if (market) {
        inferred.push(`prediction market ${market.venue} ${market.title} ${(market.probability * 100).toFixed(1)}%`);
      }
      if (data.summary) summary.push(data.summary);
      if (data.crowdBias) inferred.push(`crowd bias ${data.crowdBias}`);
      if (data.convictionScore != null) inferred.push(`crowd conviction ${data.convictionScore}`);
      if (data.uncertaintyScore != null) inferred.push(`crowd surprise risk ${data.uncertaintyScore}`);
      if (data.longshotShare != null) inferred.push(`longshot share ${data.longshotShare}% / favorite share ${data.favoriteShare ?? 'n/a'}%`);
      if (data.spreadCostBps != null) estimated.push(`prediction spread cost ${data.spreadCostBps}bps`);
      if (data.executionCostBps != null) estimated.push(`prediction execution cost ${data.executionCostBps}bps`);
      if (data.fillQualityPct != null) inferred.push(`prediction fill quality ${data.fillQualityPct}% / ${data.liquidityQuality ?? 'unknown'} books`);
      if (data.orderbookBias) inferred.push(`prediction orderbook ${data.orderbookBias}`);
      if (data.unavailable) missing.push('prediction market layer unavailable');
    }

    if (name === 'options.get_gamma_levels') {
      confirmed.push(`call wall ${data.callWall}`);
      confirmed.push(`put wall ${data.putWall}`);
      inferred.push(`gamma flip ${data.gammaFlip}`);
      inferred.push(`ATM IV ${data.theoreticalAtmVol ?? 'n/a'}% / skew ${data.downsideSkew ?? 'n/a'}`);
      inferred.push(`greek QA ${data.greekAgreementScore ?? 'n/a'} / solver ${data.ivSolverMethod ?? 'unknown'}`);
      inferred.push(`smile fit ${data.surfaceFit?.quality ?? 'unknown'} / rr25 ${data.surfaceFit?.riskReversal1m ?? 'n/a'} / bf25 ${data.surfaceFit?.butterfly1m ?? 'n/a'}`);
      estimated.push(data.sourceLabel ?? 'synthetic gamma engine');
    }

    if (name === 'options.get_flow_proxy') {
      inferred.push(data.explanation);
      confirmed.push(`options flow ${data.flowBias}`);
      inferred.push(`expected move 1W ${data.expectedMove1w ?? 'n/a'} / 1M ${data.expectedMove1m ?? 'n/a'}`);
      inferred.push(`featured options package ${data.featuredStrategy ?? 'unknown'}`);
      inferred.push(`american exercise lens ${data.americanExerciseRisk ?? 'unknown'}`);
      estimated.push(data.sourceLabel ?? 'synthetic options flow');
    }

    if (name === 'orderflow.get_engine') {
      confirmed.push(`orderflow ${data.dominance ?? 'unknown'}`);
      inferred.push(`bid/ask ratio ${data.bidAskPressureRatio ?? 'n/a'} / imbalance ${data.quoteImbalance ?? 'n/a'}`);
      if (data.aggregateVolumePressure != null) inferred.push(`normalized broker-volume sidecar ${data.aggregateVolumeDominance ?? 'unknown'} ${data.aggregateVolumePressure}`);
      inferred.push(`absorption ${data.absorptionSignal ?? 'none'} / exhaustion ${data.exhaustionSignal ?? 'none'}`);
      if (data.priceDeltaDivergence && data.priceDeltaDivergence !== 'none') {
        inferred.push(`price/delta ${data.priceDeltaDivergence}`);
      }
      estimated.push(data.sourceLabel ?? 'orderflow proxy');
    }

    if (name === 'scenario.get_monte_carlo') {
      confirmed.push(`scenario ${data.pathBias ?? 'unknown'} / ${data.pathMethod ?? 'unknown'}`);
      inferred.push(`target first ${data.targetFirstProbability ?? 'n/a'}% / invalidation first ${data.invalidationFirstProbability ?? 'n/a'}%`);
      inferred.push(`support hold ${data.supportHoldProbability ?? 'n/a'}% / break even ${data.breakEvenProbability ?? 'n/a'}%`);
      inferred.push(`median max drawdown ${data.medianMaxDrawdownPct ?? 'n/a'}% / tail ${data.tailLossPct ?? 'n/a'}%`);
    }

    if (name === 'options.get_dealer_pressure') {
      inferred.push(data.conclusion);
      inferred.push(`dealer corridor ${data.dealerCorridorWidth ?? 'n/a'} / ATM IV ${data.theoreticalAtmVol ?? 'n/a'}%`);
      inferred.push(`greek QA ${data.greekAgreementScore ?? 'n/a'} / solver ${data.ivSolverMethod ?? 'unknown'}`);
      inferred.push(`smile fit ${data.surfaceFit?.quality ?? 'unknown'} / rr25 ${data.surfaceFit?.riskReversal1m ?? 'n/a'}`);
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

    if (name === 'analytics.get_trader_report' || name === 'intelligence.get_market_brief') {
      summary.push(data.summary);
      inferred.push(data.actionPlan);
      if (data.riskWatch) inferred.push(data.riskWatch);
      if (data.executionCommittee?.summary) inferred.push(`execution committee ${data.executionCommittee.action} / ${data.executionCommittee.ensembleScore}`);
      if (data.riskEnvelope?.body) inferred.push(data.riskEnvelope.body);
      if (Array.isArray(data.reportMeasures)) {
        confirmed.push(...data.reportMeasures.slice(0, 6).map((measure: any) => `${measure.label} ${measure.value}`));
      }
      if (Array.isArray(data.signalDiagnostics)) {
        confirmed.push(
          ...data.signalDiagnostics
            .filter((signal: any) => signal.confidence === 'high' || signal.status === 'confirmed')
            .slice(0, 4)
            .map((signal: any) => `${signal.label} ${signal.confidence} ${signal.confidenceScore}`),
        );
        estimated.push(
          ...data.signalDiagnostics
            .filter((signal: any) => signal.status === 'estimated')
            .slice(0, 3)
            .map((signal: any) => `${signal.label} ${signal.confidence} ${signal.confidenceScore}`),
        );
      }
      if (Array.isArray(data.decisionStages)) {
        const technicalStage = data.decisionStages.find((stage: any) => stage.key === 'technical-committee');
        const riskStage = data.decisionStages.find((stage: any) => stage.key === 'risk-envelope');
        if (technicalStage?.body) inferred.push(technicalStage.body);
        if (riskStage?.body) inferred.push(riskStage.body);
      }
    }

    if (name === 'analytics.get_entry_map') {
      if (data.executionRead) summary.push(data.executionRead);
      if (data.tradeThesisSummary) inferred.push(data.tradeThesisSummary);
      if (data.phaseSummary) inferred.push(data.phaseSummary);
      if (data.biasLabel) confirmed.push(`entry map ${data.biasLabel}`);
      if (data.breakOfStructure) confirmed.push(data.breakOfStructure);
      if (data.institutionalReference) confirmed.push(`institutional reference ${data.institutionalReference}`);
      if (data.premiumDiscountState) inferred.push(data.premiumDiscountState);
      if (data.modelTwoConfluenceSummary) inferred.push(data.modelTwoConfluenceSummary);
      if (data.footprintConfluence) inferred.push(data.footprintConfluence);
      if (data.absorptionContext) inferred.push(data.absorptionContext);
      if (data.triggerPattern) inferred.push(`trigger ${data.triggerPattern}`);
      if (data.entryZone) confirmed.push(`entry zone ${data.entryZone}`);
      if (data.trimZone) inferred.push(`trim zone ${data.trimZone}`);
      if (data.invalidationLevel) inferred.push(`invalidation ${data.invalidationLevel}`);
      if (Array.isArray(data.noTradeReasons) && data.noTradeReasons.length) {
        estimated.push(...data.noTradeReasons.slice(0, 2));
      }
      if (data.sourceLabel) estimated.push(data.sourceLabel);
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
      if (data.mappedSupport?.buyersPct != null) inferred.push(`buyer concentration ${Number(data.mappedSupport.buyersPct).toFixed(1)}%`);
      if (data.mappedResistance?.sellersPct != null) inferred.push(`seller concentration ${Number(data.mappedResistance.sellersPct).toFixed(1)}%`);
      if (data.dynamicLevel != null) inferred.push(`POC ${data.dynamicLevel} / ${data.dynamicState ?? 'unknown'}`);
      if (data.signalMap?.bias) inferred.push(`pivot map ${data.signalMap.bias}`);
      if (Array.isArray(data.alerts) && data.alerts.length) inferred.push(...data.alerts.slice(0, 2));
      if (data.regime?.summary) inferred.push(`structure regime ${data.regime.summary}`);
      if (data.unavailable) missing.push('pivot structure unavailable');
    }

    if (name === 'pressure.get_buyer_seller_pressure') {
      estimated.push(`buyer/seller pressure ${data.mode ?? 'unknown'} mode`);
      inferred.push(`${data.dominance ?? 'unknown'} pressure`);
      if (data.confidence != null) inferred.push(`pressure confidence ${data.confidence}`);
      if (data.aggregateVolumePressure != null) inferred.push(`normalized broker-volume sidecar ${data.aggregateVolumeDominance ?? 'unknown'} ${data.aggregateVolumePressure}`);
      if (data.structurePressureScore != null) inferred.push(`pressure structure ${data.structurePressureScore}`);
      if (data.volumePressureScore != null) inferred.push(`pressure volume ${data.volumePressureScore}`);
      inferred.push(`intraday impulse ${data.intradayImpulse ?? 'n/a'} / cumulative ${data.cumulativePressure ?? 'n/a'}`);
      if (Array.isArray(data.drivers) && data.drivers.length) inferred.push(...data.drivers.slice(0, 2));
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

  const traderReport = findToolData(toolResults, 'analytics.get_trader_report') ?? findToolData(toolResults, 'intelligence.get_market_brief');
  if (Array.isArray(traderReport?.sourceTrace)) {
    feeds.push(...traderReport.sourceTrace);
  }
  if (Array.isArray(traderReport?.signalDiagnostics)) {
    feeds.push(...traderReport.signalDiagnostics.flatMap((signal: any) => Array.isArray(signal.sources) ? signal.sources : []));
  }

  const entryMap = findToolData(toolResults, 'analytics.get_entry_map');
  if (entryMap?.sourceLabel) {
    feeds.push(entryMap.sourceLabel);
  }

  const tradingViewResearch = findToolData(toolResults, 'market.get_tradingview_research');
  if (tradingViewResearch?.sourceLabel) {
    feeds.push(tradingViewResearch.sourceLabel);
  }

  const twelveDataResearch = findToolData(toolResults, 'market.get_twelve_data_research');
  if (twelveDataResearch?.sourceLabel) {
    feeds.push(twelveDataResearch.sourceLabel);
  }

  const yahooResearch = findToolData(toolResults, 'market.get_yahoo_research');
  if (yahooResearch?.sourceLabel) {
    feeds.push(yahooResearch.sourceLabel);
  }

  const finnhubResearch = findToolData(toolResults, 'market.get_finnhub_research');
  if (finnhubResearch?.sourceLabel) {
    feeds.push(finnhubResearch.sourceLabel);
  }

  return [...new Set(feeds)];
}

function inferPrimaryMarket(toolResults: Array<{ name: string; data: any }>): string {
  const traderReport = findToolData(toolResults, 'analytics.get_trader_report') ?? findToolData(toolResults, 'intelligence.get_market_brief');
  if (traderReport?.market) return String(traderReport.market).toUpperCase();

  const candidates = toolResults
    .map(({ data }) => data?.market ?? data?.symbol ?? null)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  return (candidates[0] ?? 'XAUUSD').toUpperCase();
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
  const traderReport = findToolData(toolResults, 'analytics.get_trader_report') ?? findToolData(toolResults, 'intelligence.get_market_brief');
  const entryMap = findToolData(toolResults, 'analytics.get_entry_map');
  const twelveDataResearch = findToolData(toolResults, 'market.get_twelve_data_research');
  const yahooResearch = findToolData(toolResults, 'market.get_yahoo_research');
  const finnhubResearch = findToolData(toolResults, 'market.get_finnhub_research');

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
    { label: 'POC', value: pivots?.dynamicLevel ?? null, kind: 'balance' },
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
  const committeeAction = traderReport?.executionCommittee?.action ?? null;
  const committeeScore = traderReport?.executionCommittee?.ensembleScore ?? null;
  const riskEnvelope = traderReport?.riskEnvelope ?? null;
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
    entryMap?.biasLabel ? `entry map ${entryMap.biasLabel}` : null,
    entryMap?.phase ? `phase ${entryMap.phase}` : null,
    entryMap?.breakOfStructure ? `BOS ${entryMap.breakOfStructure}` : null,
    entryMap?.institutionalReference ? `institutional reference ${entryMap.institutionalReference}` : null,
    entryMap?.premiumDiscountState ? entryMap.premiumDiscountState : null,
    entryMap?.modelTwoConfluenceSummary ? entryMap.modelTwoConfluenceSummary : null,
    entryMap?.footprintConfluence ? entryMap.footprintConfluence : null,
    entryMap?.absorptionContext ? entryMap.absorptionContext : null,
    entryMap?.triggerPattern ? `trigger ${entryMap.triggerPattern}` : null,
    entryMap?.entryZone ? `entry zone ${entryMap.entryZone}` : null,
    currentPrice != null ? `current price ${currentPrice.toFixed(2)}` : null,
    nearest ? `nearest structure ${nearest.label} ${nearest.value.toFixed(2)}` : null,
    pressure?.score != null ? `pressure ${pressure.dominance} (${pressure.score})` : null,
    pressure?.macroProxyPressure != null && pressure?.macroProxyBias && pressure.macroProxyBias !== 'not_applicable'
      ? `fx macro proxy ${pressure.macroProxyBias} (${pressure.macroProxyPressure})`
      : null,
    orderflow?.buySellPressure != null ? `orderflow ${orderflow.dominance} (${orderflow.buySellPressure})` : null,
    orderflow?.macroProxyPressure != null && orderflow?.macroProxyBias && orderflow.macroProxyBias !== 'not_applicable'
      ? `orderflow macro proxy ${orderflow.macroProxyBias} (${orderflow.macroProxyPressure})`
      : null,
    orderflow?.priceDeltaDivergence && orderflow.priceDeltaDivergence !== 'none' ? `${orderflow.priceDeltaDivergence} (${orderflow.divergenceDetail})` : null,
    scenario?.targetFirstProbability != null ? `MC target-first ${scenario.targetFirstProbability}% / invalidation-first ${scenario.invalidationFirstProbability}%` : null,
    pivots?.signalMap?.bias ? `pivot map ${pivots.signalMap.bias}` : null,
    flow?.flowBias ? `options flow ${flow.flowBias}` : null,
    flow?.dealerPositioning ? `dealer posture ${flow.dealerPositioning}` : null,
    finnhubResearch?.technicalSignal && finnhubResearch.technicalSignal !== 'unavailable'
      ? `finnhub ${finnhubResearch.selectedResolution} ${finnhubResearch.technicalSignal}`
      : null,
    committeeAction ? `committee ${committeeAction}${committeeScore != null ? ` (${committeeScore})` : ''}` : null,
    riskEnvelope?.sizeBand ? `risk envelope ${riskEnvelope.sizeBand} / ${(riskEnvelope.riskBudgetPct * 100).toFixed(0)}% normal risk` : null,
  ].filter((value): value is string => Boolean(value));

  const caveats = [
    entryMap?.doNotExecute ? `entry map is standing down new execution: ${(entryMap.noTradeReasons ?? []).slice(0, 2).join(' | ')}` : null,
    pressure?.mode && pressure.mode !== 'direct' ? `pressure is ${pressure.mode}, not true aggressor tape` : null,
    orderflow?.feedQuality === 'weak' ? 'orderflow feed quality is weak here, so footprint-style readings are estimated rather than tape-true' : null,
    flow?.mode === 'synthetic-live' ? 'options flow is synthetic and inferred from live market behavior, not from a paid OPRA-style feed' : null,
    scenario?.sourceLabel ? scenario.sourceLabel : null,
    riskEnvelope?.tradeSuppression ? `the current risk gate is suppressing aggressive execution (${riskEnvelope.riskScore}/100)` : null,
    nearest && level != null && Math.abs(level - nearest.value) > (tolerance * 1.8) ? 'the requested level is not tightly aligned with the main nearby structure cluster' : null,
  ].filter((value): value is string => Boolean(value));

  const watchItems = [
    entryMap?.phaseSummary ? `watch phase state: ${entryMap.phaseSummary}` : null,
    entryMap?.institutionalReferenceZone ? `watch institutional zone: ${entryMap.institutionalReferenceZone}` : null,
    entryMap?.liquidityTargetContext ? `watch liquidity objective: ${entryMap.liquidityTargetContext}` : null,
    entryMap?.sessionTimingNotes?.[0] ? `watch session timing: ${entryMap.sessionTimingNotes[0]}` : null,
    supportCluster ? 'watch for acceptance back above support cluster after the touch' : null,
    resistanceCluster ? 'watch for rejection or stalling into the resistance cluster' : null,
    pressure?.structureState ? `watch whether price stays ${pressure.structureState}` : null,
    pressure?.macroProxyDetail ? `watch whether the macro proxy stays aligned: ${pressure.macroProxyDetail}` : null,
    orderflow?.absorptionSignal && orderflow.absorptionSignal !== 'none' ? `watch ${orderflow.absorptionSignal}` : null,
    orderflow?.exhaustionSignal && orderflow.exhaustionSignal !== 'none' ? `watch ${orderflow.exhaustionSignal}` : null,
    orderflow?.priceDeltaDivergence && orderflow.priceDeltaDivergence !== 'none' ? `watch ${orderflow.divergenceDetail}` : null,
    calendar?.summary ? `watch calendar risk: ${calendar.summary}` : null,
    calendar?.predictiveSignals?.[0]?.summary ? `watch calendar chain: ${calendar.predictiveSignals[0].summary}` : null,
    flow?.squeezeRisk ? `watch squeeze risk ${flow.squeezeRisk} around gamma walls` : null,
    finnhubResearch?.upcomingEvent?.date ? `watch Finnhub event timing ${finnhubResearch.upcomingEvent.label} ${finnhubResearch.upcomingEvent.date}` : null,
  ].filter((value): value is string => Boolean(value));

  let conclusion = 'Execution is mixed; structure and pressure are not clean enough to call this an obvious action zone.';
  let confidence: 'low' | 'medium' | 'high' = 'medium';

  if (level == null) {
    const entryFloor = [profile?.valueAreaLow, pivots?.pivot, profile?.poc].filter((value): value is number => value != null);
    const entryZone = entryFloor.length ? `${Math.min(...entryFloor).toFixed(2)} - ${Math.max(...entryFloor).toFixed(2)}` : 'structure unavailable';
    const trimZone = [profile?.valueAreaHigh, pivots?.resistances?.[0], flow?.callWall].filter((value): value is number => value != null);
    conclusion = entryMap?.executionRead
      ? `${entryMap.executionRead} Entry ${entryMap.entryZone}; trim ${entryMap.trimZone}; invalidation ${entryMap.invalidationLevel}.`
      : `Best active entry reference is ${entryZone}; trim or reassess into ${trimZone.length ? trimZone.slice(0, 3).map((value) => value.toFixed(2)).join(' / ') : 'the next resistance cluster'}.`;
    confidence = entryMap?.confidenceLabel ?? (bullishPressure || bearishPressure || Math.abs(flow?.netFlowScore ?? 0) > 14 ? 'medium' : 'low');
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
    if (!riskEnvelope?.tradeSuppression && resistanceCluster && bearishPressure && bearishFlow) {
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
    if (!riskEnvelope?.tradeSuppression && supportCluster && bullishPressure && (bullishFlow || !bearishFlow) && !hostileMacro) {
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
    entryMap?.tradeThesisSummary ? `Execution thesis: ${entryMap.tradeThesisSummary}` : null,
    entryMap?.targetLogic ? `Target logic: ${entryMap.targetLogic}` : null,
    entryMap?.breakOfStructure ? `Break of structure: ${entryMap.breakOfStructure}` : null,
    entryMap?.institutionalReferenceZone ? `Institutional reference zone: ${entryMap.institutionalReferenceZone} (${entryMap?.institutionalReference ?? 'reference pending'}).` : null,
    entryMap?.modelTwoConfluenceSummary ? `Model 2 confluence: ${entryMap.modelTwoConfluenceSummary}` : null,
    entryMap?.footprintConfluence ? `Footprint confluence: ${entryMap.footprintConfluence}` : null,
    entryMap?.absorptionContext ? `Absorption: ${entryMap.absorptionContext}` : null,
    currentPrice != null ? `Spot reference: ${currentPrice.toFixed(2)}.` : null,
    nearest ? `Nearest structure: ${nearest.label} ${nearest.value.toFixed(2)}.` : null,
    pivots?.supports?.[0] != null ? `Harder invalidation sits below ${pivots.supports[0].toFixed(2)}.` : null,
    pivots?.resistances?.[0] != null ? `First overhead reaction zone is ${pivots.resistances[0].toFixed(2)}.` : null,
    pivots?.mappedSupport?.price != null ? `Mapped buyer concentration support sits at ${pivots.mappedSupport.price.toFixed(2)}${pivots.mappedSupport.buyersPct != null ? ` (${Number(pivots.mappedSupport.buyersPct).toFixed(1)}% buyers)` : ''}.` : null,
    pivots?.mappedResistance?.price != null ? `Mapped seller concentration resistance sits at ${pivots.mappedResistance.price.toFixed(2)}${pivots.mappedResistance.sellersPct != null ? ` (${Number(pivots.mappedResistance.sellersPct).toFixed(1)}% sellers)` : ''}.` : null,
    pivots?.regime?.summary ? `Structure regime reads ${pivots.regime.summary}` : null,
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
      `Pressure stack: confidence ${pressure?.confidence ?? 'n/a'} / momentum ${pressure?.priceMomentumPressure ?? 'n/a'} / volume ${pressure?.volumePressureScore ?? 'n/a'} / structure ${pressure?.structurePressureScore ?? 'n/a'} / macro ${pressure?.macroProxyScore ?? 'n/a'} / vol ${pressure?.volatilityAdjustment ?? 'n/a'}`,
      `Entry map: ${entryMap?.biasLabel ?? 'unknown'} / phase ${entryMap?.phase ?? 'unknown'} / readiness ${entryMap?.readiness ?? 'unknown'} / BOS ${entryMap?.breakOfStructure ?? 'unknown'} / reference ${entryMap?.institutionalReference ?? 'unknown'} / zone ${entryMap?.entryZone ?? 'n/a'} / trim ${entryMap?.trimZone ?? 'n/a'} / invalidation ${entryMap?.invalidationLevel ?? 'n/a'} / trigger ${entryMap?.triggerPattern ?? 'unknown'} / model2 ${entryMap?.modelTwoConfluenceLabel ?? 'unknown'} ${entryMap?.modelTwoConfluenceScore ?? 'n/a'}`,
      `Pivot map: ${pivots?.signalMap?.bias ?? 'unknown'} / dynamic ${pivots?.dynamicState ?? 'unknown'} / buy concentration ${pivots?.mappedSupport?.buyersPct ?? 'n/a'} / sell concentration ${pivots?.mappedResistance?.sellersPct ?? 'n/a'} / regime ${pivots?.regime?.primaryCode ?? 'unknown'} / breakout ${pivots?.regime?.breakout?.level ?? 'none'} ${pivots?.regime?.breakout?.state ?? 'inside'}`,
      `Orderflow: ${orderflow?.dominance ?? 'unknown'} / ${orderflow?.buySellPressure ?? 'n/a'} / ratio ${orderflow?.bidAskPressureRatio ?? 'n/a'} / imbalance ${orderflow?.quoteImbalance ?? 'n/a'} / divergence ${orderflow?.priceDeltaDivergence ?? 'none'}`,
      `Flow proxy: ${flow?.flowBias ?? 'unknown'} / ${flow?.dealerPositioning ?? 'unknown'} / squeeze ${flow?.squeezeRisk ?? 'unknown'} / ATM IV ${flow?.theoreticalAtmVol ?? 'n/a'} / skew ${flow?.downsideSkew ?? 'n/a'} / smile ${flow?.surfaceFit?.quality ?? 'unknown'}`,
      `Twelve Data sidecar: ${twelveDataResearch?.selectedRecommendation ?? 'unknown'} / ${twelveDataResearch?.consensus ?? 'unknown'} / RSI ${twelveDataResearch?.indicators?.rsi ?? 'n/a'} / ADX ${twelveDataResearch?.indicators?.adx ?? 'n/a'} / state ${twelveDataResearch?.marketStateLabel ?? 'unknown'}`,
      `Yahoo sidecar: ${yahooResearch?.matchedSymbolId ?? 'unmatched'} / ${yahooResearch?.sentiment ?? 'unknown'} / move ${yahooResearch?.percentChange ?? 'n/a'} / headlines ${yahooResearch?.headlines?.length ?? 0} / boards ${yahooResearch?.boards?.length ?? 0}`,
      `Finnhub sidecar: ${finnhubResearch?.matchedSymbolId ?? 'unmatched'} / ${finnhubResearch?.technicalSignal ?? 'unknown'} / bias ${finnhubResearch?.technicalBias ?? 'unknown'} / support ${finnhubResearch?.levels?.support ?? 'n/a'} / resistance ${finnhubResearch?.levels?.resistance ?? 'n/a'} / event ${finnhubResearch?.upcomingEvent?.date ?? 'none'}`,
      `Monte Carlo: ${scenario?.pathBias ?? 'unknown'} / ${scenario?.pathMethod ?? 'unknown'} / target-first ${scenario?.targetFirstProbability ?? 'n/a'}% / invalidation-first ${scenario?.invalidationFirstProbability ?? 'n/a'}% / support ${scenario?.supportHoldProbability ?? 'n/a'}% / break-even ${scenario?.breakEvenProbability ?? 'n/a'}%`,
      `Committee: ${committeeAction ?? 'unknown'} / score ${committeeScore ?? 'n/a'} / risk ${riskEnvelope?.sizeBand ?? 'unknown'} / gate ${riskEnvelope?.tradeSuppression ? 'suppressed' : 'open'}`,
      `Calendar: ${calendar?.summary ?? 'calendar unavailable'}`,
      calendar?.predictiveSignals?.[0]
        ? `Calendar chain: ${calendar.predictiveSignals[0].summary} | ${calendar.predictiveSignals[0].note}`
        : 'Calendar chain: none active',
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
  memoryMatches: Array<{ createdAt: string; outcome: 'win' | 'loss' | 'flat' | 'open' | null; similarityScore: number; recommendation: string }>,
  localContext: string,
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
  const memoryLine = memoryMatches[0]
    ? `Similar prior setup (${Math.round(memoryMatches[0].similarityScore * 100)}%): ${memoryMatches[0].recommendation}`
    : null;

  const confidence = executionLens.confidence ?? (context.missing.length >= 2 ? 'low' : 'medium');
  const answer = [
    `Conclusion: ${conclusion}`,
    `Strongest supporting signals: ${supportingSignals.join(' | ') || 'insufficient live signals'}`,
    `Caveats: ${caveats.join(' | ')}`,
    `Estimated/proxy signals: ${context.estimated.join(' | ') || 'none'}`,
    memoryLine ? `Situation memory: ${memoryLine}` : null,
    `Confirm / invalidate: follow price acceptance around pivots, POC, value-area edges, and gamma walls.`,
    `What to watch: ${watchItems.join(' | ')}`,
    `Execution guidance: ${executionGuidance.join(' | ')}`,
    `Confidence: ${confidence}`,
  ].filter(Boolean).join('\n');

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
    memoryMatches,
    answer,
    contextSnapshot: [
      `Question: ${question}`,
      localContext ? `Local operator context: ${localContext}` : null,
      `Intent: ${intent}`,
      `Confirmed: ${context.confirmed.join('; ') || 'none'}`,
      `Inferred: ${context.inferred.join('; ') || 'none'}`,
      `Estimated: ${context.estimated.join('; ') || 'none'}`,
      `Missing: ${context.missing.join('; ') || 'none'}`,
      `Memory: ${memoryMatches.map((item) => `${Math.round(item.similarityScore * 100)}% ${item.outcome ?? 'open'} -> ${item.recommendation}`).join('; ') || 'none'}`,
      ...executionLens.promptLines,
    ].filter(Boolean).join('\n'),
  };
}

export async function askVaultum(input: { question: string; localContext?: string; market?: string; timeframe?: string }): Promise<VaultumAiStructuredAnswer> {
  const question = (input.question || '').trim();
  const localContext = String(input.localContext || '').trim();
  const requestedMarket = String(input.market || '').toUpperCase().trim();
  const requestedTimeframe = String(input.timeframe || '').toLowerCase().trim();
  const intent = classifyIntent(question || 'macro regime');
  const plannedTools = planTools(question, intent, {
    preferredMarket: requestedMarket || undefined,
    preferredTimeframe: requestedTimeframe || undefined,
  });

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
  const primaryMarket = requestedMarket || inferPrimaryMarket(toolResults);
  const requestedFocusLines = [
    requestedMarket ? `Requested market focus: ${requestedMarket}` : null,
    requestedTimeframe ? `Requested timeframe focus: ${requestedTimeframe}` : null,
  ].filter((value): value is string => Boolean(value));
  const memoryMatches = await recallSituationMemories({
    namespace: 'trader-report',
    market: primaryMarket,
    query: [
      question,
      localContext,
      context.summary.join(' '),
      context.confirmed.join(' '),
      context.inferred.join(' '),
    ].join('\n'),
    limit: 2,
  });

  const external = await callChatProvider(
    VAULTUM_SYSTEM_PROMPT,
    [
      `Question: ${question}`,
      ...requestedFocusLines,
      localContext ? `Local operator context: ${localContext}` : null,
      `Intent: ${intent}`,
      `Tools used: ${plannedTools.map((tool) => tool.name).join(', ')}`,
      `Confirmed signal: ${context.confirmed.join(' | ') || 'none'}`,
      `Inferred implication: ${context.inferred.join(' | ') || 'none'}`,
      `Estimated/proxy signal: ${context.estimated.join(' | ') || 'none'}`,
      `Missing/uncertain data: ${context.missing.join(' | ') || 'none'}`,
      `Situation memory: ${memoryMatches.map((item) => `${Math.round(item.similarityScore * 100)}% ${item.outcome ?? 'open'} -> ${item.recommendation}`).join(' | ') || 'none'}`,
      ...executionLens.promptLines,
      'Return the answer in terminal analyst style with conclusion, strongest supporting signals, caveats, confirm/invalidate levels, what to watch, confidence, and execution guidance if relevant.',
    ].filter(Boolean).join('\n'),
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
    memoryMatches,
    localContext,
  );

  if (!external.content || !external.provider) {
    return {
      ...structured,
      contextSnapshot: [
        structured.contextSnapshot,
        ...requestedFocusLines,
      ].filter(Boolean).join('\n'),
    };
  }

  return {
    ...structured,
    provider: external.provider,
    answer: external.content,
    contextSnapshot: [
      structured.contextSnapshot,
      ...requestedFocusLines,
      localContext ? `Local operator context: ${localContext}` : null,
    ].filter(Boolean).join('\n'),
  };
}
