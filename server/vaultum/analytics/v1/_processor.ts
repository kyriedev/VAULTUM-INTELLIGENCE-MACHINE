import type { VaultumAnalyticsContext } from './_context';

export type VaultumProcessorStatus = 'confirmed' | 'derived' | 'estimated';

export type VaultumProcessorOutput<T = unknown> = {
  value: T;
  status: VaultumProcessorStatus;
  detail: string;
  references?: string[];
};

export type VaultumProcessorResults = Record<string, VaultumProcessorOutput>;

export type VaultumProcessor<T = unknown> = {
  key: string;
  dependencies?: string[];
  run: (context: VaultumAnalyticsContext, results: VaultumProcessorResults) => Promise<VaultumProcessorOutput<T>> | VaultumProcessorOutput<T>;
};

export async function runVaultumProcessorGraph(
  context: VaultumAnalyticsContext,
  processors: VaultumProcessor[],
): Promise<VaultumProcessorResults> {
  const pending = new Map(processors.map((processor) => [processor.key, processor]));
  const results: VaultumProcessorResults = {};

  while (pending.size) {
    let advanced = false;

    for (const [key, processor] of [...pending.entries()]) {
      const dependencies = processor.dependencies ?? [];
      if (dependencies.some((dependency) => !(dependency in results))) continue;

      results[key] = await processor.run(context, results);
      pending.delete(key);
      advanced = true;
    }

    if (!advanced) {
      const blocked = [...pending.keys()].join(', ');
      throw new Error(`Vaultum processor graph could not resolve dependencies for: ${blocked}`);
    }
  }

  return results;
}
