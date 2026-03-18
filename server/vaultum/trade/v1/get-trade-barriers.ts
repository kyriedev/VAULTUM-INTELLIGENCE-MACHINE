export async function getTradeBarriers(): Promise<{ barriers: Array<{ barrier: string; marketEffect: string }> }> {
  return {
    barriers: [
      { barrier: 'SPS/TBT escalation', marketEffect: 'margin and supply-chain drag' },
      { barrier: 'Tariff increase', marketEffect: 'inflation and FX pass-through' },
      { barrier: 'Export licensing', marketEffect: 'sector bottleneck risk' }
    ]
  };
}
