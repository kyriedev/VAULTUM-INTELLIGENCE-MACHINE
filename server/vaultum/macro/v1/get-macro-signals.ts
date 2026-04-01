import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { fetchJSON, rateOfChange, smaCalc, extractClosePrices, extractAlignedPriceVolume } from './_shared';
import { getBisPolicyRates } from './get-bis-policy-rates';
import { getEnergyPrices } from './get-energy-prices';
import { getFredSeries } from './get-fred-series';

function latestObservation(series: { observations?: Array<{ value: number | null }> } | null | undefined): number | null {
  const observations = series?.observations ?? [];
  for (const item of observations) {
    if (item?.value != null && Number.isFinite(item.value)) return item.value;
  }
  return null;
}

function priorObservation(series: { observations?: Array<{ value: number | null }> } | null | undefined, offset: number): number | null {
  const observations = (series?.observations ?? []).filter((item) => item?.value != null && Number.isFinite(item.value));
  return observations[offset]?.value ?? null;
}

export async function getMacroSignals(): Promise<any> {
  return getCachedOrCompute(cacheKey('macro', 'signals'), async () => {
    const yahooBase = 'https://query1.finance.yahoo.com/v8/finance/chart';
    const [dxyChart, goldChart, us10yChart, spxChart, vixChart, usdJpyChart, fred2y, fred10y, fredReal10y, bisPolicyRates, energyPrices] = await Promise.all([
      fetchJSON(`${yahooBase}/DX-Y.NYB?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/GC=F?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/^TNX?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/^GSPC?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/^VIX?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/JPY=X?range=1y&interval=1d`).catch(() => null),
      getFredSeries({ seriesId: 'DGS2', limit: 60 }).catch(() => ({ observations: [], source: 'FRED unavailable' })),
      getFredSeries({ seriesId: 'DGS10', limit: 60 }).catch(() => ({ observations: [], source: 'FRED unavailable' })),
      getFredSeries({ seriesId: 'DFII10', limit: 60 }).catch(() => ({ observations: [], source: 'FRED unavailable' })),
      getBisPolicyRates().catch(() => ({ rates: [] })),
      getEnergyPrices().catch(() => ({ prices: [] })),
    ]);

    const dxy = extractClosePrices(dxyChart);
    const gold = extractClosePrices(goldChart);
    const us10y = extractClosePrices(us10yChart);
    const spx = extractClosePrices(spxChart);
    const vix = extractClosePrices(vixChart);
    const usdJpy = extractClosePrices(usdJpyChart);
    const goldAligned = extractAlignedPriceVolume(goldChart);

    const dxyRoc20 = rateOfChange(dxy, 20);
    const goldRoc20 = rateOfChange(gold, 20);
    const yieldRoc20 = rateOfChange(us10y, 20);
    const spxRoc20 = rateOfChange(spx, 20);
    const vixRoc5 = rateOfChange(vix, 5);
    const jpyRoc20 = rateOfChange(usdJpy, 20);
    const twoYear = latestObservation(fred2y);
    const tenYear = latestObservation(fred10y);
    const realYield10 = latestObservation(fredReal10y);
    const priorRealYield10 = priorObservation(fredReal10y, 20);
    const realYieldTrend20 = realYield10 != null && priorRealYield10 != null ? Number((realYield10 - priorRealYield10).toFixed(2)) : null;
    const curve2s10s = twoYear != null && tenYear != null ? Number((tenYear - twoYear).toFixed(2)) : null;
    const curveShape =
      curve2s10s == null
        ? 'unknown'
        : curve2s10s < 0
          ? 'inverted'
          : curve2s10s < 0.35
            ? 'flat'
            : curve2s10s > 1.2
              ? 'steep'
              : 'normal';
    const fedRate = bisPolicyRates.rates.find((rate) => rate.bank === 'Federal Reserve')?.rate ?? null;
    const ecbRate = bisPolicyRates.rates.find((rate) => rate.bank === 'European Central Bank')?.rate ?? null;
    const bojRate = bisPolicyRates.rates.find((rate) => rate.bank === 'Bank of Japan')?.rate ?? null;
    const policyDivergence =
      fedRate != null && ecbRate != null && bojRate != null
        ? fedRate > ecbRate && fedRate > bojRate
          ? 'fed restrictive leader'
          : bojRate < 1 && fedRate - bojRate >= 2
            ? 'boj ultra-easy laggard'
            : 'policy gap narrowing'
        : 'unknown';
    const oilChange = energyPrices.prices.find((item) => item.symbol === 'CL=F')?.change ?? null;

    const goldSma50 = smaCalc(gold, 50);
    const goldPrice = gold[gold.length - 1] ?? null;
    let goldVwap30: number | null = null;
    if (goldAligned.length >= 30) {
      const last30 = goldAligned.slice(-30);
      let sumPv = 0;
      let sumV = 0;
      last30.forEach(({ price, volume }) => {
        sumPv += price * volume;
        sumV += volume;
      });
      if (sumV > 0) goldVwap30 = Number((sumPv / sumV).toFixed(2));
    }

    const regime =
      dxyRoc20 !== null && spxRoc20 !== null
        ? ((realYieldTrend20 ?? yieldRoc20 ?? 0) > 0) && dxyRoc20 > 0 && spxRoc20 < 0
          ? 'risk-off tightening'
          : ((realYieldTrend20 ?? yieldRoc20 ?? 0) <= 0) && spxRoc20 >= 0
            ? 'risk-on easing'
            : 'mixed transition'
        : 'unknown';

    const goldBias =
      goldPrice && goldSma50
        ? goldPrice > goldSma50 && (goldVwap30 === null || goldPrice > goldVwap30)
          ? 'bullish'
          : 'neutral-to-soft'
        : 'unknown';

    const safeHavenPressure =
      goldRoc20 !== null && vixRoc5 !== null
        ? goldRoc20 > 0 && vixRoc5 > 0
          ? 'elevated'
          : 'contained'
        : 'unknown';

    const dollarRegime =
      dxyRoc20 == null
        ? 'unknown'
        : dxyRoc20 > 1
          ? 'firm dollar'
          : dxyRoc20 < -1
            ? 'soft dollar'
            : 'range dollar';
    const realYieldPressure =
      realYield10 == null
        ? 'unknown'
        : realYield10 >= 1.75 || (realYieldTrend20 != null && realYieldTrend20 > 0.15)
          ? 'elevated'
          : realYield10 <= 1.1 || (realYieldTrend20 != null && realYieldTrend20 < -0.15)
            ? 'easing'
            : 'contained';
    const geopoliticalStress =
      (oilChange ?? 0) > 2 && (vixRoc5 ?? 0) > 4
        ? 'elevated'
        : (oilChange ?? 0) > 1 || (vixRoc5 ?? 0) > 2
          ? 'watch'
          : 'contained';

    return {
      regime,
      goldBias,
      safeHavenPressure,
      confirmed: {
        dxyRoc20,
        yieldRoc20,
        realYield10,
        realYieldTrend20,
        curve2s10s,
        curveShape,
        spxRoc20,
        vixRoc5,
        jpyRoc20,
        goldRoc20,
      },
      inferred: {
        dollarLiquidityPressure: dxyRoc20 !== null && dxyRoc20 > 1 ? 'elevated' : 'normalizing',
        carryStress: jpyRoc20 !== null && jpyRoc20 < -2 ? 'elevated' : 'moderate',
        dollarRegime,
        realYieldPressure,
        policyDivergence,
        geopoliticalStress,
      },
      policy: {
        fedRate,
        ecbRate,
        bojRate,
        divergence: policyDivergence,
      },
      energy: {
        wtiChange: oilChange,
      },
      rates: {
        nominal2y: twoYear,
        nominal10y: tenYear,
        real10y: realYield10,
        curve2s10s,
        curveShape,
      },
      missing: [],
    };
  }, 900);
}
