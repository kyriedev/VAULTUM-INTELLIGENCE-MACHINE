function sanitize(models: string[]): string[] {
  return models
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/embed/i.test(item));
}

export async function discoverLocalModels(): Promise<string[]> {
  const baseUrl = (((import.meta as any).env?.VITE_OLLAMA_API_URL || 'http://127.0.0.1:11434') as string).trim();
  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok) throw new Error('Ollama tags unavailable');
    const payload = await response.json() as { models?: Array<{ name?: string }> };
    const discovered = sanitize((payload.models ?? []).map((model) => model.name ?? ''));
    if (discovered.length) return discovered;
  } catch {
    return listLocalModels();
  }
  return listLocalModels();
}

export function listLocalModels(): string[] {
  const configured = ((import.meta as any).env?.VITE_OLLAMA_MODELS || '') as string;
  const discovered = sanitize(configured.split(','));
  return discovered.length ? discovered : ['deepseek-r1-distill-llama-70b', 'llama-3.1-70b-instruct', 'qwen2.5-instruct', 'phi-4'];
}
