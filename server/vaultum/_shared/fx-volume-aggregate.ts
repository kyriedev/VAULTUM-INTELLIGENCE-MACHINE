declare const process: { env: Record<string, string | undefined> };

import { cacheKey } from '../../_shared/cache-keys';
import { CHROME_UA } from '../../_shared/constants';
import { getCachedOrCompute } from '../../_shared/redis';
import { getRelayLiquiditySnapshot } from '../relay/v1/get-liquidity.ts';
import { getRelayVolumeSnapshot } from '../relay/v1/get-volume.ts';
import { fetchOandaCandles, mapToOandaInstrument, oandaConfigured } from './oanda';
import { relayConfigured, relaySecretPresent } from './provider-catalog';

type ProviderState = 'active' | 'inactive' | 'unavailable';

type BrokerVolumeCandle = {
  time: string;
  open?: number;
  close?: number;
  volume: number;
};

type NormalizedBrokerVolumeCandle = BrokerVolumeCandle & {
  provider: 'OANDA' | 'FXCM';
  rawVolume: number;
  normalizedVolume: number;
  baselineVolume: number;
};

type VolumeSourceSnapshot = {
  provider: 'OANDA' | 'FXCM' | 'RELAY';
  state: ProviderState;
  bars: number;
  latestVolume: number | null;
  rollingVolume: number | null;
  note: string;
};

export type FxVolumeAggregateResponse = {
  market: string;
  interval: 'S5';
  sampledAt: string;
  sourceMode: 'multi-broker' | 'single-broker' | 'synthetic-relay' | 'unavailable';
  sourceLabel: string;
  normalizationMode: 'provider-baseline' | 'synthetic-flow' | 'none';
  normalizationLabel: string;
  supported: boolean;
  lastBarTime: string | null;
  latestVolume: number | null;
  rollingVolume: number | null;
  relativeVolume: number | null;
  buyerSharePct: number | null;
  sellerSharePct: number | null;
  dominance: 'buyers dominant' | 'sellers dominant' | 'balanced' | 'unknown';
  volumeScore: number | null;
  sources: VolumeSourceSnapshot[];
  candles: Array<{
    time: string;
    volume: number;
    bullishVolume: number;
    bearishVolume: number;
  }>;
  unavailable?: true;
  error?: string;
};

function env(name: string): string {
  return (process.env[name] || '').trim();
}

function relayBaseUrl(): string | null {
  const raw = env('FXCM_RELAY_URL') || env('WS_RELAY_URL');
  if (!raw) return null;
  return raw.replace('wss://', 'https://').replace('ws://', 'http://').replace(/\/$/, '');
}

function relayHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': CHROME_UA,
  };
  const relaySecret = env('RELAY_SHARED_SECRET');
  if (relaySecret) {
    const relayHeader = (env('RELAY_AUTH_HEADER') || 'x-relay-key').toLowerCase();
    headers[relayHeader] = relaySecret;
    headers.Authorization = `Bearer ${relaySecret}`;
  }
  return headers;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function supportedFxMarket(market: string): boolean {
  return Boolean(mapToOandaInstrument(market));
}

function toNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function baselineVolume(candles: BrokerVolumeCandle[]): number {
  const samples = candles
    .map((candle) => candle.volume)
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(-48);
  return Math.max(average(samples), 1);
}

function normalizeSourceCandles(provider: 'OANDA' | 'FXCM', candles: BrokerVolumeCandle[]): NormalizedBrokerVolumeCandle[] {
  if (!candles.length) return [];
  const baseline = baselineVolume(candles);
  return candles.map((candle) => ({
    ...candle,
    provider,
    rawVolume: candle.volume,
    normalizedVolume: Number(((candle.volume / baseline) * 100).toFixed(4)),
    baselineVolume: baseline,
  }));
}

function normalizeRelayCandles(payload: any): BrokerVolumeCandle[] {
  const rows = Array.isArray(payload?.candles)
    ? payload.candles
    : Array.isArray(payload?.bars)
      ? payload.bars
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : [];

  return rows.flatMap((row: any) => {
    const time = String(row?.time || row?.timestamp || row?.date || '').trim();
    const volume = toNumber(row?.volume ?? row?.tickQty ?? row?.tickVolume ?? row?.ticks);
    if (!time || volume == null) return [];
    const open = toNumber(row?.open ?? row?.o);
    const close = toNumber(row?.close ?? row?.c);
    return [{ time, open: open ?? undefined, close: close ?? undefined, volume }];
  });
}

