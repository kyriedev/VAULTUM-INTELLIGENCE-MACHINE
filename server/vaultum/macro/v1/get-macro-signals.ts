import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { fetchJSON, rateOfChange, smaCalc, extractClosePrices, extractAlignedPriceVolume } from './_shared';

export async function getMacroSignals(): Promise<any> {
  return getCachedOrCompute(cacheKey('macro', 'signals'), async () => {
    const yahooBase = 'https://query1.finance.yahoo.com/v8/finance/chart';
    const [dxyChart, goldChart, us10yChart, spxChart, vixChart, usdJpyChart] = await Promise.all([
      fetchJSON(`${yahooBase}/DX-Y.NYB?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/GC=F?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/^TNX?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/^GSPC?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/^VIX?range=1y&interval=1d`).catch(() => null),
      fetchJSON(`${yahooBase}/JPY=X?range=1y&interval=1d`).catch(() => null),
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
      dxyRoc20 !== null && yieldRoc20 !== null && spxRoc20 !== null
        ? yieldRoc20 > 0 && dxyRoc20 > 0 && spxRoc20 < 0
          ? 'risk-off tightening'
          : yieldRoc20 <= 0 && spxRoc20 >= 0
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

    return {
      regime,
      goldBias,
      safeHavenPressure,
      confirmed: {
        dxyRoc20,
        yieldRoc20,
        spxRoc20,
        vixRoc5,
        jpyRoc20,
        goldRoc20,
      },
      inferred: {
        dollarLiquidityPressure: dxyRoc20 !== null && dxyRoc20 > 1 ? 'elevated' : 'normalizing',
        carryStress: jpyRoc20 !== null && jpyRoc20 < -2 ? 'elevated' : 'moderate',
      },
      missing: [],
    };
  }, 900);
}
