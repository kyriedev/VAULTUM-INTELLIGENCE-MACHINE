export interface AiFlowSettings {
  provider: 'cloud-open-weight' | 'ollama-local' | 'browser-utility' | 'deterministic-fallback';
  uncertaintyDiscipline: boolean;
  providers: string[];
}

export function getAiFlowSettings(): AiFlowSettings {
  const providers: string[] = [];
  if ((import.meta as any).env?.VITE_OPENROUTER_ENABLED === 'true') providers.push('cloud-open-weight');
  if ((import.meta as any).env?.VITE_OLLAMA_ENABLED === 'true') providers.push('ollama-local');
  providers.push('browser-utility', 'deterministic-fallback');
  return {
    provider: providers[0] as AiFlowSettings['provider'],
    uncertaintyDiscipline: true,
    providers,
  };
}