async function fetchFxcmRelayCandles(market: string): Promise<BrokerVolumeCandle[]> {
  const base = relayBaseUrl();
  if (!base || !relayConfigured()) return [];

  const endpoints = [
    `${base}/fxcm-volume?market=${encodeURIComponent(market)}&interval=S5&bars=120`,
    `${base}/broker-volume?provider=fxcm&market=${encodeURIComponent(market)}&interval=S5&bars=120`,
    `${base}/fxcm/candles?market=${encodeURIComponent(market)}&granularity=S5&count=120`,
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        headers: relayHeaders(),
        signal: AbortSignal.timeout(3500),
      });
      if (!response.ok) continue;
      const payload = await response.json();
      const candles = normalizeRelayCandles(payload);
      if (candles.length) return candles;
    } catch {
      /* try next endpoint */
    }
  }

  return [];
}

function aggregateCandles(sources: NormalizedBrokerVolumeCandle[][]): Array<{ time: string; volume: number; bullishVolume: number; bearishVolume: number }> {
  const buckets = new Map<string, { time: string; volume: number; bullishVolume: number; bearishVolume: number }>();

  sources.flat().forEach((candle) => {
    const existing = buckets.get(candle.time) ?? { time: candle.time, volume: 0, bullishVolume: 0, bearishVolume: 0 };
    existing.volume += candle.normalizedVolume;
    if ((candle.close ?? 0) >= (candle.open ?? 0)) existing.bullishVolume += candle.normalizedVolume;
    else existing.bearishVolume += candle.normalizedVolume;
    buckets.set(candle.time, existing);
  });

  return [...buckets.values()]
    .sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime())
    .slice(-120);
}

function summarizeSources(oanda: BrokerVolumeCandle[], fxcm: BrokerVolumeCandle[]): VolumeSourceSnapshot[] {
  return [
    {
      provider: 'OANDA',
      state: oanda.length ? 'active' : (oandaConfigured() ? 'unavailable' : 'inactive'),
      bars: oanda.length,
      latestVolume: oanda.length ? oanda[oanda.length - 1]!.volume : null,
      rollingVolume: oanda.length ? Number(oanda.slice(-24).reduce((sum, candle) => sum + candle.volume, 0).toFixed(0)) : null,
      note: oanda.length
        ? 'OANDA broker-volume candles are contributing to the aggregate FX volume sidecar and are baseline-normalized before blending.'
        : oandaConfigured()
          ? 'OANDA is configured but did not return usable S5 broker-volume candles.'
          : 'OANDA is not configured.',
    },
    {
      provider: 'FXCM',
      state: fxcm.length ? 'active' : (relayConfigured() || relaySecretPresent() ? 'unavailable' : 'inactive'),
      bars: fxcm.length,
      latestVolume: fxcm.length ? fxcm[fxcm.length - 1]!.volume : null,
      rollingVolume: fxcm.length ? Number(fxcm.slice(-24).reduce((sum, candle) => sum + candle.volume, 0).toFixed(0)) : null,
      note: fxcm.length
        ? 'FXCM relay volume is contributing to the aggregate FX volume sidecar and is baseline-normalized before blending.'
        : relayConfigured()
          ? 'FXCM relay path is configured but did not return usable S5 volume bars.'
          : 'FXCM relay path is not configured.',
    },
  ];
}

