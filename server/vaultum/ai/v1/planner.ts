import type { ToolCall, VaultumIntent } from './_shared';
import { normalizeVaultumTimeframe, structuralTimeframeFor } from '../../_shared/timeframes';

function lower(input: string): string {
  return input.toLowerCase();
}

export function classifyIntent(question: string): VaultumIntent {
  const q = lower(question);
  if (/(fear|greed|sentiment|market brief|desk note|open note)/.test(q)) return 'macro-regime';
  if (/(monitor|institutional feed|real yield|curve|policy divergence|dealer flow|gamma flip|stop cluster)/.test(q)) return 'execution-guidance';
  if (/(monte|scenario|probability|odds|distribution|calendar today|calendar|economic event|news today|high impact)/.test(q)) return 'execution-guidance';
  if (/(entry|enter|exit|take profit|tp|trim|close|execute|execution|target|stop|invalidation|setup)/.test(q)) return 'execution-guidance';
  if (/(gold|xau|bullion)/.test(q)) return 'asset-bias';
  if (/(macro|regime|risk on|risk off|yield|dxy)/.test(q)) return 'macro-regime';
  if (/(geopolit|war|shipping|hormuz|red sea|sanction)/.test(q)) return 'geopolitical-impact';
  if (/(tariff|trade|barrier|wto|restriction)/.test(q)) return 'trade-policy-impact';
  if (/(prediction|polymarket|probability|odds)/.test(q)) return 'prediction-market-context';
  if (/(signal|why does|what does .* mean)/.test(q)) return 'signal-explanation';
  if (/(country|brief|saudi|china|japan|iran|uk|europe)/.test(q)) return 'country-brief';
  if (/(gamma|call wall|put wall|strike|option)/.test(q)) return 'options-gamma-positioning';
  if (/(dealer|hedg|pinning|squeeze)/.test(q)) return 'dealer-pressure';
  if (/(cot|positioning|crowded|speculative)/.test(q)) return 'cot-positioning';
  if (/(liquidity|carry|jpy|funding|safe haven)/.test(q)) return 'liquidity-stress';
  if (/(benner|cycle|turning point)/.test(q)) return 'benner-cycle-interpretation';
  if (/(volume profile|poc|value area|node)/.test(q)) return 'volume-profile-interpretation';
  if (/(pivot|support|resistance|r1|s1)/.test(q)) return 'pivot-interpretation';
  if (/(buyer|seller|pressure|order flow|aggressor)/.test(q)) return 'buyer-seller-pressure-interpretation';
  if (/(correlation|cross asset|equit|oil|fx)/.test(q)) return 'cross-asset-correlation';
  if (/(search|document|news|headline)/.test(q)) return 'document-news-search';
  return 'macro-regime';
}

