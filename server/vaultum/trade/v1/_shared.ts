declare const process: { env: Record<string, string | undefined> };

import { CHROME_UA } from '../../../_shared/constants';

export const WTO_API_BASE = 'https://api.wto.org/timeseries/v1';
export const ITS_MTV_AX = 'ITS_MTV_AX';
export const ITS_MTV_AM = 'ITS_MTV_AM';

export const WTO_MEMBER_CODES: Record<string, string> = {
  '840': 'United States',
  '156': 'China',
  '276': 'Germany',
  '392': 'Japan',
  '826': 'United Kingdom',
  '356': 'India',
  '643': 'Russia',
  '410': 'South Korea',
  '036': 'Australia',
  '124': 'Canada',
  '484': 'Mexico',
  '000': 'World',
};

export async function wtoFetch(path: string, params?: Record<string, string>): Promise<any | null> {
  const apiKey = process.env.WTO_API_KEY;
  if (!apiKey) return null;
  try {
    const url = new URL(`${WTO_API_BASE}${path}`);
    Object.entries(params ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));
    const res = await fetch(url.toString(), {
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'User-Agent': CHROME_UA,
      },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 204) return { Dataset: [] };
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