async function summarizeRelaySource(market: string): Promise<{ source: VolumeSourceSnapshot; snapshot: FxVolumeAggregateResponse | null }> {
  try {
    const [volume, liquidity] = await Promise.all([
      getRelayVolumeSnapshot({ asset: market }),
      getRelayLiquiditySnapshot({ asset: market }),
    ]);

    const buyerSharePct = volume.aggregate.volume
      ? ((volume.aggregate.buy_volume ?? 0) / Math.max(volume.aggregate.volume, 0.0001)) * 100
      : 50;
    const sellerSharePct = volume.aggregate.volume
      ? ((volume.aggregate.sell_volume ?? 0) / Math.max(volume.aggregate.volume, 0.0001)) * 100
      : 50;
    const dominance = liquidity.syntheticFxDirection === 'bullish'
      ? 'buyers dominant'
      : liquidity.syntheticFxDirection === 'bearish'
        ? 'sellers dominant'
        : 'balanced';

    return {
      source: {
        provider: 'RELAY',
        state: liquidity.stale ? 'unavailable' : 'active',
        bars: volume.normalized.length,
        latestVolume: volume.aggregate.volume != null ? Number(volume.aggregate.volume.toFixed(0)) : null,
        rollingVolume: Number(volume.rollingVolume.toFixed(0)),
        note: liquidity.stale
          ? 'Synthetic relay fallback is serving stale proxy orderflow data.'
          : 'Synthetic relay fallback is deriving flow intensity from Binance orderflow proxies, macro weighting, and optional unofficial TradingView confirmation.',
      },
      snapshot: {
        market,
        interval: 'S5',
        sampledAt: liquidity.timestamp,
        sourceMode: 'synthetic-relay',
        sourceLabel: 'Synthetic relay fallback is deriving flow intensity from Binance orderflow proxies, macro weighting, and optional unofficial TradingView confirmation. It is not pretending to be real broker tape volume.',
        normalizationMode: 'synthetic-flow',
        normalizationLabel: 'Synthetic flow blends crypto proxy volume, buy/sell delta, order-book imbalance, and macro weighting into a broker-independent flow score.',
        supported: true,
        lastBarTime: liquidity.timestamp,
        latestVolume: volume.aggregate.volume != null ? Number(volume.aggregate.volume.toFixed(0)) : null,
        rollingVolume: Number(volume.rollingVolume.toFixed(0)),
        relativeVolume: volume.relativeVolume,
        buyerSharePct: Number(buyerSharePct.toFixed(1)),
        sellerSharePct: Number(sellerSharePct.toFixed(1)),
        dominance,
        volumeScore: liquidity.syntheticFxVolumeScore,
        sources: [],
        candles: volume.normalized.map((point) => ({
          time: point.timestamp,
          volume: Number((point.volume ?? 0).toFixed(0)),
          bullishVolume: Number((point.buy_volume ?? 0).toFixed(0)),
          bearishVolume: Number((point.sell_volume ?? 0).toFixed(0)),
        })),
      },
    };
  } catch (error) {
    return {
      source: {
        provider: 'RELAY',
        state: 'unavailable',
        bars: 0,
        latestVolume: null,
        rollingVolume: null,
        note: error instanceof Error ? error.message : 'Synthetic relay fallback was unavailable.',
      },
      snapshot: null,
    };
  }
}

