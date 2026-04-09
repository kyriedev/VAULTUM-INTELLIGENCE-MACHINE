import assert from 'node:assert/strict';

import { buildLiquiditySnapshot, buildOrderflowSnapshot } from '../server/vaultum/relay/v1/_fusion.ts';
import type {
  BinanceSymbolSnapshot,
  RelayMacroSnapshot,
  RelayProviderStatus,
  TradingViewUnofficialSnapshot,
} from '../server/vaultum/relay/v1/_types.ts';

function provider(state: RelayProviderStatus['state'], source: string): RelayProviderStatus {
  return {
    provider: 'binance',
    state,
    detail: `${state} provider`,
    updatedAt: new Date().toISOString(),
    source,
  };
}

function makeSnapshot(symbol: string, price: number, buyVolume: number, sellVolume: number, imbalance: number): BinanceSymbolSnapshot {
  const volume = buyVolume + sellVolume;
  return {
    symbol,
    timestamp: new Date().toISOString(),
    price,
    volume,
    buy_volume: buyVolume,
    sell_volume: sellVolume,
    source: 'binance-rest',
    tradeCount: 24,
    bidNotional: 250_000,
    askNotional: 220_000,
    liquidityImbalance: imbalance,
    records: [{
      timestamp: new Date().toISOString(),
      asset: symbol,
      price,
      volume,
      buy_volume: buyVolume,
      sell_volume: sellVolume,
      source: 'binance-rest',
    }],
    provider: provider('rest-fallback', 'binance-rest'),
  };
}

function macroSnapshot(): RelayMacroSnapshot {
  return {
    timestamp: new Date().toISOString(),
    normalized: [],
    cacheState: 'live',
    stale: false,
    indicators: {
      fred: {
        DGS2: { asset: 'DGS2', value: 4.1, previous: 4.0, change: 0.1, timestamp: '2026-04-03', source: 'FRED' },
        DGS10: { asset: 'DGS10', value: 4.3, previous: 4.25, change: 0.05, timestamp: '2026-04-03', source: 'FRED' },
        DFII10: { asset: 'DFII10', value: 1.9, previous: 1.85, change: 0.05, timestamp: '2026-04-03', source: 'FRED' },
      },
      worldBank: {
        'US:NY.GDP.MKTP.KD.ZG': { asset: 'US:NY.GDP.MKTP.KD.ZG', value: 2.4, previous: 2.1, change: 0.3, timestamp: '2025', source: 'World Bank' },
        'CN:NY.GDP.MKTP.KD.ZG': { asset: 'CN:NY.GDP.MKTP.KD.ZG', value: 4.6, previous: 4.4, change: 0.2, timestamp: '2025', source: 'World Bank' },
        'JP:FP.CPI.TOTL.ZG': { asset: 'JP:FP.CPI.TOTL.ZG', value: 2.6, previous: 2.4, change: 0.2, timestamp: '2025', source: 'World Bank' },
      },
      imf: {},
      optional: {},
    },
    providers: {
      fred: { provider: 'fred', state: 'live', detail: 'fred ok', updatedAt: new Date().toISOString(), source: 'FRED' },
      worldBank: { provider: 'world-bank', state: 'live', detail: 'wb ok', updatedAt: new Date().toISOString(), source: 'World Bank' },
      imf: { provider: 'imf', state: 'inactive', detail: 'imf idle', updatedAt: new Date().toISOString(), source: 'IMF' },
      optionalScrapers: { provider: 'optional-scrapers', state: 'disabled', detail: 'disabled', updatedAt: new Date().toISOString(), source: null },
    },
    warnings: [],
  };
}

function technical(recommendation: TradingViewUnofficialSnapshot['recommendation']): TradingViewUnofficialSnapshot {
  return {
    requestedAsset: 'EURUSD',
    matchedSymbolId: 'FX:EURUSD',
    recommendation,
    score: recommendation === 'buy' ? 0.2 : recommendation === 'sell' ? -0.2 : 0,
    summary: 'technical snapshot',
    source: 'searchMarketV3 + global scan',
    warnings: [],
    provider: { provider: 'tradingview-unofficial', state: 'live', detail: 'ok', updatedAt: new Date().toISOString(), source: 'TradingView' },
  };
}

export function runRelayEngineTests(): void {
  {
    const orderflow = buildOrderflowSnapshot(
      'EURUSD',
      ['BTCUSDT', 'ETHUSDT'],
      [
        makeSnapshot('BTCUSDT', 68_500, 18, 11, 9),
        makeSnapshot('ETHUSDT', 3_500, 14, 9, 7),
      ],
      'live',
      false,
      [],
    );

    assert.equal(orderflow.directionalBias, 'buyers-dominant');
    assert.ok(orderflow.volumeDelta > 0);
    assert.ok(orderflow.liquidityImbalance > 0);
  }

  {
    const orderflow = buildOrderflowSnapshot(
      'EURUSD',
      ['BTCUSDT', 'ETHUSDT'],
      [
        makeSnapshot('BTCUSDT', 68_500, 18, 11, 9),
        makeSnapshot('ETHUSDT', 3_500, 14, 9, 7),
      ],
      'live',
      false,
      [],
    );
    const liquidity = buildLiquiditySnapshot(orderflow, macroSnapshot(), technical('buy'), []);

    assert.equal(liquidity.syntheticFxDirection, 'bullish');
    assert.ok(liquidity.syntheticFxVolumeScore > 0);
    assert.ok(liquidity.breakdown.directionScore > 0);
  }

  {
    const orderflow = buildOrderflowSnapshot(
      'EURUSD',
      ['BTCUSDT', 'ETHUSDT'],
      [
        makeSnapshot('BTCUSDT', 68_500, 8, 17, -11),
        makeSnapshot('ETHUSDT', 3_500, 6, 14, -9),
      ],
      'live',
      false,
      [],
    );
    const liquidity = buildLiquiditySnapshot(orderflow, macroSnapshot(), technical('sell'), []);

    assert.equal(liquidity.syntheticFxDirection, 'bearish');
    assert.ok(liquidity.syntheticFxVolumeScore < 0);
  }
}
