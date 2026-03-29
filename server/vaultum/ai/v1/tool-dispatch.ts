import { listMarketQuotes } from '../../market/v1/list-market-quotes';
import { listCommodityQuotes } from '../../market/v1/list-commodity-quotes';
import { getSectorSummary } from '../../market/v1/get-sector-summary';
import { listEtfFlows } from '../../market/v1/list-etf-flows';
import { getFearGreedIndex } from '../../market/v1/get-fear-greed-index';
import { getMacroSignals } from '../../macro/v1/get-macro-signals';
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
import { getCotSummary } from '../../positioning/v1/get-cot-summary';
import { getPositioningRegime } from '../../positioning/v1/get-positioning-regime';
import { getLiquidityStress } from '../../liquidity/v1/get-liquidity-stress';
import { getCarryStress } from '../../liquidity/v1/get-carry-stress';
import { getSafeHavenPressure } from '../../liquidity/v1/get-safe-haven-pressure';
import { getCrossAssetRegime } from '../../liquidity/v1/get-cross-asset-regime';
import { getCycleState } from '../../benner/v1/get-cycle-state';
import { getProfile } from '../../volume/v1/get-profile';
import { getLevels } from '../../pivots/v1/get-levels';
import { getBuyerSellerPressure } from '../../pressure/v1/get-buyer-seller-pressure';
import { getOrderflowEngine } from '../../orderflow/v1/get-engine';
import { getMonteCarloScenario } from '../../scenario/v1/get-monte-carlo';

export const vaultumAiTools = {
  'market.list_market_quotes': listMarketQuotes,
  'market.list_commodity_quotes': listCommodityQuotes,
  'market.get_sector_summary': async () => getSectorSummary(),
  'market.list_etf_flows': async () => listEtfFlows(),
  'market.get_fear_greed_index': async () => getFearGreedIndex(),
  'macro.get_macro_signals': async () => getMacroSignals(),
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
  'positioning.get_cot_summary': getCotSummary,
  'positioning.get_positioning_regime': getPositioningRegime,
  'liquidity.get_liquidity_stress': async () => getLiquidityStress(),
  'liquidity.get_carry_stress': async () => getCarryStress(),
  'liquidity.get_safe_haven_pressure': async () => getSafeHavenPressure(),
  'liquidity.get_cross_asset_regime': async () => getCrossAssetRegime(),
  'benner.get_cycle_state': getCycleState,
  'volume.get_profile': getProfile,
  'pivots.get_levels': getLevels,
  'pressure.get_buyer_seller_pressure': getBuyerSellerPressure,
  'orderflow.get_engine': getOrderflowEngine,
  'scenario.get_monte_carlo': getMonteCarloScenario,
} satisfies Record<string, (input: any) => Promise<any>>;

export type VaultumAiToolName = keyof typeof vaultumAiTools;

export async function callVaultumAiTool(name: VaultumAiToolName, input: any): Promise<any> {
  return vaultumAiTools[name](input ?? {});
}
