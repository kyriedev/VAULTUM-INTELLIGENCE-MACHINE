export async function getBisPolicyRates(): Promise<{ rates: Array<{ bank: string; rate: number }> }> {
  return {
    rates: [
      { bank: 'Fed', rate: 5.25 },
      { bank: 'ECB', rate: 4.0 },
      { bank: 'BoJ', rate: 0.1 }
    ]
  };
}
