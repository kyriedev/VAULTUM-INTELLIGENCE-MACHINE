export async function getBisExchangeRates(): Promise<{ pairs: Array<{ pair: string; bias: string }> }> {
  return {
    pairs: [
      { pair: 'USDJPY', bias: 'policy divergence' },
      { pair: 'EURUSD', bias: 'rate spread compression' },
      { pair: 'USDCNH', bias: 'trade and growth sensitivity' }
    ]
  };
}
