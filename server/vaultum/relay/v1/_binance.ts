import { RELAY_CONFIG } from './_config.ts';
import { readRelaySnapshot, setRelaySnapshot } from './_cache.ts';
import { fetchJsonWithRetry } from './_http.ts';
import type {
  BinanceSymbolSnapshot,
  RelayProviderStatus,
  RelayUnifiedPoint,
} from './_types.ts';

type DepthLevel = {
  price: number;
  quantity: number;
};

type TradeEvent = {
  timestamp: number;
  price: number;
  quantity: number;
  aggressor: 'buy' | 'sell';
};

type BinanceRuntimeState = {
  symbol: string;
  lastPrice: number | null;
  updatedAt: number;
  depthUpdatedAt: number;
  tradeUpdatedAt: number;
  bids: DepthLevel[];
  asks: DepthLevel[];
  trades: TradeEvent[];
  lastPersistAt: number;
};

type BinanceDepthPayload = {
  bids?: Array<[string, string]>;
  asks?: Array<[string, string]>;
};

type BinanceAggTradePayload = Array<{
  p?: string;
  q?: string;
  T?: number;
  m?: boolean;
}>;

const runtimeStates = new Map<string, BinanceRuntimeState>();
let runtimeSocket: WebSocket | null = null;
let runtimeSymbols: string[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let runtimeStarted = false;

function now(): number {
  return Date.now();
}

function toNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function sortDepth(levels: DepthLevel[], side: 'bids' | 'asks'): DepthLevel[] {
  return [...levels]
    .sort((left, right) => side === 'bids' ? right.price - left.price : left.price - right.price)
    .slice(0, 20);
}

function normalizeDepth(raw: Array<[string, string]> | undefined, side: 'bids' | 'asks'): DepthLevel[] {
  const levels = (raw ?? [])
    .map(([price, quantity]) => ({ price: Number(price), quantity: Number(quantity) }))
    .filter((level) => Number.isFinite(level.price) && Number.isFinite(level.quantity) && level.quantity > 0);
  return sortDepth(levels, side);
}

function trimTrades(trades: TradeEvent[]): TradeEvent[] {
  const cutoff = now() - RELAY_CONFIG.binanceTradeLookbackMs;
  return trades.filter((trade) => trade.timestamp >= cutoff).slice(-500);
}

function getRuntimeState(symbol: string): BinanceRuntimeState {
  const key = symbol.toUpperCase();
  const existing = runtimeStates.get(key);
  if (existing) return existing;
  const state: BinanceRuntimeState = {
    symbol: key,
    lastPrice: null,
    updatedAt: 0,
    depthUpdatedAt: 0,
    tradeUpdatedAt: 0,
    bids: [],
    asks: [],
    trades: [],
    lastPersistAt: 0,
  };
  runtimeStates.set(key, state);
  return state;
}

function buildProviderStatus(state: RelayProviderStatus['state'], detail: string, source: string): RelayProviderStatus {
  return {
    provider: 'binance',
    state,
    detail,
    updatedAt: new Date().toISOString(),
    source,
  };
}

function toUnifiedRecord(symbol: string, price: number | null, volume: number, buyVolume: number, sellVolume: number, source: string, timestamp: string): RelayUnifiedPoint {
  return {
    timestamp,
    asset: symbol,
    price,
    volume: Number(volume.toFixed(4)),
    buy_volume: Number(buyVolume.toFixed(4)),
    sell_volume: Number(sellVolume.toFixed(4)),
    source,
  };
}

function buildSnapshotFromState(state: BinanceRuntimeState, source: BinanceSymbolSnapshot['source']): BinanceSymbolSnapshot {
  const trades = trimTrades(state.trades);
  const volume = trades.reduce((sum, trade) => sum + trade.quantity, 0);
  const buyVolume = trades.filter((trade) => trade.aggressor === 'buy').reduce((sum, trade) => sum + trade.quantity, 0);
  const sellVolume = trades.filter((trade) => trade.aggressor === 'sell').reduce((sum, trade) => sum + trade.quantity, 0);
  const bidNotional = state.bids.slice(0, 10).reduce((sum, level) => sum + (level.price * level.quantity), 0);
  const askNotional = state.asks.slice(0, 10).reduce((sum, level) => sum + (level.price * level.quantity), 0);
  const imbalanceBase = bidNotional + askNotional;
  const liquidityImbalance = imbalanceBase > 0 ? ((bidNotional - askNotional) / imbalanceBase) * 100 : 0;
  const topBid = state.bids[0]?.price ?? null;
  const topAsk = state.asks[0]?.price ?? null;
  const price = state.lastPrice ?? (topBid != null && topAsk != null ? (topBid + topAsk) / 2 : topBid ?? topAsk ?? null);
  const timestamp = new Date(Math.max(state.updatedAt, state.tradeUpdatedAt, state.depthUpdatedAt, now())).toISOString();

  return {
    symbol: state.symbol,
    timestamp,
    price: price != null ? Number(price.toFixed(6)) : null,
    volume: Number(volume.toFixed(4)),
    buy_volume: Number(buyVolume.toFixed(4)),
    sell_volume: Number(sellVolume.toFixed(4)),
    source,
    tradeCount: trades.length,
    bidNotional: Number(bidNotional.toFixed(2)),
    askNotional: Number(askNotional.toFixed(2)),
    liquidityImbalance: Number(liquidityImbalance.toFixed(2)),
    records: [toUnifiedRecord(state.symbol, price, volume, buyVolume, sellVolume, source, timestamp)],
    provider: buildProviderStatus(
      source === 'binance-ws' ? 'live' : source === 'binance-rest' ? 'rest-fallback' : 'stale',
      source === 'binance-ws'
        ? 'Live Binance runtime snapshot.'
        : source === 'binance-rest'
          ? 'Binance REST fallback snapshot.'
          : 'Stale Binance relay snapshot.',
      source,
    ),
  };
}

async function fetchBinanceRestSnapshot(symbol: string): Promise<BinanceSymbolSnapshot> {
  const [depth, trades] = await Promise.all([
    fetchJsonWithRetry<BinanceDepthPayload>(`https://api.binance.com/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=20`, {
      timeoutMs: 5_000,
      retries: 1,
    }),
    fetchJsonWithRetry<BinanceAggTradePayload>(`https://api.binance.com/api/v3/aggTrades?symbol=${encodeURIComponent(symbol)}&limit=80`, {
      timeoutMs: 5_000,
      retries: 1,
    }),
  ]);

  const state = getRuntimeState(symbol);
  state.bids = normalizeDepth(depth.data?.bids, 'bids');
  state.asks = normalizeDepth(depth.data?.asks, 'asks');
  state.trades = trimTrades((trades.data ?? []).flatMap((trade) => {
    const price = toNumber(trade.p);
    const quantity = toNumber(trade.q);
    const timestamp = toNumber(trade.T);
    if (price == null || quantity == null || timestamp == null) return [];
    return [{
      timestamp,
      price,
      quantity,
      aggressor: trade.m ? 'sell' as const : 'buy' as const,
    }];
  }));
  state.lastPrice = state.trades[state.trades.length - 1]?.price ?? state.lastPrice;
  state.updatedAt = now();
  state.depthUpdatedAt = now();
  state.tradeUpdatedAt = now();

  const snapshot = buildSnapshotFromState(state, 'binance-rest');
  await setRelaySnapshot('binance-symbol', symbol, snapshot, RELAY_CONFIG.cacheTtlSeconds, RELAY_CONFIG.staleTtlSeconds);
  return snapshot;
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    runtimeStarted = false;
    if (runtimeSymbols.length) startBinanceRelayRuntime(runtimeSymbols);
  }, 2_000);
}

