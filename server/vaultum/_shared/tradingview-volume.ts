declare const process: { env: Record<string, string | undefined> };

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { cacheKey } from '../../_shared/cache-keys';
import { CHROME_UA } from '../../_shared/constants';
import { getCachedOrCompute } from '../../_shared/redis';

export type TradingViewVolumeClass = 'exchange-volume' | 'broker-volume' | 'estimated-volume';
export type TradingViewVolumeMode = 'volume-backed' | 'proxy' | 'estimated';
export type TradingViewVolumeQuality = 'strong' | 'usable' | 'weak';

export type TradingViewVolumeHint = {
  market: string;
  query: string;
  filter: 'stock' | 'futures' | 'forex' | 'cfd' | 'crypto' | 'index' | 'economic';
  preferredIds: string[];
  preferTradingView: boolean;
};

export type TradingViewVolumeCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type TradingViewVolumeFeed = {
  source: 'tradingview';
  candles: TradingViewVolumeCandle[];
  market: string;
  requestedTimeframe: string;
  matchedSymbolId: string;
  sourceLabel: string;
  volumeClass: TradingViewVolumeClass;
  mode: TradingViewVolumeMode;
  quality: TradingViewVolumeQuality;
  warnings: string[];
  providerTrace: string[];
};

const TRADINGVIEW_ORIGIN = 'https://www.tradingview.com';
const TRADINGVIEW_WS_URL = 'wss://data.tradingview.com/socket.io/websocket?type=chart';
const UNAUTHORIZED_TOKEN = 'unauthorized_user_token';
const HUGE_VOLUME_SENTINEL = 1e15;

const MARKET_ALIASES: Record<string, string> = {
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
  'YM=F': 'US30',
  'YM1!': 'US30',
  'CBOT_MINI:YM1!': 'US30',
  UUP: 'DXY',
  'DX-Y.NYB': 'DXY',
  BTC: 'BTCUSD',
  BTCUSDT: 'BTCUSD',
  'BTC-USD': 'BTCUSD',
  ETH: 'ETHUSD',
  ETHUSDT: 'ETHUSD',
  'ETH-USD': 'ETHUSD',
};

const TRADINGVIEW_VOLUME_HINTS: Record<string, TradingViewVolumeHint> = {
  XAUUSD: {
    market: 'XAUUSD',
    query: 'GC1!',
    filter: 'futures',
    preferredIds: ['COMEX:GC1!', 'OANDA:XAUUSD', 'FX:XAUUSD', 'TVC:GOLD'],
    preferTradingView: true,
  },
  WTI: {
    market: 'WTI',
    query: 'CL1!',
    filter: 'futures',
    preferredIds: ['NYMEX:CL1!', 'TVC:USOIL', 'OANDA:WTICOUSD'],
    preferTradingView: true,
  },
  US30: {
    market: 'US30',
    query: 'YM1!',
    filter: 'futures',
    preferredIds: ['CBOT_MINI:YM1!', 'AMEX:DIA', 'OANDA:US30USD', 'BLACKBULL:US30'],
    preferTradingView: true,
  },
  EURUSD: {
    market: 'EURUSD',
    query: 'EURUSD',
    filter: 'forex',
    preferredIds: ['OANDA:EURUSD', 'FX:EURUSD'],
    preferTradingView: false,
  },
  GBPUSD: {
    market: 'GBPUSD',
    query: 'GBPUSD',
    filter: 'forex',
    preferredIds: ['OANDA:GBPUSD', 'FX:GBPUSD'],
    preferTradingView: false,
  },
  USDJPY: {
    market: 'USDJPY',
    query: 'USDJPY',
    filter: 'forex',
    preferredIds: ['OANDA:USDJPY', 'FX:USDJPY'],
    preferTradingView: false,
  },
  GBPJPY: {
    market: 'GBPJPY',
    query: 'GBPJPY',
    filter: 'forex',
    preferredIds: ['OANDA:GBPJPY', 'FX:GBPJPY'],
    preferTradingView: false,
  },
  EURJPY: {
    market: 'EURJPY',
    query: 'EURJPY',
    filter: 'forex',
    preferredIds: ['OANDA:EURJPY', 'FX:EURJPY'],
    preferTradingView: false,
  },
  BTCUSD: {
    market: 'BTCUSD',
    query: 'BTCUSD',
    filter: 'crypto',
    preferredIds: ['BINANCE:BTCUSDT', 'COINBASE:BTCUSD'],
    preferTradingView: true,
  },
  ETHUSD: {
    market: 'ETHUSD',
    query: 'ETHUSD',
    filter: 'crypto',
    preferredIds: ['BINANCE:ETHUSDT', 'COINBASE:ETHUSD'],
    preferTradingView: true,
  },
};

