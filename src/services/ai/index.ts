import { invokeVaultumRpc } from '@/services/rpc';

export interface VaultumAiResponse {
  provider: string;
  intent: string;
  toolsUsed: string[];
  confidence: 'low' | 'medium' | 'high';
  conclusion: string;
  supportingSignals: string[];
  caveats: string[];
  watchItems: string[];
  confirmedSignals: string[];
  inferredImplications: string[];
  estimatedSignals: string[];
  missingData: string[];
  answer: string;
  contextSnapshot: string;
}

export async function askVaultum(question: string): Promise<VaultumAiResponse | null> {
  return invokeVaultumRpc<VaultumAiResponse>('ai', 'ask-vaultum', { question });
}

export async function summarizeRegime(): Promise<{ summary: string } | null> {
  return invokeVaultumRpc<{ summary: string }>('ai', 'summarize-regime', {});
}
