import { listMarketQuotes } from '../../market/v1/list-market-quotes';
import { listCommodityQuotes } from '../../market/v1/list-commodity-quotes';
import { getSectorSummary } from '../../market/v1/get-sector-summary';
import { listEtfFlows } from '../../market/v1/list-etf-flows';
import { getFearGreedIndex } from '../../market/v1/get-fear-greed-index';
import { getTradingViewResearch } from '../../market/v1/_tradingview';
import { getTwelveDataResearch } from '../../market/v1/_twelvedata';
import { getYahooResearch } from '../../market/v1/_yahoo-research';
import { getFinnhubResearch } from '../../market/v1/_finnhub-research';
import { getMacroSignals } from '../../macro/v1/get-macro-signals';
import { getRatesDifferentials } from '../../macro/v1/get-rates-differentials';
import { getFredSeries } from '../../macro/v1/get-fred-series';
import { getEnergyPrices } from '../../macro/v1/get-energy-prices';
import { getBisPolicyRates } from '../../macro/v1/get-bis-policy-rates';
import { getBisExchangeRates } from '../../macro/v1/get-bis-exchange-rates';
import { getBisCredit } from '../../macro/v1/get-bis-credit';
import { getEconomicCalendar } from '../../calendar/v1/get-economic-calendar';
import { getRiskScores } from '../../intelligence/v1/get-risk-scores';
import { classifyEvent } from '../../intelligence/v1/classify-event';
import { getCountryIntelBrief } from '../../intelligence/v1/get-country-intel-brief';
import { getMarketBrief } from '../../intelligence/v1/get-market-brief';
import { getMarketDecisionDemo } from '../../intelligence/v1/get-market-decision-demo.ts';
import { getMarketDecisionEngine } from '../../intelligence/v1/get-market-decision-engine.ts';
import { getNewsIntel } from '../../intelligence/v1/get-news-intel';
import { getXIntel } from '../../intelligence/v1/get-x-intel';
import { searchNewsDocuments } from '../../intelligence/v1/search-news-documents';
import { getProxyTensionStatus } from '../../intelligence/v1/get-proxy-tension-status';
import { getTradeFlows } from '../../trade/v1/get-trade-flows';
import { getTariffTrends } from '../../trade/v1/get-tariff-trends';
import { getTradeRestrictions } from '../../trade/v1/get-trade-restrictions';
import { getTradeBarriers } from '../../trade/v1/get-trade-barriers';
import { listPredictionMarkets } from '../../prediction/v1/list-prediction-markets';
import { getGammaLevels } from '../../options/v1/get-gamma-levels';
import { getDealerPressure } from '../../options/v1/get-dealer-pressure';
import { listOptionsSnapshots } from '../../options/v1/list-options-snapshots';
import { getFlowProxy } from '../../options/v1/get-flow-proxy';
import { getStrikePressure } from '../../options/v1/get-strike-pressure';
import { getCotSummary } from '../../positioning/v1/get-cot-summary';
import { getPositioningRegime } from '../../positioning/v1/get-positioning-regime';
import { getCryptoDerivativesContext } from '../../positioning/v1/get-crypto-derivatives-context';
import { getLiquidityStress } from '../../liquidity/v1/get-liquidity-stress';
import { getCarryStress } from '../../liquidity/v1/get-carry-stress';
import { getSafeHavenPressure } from '../../liquidity/v1/get-safe-haven-pressure';
import { getCrossAssetRegime } from '../../liquidity/v1/get-cross-asset-regime';
import { getCycleState } from '../../benner/v1/get-cycle-state';
import { getTraderReport } from '../../analytics/v1/get-trader-report';
import { getEntryMap } from '../../analytics/v1/get-entry-map';
import { getLearningDashboard } from '../../analytics/v1/get-learning-dashboard.ts';
import { getLearningRecommendations } from '../../analytics/v1/get-learning-recommendations.ts';
import { getSetupPatrol } from '../../analytics/v1/get-setup-patrol';
import { getProfile } from '../../volume/v1/get-profile';
import { getLevels } from '../../pivots/v1/get-levels';
import { getBuyerSellerPressure } from '../../pressure/v1/get-buyer-seller-pressure';
import { getPortfolioOverlay } from '../../portfolio/v1/get-overlay';
import { getOrderflowEngine } from '../../orderflow/v1/get-engine';
import { getMonteCarloScenario } from '../../scenario/v1/get-monte-carlo';
import { getInstitutionalMonitor } from '../../monitor/v1/get-institutional-monitor';
import { getReportOverview } from '../../reports/v1/get-report-overview';
import { getProviderCatalog } from '../../system/v1/get-provider-catalog';
import { getDataMoat } from '../../system/v1/get-data-moat';
import { getTrustMoat } from '../../system/v1/get-trust-moat';
import { getTradingDoctrine } from '../../system/v1/get-trading-doctrine';
import { getKnowledgeContextPack } from '../../system/v1/_knowledge-context-pack.ts';
import { getKnowledgeGraph } from '../../system/v1/get-knowledge-graph';
import { getKnowledgeCoverage } from '../../system/v1/get-knowledge-coverage';
import { getDetectionEngine } from '../../system/v1/get-detection-engine';
import { getModelSelectionEngine } from '../../system/v1/get-model-selection-engine';
import { getAgentRulebooks } from '../../system/v1/get-agent-rulebooks';
import { getConceptSimulation } from '../../system/v1/get-concept-simulation';
import { getAnalystOs } from '../../analyst/v1/get-os';

