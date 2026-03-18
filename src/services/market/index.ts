import type { PanelSnapshot } from '@/types';

function findQuote(quotes: Array<{ symbol: string; price: number; change: number }> | undefined, symbol: string) {
  return quotes?.find((quote) => quote.symbol === symbol) ?? null;
}

function fmtMove(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function buildMarketPanels(input: {
  marketQuotes?: { quotes?: Array<{ symbol: string; price: number; change: number }> } | null;
  commodityQuotes?: { quotes?: Array<{ symbol: string; price: number; change: number }> } | null;
  sectorSummary?: { sectors?: Array<{ symbol: string; change: number }> } | null;
  etfFlows?: { summary?: { netDirection?: string }; flows?: Array<{ ticker: string; direction: string }> } | null;
}): Record<string, PanelSnapshot> {
  const quotes = input.marketQuotes?.quotes ?? [];
  const commodities = input.commodityQuotes?.quotes ?? [];
  const sectors = input.sectorSummary?.sectors ?? [];
  const spx = findQuote(quotes, '^GSPC');
  const ndx = findQuote(quotes, '^IXIC');
  const vix = findQuote(quotes, '^VIX');
  const dxy = findQuote(quotes, 'DX-Y.NYB');
  const us10y = findQuote(quotes, '^TNX');
  const gold = findQuote(quotes, 'GC=F') ?? findQuote(commodities, 'GC=F');
  const oil = findQuote(commodities, 'CL=F');
  const topSector = [...sectors].sort((a, b) => b.change - a.change)[0];
  const fxPairs = ['EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'GBPJPY=X', 'EURJPY=X']
    .map((symbol) => findQuote(quotes, symbol))
    .filter((quote): quote is NonNullable<typeof quote> => Boolean(quote));

  return {
    'market-radar': {
      conclusion: `SPX ${fmtMove(spx?.change)} / NDX ${fmtMove(ndx?.change)} / VIX ${fmtMove(vix?.change)} keep the tape in a ${((vix?.change ?? 0) > 3 || (spx?.change ?? 0) < 0) ? 'fragile' : 'constructive'} regime.`,
      metrics: [
        { label: 'SPX', value: fmtMove(spx?.change), tone: (spx?.change ?? 0) >= 0 ? 'bullish' : 'bearish' },
        { label: 'NDX', value: fmtMove(ndx?.change), tone: (ndx?.change ?? 0) >= 0 ? 'bullish' : 'bearish' },
        { label: 'VIX', value: fmtMove(vix?.change), tone: (vix?.change ?? 0) > 0 ? 'alert' : 'neutral' },
        { label: 'DXY', value: fmtMove(dxy?.change), tone: (dxy?.change ?? 0) > 0 ? 'alert' : 'bullish' },
        { label: 'US10Y', value: fmtMove(us10y?.change), tone: (us10y?.change ?? 0) > 0 ? 'alert' : 'bullish' },
        { label: 'Gold', value: fmtMove(gold?.change), tone: (gold?.change ?? 0) >= 0 ? 'bullish' : 'bearish' },
      ],
      table: {
        columns: ['Instrument', 'Price', 'Change'],
        rows: [
          ['SPX', spx?.price?.toFixed(2) ?? 'n/a', fmtMove(spx?.change)],
          ['NDX', ndx?.price?.toFixed(2) ?? 'n/a', fmtMove(ndx?.change)],
          ['VIX', vix?.price?.toFixed(2) ?? 'n/a', fmtMove(vix?.change)],
          ['DXY', dxy?.price?.toFixed(2) ?? 'n/a', fmtMove(dxy?.change)],
          ['US10Y', us10y?.price?.toFixed(2) ?? 'n/a', fmtMove(us10y?.change)],
          ['Gold', gold?.price?.toFixed(2) ?? 'n/a', fmtMove(gold?.change)],
        ],
      },
      bullets: [
        `Dollar context: DXY ${fmtMove(dxy?.change)} and US10Y ${fmtMove(us10y?.change)} remain the primary macro filter.`,
        `Sector leadership: ${topSector ? `${topSector.symbol} ${fmtMove(topSector.change)}` : 'sector data limited'}.`,
        `ETF flow overlay: ${input.etfFlows?.summary?.netDirection ?? 'unavailable'}.`,
      ],
      alerts: input.etfFlows?.summary?.netDirection === 'outflows'
        ? ['ETF flow backdrop is risk-negative and can weaken equity breadth confirmation.']
        : [],
      status: 'mixed',
    },
    'gold-engine': {
      conclusion: `Gold trades at ${gold?.price?.toFixed(2) ?? 'n/a'} with ${fmtMove(gold?.change)} day change, keeping bullion sensitive to yields, dollar, and safe-haven flow.`,
      metrics: [
        { label: 'Gold Spot Proxy', value: gold?.price?.toFixed(2) ?? 'n/a', tone: (gold?.change ?? 0) >= 0 ? 'bullish' : 'bearish' },
        { label: 'Gold Change', value: fmtMove(gold?.change), tone: (gold?.change ?? 0) >= 0 ? 'bullish' : 'bearish' },
        { label: 'DXY Filter', value: fmtMove(dxy?.change), tone: (dxy?.change ?? 0) > 0 ? 'alert' : 'bullish' },
        { label: '10Y Yield Filter', value: fmtMove(us10y?.change), tone: (us10y?.change ?? 0) > 0 ? 'alert' : 'bullish' },
        { label: 'WTI Confirmation', value: fmtMove(oil?.change), tone: (oil?.change ?? 0) > 0 ? 'alert' : 'neutral' },
        { label: 'Risk Regime', value: (vix?.change ?? 0) > 0 ? 'stress rising' : 'stress contained', tone: (vix?.change ?? 0) > 0 ? 'alert' : 'bullish' },
      ],
      bullets: [
        `Confirmed signal: gold ${fmtMove(gold?.change)} versus DXY ${fmtMove(dxy?.change)}.`,
        `Inferred implication: ${((gold?.change ?? 0) > 0 && (us10y?.change ?? 0) <= 0) ? 'macro support is constructive' : 'macro support is mixed'}.`,
        'Watch real-yield repricing and geopolitically driven safe-haven demand for confirmation.',
      ],
      table: {
        columns: ['Driver', 'Reading'],
        rows: [
          ['Gold', `${gold?.price?.toFixed(2) ?? 'n/a'} / ${fmtMove(gold?.change)}`],
          ['DXY', `${dxy?.price?.toFixed(2) ?? 'n/a'} / ${fmtMove(dxy?.change)}`],
          ['US10Y', `${us10y?.price?.toFixed(2) ?? 'n/a'} / ${fmtMove(us10y?.change)}`],
          ['VIX', `${vix?.price?.toFixed(2) ?? 'n/a'} / ${fmtMove(vix?.change)}`],
        ],
      },
      status: 'confirmed',
    },
    'fx-board': {
      conclusion: `FX board is driven by dollar direction and JPY carry sensitivity, with DXY ${fmtMove(dxy?.change)} setting the near-term filter.`,
      metrics: [
        { label: 'DXY', value: fmtMove(dxy?.change), tone: (dxy?.change ?? 0) > 0 ? 'alert' : 'bullish' },
        { label: 'EURUSD', value: fmtMove(findQuote(quotes, 'EURUSD=X')?.change), tone: (findQuote(quotes, 'EURUSD=X')?.change ?? 0) >= 0 ? 'bullish' : 'bearish' },
        { label: 'GBPUSD', value: fmtMove(findQuote(quotes, 'GBPUSD=X')?.change), tone: (findQuote(quotes, 'GBPUSD=X')?.change ?? 0) >= 0 ? 'bullish' : 'bearish' },
        { label: 'USDJPY', value: fmtMove(findQuote(quotes, 'USDJPY=X')?.change), tone: (findQuote(quotes, 'USDJPY=X')?.change ?? 0) >= 0 ? 'alert' : 'bullish' },
        { label: 'GBPJPY', value: fmtMove(findQuote(quotes, 'GBPJPY=X')?.change), tone: (findQuote(quotes, 'GBPJPY=X')?.change ?? 0) >= 0 ? 'alert' : 'bearish' },
        { label: 'EURJPY', value: fmtMove(findQuote(quotes, 'EURJPY=X')?.change), tone: (findQuote(quotes, 'EURJPY=X')?.change ?? 0) >= 0 ? 'alert' : 'bearish' },
      ],
      bullets: [
        `EURUSD ${fmtMove(findQuote(quotes, 'EURUSD=X')?.change)}, GBPUSD ${fmtMove(findQuote(quotes, 'GBPUSD=X')?.change)}, USDJPY ${fmtMove(findQuote(quotes, 'USDJPY=X')?.change)}.`,
        `JPY crosses: GBPJPY ${fmtMove(findQuote(quotes, 'GBPJPY=X')?.change)} and EURJPY ${fmtMove(findQuote(quotes, 'EURJPY=X')?.change)}.`,
        'Central-bank divergence and carry stress should dominate pair bias over headline noise.',
      ],
      table: {
        columns: ['Pair', 'Price', 'Move'],
        rows: fxPairs.map((quote) => [quote.symbol.replace('=X', ''), quote.price.toFixed(4), fmtMove(quote.change)]),
      },
      status: 'mixed',
    },
    commodities: {
      conclusion: `Oil ${fmtMove(oil?.change)} and gold ${fmtMove(gold?.change)} keep the commodity complex split between supply risk and safe-haven demand.`,
      metrics: [
        { label: 'WTI', value: fmtMove(oil?.change), tone: (oil?.change ?? 0) > 0 ? 'alert' : 'neutral' },
        { label: 'Brent', value: fmtMove(findQuote(commodities, 'BZ=F')?.change), tone: (findQuote(commodities, 'BZ=F')?.change ?? 0) > 0 ? 'alert' : 'neutral' },
        { label: 'NatGas', value: fmtMove(findQuote(commodities, 'NG=F')?.change), tone: (findQuote(commodities, 'NG=F')?.change ?? 0) > 0 ? 'alert' : 'neutral' },
        { label: 'Copper', value: fmtMove(findQuote(commodities, 'HG=F')?.change), tone: (findQuote(commodities, 'HG=F')?.change ?? 0) >= 0 ? 'bullish' : 'bearish' },
        { label: 'Silver', value: fmtMove(findQuote(commodities, 'SI=F')?.change), tone: (findQuote(commodities, 'SI=F')?.change ?? 0) >= 0 ? 'bullish' : 'bearish' },
        { label: 'Gold', value: fmtMove(gold?.change), tone: (gold?.change ?? 0) >= 0 ? 'bullish' : 'bearish' },
      ],
      table: {
        columns: ['Commodity', 'Price', 'Move'],
        rows: ['GC=F', 'CL=F', 'BZ=F', 'NG=F', 'SI=F', 'HG=F']
          .map((symbol) => findQuote(commodities, symbol))
          .filter((quote): quote is NonNullable<typeof quote> => Boolean(quote))
          .map((quote) => [quote.symbol, quote.price.toFixed(2), fmtMove(quote.change)]),
      },
      bullets: [
        `WTI ${oil?.price?.toFixed(2) ?? 'n/a'}, Gold ${gold?.price?.toFixed(2) ?? 'n/a'}, Silver ${findQuote(commodities, 'SI=F')?.price?.toFixed(2) ?? 'n/a'}.`,
        `Copper ${fmtMove(findQuote(commodities, 'HG=F')?.change)} and NatGas ${fmtMove(findQuote(commodities, 'NG=F')?.change)} frame growth versus stress.`,
        'Commodity interpretation should separate inflation impulse from pure geopolitical premium.',
      ],
      alerts: (oil?.change ?? 0) > 2 ? ['Oil shock risk is elevated enough to feed back into inflation and safe-haven pricing.'] : [],
      status: 'mixed',
    },
  };
}
