import assert from 'node:assert/strict';

import { getOrRefreshRelaySnapshot, setRelaySnapshot } from '../server/vaultum/relay/v1/_cache.ts';

export async function runRelayCacheTests(): Promise<void> {
  {
    const scope = `relay-cache-${Date.now()}`;
    const id = 'stale';

    await setRelaySnapshot(scope, id, { ok: true }, 0, 60);
    const result = await getOrRefreshRelaySnapshot(
      scope,
      id,
      async () => {
        throw new Error('refresh failed');
      },
      1,
      60,
    );

    assert.equal(result.cacheState, 'stale');
    assert.equal(result.stale, true);
    assert.deepEqual(result.value, { ok: true });
  }

  {
    const scope = `relay-cache-${Date.now()}-dedupe`;
    const id = 'dedupe';
    let runs = 0;

    const [first, second] = await Promise.all([
      getOrRefreshRelaySnapshot(scope, id, async () => {
        runs += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { value: 42 };
      }, 30, 60),
      getOrRefreshRelaySnapshot(scope, id, async () => {
        runs += 1;
        return { value: 13 };
      }, 30, 60),
    ]);

    assert.equal(runs, 1);
    assert.deepEqual(first.value, { value: 42 });
    assert.deepEqual(second.value, { value: 42 });
  }
}