export const vaultumAiTools = {
  'market.list_market_quotes': listMarketQuotes,
  'market.list_commodity_quotes': listCommodityQuotes,
  'market.get_sector_summary': async () => getSectorSummary(),
  'market.list_etf_flows': async () => listEtfFlows(),
  'market.get_fear_greed_index': async () => getFearGreedIndex(),
  'market.get_tradingview_research': getTradingViewResearch,
  'market.get_twelve_data_research': getTwelveDataResearch,
  'market.get_yahoo_research': getYahooResearch,
  'market.get_finnhub_research': getFinnhubResearch,
  'macro.get_macro_signals': async (input) => getMacroSignals({ market: input?.market }),
  'macro.get_rates_differentials': async (input) => getRatesDifferentials({ market: input?.market }),
  'macro.get_fred_series': getFredSeries,
  'macro.get_energy_prices': async () => getEnergyPrices(),
  'macro.get_bis_policy_rates': async () => getBisPolicyRates(),
  'macro.get_bis_exchange_rates': async () => getBisExchangeRates(),
  'macro.get_bis_credit': async () => getBisCredit(),
  'calendar.get_economic_calendar': getEconomicCalendar,
  'intelligence.get_risk_scores': async () => getRiskScores(),
  'intelligence.classify_event': classifyEvent,
  'intelligence.get_country_intel_brief': getCountryIntelBrief,
  'intelligence.get_market_brief': getMarketBrief,
  'intelligence.get_market_decision_demo': getMarketDecisionDemo,
  'intelligence.get_market_decision_engine': getMarketDecisionEngine,
  'intelligence.get_news_intel': getNewsIntel,
  'intelligence.get_x_intel': getXIntel,
  'intelligence.search_news_documents': searchNewsDocuments,
  'intelligence.get_proxy_tension_status': async () => getProxyTensionStatus(),
  'trade.get_trade_flows': getTradeFlows,
  'trade.get_tariff_trends': getTariffTrends,
  'trade.get_trade_restrictions': async () => getTradeRestrictions(),
  'trade.get_trade_barriers': async () => getTradeBarriers(),
  'prediction.list_prediction_markets': listPredictionMarkets,
  'options.get_gamma_levels': getGammaLevels,
  'options.get_dealer_pressure': getDealerPressure,
  'options.list_options_snapshots': listOptionsSnapshots,
  'options.get_flow_proxy': getFlowProxy,
  'options.get_strike_pressure': getStrikePressure,
  'positioning.get_cot_summary': getCotSummary,
  'positioning.get_positioning_regime': getPositioningRegime,
  'positioning.get_crypto_derivatives_context': getCryptoDerivativesContext,
  'liquidity.get_liquidity_stress': async () => getLiquidityStress(),
  'liquidity.get_carry_stress': async () => getCarryStress(),
  'liquidity.get_safe_haven_pressure': async () => getSafeHavenPressure(),
  'liquidity.get_cross_asset_regime': async () => getCrossAssetRegime(),
  'benner.get_cycle_state': getCycleState,
  'analytics.get_trader_report': getTraderReport,
  'analytics.get_entry_map': getEntryMap,
  'analytics.get_learning_dashboard': getLearningDashboard,
  'analytics.get_learning_recommendations': getLearningRecommendations,
  'analytics.get_setup_patrol': getSetupPatrol,
  'volume.get_profile': getProfile,
  'pivots.get_levels': getLevels,
  'pressure.get_buyer_seller_pressure': getBuyerSellerPressure,
  'portfolio.get_overlay': getPortfolioOverlay,
  'orderflow.get_engine': getOrderflowEngine,
  'scenario.get_monte_carlo': getMonteCarloScenario,
  'monitor.get_institutional_monitor': getInstitutionalMonitor,
  'reports.get_report_overview': getReportOverview,
  'system.get_provider_catalog': async () => getProviderCatalog(),
  'system.get_data_moat': getDataMoat,
  'system.get_trust_moat': getTrustMoat,
  'system.get_trading_doctrine': getTradingDoctrine,
  'system.get_knowledge_context_pack': getKnowledgeContextPack,
  'system.get_knowledge_graph': getKnowledgeGraph,
  'system.get_knowledge_coverage': async () => getKnowledgeCoverage(),
  'system.get_detection_engine': getDetectionEngine,
  'system.get_model_selection_engine': getModelSelectionEngine,
  'system.get_agent_rulebooks': getAgentRulebooks,
  'system.get_concept_simulation': getConceptSimulation,
  'analyst.get_os': getAnalystOs,
} satisfies Record<string, (input: any) => Promise<any>>;

export type VaultumAiToolName = keyof typeof vaultumAiTools;

export async function callVaultumAiTool(name: VaultumAiToolName, input: any): Promise<any> {
  return vaultumAiTools[name](input ?? {});
}