async function persistRuntimeSnapshot(symbol: string): Promise<void> {
  const state = getRuntimeState(symbol);
  if (now() - state.lastPersistAt < RELAY_CONFIG.binancePersistThrottleMs) return;
  state.lastPersistAt = now();
  const snapshot = buildSnapshotFromState(state, 'binance-ws');
  await setRelaySnapshot('binance-symbol', symbol, snapshot, RELAY_CONFIG.cacheTtlSeconds, RELAY_CONFIG.staleTtlSeconds);
}

async function handleRuntimeMessage(message: string): Promise<void> {
  let payload: any;
  try {
    payload = JSON.parse(message);
  } catch {
    return;
  }

  const streamName = String(payload?.stream || '').toLowerCase();
  const data = payload?.data;
  if (!streamName || !data) return;

  const symbol = String(data.s || '').toUpperCase();
  if (!symbol) return;

  const state = getRuntimeState(symbol);
  state.updatedAt = now();

  if (streamName.endsWith('@aggtrade')) {
    const price = toNumber(data.p);
    const quantity = toNumber(data.q);
    const timestamp = toNumber(data.T);
    if (price != null && quantity != null && timestamp != null) {
      state.lastPrice = price;
      state.tradeUpdatedAt = timestamp;
      state.trades.push({
        timestamp,
        price,
        quantity,
        aggressor: data.m ? 'sell' : 'buy',
      });
      state.trades = trimTrades(state.trades);
    }
  } else if (streamName.includes('@depth')) {
    state.depthUpdatedAt = toNumber(data.E) ?? now();
    state.bids = normalizeDepth(data.b, 'bids');
    state.asks = normalizeDepth(data.a, 'asks');
  }

  if (state.bids.length || state.asks.length || state.trades.length) {
    await persistRuntimeSnapshot(symbol);
  }
}

