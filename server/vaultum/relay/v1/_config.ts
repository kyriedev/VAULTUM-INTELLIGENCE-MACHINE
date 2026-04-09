declare const process: { env: Record<string, string | undefined> };

function env(name: string): string {
  return (process.env[name] || '').trim();
}

function parseCsv(value: string | undefined, fallback: string[]): string[] {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return [...new Set(raw.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean))];
}

export const RELAY_DEFAULT_PROXY_MAP: Record<string, string[]> = {
  XAUUSD: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  EURUSD: ['BTCUSDT', 'ETHUSDT'],
  GBPUSD: ['BTCUSDT', 'ETHUSDT'],
  USDJPY: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  GBPJPY: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  EURJPY: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  DXY: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'],
  SPX: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  NDX: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  US30: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'],
  WTI: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'],
  BTCUSD: ['BTCUSDT'],
  ETHUSD: ['ETHUSDT'],
};

export const RELAY_CONFIG = {
  cacheTtlSeconds: 20,
  staleTtlSeconds: 240,
  macroCacheTtlSeconds: 900,
  macroStaleTtlSeconds: 7200,
  binanceTradeLookbackMs: 90_000,
  binancePersistThrottleMs: 2_500,
  runtimeEnabled: !env('VERCEL') && /^(1|true|yes)$/i.test(env('RELAY_RUNTIME_ENABLED') || 'true'),
  prewarmIntervalMs: Number(env('RELAY_PREWARM_INTERVAL_MS') || 30_000),
  binanceSymbols: parseCsv(env('RELAY_BINANCE_SYMBOLS'), ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']),
  prewarmAssets: parseCsv(env('RELAY_PREWARM_ASSETS'), ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'WTI']),
  relayPort: Number(env('RELAY_PORT') || 8787),
  relayHost: env('RELAY_HOST') || '0.0.0.0',
  tradingViewUnofficialEnabled: /^(1|true|yes)$/i.test(env('RELAY_TRADINGVIEW_UNOFFICIAL') || 'true'),
  optionalScrapersEnabled: /^(1|true|yes)$/i.test(env('RELAY_ENABLE_OPTIONAL_SCRAPERS') || ''),
  fredSeries: ['DGS2', 'DGS10', 'DFII10'],
  worldBankIndicators: [
    { country: 'US', indicator: 'NY.GDP.MKTP.KD.ZG' },
    { country: 'CN', indicator: 'NY.GDP.MKTP.KD.ZG' },
    { country: 'JP', indicator: 'FP.CPI.TOTL.ZG' },
  ],
  imfIndicators: [
    { country: 'US', indicator: 'NGDP_RPCH' },
    { country: 'JP', indicator: 'PCPIPCH' },
    { country: 'CN', indicator: 'NGDP_RPCH' },
  ],
};

export function resolveRequestedAsset(asset?: string): string {
  const normalized = String(asset || 'EURUSD').trim().toUpperCase();
  const aliases: Record<string, string> = {
    GOLD: 'XAUUSD',
    GC: 'XAUUSD',
    'GC=F': 'XAUUSD',
    OIL: 'WTI',
    CL: 'WTI',
    'CL=F': 'WTI',
    '^GSPC': 'SPX',
    SPY: 'SPX',
    '^IXIC': 'NDX',
    QQQ: 'NDX',
    '^DJI': 'US30',
    DIA: 'US30',
    DJI: 'US30',
    YM: 'US30',
    'YM=F': 'US30',
    'YM1!': 'US30',
    UUP: 'DXY',
    'DX-Y.NYB': 'DXY',
    BTC: 'BTCUSD',
    BTCUSDT: 'BTCUSD',
    'BTC-USD': 'BTCUSD',
    ETH: 'ETHUSD',
    ETHUSDT: 'ETHUSD',
    'ETH-USD': 'ETHUSD',
  };
  return aliases[normalized] ?? normalized;
}

export function resolveProxySymbols(asset?: string): string[] {
  const requestedAsset = resolveRequestedAsset(asset);
  const mapped = RELAY_DEFAULT_PROXY_MAP[requestedAsset];
  if (mapped?.length) return mapped;
  if (/USD$/.test(requestedAsset) && RELAY_DEFAULT_PROXY_MAP.EURUSD) return RELAY_DEFAULT_PROXY_MAP.EURUSD;
  return RELAY_CONFIG.binanceSymbols.slice(0, 2);
}

export function resolveTradingViewHint(asset?: string): { query: string; filter: string; preferredIds: string[] } {
  const requestedAsset = resolveRequestedAsset(asset);
  const hints: Record<string, { query: string; filter: string; preferredIds: string[] }> = {
    XAUUSD: { query: 'GC1!', filter: 'futures', preferredIds: ['COMEX:GC1!', 'OANDA:XAUUSD', 'FX:XAUUSD', 'TVC:GOLD'] },
    EURUSD: { query: 'EURUSD', filter: 'forex', preferredIds: ['FX:EURUSD', 'OANDA:EURUSD'] },
    GBPUSD: { query: 'GBPUSD', filter: 'forex', preferredIds: ['FX:GBPUSD', 'OANDA:GBPUSD'] },
    USDJPY: { query: 'USDJPY', filter: 'forex', preferredIds: ['FX:USDJPY', 'OANDA:USDJPY'] },
    DXY: { query: 'UUP', filter: 'stock', preferredIds: ['AMEX:UUP'] },
    SPX: { query: 'SPY', filter: 'stock', preferredIds: ['AMEX:SPY'] },
    NDX: { query: 'QQQ', filter: 'stock', preferredIds: ['NASDAQ:QQQ'] },
    US30: { query: 'YM1!', filter: 'futures', preferredIds: ['CBOT_MINI:YM1!', 'AMEX:DIA', 'OANDA:US30USD', 'BLACKBULL:US30'] },
    WTI: { query: 'CL1!', filter: 'futures', preferredIds: ['NYMEX:CL1!', 'AMEX:USO', 'TVC:USOIL'] },
    BTCUSD: { query: 'BTCUSD', filter: 'crypto', preferredIds: ['BINANCE:BTCUSDT', 'COINBASE:BTCUSD'] },
    ETHUSD: { query: 'ETHUSD', filter: 'crypto', preferredIds: ['BINANCE:ETHUSDT', 'COINBASE:ETHUSD'] },
  };
  return hints[requestedAsset] ?? { query: requestedAsset, filter: '', preferredIds: [] };
}
