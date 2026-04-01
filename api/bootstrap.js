import { dispatchVaultumRpc } from '../server/vaultum/router';
import { buildFeedStatus } from '../server/vaultum/_shared/feed-status';

export default async function handler(_req, res) {
  try {
    const [
      marketQuotes,
      macroSignals,
      riskScores,
      tradeRestrictions,
      fearGreed,
      marketBrief,
      prediction,
      liquidityStress,
      bennerCycle,
      providerCatalog,
      volumeProfile,
      pivotLevels,
      buyerSellerPressure,
    ] = await Promise.all([
      dispatchVaultumRpc('market', 'list_market_quotes', { symbols: ['^GSPC', '^IXIC', '^VIX', 'DX-Y.NYB', '^TNX', 'GC=F'] }),
      dispatchVaultumRpc('macro', 'get_macro_signals', {}),
      dispatchVaultumRpc('intelligence', 'get_risk_scores', {}),
      dispatchVaultumRpc('trade', 'get_trade_restrictions', {}),
      dispatchVaultumRpc('market', 'get_fear_greed_index', {}),
      dispatchVaultumRpc('intelligence', 'get_market_brief', { market: 'XAUUSD', timeframe: '1h' }),
      dispatchVaultumRpc('prediction', 'list_prediction_markets', { query: 'gold', mode: 'markets' }),
      dispatchVaultumRpc('liquidity', 'get_liquidity_stress', {}),
      dispatchVaultumRpc('benner', 'get_cycle_state', { market: 'XAUUSD' }),
      dispatchVaultumRpc('system', 'get_provider_catalog', {}),
      dispatchVaultumRpc('volume', 'get_profile', { market: 'XAUUSD', timeframe: '1d' }),
      dispatchVaultumRpc('pivots', 'get_levels', { market: 'XAUUSD', timeframe: '1d' }),
      dispatchVaultumRpc('pressure', 'get_buyer_seller_pressure', { market: 'XAUUSD', mode: 'auto' }),
    ]);

    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=120');
    res.status(200).json({
      ok: true,
      data: {
        generatedAt: new Date().toISOString(),
        feedStatus: buildFeedStatus(),
        marketQuotes,
        macroSignals,
        riskScores,
        tradeRestrictions,
        fearGreed,
        marketBrief,
        prediction,
        liquidityStress,
        bennerCycle,
        providerCatalog,
        volumeProfile,
        pivotLevels,
        buyerSellerPressure,
      },
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Bootstrap failed',
    });
  }
}
