import type { MarketProviderName, RegimeProxyDefinition } from '../lib/market/types.ts';

export type RegimeClassification = 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL' | 'TRANSITION';
export type RegimeProxyId =
  | 'usd'
  | 'gold'
  | 'rates'
  | 'nasdaq'
  | 'spx'
  | 'btc'
  | 'oil'
  | 'jpy'
  | 'volatility';

export const REGIME_PROVIDER_PRIORITY: Array<Exclude<MarketProviderName, 'brokerVolume'>> = [
  'finnhub',
  'alphavantage',
  'yahooRelay',
];

export const REGIME_PROXY_ORDER: RegimeProxyId[] = [
  'usd',
  'gold',
  'rates',
  'nasdaq',
  'spx',
  'btc',
  'oil',
  'jpy',
  'volatility',
];

export const REGIME_PROXY_DEFINITIONS: Record<RegimeProxyId, RegimeProxyDefinition> = {
  usd: {
    id: 'usd',
    label: 'Dollar Proxy',
    assetClass: 'fx',
    providerSymbols: {
      finnhub: 'UUP',
      alphavantage: 'UUP',
      yahooRelay: 'UUP',
    },
  },
  gold: {
    id: 'gold',
    label: 'Gold Proxy',
    assetClass: 'commodity',
    providerSymbols: {
      finnhub: 'GLD',
      alphavantage: 'GLD',
      yahooRelay: 'GLD',
    },
  },
  rates: {
    id: 'rates',
    label: 'US Duration Proxy',
    assetClass: 'rates',
    providerSymbols: {
      finnhub: 'TLT',
      alphavantage: 'TLT',
      yahooRelay: 'TLT',
    },
  },
  nasdaq: {
    id: 'nasdaq',
    label: 'NASDAQ Proxy',
    assetClass: 'equity',
    providerSymbols: {
      finnhub: 'QQQ',
      alphavantage: 'QQQ',
      yahooRelay: 'QQQ',
    },
  },
  spx: {
    id: 'spx',
    label: 'S&P 500 Proxy',
    assetClass: 'equity',
    providerSymbols: {
      finnhub: 'SPY',
      alphavantage: 'SPY',
      yahooRelay: 'SPY',
    },
  },
  btc: {
    id: 'btc',
    label: 'Bitcoin Proxy',
    assetClass: 'crypto',
    providerSymbols: {
      finnhub: 'IBIT',
      alphavantage: 'IBIT',
      yahooRelay: 'IBIT',
    },
  },
  oil: {
    id: 'oil',
    label: 'Oil Proxy',
    assetClass: 'commodity',
    providerSymbols: {
      finnhub: 'USO',
      alphavantage: 'USO',
      yahooRelay: 'USO',
    },
  },
  jpy: {
    id: 'jpy',
    label: 'JPY Proxy',
    assetClass: 'fx',
    providerSymbols: {
      finnhub: 'FXY',
      alphavantage: 'FXY',
      yahooRelay: 'FXY',
    },
  },
  volatility: {
    id: 'volatility',
    label: 'Volatility Proxy',
    assetClass: 'volatility',
    providerSymbols: {
      finnhub: 'VIXY',
      alphavantage: 'VIXY',
      yahooRelay: 'VIXY',
    },
  },
};

export const REGIME_CONFIG = {
  timeframe: '1d' as const,
  cache: {
    providerTtlMs: 5 * 60 * 1000,
    providerStaleTtlMs: 30 * 60 * 1000,
    engineTtlSeconds: 180,
  },
  request: {
    timeoutMs: 8_000,
    retries: 2,
    backoffMs: 250,
  },
  windows: {
    returnWindows: [1, 5, 20, 60],
    atrPeriod: 14,
    expansionWindow: 20,
    persistenceWindow: 5,
    correlationWindow: 20,
    minimumBars: 80,
  },
  normalization: {
    shortMoveScale: 3,
    mediumMoveScale: 8,
    longMoveScale: 15,
    volatilityScale: 2.25,
    reversalScale: 3.5,
  },
  classification: {
    riskOnThreshold: 16,
    riskOffThreshold: -16,
    transitionBand: 8,
    minimumConfidence: 56,
  },
  factors: {
    liquidity: {
      usd: 0.32,
      rates: 0.24,
      spx: 0.16,
      nasdaq: 0.16,
      volatility: 0.12,
    },
    risk: {
      spx: 0.24,
      nasdaq: 0.24,
      btc: 0.16,
      gold: 0.10,
      usd: 0.12,
      jpy: 0.14,
    },
    volatility: {
      atrExpansion: 0.42,
      rangeExpansion: 0.28,
      abruptMove: 0.30,
    },
    correlation: {
      equities: 0.36,
      havenVsRisk: 0.32,
      usdVsRisk: 0.20,
      oilVsGrowth: 0.12,
    },
    syntheticFlow: {
      velocity: 0.24,
      rangeExpansion: 0.22,
      volatilityExpansion: 0.18,
      confirmation: 0.16,
      persistence: 0.12,
      reversalPressure: 0.08,
    },
  },
  confidence: {
    factorAgreementWeight: 0.44,
    freshnessWeight: 0.22,
    providerAgreementWeight: 0.20,
    completenessWeight: 0.14,
    missingSeriesPenalty: 10,
    stalePenalty: 8,
    providerDisagreementPenalty: 10,
    transitionPenalty: 8,
  },
} as const;
