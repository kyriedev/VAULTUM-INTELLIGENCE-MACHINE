export async function getProxyTensionStatus(): Promise<{ conclusion: string; regions: Array<{ region: string; status: string }> }> {
  return {
    conclusion: 'Proxy tension is elevated where conflict can touch shipping, energy, or sanctions enforcement.',
    regions: [
      { region: 'Middle East', status: 'high sensitivity' },
      { region: 'Red Sea', status: 'shipping-sensitive' },
      { region: 'Taiwan Strait', status: 'strategic watch' }
    ]
  };
}
