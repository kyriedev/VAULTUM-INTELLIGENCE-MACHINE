import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { buildProviderCatalog } from '../../_shared/provider-catalog';

export async function getProviderCatalog(): Promise<ReturnType<typeof buildProviderCatalog>> {
  const key = cacheKey('system', 'provider-catalog');
  return getCachedOrCompute(key, () => buildProviderCatalog(), 60);
}
