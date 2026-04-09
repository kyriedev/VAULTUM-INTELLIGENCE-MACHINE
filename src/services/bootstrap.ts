import { buildAiPanel } from '@/services/ai/ai-panel-tools';
import { routeAiAnalysis } from '@/services/ai/ai-router';
import { buildApiUrl } from '@/services/api-base';
import { buildFreshnessSummary } from '@/services/data-freshness';
import { buildIntelligencePanels } from '@/services/intelligence';
import { buildLiquidityPanels } from '@/services/liquidity';
import { buildMacroPanels } from '@/services/macro';
import { buildMarketPanels } from '@/services/market';
import { buildOptionsPanels } from '@/services/options';
import { readCache, writeCache } from '@/services/persistent-cache';
import { buildPipelinePanels, runVaultumPipeline } from '@/services/pipeline';
import { buildPositioningPanels } from '@/services/positioning';
import { buildPredictionPanels } from '@/services/prediction';
import { invokeVaultumRpc } from '@/services/rpc';
import { runtimeConfig } from '@/services/runtime-config';
import { mergePanels } from '@/services/signal-aggregator';
import { buildTradePanels } from '@/services/trade';
import type { BootstrapSnapshot } from '@/types';

const CACHE_KEY = 'vaultum-bootstrap-snapshot-v2';

function pushWarning(warnings: string[], condition: unknown, message: string): void {
  if (condition) warnings.push(message);
}

async function fetchBootstrapSeed(): Promise<Record<string, any> | null> {
  try {
    const response = await fetch(buildApiUrl('bootstrap'), {
      headers: { 'Cache-Control': 'no-store' },
    });
    if (!response.ok) return null;
    const payload = await response.json() as { ok?: boolean; data?: Record<string, any> };
    return payload.ok ? (payload.data ?? null) : null;
  } catch {
    return null;
  }
}