export function planTools(question: string, intent: VaultumIntent, options?: {
  preferredMarket?: string;
  preferredTimeframe?: string;
}): ToolCall[] {
  const q = lower(question);
  const toolCalls: ToolCall[] = [];
  const preferredMarket = String(options?.preferredMarket || '').toUpperCase().trim();
  const analysisTimeframe = normalizeVaultumTimeframe(options?.preferredTimeframe);
  const structuralTimeframe = structuralTimeframeFor(analysisTimeframe);
  const researchTimeframe = analysisTimeframe === '5m' ? '15m' : analysisTimeframe;

  const assetMarket =
    /oil|wti|brent/.test(q) ? 'WTI'
      : /eurusd/.test(q) ? 'EURUSD'
        : /gbpusd/.test(q) ? 'GBPUSD'
          : /usdjpy/.test(q) ? 'USDJPY'
            : /gbpjpy/.test(q) ? 'GBPJPY'
              : /eurjpy/.test(q) ? 'EURJPY'
                : /dxy/.test(q) ? 'DXY'
                  : preferredMarket || 'XAUUSD';
  const cotMarket = assetMarket === 'WTI' ? 'OIL' : assetMarket === 'VIX' ? 'VIX' : 'GOLD';

  switch (intent) {
    case 'asset-bias':
      toolCalls.push(
        { name: 'market.list_market_quotes', input: { symbols: ['GC=F', 'DX-Y.NYB', '^TNX', '^VIX', '^GSPC', 'EURUSD=X', 'USDJPY=X'] } },
        { name: 'market.get_fear_greed_index', input: {} },
        { name: 'market.get_tradingview_research', input: { market: assetMarket, timeframe: researchTimeframe } },
        { name: 'market.get_twelve_data_research', input: { market: assetMarket, timeframe: researchTimeframe } },
        { name: 'market.get_yahoo_research', input: { market: assetMarket, timeframe: researchTimeframe } },
        { name: 'market.get_finnhub_research', input: { market: assetMarket, timeframe: researchTimeframe } },
        { name: 'macro.get_macro_signals', input: {} },
        { name: 'monitor.get_institutional_monitor', input: { market: assetMarket, timeframe: analysisTimeframe } },
        { name: 'analytics.get_trader_report', input: { market: assetMarket, timeframe: analysisTimeframe } },
        { name: 'analytics.get_entry_map', input: { market: assetMarket, chartTimeframe: analysisTimeframe } },
        { name: 'calendar.get_economic_calendar', input: { market: assetMarket } },
        { name: 'options.get_gamma_levels', input: { symbol: assetMarket } },
        { name: 'orderflow.get_engine', input: { market: assetMarket, timeframe: analysisTimeframe } },
        { name: 'pressure.get_buyer_seller_pressure', input: { market: assetMarket, timeframe: analysisTimeframe, mode: 'auto' } },
        { name: 'volume.get_profile', input: { market: assetMarket, timeframe: structuralTimeframe } },
        { name: 'scenario.get_monte_carlo', input: { market: assetMarket, timeframe: analysisTimeframe } },
      );
      break;
    case 'macro-regime':
      toolCalls.push(
        { name: 'market.get_fear_greed_index', input: {} },
        { name: 'market.get_tradingview_research', input: { market: assetMarket, timeframe: researchTimeframe } },
        { name: 'market.get_twelve_data_research', input: { market: assetMarket, timeframe: researchTimeframe } },
        { name: 'market.get_yahoo_research', input: { market: assetMarket, timeframe: researchTimeframe } },
        { name: 'market.get_finnhub_research', input: { market: assetMarket, timeframe: researchTimeframe } },
        { name: 'macro.get_macro_signals', input: {} },
        { name: 'monitor.get_institutional_monitor', input: { market: assetMarket, timeframe: analysisTimeframe } },
        { name: 'analytics.get_trader_report', input: { market: assetMarket, timeframe: analysisTimeframe } },
        { name: 'macro.get_fred_series', input: { seriesId: 'DGS10', limit: 20 } },
        { name: 'liquidity.get_cross_asset_regime', input: {} },
        { name: 'market.get_sector_summary', input: {} },
        { name: 'calendar.get_economic_calendar', input: { market: assetMarket } },
      );
      break;
    case 'geopolitical-impact':
      toolCalls.push(
        { name: 'monitor.get_institutional_monitor', input: { market: assetMarket, timeframe: analysisTimeframe } },
        { name: 'intelligence.get_proxy_tension_status', input: {} },
        { name: 'intelligence.get_risk_scores', input: {} },
        { name: 'market.list_commodity_quotes', input: { symbols: ['GC=F', 'CL=F', 'BZ=F'] } },
        { name: 'liquidity.get_safe_haven_pressure', input: {} },
      );
      break;
    case 'trade-policy-impact':
      toolCalls.push(
        { name: 'trade.get_trade_restrictions', input: {} },
        { name: 'trade.get_trade_flows', input: { reporter: '840', partner: '156' } },
        { name: 'trade.get_tariff_trends', input: { reporter: '840', partner: '156' } },
      );
      break;
    case 'prediction-market-context':
      toolCalls.push(
        { name: 'prediction.list_prediction_markets', input: { market: assetMarket, query: q, mode: 'markets' } },
        { name: 'intelligence.search_news_documents', input: { query: question, maxRecords: 3 } },
      );
      break;
    case 'signal-explanation':
      toolCalls.push(
        { name: 'market.get_tradingview_research', input: { market: assetMarket, timeframe: researchTimeframe } },
        { name: 'market.get_twelve_data_research', input: { market: assetMarket, timeframe: researchTimeframe } },
        { name: 'market.get_yahoo_research', input: { market: assetMarket, timeframe: researchTimeframe } },
        { name: 'market.get_finnhub_research', input: { market: assetMarket, timeframe: researchTimeframe } },
        { name: 'macro.get_macro_signals', input: {} },
        { name: 'liquidity.get_cross_asset_regime', input: {} },
        { name: 'intelligence.search_news_documents', input: { query: question, maxRecords: 3 } },
      );
      break;
    case 'country-brief':
      toolCalls.push(
        { name: 'intelligence.get_country_intel_brief', input: { countryCode: /iran/.test(q) ? 'IRN' : /china/.test(q) ? 'CHN' : /saudi/.test(q) ? 'SAU' : 'USA' } },
        { name: 'intelligence.get_risk_scores', input: {} },
        { name: 'prediction.list_prediction_markets', input: { market: assetMarket, query: question, mode: 'markets' } },
      );
      break;
    case 'options-gamma-positioning':
      toolCalls.push(
        { name: 'monitor.get_institutional_monitor', input: { market: assetMarket, timeframe: analysisTimeframe } },
        { name: 'options.get_gamma_levels', input: { symbol: assetMarket } },
        { name: 'options.get_flow_proxy', input: { symbol: assetMarket } },
        { name: 'options.list_options_snapshots', input: { symbol: assetMarket } },
        { name: 'options.get_dealer_pressure', input: { symbol: assetMarket } },
      );
      break;
    case 'dealer-pressure':
      toolCalls.push(
        { name: 'monitor.get_institutional_monitor', input: { market: assetMarket, timeframe: analysisTimeframe } },
        { name: 'options.get_dealer_pressure', input: { symbol: assetMarket } },
        { name: 'options.get_flow_proxy', input: { symbol: assetMarket } },
        { name: 'options.get_gamma_levels', input: { symbol: assetMarket } },
        { name: 'market.list_market_quotes', input: { symbols: ['GC=F', '^VIX', '^GSPC'] } },
      );
      break;
    case 'cot-positioning':
      toolCalls.push(
        { name: 'monitor.get_institutional_monitor', input: { market: assetMarket, timeframe: analysisTimeframe } },
        { name: 'positioning.get_cot_summary', input: { market: cotMarket } },
        { name: 'positioning.get_positioning_regime', input: { market: cotMarket } },
        { name: 'market.list_market_quotes', input: { symbols: ['GC=F', 'DX-Y.NYB', '^TNX'] } },
      );
      break;
    case 'liquidity-stress':
      toolCalls.push(
        { name: 'monitor.get_institutional_monitor', input: { market: assetMarket, timeframe: analysisTimeframe } },
        { name: 'liquidity.get_liquidity_stress', input: {} },
        { name: 'liquidity.get_carry_stress', input: {} },
        { name: 'liquidity.get_safe_haven_pressure', input: {} },
        { name: 'liquidity.get_cross_asset_regime', input: {} },
      );
      break;
    case 'cross-asset-correlation':
      toolCalls.push(
        { name: 'market.list_market_quotes', input: { symbols: ['GC=F', 'CL=F', 'DX-Y.NYB', '^GSPC', '^VIX', 'EURUSD=X', 'USDJPY=X'] } },
        { name: 'macro.get_macro_signals', input: {} },
        { name: 'monitor.get_institutional_monitor', input: { market: assetMarket, timeframe: analysisTimeframe } },
        { name: 'liquidity.get_cross_asset_regime', input: {} },
      );
      break;
    case 'benner-cycle-interpretation':
      toolCalls.push(
        { name: 'benner.get_cycle_state', input: { market: assetMarket } },
        { name: 'macro.get_macro_signals', input: {} },
        { name: 'liquidity.get_cross_asset_regime', input: {} },
      );
      break;
    case 'volume-profile-interpretation':
      toolCalls.push(
        { name: 'volume.get_profile', input: { market: assetMarket, timeframe: structuralTimeframe } },
        { name: 'orderflow.get_engine', input: { market: assetMarket, timeframe: analysisTimeframe } },
        { name: 'pressure.get_buyer_seller_pressure', input: { market: assetMarket, timeframe: analysisTimeframe, mode: 'auto' } },
        { name: 'market.list_market_quotes', input: { symbols: ['GC=F', 'EURUSD=X', 'USDJPY=X', 'CL=F'] } },
      );
      break;
    case 'pivot-interpretation':
      toolCalls.push(
        { name: 'pivots.get_levels', input: { market: assetMarket, timeframe: structuralTimeframe } },
        { name: 'market.list_market_quotes', input: { symbols: ['GC=F', 'EURUSD=X', 'USDJPY=X', 'CL=F'] } },
        { name: 'volume.get_profile', input: { market: assetMarket, timeframe: structuralTimeframe } },
      );
      break;
    case 'buyer-seller-pressure-interpretation':
      toolCalls.push(
        { name: 'orderflow.get_engine', input: { market: assetMarket, timeframe: analysisTimeframe } },
        { name: 'pressure.get_buyer_seller_pressure', input: { market: assetMarket, timeframe: analysisTimeframe, mode: 'auto' } },
        { name: 'volume.get_profile', input: { market: assetMarket, timeframe: structuralTimeframe } },
        { name: 'pivots.get_levels', input: { market: assetMarket, timeframe: structuralTimeframe } },
      );
      break;
    case 'execution-guidance':
      toolCalls.push(
        { name: 'market.get_fear_greed_index', input: {} },
        { name: 'market.get_tradingview_research', input: { market: assetMarket, timeframe: researchTimeframe } },
        { name: 'market.get_twelve_data_research', input: { market: assetMarket, timeframe: researchTimeframe } },
        { name: 'market.get_yahoo_research', input: { market: assetMarket, timeframe: researchTimeframe } },
        { name: 'market.get_finnhub_research', input: { market: assetMarket, timeframe: researchTimeframe } },
        { name: 'macro.get_macro_signals', input: {} },
        { name: 'monitor.get_institutional_monitor', input: { market: assetMarket, timeframe: analysisTimeframe } },
        { name: 'analytics.get_trader_report', input: { market: assetMarket, timeframe: analysisTimeframe } },
        { name: 'analytics.get_entry_map', input: { market: assetMarket, chartTimeframe: analysisTimeframe } },
        { name: 'calendar.get_economic_calendar', input: { market: assetMarket } },
        { name: 'volume.get_profile', input: { market: assetMarket, timeframe: structuralTimeframe } },
        { name: 'pivots.get_levels', input: { market: assetMarket, timeframe: structuralTimeframe } },
        { name: 'orderflow.get_engine', input: { market: assetMarket, timeframe: analysisTimeframe } },
        { name: 'pressure.get_buyer_seller_pressure', input: { market: assetMarket, timeframe: analysisTimeframe, mode: 'auto' } },
        { name: 'options.get_gamma_levels', input: { symbol: assetMarket } },
        { name: 'options.get_dealer_pressure', input: { symbol: assetMarket } },
        { name: 'options.get_flow_proxy', input: { symbol: assetMarket } },
        { name: 'scenario.get_monte_carlo', input: { market: assetMarket, timeframe: analysisTimeframe } },
      );
      break;
    case 'document-news-search':
      toolCalls.push(
        { name: 'intelligence.search_news_documents', input: { query: question, maxRecords: 5 } },
      );
      break;
  }

  const unique = new Map<string, ToolCall>();
  toolCalls.forEach((call) => unique.set(`${call.name}:${JSON.stringify(call.input)}`, call));
  return [...unique.values()].slice(0, 16);
}