export async function getFxVolumeAggregate(input: { market?: string }): Promise<FxVolumeAggregateResponse> {
  const market = String(input.market || 'EURUSD').toUpperCase();

  return getCachedOrCompute(cacheKey('fx-volume', market), async () => {
    if (!supportedFxMarket(market)) {
      const relay = await summarizeRelaySource(market);
      if (relay.snapshot) {
        return {
          ...relay.snapshot,
          sources: [relay.source],
        };
      }
      return {
        market,
        interval: 'S5',
        sampledAt: new Date().toISOString(),
        sourceMode: 'unavailable',
        sourceLabel: 'Aggregate FX sidecar only runs on supported broker markets unless the synthetic relay fallback is available.',
        normalizationMode: 'none',
        normalizationLabel: 'No normalization is applied when the broker-volume sidecar is unavailable.',
        supported: false,
        lastBarTime: null,
        latestVolume: null,
        rollingVolume: null,
        relativeVolume: null,
        buyerSharePct: null,
        sellerSharePct: null,
        dominance: 'unknown',
        volumeScore: null,
        sources: [...summarizeSources([], []), relay.source],
        candles: [],
        unavailable: true,
      };
    }

    try {
      const [oanda, fxcm, relay] = await Promise.all([
        oandaConfigured() ? fetchOandaCandles(market, 'S5', 120) : Promise.resolve([]),
        fetchFxcmRelayCandles(market),
        summarizeRelaySource(market),
      ]);

      const normalizedOanda: BrokerVolumeCandle[] = oanda.map((candle) => ({
        time: candle.time,
        open: candle.open,
        close: candle.close,
        volume: candle.volume,
      }));
      const blendedOanda = normalizeSourceCandles('OANDA', normalizedOanda);
      const blendedFxcm = normalizeSourceCandles('FXCM', fxcm);
      const aggregated = aggregateCandles([blendedOanda, blendedFxcm]);
      const sources = [...summarizeSources(normalizedOanda, fxcm), relay.source];
      if (!aggregated.length) {
        if (relay.snapshot) {
          return {
            ...relay.snapshot,
            sources,
          };
        }
        return {
          market,
          interval: 'S5',
          sampledAt: new Date().toISOString(),
          sourceMode: 'unavailable',
          sourceLabel: 'Aggregate FX broker-volume sidecar has no usable broker bars yet, and the synthetic relay fallback was unavailable.',
          normalizationMode: 'none',
          normalizationLabel: 'No normalization is applied when the broker-volume sidecar has no usable broker bars.',
          supported: true,
          lastBarTime: null,
          latestVolume: null,
          rollingVolume: null,
          relativeVolume: null,
          buyerSharePct: null,
          sellerSharePct: null,
          dominance: 'unknown',
          volumeScore: null,
          sources,
          candles: [],
          unavailable: true,
        };
      }

      const latest = aggregated[aggregated.length - 1]!;
      const rollingWindow = aggregated.slice(-24);
      const priorWindow = aggregated.slice(-48, -24);
      const rollingVolume = rollingWindow.reduce((sum, candle) => sum + candle.volume, 0);
      const priorAverage = average(priorWindow.map((candle) => candle.volume));
      const relativeVolume = priorAverage > 0 ? rollingWindow[rollingWindow.length - 1]!.volume / priorAverage : 1;
      const bullishVolume = rollingWindow.reduce((sum, candle) => sum + candle.bullishVolume, 0);
      const bearishVolume = rollingWindow.reduce((sum, candle) => sum + candle.bearishVolume, 0);
      const totalDirectional = bullishVolume + bearishVolume;
      const buyerSharePct = totalDirectional > 0 ? (bullishVolume / totalDirectional) * 100 : 50;
      const sellerSharePct = totalDirectional > 0 ? (bearishVolume / totalDirectional) * 100 : 50;
      const dominance = buyerSharePct > sellerSharePct + 6
        ? 'buyers dominant'
        : sellerSharePct > buyerSharePct + 6
          ? 'sellers dominant'
          : 'balanced';
      const activeSources = sources.filter((source) => source.state === 'active').length;
      const volumeScore = clamp(
        ((buyerSharePct - sellerSharePct) * 0.65) + ((relativeVolume - 1) * 24) + (activeSources >= 2 ? 8 : 0),
        -100,
        100,
      );

      return {
        market,
        interval: 'S5',
        sampledAt: new Date().toISOString(),
        sourceMode: activeSources >= 2 ? 'multi-broker' : 'single-broker',
        sourceLabel: activeSources >= 2
          ? 'Aggregate FX broker-volume sidecar is blending OANDA and FXCM relay bars into one normalized live OTC FX volume composite.'
          : sources.some((source) => source.provider === 'OANDA' && source.state === 'active')
            ? 'Aggregate FX broker-volume sidecar is currently running on normalized OANDA broker-volume, with FXCM ready to supplement when relay volume is available.'
            : 'Aggregate FX broker-volume sidecar is currently running on normalized relay-fed broker volume only.',
        normalizationMode: 'provider-baseline',
        normalizationLabel: 'Broker volumes are baseline-normalized per provider before blending so OANDA and FXCM can reinforce each other without raw-volume scale drift.',
        supported: true,
        lastBarTime: latest.time,
        latestVolume: Number(latest.volume.toFixed(0)),
        rollingVolume: Number(rollingVolume.toFixed(0)),
        relativeVolume: Number(relativeVolume.toFixed(2)),
        buyerSharePct: Number(buyerSharePct.toFixed(1)),
        sellerSharePct: Number(sellerSharePct.toFixed(1)),
        dominance,
        volumeScore: Number(volumeScore.toFixed(1)),
        sources,
        candles: rollingWindow.map((candle) => ({
          time: candle.time,
          volume: Number(candle.volume.toFixed(0)),
          bullishVolume: Number(candle.bullishVolume.toFixed(0)),
          bearishVolume: Number(candle.bearishVolume.toFixed(0)),
        })),
      };
    } catch (error) {
      const relay = await summarizeRelaySource(market);
      if (relay.snapshot) {
        return {
          ...relay.snapshot,
          sources: [...summarizeSources([], []), relay.source],
        };
      }
      return {
        market,
        interval: 'S5',
        sampledAt: new Date().toISOString(),
        sourceMode: 'unavailable',
        sourceLabel: 'Aggregate FX broker-volume sidecar failed on the current request and no synthetic relay fallback was available.',
        normalizationMode: 'none',
        normalizationLabel: 'No normalization is applied when the broker-volume sidecar request fails.',
        supported: true,
        lastBarTime: null,
        latestVolume: null,
        rollingVolume: null,
        relativeVolume: null,
        buyerSharePct: null,
        sellerSharePct: null,
        dominance: 'unknown',
        volumeScore: null,
        sources: [...summarizeSources([], []), relay.source],
        candles: [],
        unavailable: true,
        error: error instanceof Error ? error.message : 'Unknown FX volume aggregate error',
      };
    }
  }, 1);
}
