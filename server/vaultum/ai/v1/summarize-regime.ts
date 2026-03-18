import { askVaultum } from './ask-vaultum';

export async function summarizeRegime(): Promise<{ summary: string }> {
  const answer = await askVaultum({ question: 'Summarize the current macro regime for trading.' });
  return {
    summary: answer.answer,
  };
}
