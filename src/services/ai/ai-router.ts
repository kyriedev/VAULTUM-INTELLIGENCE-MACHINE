import { getAiFlowSettings } from '@/services/ai/ai-flow-settings';
import { classifyUrgency, summarizeLocally } from '@/services/ai/browser-ml';

export function routeAiAnalysis(lines: string[]): string {
  const settings = getAiFlowSettings();
  const urgency = classifyUrgency(lines);
  return `[${settings.provider} | ${urgency}] ${summarizeLocally(lines)}`;
}