export async function loadBootstrapSnapshot(force = false): Promise<BootstrapSnapshot> {
  const cached = force ? null : readCache<BootstrapSnapshot>(CACHE_KEY);
  if (cached) return cached;

  const seed = await fetchBootstrapSeed();

  const [
    marketQuotes,
    commodityQuotes,
    sectorSummary,
    etfFlows,
    fearGreed,
    macroSignals,
    fred2y,
    fred10y,
    energyPrices,
    bisPolicyRates,
    bisExchangeRates,
    bisCredit,
    riskScores,
    countryBrief,
    newsIntel,
    proxyTension,
    tradeFlows,
    tradeRestrictions,
    tariffTrends,
    tradeBarriers,
    prediction,
    gammaLevels,
    dealerPressure,
    optionsSnapshots,
    strikePressure,
    cotSummary,
    positioningRegime,
    liquidityStress,
    carryStress,
    safeHavenPressure,
    crossAssetRegime,
    bennerCycle,
    providerCatalog,
    volumeProfile,
    pivotLevels,
    orderflowEngine,
    buyerSellerPressure,
    entryMap,
  ] = await Promise.all([
    seed?.marketQuotes ?? invokeVaultumRpc<any>('market', 'list-market-quotes', { symbols: ['^GSPC', '^IXIC', '^VIX', 'DX-Y.NYB', '^TNX', '^IRX', 'EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'GBPJPY=X', 'EURJPY=X', 'GC=F'] }),
    invokeVaultumRpc<any>('market', 'list-commodity-quotes', { symbols: ['GC=F', 'CL=F', 'BZ=F', 'NG=F', 'SI=F', 'HG=F'] }),
    invokeVaultumRpc<any>('market', 'get-sector-summary', {}),
    invokeVaultumRpc<any>('market', 'list-etf-flows', {}),
    invokeVaultumRpc<any>('market', 'get-fear-greed-index', {}),
    seed?.macroSignals ?? invokeVaultumRpc<any>('macro', 'get-macro-signals', {}),
    invokeVaultumRpc<any>('macro', 'get-fred-series', { seriesId: 'DGS2', limit: 30 }),
    invokeVaultumRpc<any>('macro', 'get-fred-series', { seriesId: 'DGS10', limit: 30 }),
    invokeVaultumRpc<any>('macro', 'get-energy-prices', {}),
    invokeVaultumRpc<any>('macro', 'get-bis-policy-rates', {}),
    invokeVaultumRpc<any>('macro', 'get-bis-exchange-rates', {}),
    invokeVaultumRpc<any>('macro', 'get-bis-credit', {}),
    seed?.riskScores ?? invokeVaultumRpc<any>('intelligence', 'get-risk-scores', {}),
    invokeVaultumRpc<any>('intelligence', 'get-country-intel-brief', { countryCode: 'SAU' }),
    invokeVaultumRpc<any>('intelligence', 'get-news-intel', { market: 'XAUUSD', timeframe: '1h' }),
    invokeVaultumRpc<any>('intelligence', 'get-proxy-tension-status', {}),
    invokeVaultumRpc<any>('trade', 'get-trade-flows', { reporter: '840', partner: '156' }),
    seed?.tradeRestrictions ?? invokeVaultumRpc<any>('trade', 'get-trade-restrictions', {}),
    invokeVaultumRpc<any>('trade', 'get-tariff-trends', { reporter: '840', partner: '156' }),
    invokeVaultumRpc<any>('trade', 'get-trade-barriers', {}),
    seed?.prediction ?? invokeVaultumRpc<any>('prediction', 'list-prediction-markets', { market: 'XAUUSD', mode: 'markets' }),
    invokeVaultumRpc<any>('options', 'get-gamma-levels', { symbol: 'XAUUSD' }),
    invokeVaultumRpc<any>('options', 'get-dealer-pressure', { symbol: 'XAUUSD' }),
    invokeVaultumRpc<any>('options', 'list-options-snapshots', { symbol: 'XAUUSD' }),
    invokeVaultumRpc<any>('options', 'get-strike-pressure', { symbol: 'XAUUSD' }),
    invokeVaultumRpc<any>('positioning', 'get-cot-summary', { market: 'GOLD' }),
    invokeVaultumRpc<any>('positioning', 'get-positioning-regime', { market: 'GOLD' }),
    seed?.liquidityStress ?? invokeVaultumRpc<any>('liquidity', 'get-liquidity-stress', {}),
    invokeVaultumRpc<any>('liquidity', 'get-carry-stress', {}),
    invokeVaultumRpc<any>('liquidity', 'get-safe-haven-pressure', {}),
    invokeVaultumRpc<any>('liquidity', 'get-cross-asset-regime', {}),
    invokeVaultumRpc<any>('benner', 'get-cycle-state', { market: 'XAUUSD' }),
    seed?.providerCatalog ?? invokeVaultumRpc<any>('system', 'get-provider-catalog', {}),
    invokeVaultumRpc<any>('volume', 'get-profile', { market: 'XAUUSD', timeframe: '1d' }),
    invokeVaultumRpc<any>('pivots', 'get-levels', { market: 'XAUUSD', timeframe: '1d' }),
    invokeVaultumRpc<any>('orderflow', 'get-engine', { market: 'XAUUSD', timeframe: '1h' }),
    invokeVaultumRpc<any>('pressure', 'get-buyer-seller-pressure', { market: 'XAUUSD', mode: 'auto' }),
    seed?.entryMap ?? invokeVaultumRpc<any>('analytics', 'get-entry-map', { market: 'XAUUSD', chartTimeframe: '1h', majorTimeframe: '4h', minorTimeframe: '15m', triggerTimeframe: '5m' }),
  ]);

  const warnings: string[] = [];
  pushWarning(warnings, !marketQuotes?.quotes?.length, 'Market quote feed unavailable or rate-limited.');
  pushWarning(warnings, !fearGreed?.compositeScore && fearGreed?.compositeScore !== 0, 'Fear and greed sentiment engine unavailable.');
  pushWarning(warnings, !macroSignals?.regime, 'Macro regime engine degraded or unavailable.');
  pushWarning(warnings, !macroSignals?.ratesDifferentials?.scoreboard?.length, 'Cross-country rates differential scoreboard is unavailable.');
  pushWarning(warnings, !newsIntel?.summary, 'Structured news-intelligence layer unavailable; calendar remains active but catalyst sentiment is degraded.');
  pushWarning(warnings, prediction?.unavailable || !prediction?.markets?.length, 'Prediction market layer missing or blocked.');
  pushWarning(warnings, !gammaLevels?.symbol, 'Options gamma layer is unavailable or returning incomplete structure.');
  pushWarning(warnings, gammaLevels?.mode === 'synthetic-live', 'Options structure uses a live synthetic proxy engine; direct options-flow and dealer books are not wired yet.');
  pushWarning(warnings, !strikePressure?.focusReading, 'Strike-by-strike pressure interpretation is unavailable, so options context falls back to walls, corridor, and synthetic dealer summaries only.');
  pushWarning(warnings, !cotSummary?.reportDate, 'Official CFTC positioning feed unavailable for the selected market.');
  pushWarning(warnings, !bisPolicyRates?.rates?.length || !bisExchangeRates?.pairs?.length || !bisCredit?.credit?.length, 'One or more BIS macro feeds are unavailable.');
  pushWarning(warnings, tradeRestrictions?.unavailable, 'WTO trade restriction layer unavailable.');
  pushWarning(warnings, volumeProfile?.unavailable, 'Volume profile layer is estimated or unavailable for the selected market.');
  pushWarning(warnings, !orderflowEngine?.buySellPressure && orderflowEngine?.buySellPressure !== 0, 'Orderflow engine unavailable for the selected market.');
  pushWarning(warnings, orderflowEngine?.feedQuality === 'weak', 'Orderflow/footprint quality is weak for this asset; readings are estimated rather than tape-true.');
  pushWarning(warnings, !entryMap?.sourceLabel, 'Execution entry map is unavailable, so AI/bootstrap precision falls back to the older pipeline layer.');

  const pipeline = runVaultumPipeline({
    marketQuotes,
    commodityQuotes,
    sectorSummary,
    macroSignals,
    fred2y,
    fred10y,
    proxyTension,
    tradeBarriers,
    prediction,
    gammaLevels,
    dealerPressure,
    cotSummary,
    crossAssetRegime,
    warnings,
    bennerCycle,
    volumeProfile,
    pivotLevels,
    orderflowEngine,
    buyerSellerPressure,
  });
  const executionSupport = entryMap
    ? {
        ...pipeline.execution,
        entryZone: entryMap.entryZone,
        trimZone: entryMap.trimZone,
        noTradeZone: entryMap.noTradeZone,
        invalidationLevel: entryMap.invalidationLevel,
        targetLogic: entryMap.targetLogic,
        stopLogic: entryMap.stopLogic,
        tradeThesisSummary: entryMap.tradeThesisSummary,
        feedQuality: entryMap.feedQuality,
        orderflowSummary: entryMap.orderflowSummary,
        executionChecklist: entryMap.executionChecklist,
        alertConditions: entryMap.alertConditions,
        sessionTimingNotes: entryMap.sessionTimingNotes,
        doNotExecute: entryMap.doNotExecute,
        breakOfStructure: entryMap.breakOfStructure,
        institutionalReference: entryMap.institutionalReference,
        institutionalReferenceZone: entryMap.institutionalReferenceZone,
        premiumDiscountState: entryMap.premiumDiscountState,
        modelTwoConfluenceScore: entryMap.modelTwoConfluenceScore,
        modelTwoConfluenceLabel: entryMap.modelTwoConfluenceLabel,
        modelTwoConfluenceSummary: entryMap.modelTwoConfluenceSummary,
        footprintConfluence: entryMap.footprintConfluence,
        absorptionContext: entryMap.absorptionContext,
        liquidityTargetContext: entryMap.liquidityTargetContext,
      }
    : pipeline.execution;
  const pipelineForPanels = {
    ...pipeline,
    execution: executionSupport,
  };

  const panels = mergePanels(
    buildMarketPanels({ marketQuotes, commodityQuotes, sectorSummary, etfFlows, crossAssetRegime }),
    buildMacroPanels({ macroSignals, crossAssetRegime, fred2y, fred10y, energyPrices, bisPolicyRates, bisExchangeRates, bisCredit }),
    buildIntelligencePanels({ riskScores, proxyTension, countryBrief, newsIntel }),
    buildTradePanels({ flows: tradeFlows, restrictions: tradeRestrictions, tariffTrends, barriers: tradeBarriers }),
    buildPredictionPanels({ prediction }),
    buildOptionsPanels({ gamma: gammaLevels, dealer: dealerPressure, snapshots: optionsSnapshots, strikePressure }),
    buildPositioningPanels({ cot: cotSummary, regime: positioningRegime }),
    buildLiquidityPanels({ stress: liquidityStress, carry: carryStress, haven: safeHavenPressure, crossAsset: crossAssetRegime }),
    buildPipelinePanels(pipelineForPanels),
  );

  const topSignals = [
    macroSignals?.regime ? `Macro regime ${macroSignals.regime}` : null,
    macroSignals?.ratesDifferentials?.summary ?? null,
    newsIntel?.patternModel?.summary ?? newsIntel?.sentiment?.summary ?? null,
    pipeline.marketContext.goldBias ? `Gold bias ${pipeline.marketContext.goldBias}` : null,
    entryMap?.phaseSummary ? `${entryMap.biasLabel} / ${entryMap.phaseSummary}` : null,
    entryMap?.modelTwoConfluenceSummary ?? null,
    entryMap?.executionRead ?? null,
    `${pipeline.marketContext.executionCautionState} / risk ${pipeline.risk.cautionLevel}`,
    fearGreed?.compositeScore != null ? `Sentiment ${fearGreed.compositeScore.toFixed(1)} ${fearGreed.compositeLabel}` : null,
    orderflowEngine?.summary ?? null,
    dealerPressure?.conclusion ?? null,
    strikePressure?.uiSummary ?? null,
    prediction?.summary ?? (prediction?.markets?.[0] ? `${prediction.markets[0].title} ${(prediction.markets[0].probability * 100).toFixed(1)}%` : null),
    `${bennerCycle?.phase ?? 'unknown'} cycle / ${volumeProfile?.valueAreaPosition ?? 'unknown'} profile`,
  ].filter((value): value is string => Boolean(value));

  panels['ai-insights'] = buildAiPanel([
    routeAiAnalysis([
      `Conclusion: ${entryMap?.executionRead ?? `${pipeline.decision.directionalBias} with ${pipeline.marketContext.marketRegime} and ${pipeline.risk.cautionLevel} risk.`}`,
      `Confirmed signal: ${entryMap?.phaseSummary ?? macroSignals?.regime ?? 'macro regime unavailable'}.`,
      `Inferred implication: ${entryMap?.tradeThesisSummary ?? dealerPressure?.conclusion ?? 'dealer pressure unavailable'}.`,
      `Estimated/proxy signal: pressure ${buyerSellerPressure?.mode ?? 'unknown'} / orderflow ${orderflowEngine?.mode ?? 'unknown'} / options ${dealerPressure?.mode ?? 'unknown'} / profile ${volumeProfile?.mode ?? 'unknown'}.`,
      `Missing data: ${warnings.join(' ') || 'no major bootstrap gaps detected.'}`,
    ]),
    ...topSignals.slice(0, 3),
    warnings[0] ?? 'No major freshness warning.',
  ]);

  const snapshot: BootstrapSnapshot = {
    generatedAt: new Date().toISOString(),
    intent: 'macro-regime',
    primaryAsset: 'XAUUSD',
    runtime: runtimeConfig(seed?.feedStatus ?? [], providerCatalog?.providers ?? []),
    freshness: buildFreshnessSummary(warnings),
    conclusion: `${pipeline.decision.directionalBias}, ${pipeline.marketContext.marketRegime}, ${pipeline.marketContext.executionCautionState}.`,
    supportingSignals: topSignals.slice(0, 5),
    caveats: warnings,
    confirmationMap: {
      confirm: pipeline.decision.confirmationChecklist,
      invalidate: pipeline.decision.invalidationChecklist,
    },
    marketContext: pipeline.marketContext,
    decision: pipeline.decision,
    risk: pipeline.risk,
    execution: executionSupport,
    entryMap: entryMap ?? undefined,
    bennerCycleMap: bennerCycle ?? undefined,
    panels,
    searchIndex: [
      { label: 'XAUUSD', kind: 'asset', tags: ['gold', 'safe haven', 'dealer pressure'] },
      { label: 'DXY', kind: 'asset', tags: ['dollar', 'liquidity', 'funding'] },
      { label: 'USDJPY', kind: 'asset', tags: ['carry', 'jpy', 'stress'] },
      { label: 'Trade Policy', kind: 'workflow', tags: ['tariff', 'wto', 'restriction'] },
      { label: 'Options Gamma', kind: 'workflow', tags: ['gamma', 'call wall', 'put wall'] },
      { label: 'Dealer Pressure', kind: 'workflow', tags: ['dealer', 'hedging', 'volatility'] },
      { label: 'COT Positioning', kind: 'workflow', tags: ['cftc', 'positioning', 'crowding'] },
      { label: 'Liquidity Stress', kind: 'workflow', tags: ['dxy', 'vix', 'jpy', 'cross-asset'] },
      { label: 'Benner Cycle', kind: 'workflow', tags: ['cycle', 'turning point', 'temporal'] },
      { label: 'Monte Carlo', kind: 'workflow', tags: ['scenario', 'probability', 'distribution', 'path'] },
      { label: 'Economic Calendar', kind: 'workflow', tags: ['calendar', 'macro', 'event risk', 'GBPUSD'] },
      { label: 'Rates Differential Scoreboard', kind: 'workflow', tags: ['rates', 'boe', 'ecb', 'boj', 'fed', 'eurusd', 'gbpusd', 'usdjpy', 'gbpjpy'] },
      { label: 'Fear & Greed', kind: 'workflow', tags: ['sentiment', 'risk appetite', 'fear', 'greed'] },
      { label: 'News Intelligence', kind: 'workflow', tags: ['news', 'sentiment', 'calendar chain', 'jb-news', 'catalyst', 'gold', 'us30'] },
      { label: 'Market Brief', kind: 'workflow', tags: ['brief', 'desk note', 'opening plan', 'watchlist'] },
      { label: 'Volume Profile', kind: 'workflow', tags: ['poc', 'value area', 'nodes'] },
      { label: 'Buyer/Seller Pressure', kind: 'workflow', tags: ['pressure', 'proxy flow', 'execution'] },
      { label: 'Orderflow Engine', kind: 'workflow', tags: ['footprint', 'imbalance', 'absorption', 'execution'] },
      { label: 'Execution Playbook', kind: 'workflow', tags: ['entry', 'exit', 'target', 'invalidation'] },
      { label: 'Entry Map', kind: 'workflow', tags: ['4h', '15m', '5m', 'phase model', 'trigger', 'execution'] },
      { label: 'Finance Streams', kind: 'workflow', tags: ['youtube', 'bloomberg', 'desk tv', 'live'] },
      { label: 'TradingView Screener', kind: 'workflow', tags: ['tradingview', 'screener', 'watchlist', 'matrix'] },
      { label: 'TradingView Research', kind: 'workflow', tags: ['tradingview', 'scanner', 'technical consensus', 'symbol search'] },
      { label: 'Twelve Data Research', kind: 'workflow', tags: ['twelvedata', 'technical indicators', 'market state', 'research'] },
      { label: 'Yahoo Research', kind: 'workflow', tags: ['yahoo', 'catalyst', 'headlines', 'symbol discovery', 'boards'] },
      { label: 'Finnhub Research', kind: 'workflow', tags: ['finnhub', 'technical aggregate', 'earnings', 'news sentiment', 'support resistance'] },
      { label: 'Institutional Monitor', kind: 'workflow', tags: ['rates', 'dxy', 'dealers', 'cot', 'liquidity', 'policy', 'stress'] },
      { label: 'Analyst OS', kind: 'workflow', tags: ['analyst', 'decision chain', 'blindspot', 'workflow', 'trust'] },
      { label: 'Data And Trust', kind: 'workflow', tags: ['data moat', 'trust moat', 'source quality', 'coverage', 'fallback'] },
      { label: 'Report Desk', kind: 'workflow', tags: ['pdf', 'daily report', 'weekly report', 'quarterly report', 'download'] },
      { label: 'Trade Journal', kind: 'workflow', tags: ['journal', 'execution review', 'performance', 'mistakes', 'manual log'] },
      { label: 'Operator Manual', kind: 'workflow', tags: ['manual', 'tutorial', 'guide', 'gold', 'us30'] },
      { label: 'Provider Catalog', kind: 'workflow', tags: ['connectors', 'providers', 'feeds', 'registry', 'runtime'] },
    ],
  };

  writeCache(CACHE_KEY, snapshot);
  return snapshot;
}