function env(name: string): string {
  return (process.env[name] || '').trim();
}

function resolveMarket(input?: string): string {
  const normalized = String(input || 'XAUUSD').trim().toUpperCase();
  return MARKET_ALIASES[normalized] ?? normalized;
}

export function resolveTradingViewVolumeHint(input?: string): TradingViewVolumeHint | null {
  const market = resolveMarket(input);
  return TRADINGVIEW_VOLUME_HINTS[market] ?? null;
}

function timeframeToResolution(timeframe: string): string {
  const value = String(timeframe || '1h').trim().toLowerCase();
  if (value === '5m') return '5';
  if (value === '15m') return '15';
  if (value === '30m') return '30';
  if (value === '1h' || value === '60m') return '60';
  if (value === '4h') return '240';
  if (value === '1d' || value === 'd') return '1D';
  if (value === '1w' || value === 'w') return '1W';
  return '60';
}

function buildCookies(): string {
  const session = env('TRADINGVIEW_SESSION');
  const signature = env('TRADINGVIEW_SIGNATURE');
  if (!session) return '';
  if (!signature) return `sessionid=${session}`;
  return `sessionid=${session}; sessionid_sign=${signature}`;
}

async function resolveWebSocketConstructor(): Promise<any> {
  const configuredPath = env('TRADINGVIEW_WS_MODULE');
  const desktopCandidate = env('USERPROFILE')
    ? path.join(env('USERPROFILE'), 'Desktop', 'tradingview-api', 'node_modules', 'ws', 'index.js')
    : '';
  const candidates = [configuredPath, desktopCandidate].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const loaded = await import(pathToFileURL(candidate).href);
      const ctor = loaded.default ?? loaded.WebSocket ?? loaded;
      if (typeof ctor === 'function') return ctor;
    } catch {
      // keep falling back
    }
  }

  return (globalThis as any).WebSocket;
}

