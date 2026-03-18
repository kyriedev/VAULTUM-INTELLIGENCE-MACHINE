export async function listOptionsSnapshots(input: { symbol: string }): Promise<{ symbol: string; snapshots: Array<{ tenor: string; bias: string; impliedVol: number }> }> {
  return {
    symbol: input.symbol,
    snapshots: [
      { tenor: '1W', bias: 'event-premium elevated', impliedVol: 19.4 },
      { tenor: '1M', bias: 'upside call interest notable', impliedVol: 17.2 },
      { tenor: '3M', bias: 'macro uncertainty still priced', impliedVol: 18.7 }
    ]
  };
}
