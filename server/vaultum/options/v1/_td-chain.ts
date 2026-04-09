declare const process: { env: Record<string, string | undefined> };

export type TdContract = {
  kind: 'call' | 'put';
  strike: number;
  expirationDate: string;
  daysToExpiration: number;
  bid: number | null;
  ask: number | null;
  mark: number | null;
  last: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
  volatility: number | null;
  openInterest: number;
  totalVolume: number;
  inTheMoney: boolean;
  theoreticalOptionValue: number | null;
};

export type TdChainAnalytics = {
  sourceSymbol: string;
  proxyUnderlying: string;
  underlyingPrice: number;
  totalOpenInterest: number;
  totalVolume: number;
  atmImpliedVol: number | null;
  downsideSkew: number | null;
  callWall: number | null;
  putWall: number | null;
  gammaFlip: number | null;
  callOpenInterest: number;
  putOpenInterest: number;
  dealerCorridorWidth: number | null;
  contracts: TdContract[];
};

function env(name: string): string {
  return (process.env[name] || '').trim();
}

export function tdaConfigured(): boolean {
  return Boolean(env('TDA_API_KEY'));
}

export function mapVaultumSymbolToTd(symbol: string): string | null {
  const upper = (symbol || 'XAUUSD').toUpperCase();
  const map: Record<string, string> = {
    XAUUSD: 'GLD',
    GOLD: 'GLD',
    'GC=F': 'GLD',
    WTI: 'USO',
    OIL: 'USO',
    'CL=F': 'USO',
    SPX: 'SPY',
    '^GSPC': 'SPY',
    NDX: 'QQQ',
    '^IXIC': 'QQQ',
    US30: 'DIA',
    '^DJI': 'DIA',
    DJI: 'DIA',
    DIA: 'DIA',
    'YM=F': 'DIA',
    DXY: 'UUP',
    'DX-Y.NYB': 'UUP',
    EURUSD: 'FXE',
    GBPUSD: 'FXB',
    USDJPY: 'FXY',
    'EURUSD=X': 'FXE',
    'GBPUSD=X': 'FXB',
    'USDJPY=X': 'FXY',
  };
  if (map[upper]) return map[upper];
  if (/^[A-Z]{1,6}$/.test(upper)) return upper;
  return null;
}

function parseNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function midpoint(bid: number | null, ask: number | null, mark: number | null, last: number | null): number | null {
  if (mark != null && Number.isFinite(mark)) return mark;
  if (bid != null && ask != null) return (bid + ask) / 2;
  return last;
}

function flattenSide(kind: 'call' | 'put', sideMap: Record<string, Record<string, any[]>>): TdContract[] {
  const contracts: TdContract[] = [];
  for (const [expiryKey, strikes] of Object.entries(sideMap ?? {})) {
    const [expiryDateRaw, daysRaw] = expiryKey.split(':');
    const fallbackDays = Number(daysRaw);
    for (const [strikeKey, entries] of Object.entries(strikes ?? {})) {
      for (const entry of entries ?? []) {
        const bid = parseNumber(entry?.bid);
        const ask = parseNumber(entry?.ask);
        const mark = parseNumber(entry?.mark);
        const last = parseNumber(entry?.last);
        contracts.push({
          kind,
          strike: Number(strikeKey),
          expirationDate: String(entry?.expirationDate ?? expiryDateRaw ?? ''),
          daysToExpiration: Number(entry?.daysToExpiration ?? fallbackDays ?? 0),
          bid,
          ask,
          mark: midpoint(bid, ask, mark, last),
          last,
          delta: parseNumber(entry?.delta),
          gamma: parseNumber(entry?.gamma),
          theta: parseNumber(entry?.theta),
          vega: parseNumber(entry?.vega),
          rho: parseNumber(entry?.rho),
          volatility: parseNumber(entry?.volatility),
          openInterest: Number(entry?.openInterest ?? 0),
          totalVolume: Number(entry?.totalVolume ?? 0),
          inTheMoney: Boolean(entry?.inTheMoney),
          theoreticalOptionValue: parseNumber(entry?.theoreticalOptionValue),
        });
      }
    }
  }
  return contracts;
}

function nearestAtmContracts(contracts: TdContract[], spot: number): TdContract[] {
  return [...contracts]
    .sort((left, right) => {
      const leftDist = Math.abs(left.strike - spot) + (left.daysToExpiration * 0.1);
      const rightDist = Math.abs(right.strike - spot) + (right.daysToExpiration * 0.1);
      return leftDist - rightDist;
    })
    .slice(0, 8);
}