export function startBinanceRelayRuntime(symbols = RELAY_CONFIG.binanceSymbols): void {
  const normalizedSymbols = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  if (!normalizedSymbols.length || runtimeStarted) return;

  runtimeStarted = true;
  runtimeSymbols = normalizedSymbols;
  const streams = normalizedSymbols.flatMap((symbol) => [
    `${symbol.toLowerCase()}@aggTrade`,
    `${symbol.toLowerCase()}@depth20@100ms`,
  ]);
  const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`;

  try {
    runtimeSocket = new WebSocket(wsUrl);
    runtimeSocket.onmessage = (event) => {
      if (typeof event.data === 'string') {
        void handleRuntimeMessage(event.data);
      }
    };
    runtimeSocket.onclose = () => {
      runtimeSocket = null;
      scheduleReconnect();
    };
    runtimeSocket.onerror = () => {
      try { runtimeSocket?.close(); } catch { /* noop */ }
    };
  } catch {
    runtimeStarted = false;
    scheduleReconnect();
  }
}

export function relayRuntimeActive(): boolean {
  return Boolean(runtimeSocket && runtimeSocket.readyState === WebSocket.OPEN);
}

export async function getBinanceSymbolSnapshot(symbol: string, forceRefresh = false): Promise<BinanceSymbolSnapshot> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const state = getRuntimeState(normalizedSymbol);
  const liveAgeMs = now() - Math.max(state.tradeUpdatedAt, state.depthUpdatedAt, state.updatedAt);
  const hasLiveState = !forceRefresh && liveAgeMs < Math.max(RELAY_CONFIG.binancePersistThrottleMs * 4, 10_000)
    && (state.trades.length > 0 || (state.bids.length > 0 && state.asks.length > 0));

  if (hasLiveState) {
    return buildSnapshotFromState(state, 'binance-ws');
  }

  try {
    return await fetchBinanceRestSnapshot(normalizedSymbol);
  } catch (error) {
    const cached = await readRelaySnapshot<BinanceSymbolSnapshot>('binance-symbol', normalizedSymbol);
    if (cached) {
      return {
        ...cached.value,
        source: 'binance-cache-stale',
        provider: buildProviderStatus('stale', error instanceof Error ? `${error.message}. Serving stale Binance relay snapshot.` : 'Serving stale Binance relay snapshot.', 'binance-cache-stale'),
      };
    }
    throw error instanceof Error ? error : new Error(`Unable to fetch Binance relay snapshot for ${normalizedSymbol}`);
  }
}
