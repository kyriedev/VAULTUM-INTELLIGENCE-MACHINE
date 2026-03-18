export async function searchNewsDocuments(input: { query: string; timespan?: string; maxRecords?: number; tone?: string }): Promise<{ results: Array<{ title: string; type: string }> }> {
  const limit = Math.max(1, Math.min(input.maxRecords ?? 3, 10));
  return {
    results: [
      { title: `Search result for ${input.query}: energy chokepoint note`, type: 'brief' },
      { title: `Search result for ${input.query}: tariff transmission memo`, type: 'document' },
      { title: `Search result for ${input.query}: cross-asset morning note`, type: 'news' }
    ].slice(0, limit)
  };
}
