import { CHROME_UA, yahooGate } from '../../../_shared/constants';

export async function fetchJSON(url: string, timeout = 8000): Promise<any> {
  if (url.includes('yahoo.com')) await yahooGate();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': CHROME_UA }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export function rateOfChange(prices: number[], days: number): number | null {
  if (prices.length < days + 1) return null;
  const recent = prices[prices.length - 1];
  const past = prices[prices.length - 1 - days];
  if (!past || past === 0) return null;
  return ((recent - past) / past) * 100;
}

export function smaCalc(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  return prices.slice(-period).reduce((sum, value) => sum + value, 0) / period;
}

export function extractClosePrices(chart: any): number[] {
  return chart?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((price: number | null) => price != null) ?? [];
}

export function extractAlignedPriceVolume(chart: any): Array<{ price: number; volume: number }> {
  const quote = chart?.chart?.result?.[0]?.indicators?.quote?.[0];
  const close = quote?.close ?? [];
  const volume = quote?.volume ?? [];
  const pairs: Array<{ price: number; volume: number }> = [];
  for (let index = 0; index < close.length; index++) {
    if (close[index] != null && volume[index] != null) pairs.push({ price: close[index], volume: volume[index] });
  }
  return pairs;
}
