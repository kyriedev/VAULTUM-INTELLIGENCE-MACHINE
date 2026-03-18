export async function getBisCredit(): Promise<{ credit: Array<{ country: string; regime: string }> }> {
  return {
    credit: [
      { country: 'United States', regime: 'late-cycle but orderly' },
      { country: 'China', regime: 'policy-managed' },
      { country: 'Euro Area', regime: 'slowdown risk' }
    ]
  };
}
