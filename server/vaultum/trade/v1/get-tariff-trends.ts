export async function getTariffTrends(_input: { reporter: string; partner?: string }): Promise<{ trends: Array<{ bloc: string; trend: string }> }> {
  return {
    trends: [
      { bloc: 'US', trend: 'selective tightening' },
      { bloc: 'EU', trend: 'strategic protection' },
      { bloc: 'China', trend: 'countermeasure optionality' }
    ]
  };
}
