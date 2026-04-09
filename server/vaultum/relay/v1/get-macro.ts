import { getRelayMacroSnapshot } from './_macro.ts';

export async function getMacroRelay(input?: { forceRefresh?: boolean }) {
  return getRelayMacroSnapshot({ forceRefresh: input?.forceRefresh });
}
