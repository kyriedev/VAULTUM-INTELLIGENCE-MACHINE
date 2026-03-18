import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { fetchYahooQuotesBatch } from '../../market/v1/_shared';

export async function getCrossAssetRegime(): Promise<any> {
  return getCachedOrCompute(cacheKey('liquidity', 'cross-asset-regime'), async () => {
    const batch = await fetchYahooQuotesBatch(['GC=F', 'CL=F', 'DX-Y.NYB', '^GSPC', '^VIX']);
    const gold = batch.results.get('GC=F');
    const oil = batch.results.get('CL=F');
    const dxy = batch.results.get('DX-Y.NYB');
    const spx = batch.results.get('^GSPC');
    const vix = batch.results.get('^VIX');

    const regime = (gold?.change ?? 0) > 0 && (dxy?.change ?? 0) > 0 && (spx?.change ?? 0) <= 0
      ? 'gold-firm / dollar-firm / cyclical-risk-fragile'
      : (spx?.change ?? 0) > 0 && (vix?.change ?? 0) < 0
        ? 'risk-on / vol-compressed'
        : 'mixed-transition';
    const riskState = regime.includes('risk-on') ? 'risk-on' : regime.includes('fragile') ? 'risk-off' : 'transition';

    return {
      regime,
      riskState,
      supporting: {
        gold: gold?.change ?? null,
        oil: oil?.change ?? null,
        dxy: dxy?.change ?? null,
        spx: spx?.change ?? null,
        vix: vix?.change ?? null,
      },
    };
  }, 300);
}