async function resolveAuthToken(): Promise<string> {
  const cookies = buildCookies();
  if (!cookies) return UNAUTHORIZED_TOKEN;

  const key = cacheKey('market', `tradingview-auth:${env('TRADINGVIEW_SESSION').slice(-8)}`);
  return getCachedOrCompute(key, async () => {
    try {
      const response = await fetch(TRADINGVIEW_ORIGIN, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          Cookie: cookies,
          Origin: TRADINGVIEW_ORIGIN,
          Referer: TRADINGVIEW_ORIGIN,
          'User-Agent': CHROME_UA,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return UNAUTHORIZED_TOKEN;
      const html = await response.text();
      const authToken = /"auth_token":"(.*?)"/.exec(html)?.[1];
      return authToken?.trim() || UNAUTHORIZED_TOKEN;
    } catch {
      return UNAUTHORIZED_TOKEN;
    }
  }, 3600);
}

function genSessionId(prefix: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 12; index += 1) {
    value += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return `${prefix}_${value}`;
}

function formatPacket(packet: unknown): string {
  const body = typeof packet === 'string' ? packet : JSON.stringify(packet);
  return `~m~${body.length}~m~${body}`;
}

function parsePackets(raw: string): Array<number | { m?: string; p?: any[] }> {
  return raw
    .replace(/~h~/g, '')
    .split(/~m~[0-9]{1,}~m~/g)
    .flatMap((segment) => {
      if (!segment) return [];
      try {
        return [JSON.parse(segment) as number | { m?: string; p?: any[] }];
      } catch {
        return [];
      }
    });
}

async function toText(data: unknown): Promise<string> {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data.text();
  return String(data ?? '');
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toIsoTime(raw: unknown): string | null {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const millis = value > 1e12 ? value : value * 1000;
  return new Date(millis).toISOString();
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function sanitizeVolume(value: unknown): number | null {
  const volume = Number(value);
  if (!Number.isFinite(volume) || volume <= 0 || volume >= HUGE_VOLUME_SENTINEL) return null;
  return round(volume, 2);
}

function normalizeCandles(candles: TradingViewVolumeCandle[]): { candles: TradingViewVolumeCandle[]; usableBars: number; warnings: string[] } {
  const warnings: string[] = [];
  const finiteVolumes = candles
    .map((candle) => candle.volume)
    .filter((volume): volume is number => typeof volume === 'number' && Number.isFinite(volume) && volume > 0);
  const medianVolume = median(finiteVolumes);
  const extremeThreshold = medianVolume > 0
    ? Math.max(medianVolume * 1_000_000, HUGE_VOLUME_SENTINEL)
    : HUGE_VOLUME_SENTINEL;
  let rejectedBars = 0;

  const normalized = candles.map((candle) => {
    const volume = candle.volume == null || candle.volume >= extremeThreshold
      ? null
      : candle.volume;
    if (candle.volume != null && volume == null) rejectedBars += 1;
    return {
      ...candle,
      volume,
    };
  });

  if (rejectedBars > 0) {
    warnings.push(`TradingView volume sanity rejected ${rejectedBars} abnormal bar${rejectedBars === 1 ? '' : 's'} before accepting the series.`);
  }

  return {
    candles: normalized,
    usableBars: normalized.filter((candle) => (candle.volume ?? 0) > 0).length,
    warnings,
  };
}

function volumeClassForSymbol(symbolId: string): TradingViewVolumeClass {
  const upper = symbolId.toUpperCase();
  if (/^(COMEX|NYMEX|CME(?:_MINI)?|CBOT(?:_MINI)?|ICE|BINANCE|COINBASE|NASDAQ|NYSE|AMEX):/.test(upper)) return 'exchange-volume';
  if (/^(OANDA|FX|FOREXCOM|BLACKBULL):/.test(upper)) return 'broker-volume';
  return 'estimated-volume';
}

function modeForVolumeClass(volumeClass: TradingViewVolumeClass): TradingViewVolumeMode {
  if (volumeClass === 'exchange-volume') return 'volume-backed';
  if (volumeClass === 'broker-volume') return 'proxy';
  return 'estimated';
}

function qualityForVolumeClass(volumeClass: TradingViewVolumeClass): TradingViewVolumeQuality {
  if (volumeClass === 'exchange-volume') return 'strong';
  if (volumeClass === 'broker-volume') return 'usable';
  return 'weak';
}

function volumeClassLabel(volumeClass: TradingViewVolumeClass): string {
  if (volumeClass === 'exchange-volume') return 'exchange volume';
  if (volumeClass === 'broker-volume') return 'broker or tick-style volume';
  return 'proxy or composite volume';
}

function buildSourceLabel(input: {
  market: string;
  symbolId: string;
  volumeClass: TradingViewVolumeClass;
}): string {
  const base =
    input.volumeClass === 'exchange-volume'
      ? `TradingView is using ${input.symbolId} as the live ${input.market} volume anchor. This is exchange-traded volume, so Vaultum treats it as the preferred volume-backed profile and orderflow sidecar.`
      : input.volumeClass === 'broker-volume'
        ? `TradingView is using ${input.symbolId} for ${input.market}. This is broker or tick-style volume, so Vaultum treats it as participation context rather than centralized tape.`
        : `TradingView is using ${input.symbolId} for ${input.market}. This is proxy or composite volume context, so Vaultum keeps it clearly labeled as estimated rather than tape-true.`;
  return `${base} Non-finite and placeholder volume values are rejected before the series is accepted.`;
}

async function fetchRawCandles(symbolId: string, timeframe: string, count: number, authToken: string): Promise<TradingViewVolumeCandle[]> {
  const WebSocketCtor = await resolveWebSocketConstructor();
  const sessionId = genSessionId('cs');
  const seriesId = 'ser_1';
  const resolution = timeframeToResolution(timeframe);
  const candles = new Map<number, TradingViewVolumeCandle>();

  return new Promise<TradingViewVolumeCandle[]>((resolve, reject) => {
    if (typeof WebSocketCtor !== 'function') {
      reject(new Error('WebSocket is unavailable in the current runtime.'));
      return;
    }

    let finalized = false;
    let requestedMore = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    const ws = WebSocketCtor === (globalThis as any).WebSocket
      ? new WebSocketCtor(
        TRADINGVIEW_WS_URL,
        [],
        {
          headers: {
            Origin: TRADINGVIEW_ORIGIN,
            Referer: TRADINGVIEW_ORIGIN,
            'User-Agent': CHROME_UA,
          },
        },
      )
      : new WebSocketCtor(TRADINGVIEW_WS_URL, {
        origin: TRADINGVIEW_ORIGIN,
        headers: {
          Referer: TRADINGVIEW_ORIGIN,
          'User-Agent': CHROME_UA,
        },
      });
    const emitterStyle = typeof ws.on === 'function';

    const cleanup = (): void => {
      if (settleTimer) clearTimeout(settleTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (emitterStyle && typeof ws.removeAllListeners === 'function') {
        ws.removeAllListeners('message');
        ws.removeAllListeners('open');
        ws.removeAllListeners('error');
        ws.removeAllListeners('close');
      } else {
        ws.onmessage = null;
        ws.onopen = null;
        ws.onerror = null;
        ws.onclose = null;
      }
      if (ws.readyState === 0 || ws.readyState === 1) {
        try {
          ws.close();
        } catch {
          // ignore close errors during cleanup
        }
      }
    };

    const fail = (error: unknown): void => {
      if (finalized) return;
      finalized = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const succeed = (): void => {
      if (finalized) return;
      const rows = [...candles.entries()]
        .sort((left, right) => left[0] - right[0])
        .map((entry) => entry[1])
        .slice(-count);
      if (!rows.length) {
        fail(new Error(`TradingView did not return candles for ${symbolId}.`));
        return;
      }
      finalized = true;
      cleanup();
      resolve(rows);
    };

    const send = (type: string, payload: any[]): void => {
      ws.send(formatPacket({ m: type, p: payload }));
    };

    const scheduleSettle = (): void => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        if (!requestedMore && candles.size > 0 && candles.size < Math.max(120, Math.floor(count * 0.7))) {
          requestedMore = true;
          send('request_more_data', [sessionId, '$prices', Math.max(40, count - candles.size)]);
          scheduleSettle();
          return;
        }
        succeed();
      }, 500);
    };

    timeoutTimer = setTimeout(() => {
      fail(new Error(`TradingView candle request timed out for ${symbolId}.`));
    }, 14_000);

    const handleOpen = () => {
      send('set_auth_token', [authToken]);
      send('chart_create_session', [sessionId]);
      send('resolve_symbol', [
        sessionId,
        seriesId,
        `=${JSON.stringify({
          symbol: symbolId,
          adjustment: 'splits',
        })}`,
      ]);
      send('create_series', [sessionId, '$prices', 's1', seriesId, resolution, count]);
    };

    const handleError = () => {
      fail(new Error(`TradingView websocket error for ${symbolId}.`));
    };

    const handleClose = () => {
      if (!finalized) {
        fail(new Error(`TradingView websocket closed before ${symbolId} finished loading.`));
      }
    };

    const handleMessage = (payload: unknown) => {
      const rawData = emitterStyle ? payload : (payload as MessageEvent).data;
      void toText(rawData).then((text) => {
        parsePackets(text).forEach((packet) => {
          if (typeof packet === 'number') {
            if (ws.readyState === 1) ws.send(formatPacket(`~h~${packet}`));
            return;
          }

          const type = String(packet.m || '');
          const data = Array.isArray(packet.p) ? packet.p : [];

          if (type === 'critical_error') {
            fail(new Error(`TradingView critical error for ${symbolId}: ${String(data[2] || data[1] || 'unknown error')}`));
            return;
          }

          if (type === 'symbol_error') {
            fail(new Error(`TradingView symbol error for ${symbolId}: ${String(data[2] || 'unknown symbol error')}`));
            return;
          }

          if (type === 'series_error') {
            fail(new Error(`TradingView series error for ${symbolId}: ${String(data[3] || data[2] || 'unknown series error')}`));
            return;
          }

          if (type !== 'timescale_update' && type !== 'du') return;
          const priceRows = data[1]?.$prices?.s;
          if (!Array.isArray(priceRows)) return;

          priceRows.forEach((point: any) => {
            const raw = Array.isArray(point?.v) ? point.v : null;
            const time = toIsoTime(raw?.[0]);
            const open = Number(raw?.[1]);
            const high = Number(raw?.[2]);
            const low = Number(raw?.[3]);
            const close = Number(raw?.[4]);
            if (!time || ![open, high, low, close].every((value) => Number.isFinite(value) && value > 0)) return;

            const timestamp = Date.parse(time);
            candles.set(timestamp, {
              time,
              open,
              high,
              low,
              close,
              volume: sanitizeVolume(raw?.[5]),
            });
          });

          if (candles.size > 0) scheduleSettle();
        });
      }).catch((error) => fail(error));
    };

    if (emitterStyle) {
      ws.on('open', handleOpen);
      ws.on('error', handleError);
      ws.on('close', handleClose);
      ws.on('message', handleMessage);
    } else {
      ws.onopen = handleOpen;
      ws.onerror = handleError;
      ws.onclose = handleClose;
      ws.onmessage = (event: MessageEvent) => handleMessage(event);
    }
  });
}

export async function fetchTradingViewVolumeCandles(input: {
  market: string;
  timeframe?: string;
  count?: number;
}): Promise<TradingViewVolumeFeed | null> {
  const hint = resolveTradingViewVolumeHint(input.market);
  if (!hint?.preferredIds.length) return null;

  const market = resolveMarket(input.market);
  const timeframe = String(input.timeframe || '1h').toLowerCase();
  const count = Math.max(40, Math.min(Number(input.count || 320), 500));
  const key = cacheKey('market', `tradingview-volume:${market}:${timeframe}:${count}`);

  return getCachedOrCompute(key, async () => {
    const authToken = await resolveAuthToken();
    const attempts: string[] = [];

    for (const symbolId of hint.preferredIds) {
      try {
        const rawCandles = await fetchRawCandles(symbolId, timeframe, count, authToken);
        const normalized = normalizeCandles(rawCandles);
        const usableFloor = Math.max(12, Math.floor(Math.min(count, normalized.candles.length) * 0.25));
        const volumeClass = volumeClassForSymbol(symbolId);
        const mode = modeForVolumeClass(volumeClass);
        const quality = qualityForVolumeClass(volumeClass);
        attempts.push(`${symbolId}: accepted ${normalized.usableBars}/${normalized.candles.length} usable ${volumeClassLabel(volumeClass)} bars`);

        if (normalized.usableBars < usableFloor) {
          attempts.push(`${symbolId}: rejected because only ${normalized.usableBars} usable volume bars passed sanity checks`);
          continue;
        }

        return {
          source: 'tradingview',
          candles: normalized.candles,
          market,
          requestedTimeframe: timeframe,
          matchedSymbolId: symbolId,
          sourceLabel: buildSourceLabel({ market, symbolId, volumeClass }),
          volumeClass,
          mode,
          quality,
          warnings: normalized.warnings,
          providerTrace: attempts,
        } satisfies TradingViewVolumeFeed;
      } catch (error) {
        attempts.push(`${symbolId}: ${error instanceof Error ? error.message : 'unknown TradingView error'}`);
      }
    }

    return null;
  }, 180);
}