export async function fetchTdOptionChain(symbol: string): Promise<TdChainAnalytics | null> {
  const apiKey = env('TDA_API_KEY');
  const proxyUnderlying = mapVaultumSymbolToTd(symbol);
  if (!apiKey || !proxyUnderlying) return null;

  const url = new URL('https://api.tdameritrade.com/v1/marketdata/chains');
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('symbol', proxyUnderlying);
  url.searchParams.set('contractType', 'ALL');
  url.searchParams.set('includeQuotes', 'TRUE');
  url.searchParams.set('strategy', 'SINGLE');
  url.searchParams.set('range', 'ALL');

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as any;
    if (payload?.status !== 'SUCCESS') return null;

    const contracts = [
      ...flattenSide('call', payload.callExpDateMap ?? {}),
      ...flattenSide('put', payload.putExpDateMap ?? {}),
    ].filter((contract) => contract.daysToExpiration >= 0);

    const underlyingPrice = Number(payload.underlyingPrice ?? 0);
    if (!contracts.length || !Number.isFinite(underlyingPrice) || underlyingPrice <= 0) return null;

    const callContracts = contracts.filter((contract) => contract.kind === 'call');
    const putContracts = contracts.filter((contract) => contract.kind === 'put');
    const callWall = [...callContracts].sort((left, right) => (right.openInterest * (right.gamma ?? 0)) - (left.openInterest * (left.gamma ?? 0)))[0]?.strike ?? null;
    const putWall = [...putContracts].sort((left, right) => (right.openInterest * (right.gamma ?? 0)) - (left.openInterest * (left.gamma ?? 0)))[0]?.strike ?? null;

    const atmContracts = nearestAtmContracts(contracts, underlyingPrice);
    const atmImpliedVols = atmContracts.map((contract) => contract.volatility).filter((value): value is number => value != null && value > 0);
    const atmImpliedVol = atmImpliedVols.length
      ? atmImpliedVols.reduce((sum, value) => sum + value, 0) / atmImpliedVols.length
      : null;

    const downCandidates = putContracts
      .filter((contract) => contract.strike <= underlyingPrice * 0.98 && contract.daysToExpiration <= 45)
      .sort((left, right) => Math.abs(left.strike - (underlyingPrice * 0.95)) - Math.abs(right.strike - (underlyingPrice * 0.95)))
      .slice(0, 3);
    const upCandidates = callContracts
      .filter((contract) => contract.strike >= underlyingPrice * 1.02 && contract.daysToExpiration <= 45)
      .sort((left, right) => Math.abs(left.strike - (underlyingPrice * 1.05)) - Math.abs(right.strike - (underlyingPrice * 1.05)))
      .slice(0, 3);

    const downIv = downCandidates.map((contract) => contract.volatility).filter((value): value is number => value != null && value > 0);
    const upIv = upCandidates.map((contract) => contract.volatility).filter((value): value is number => value != null && value > 0);
    const downsideSkew = downIv.length && upIv.length
      ? (downIv.reduce((sum, value) => sum + value, 0) / downIv.length) - (upIv.reduce((sum, value) => sum + value, 0) / upIv.length)
      : null;

    const callOpenInterest = callContracts.reduce((sum, contract) => sum + contract.openInterest, 0);
    const putOpenInterest = putContracts.reduce((sum, contract) => sum + contract.openInterest, 0);
    const totalOpenInterest = contracts.reduce((sum, contract) => sum + contract.openInterest, 0);
    const totalVolume = contracts.reduce((sum, contract) => sum + contract.totalVolume, 0);

    const strikesBetween = [callWall, putWall].filter((value): value is number => value != null).sort((left, right) => left - right);
    const gammaFlip = strikesBetween.length === 2
      ? Number((((strikesBetween[0] + strikesBetween[1]) / 2)).toFixed(2))
      : nearestAtmContracts(contracts, underlyingPrice)[0]?.strike ?? null;
    const dealerCorridorWidth = callWall != null && putWall != null ? Math.abs(callWall - putWall) : null;

    return {
      sourceSymbol: symbol,
      proxyUnderlying,
      underlyingPrice,
      totalOpenInterest,
      totalVolume,
      atmImpliedVol,
      downsideSkew,
      callWall,
      putWall,
      gammaFlip,
      callOpenInterest,
      putOpenInterest,
      dealerCorridorWidth,
      contracts,
    };
  } catch {
    return null;
  }
}
