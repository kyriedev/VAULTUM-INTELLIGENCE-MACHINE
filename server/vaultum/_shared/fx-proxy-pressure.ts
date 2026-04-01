import { cacheKey } from '../../_shared/cache-keys';
import { getCachedOrCompute } from '../../_shared/redis';
import { fetchYahooChart } from './yahoo';

type Candle = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type FxMacroProxySnapshot = {
  applicable: boolean;
  formula: string;
  marketRationale: string | null;
  dxyMovement: number | null;
  yieldMovement: number | null;
  jpyRiskMovement: number | null;
  dxyPressure: number;
  yieldPressure: number;
  jpyRiskPressure: number;
  macroProxyPressure: number;
  macroProxyBias: string;
  detail: string;
};

type MacroOrientation = {
  dxyWeight: number;
  yieldWeight: number;
  jpyWeight: number;
  rationale: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeCandles(payload: any): Candle[] {
  return Array.isArray(payload?.candles)
    ? payload.candles.map((candle: any) => ({
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: typeof candle.volume === 'number' ? candle.volume : null,
    })).filter((candle: Candle) => Number.isFinite(candle.close))
    : [];
}

async function fetchProxyCandles(symbol: string): Promise<Candle[]> {
  const intraday = await fetchYahooChart(symbol, '5d', '1h').catch(() => null);
  const intradayCandles = normalizeCandles(intraday);
  if (intradayCandles.length >= 10) return intradayCandles;

  const daily = await fetchYahooChart(symbol, '1mo', '1d').catch(() => null);
  return normalizeCandles(daily);
}

function weightedMomentum(candles: Candle[]): number | null {
  if (candles.length < 4) return null;
  const closes = candles.map((candle) => candle.close);
  const latest = closes[closes.length - 1];
  const shortRef = closes[Math.max(closes.length - 4, 0)];
  const mediumRef = closes[Math.max(closes.length - 9, 0)];
  if (!latest || !shortRef || !mediumRef) return null;
  const shortMove = ((latest - shortRef) / shortRef) * 100;
  const mediumMove = ((latest - mediumRef) / mediumRef) * 100;
  return Number(clamp((shortMove * 0.7) + (mediumMove * 0.3), -3.5, 3.5).toFixed(3));
}

function orientationForMarket(market: string): MacroOrientation | null {
  const value = market.toUpperCase();
  if (value === 'EURUSD' || value === 'GBPUSD') {
    return {
      dxyWeight: -1,
      yieldWeight: -0.85,
      jpyWeight: 0,
      rationale: 'Dollar strength and firmer US yields usually lean against XXXUSD pairs.',
    };
  }
  if (value === 'USDJPY') {
    return {
      dxyWeight: 0.85,
      yieldWeight: 1,
      jpyWeight: 1,
      rationale: 'USDJPY usually strengthens when the dollar firms, yields rise, and JPY weakens in a carry-friendly tape.',
    };
  }
  if (value === 'EURJPY' || value === 'GBPJPY') {
    return {
      dxyWeight: 0,
      yieldWeight: 0.7,
      jpyWeight: 1,
      rationale: 'JPY crosses lean more on carry and JPY weakness than on DXY directly.',
    };
  }
  if (value === 'XAUUSD' || value === 'GOLD') {
    return {
      dxyWeight: -1,
      yieldWeight: -1,
      jpyWeight: 0,
      rationale: 'Gold usually softens when the dollar and US yields rise together.',
    };
  }
  return null;
}

function pressureLabel(score: number): string {
  if (score > 8) return 'buyers dominant';
  if (score < -8) return 'sellers dominant';
  return 'balanced / rotational';
}

export async function getFxMacroProxyPressure(market: string): Promise<FxMacroProxySnapshot> {
  const normalizedMarket = (market || '').toUpperCase();
  return getCachedOrCompute(cacheKey('fx-macro-proxy', normalizedMarket), async () => {
    const orientation = orientationForMarket(normalizedMarket);
    if (!orientation) {
      return {
        applicable: false,
        formula: 'price momentum + tick volume spike + DXY movement + yield movement + JPY risk movement',
        marketRationale: null,
        dxyMovement: null,
        yieldMovement: null,
        jpyRiskMovement: null,
        dxyPressure: 0,
        yieldPressure: 0,
        jpyRiskPressure: 0,
        macroProxyPressure: 0,
        macroProxyBias: 'not_applicable',
        detail: 'FX macro proxy pressure is not used for this market.',
      };
    }

    const [dxyCandles, yieldCandles, usdJpyCandles] = await Promise.all([
      fetchProxyCandles('DX-Y.NYB'),
      fetchProxyCandles('^TNX'),
      fetchProxyCandles('JPY=X'),
    ]);

    const dxyMovement = weightedMomentum(dxyCandles);
    const yieldMovement = weightedMomentum(yieldCandles);
    const jpyRiskMovement = orientation.jpyWeight !== 0 ? weightedMomentum(usdJpyCandles) : null;

    const dxyPressure = Number(clamp((dxyMovement ?? 0) * 18 * orientation.dxyWeight, -24, 24).toFixed(1));
    const yieldPressure = Number(clamp((yieldMovement ?? 0) * 14 * orientation.yieldWeight, -24, 24).toFixed(1));
    const jpyRiskPressure = Number(clamp((jpyRiskMovement ?? 0) * 16 * orientation.jpyWeight, -24, 24).toFixed(1));
    const macroProxyPressure = Number(clamp(dxyPressure + yieldPressure + jpyRiskPressure, -35, 35).toFixed(1));
    const macroProxyBias = pressureLabel(macroProxyPressure);

    return {
      applicable: true,
      formula: 'price momentum + tick volume spike + DXY movement + yield movement + JPY risk movement',
      marketRationale: orientation.rationale,
      dxyMovement,
      yieldMovement,
      jpyRiskMovement,
      dxyPressure,
      yieldPressure,
      jpyRiskPressure,
      macroProxyPressure,
      macroProxyBias,
      detail: `${orientation.rationale} DXY ${dxyMovement != null ? `${dxyMovement >= 0 ? '+' : ''}${dxyMovement}%` : 'n/a'}, US10Y ${yieldMovement != null ? `${yieldMovement >= 0 ? '+' : ''}${yieldMovement}%` : 'n/a'}, JPY risk ${jpyRiskMovement != null ? `${jpyRiskMovement >= 0 ? '+' : ''}${jpyRiskMovement}%` : 'n/a'}.`,
    };
  }, 180);
}
