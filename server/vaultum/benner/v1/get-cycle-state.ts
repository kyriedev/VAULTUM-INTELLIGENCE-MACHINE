import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';

const BENNER_PHASES = ['accumulation', 'expansion', 'distribution', 'caution'] as const;

export async function getCycleState(input: { market: string }): Promise<any> {
  const market = (input.market || 'GOLD').toUpperCase();
  return getCachedOrCompute(cacheKey('benner', `cycle:${market}`), async () => {
    const year = new Date().getUTCFullYear();
    const marketSeed = market.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const phaseIndex = (year + marketSeed) % BENNER_PHASES.length;
    const phase = BENNER_PHASES[phaseIndex];
    const bullish = phase === 'accumulation' || phase === 'expansion';
    const nextTurnYear = year + ((phaseIndex % 2 === 0) ? 1 : 2);

    return {
      market,
      phase,
      bias: bullish ? 'bullish-to-constructive' : 'cautionary-to-bearish',
      turnWindow: `${nextTurnYear}-Q${(phaseIndex % 4) + 1}`,
      confidence: phase === 'expansion' || phase === 'distribution' ? 'medium' : 'low',
      compatibility: bullish ? 'supports pro-risk and bullion continuation if macro confirms' : 'warns that cycle timing is less supportive without fresh macro confirmation',
      notes: [
        'Benner Cycle is treated as a temporal overlay rather than a standalone trading trigger.',
        'Cycle context should be confirmed with macro, positioning, and structure before acting.',
      ],
    };
  }, 3600);
}
