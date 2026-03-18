import type { PanelSnapshot } from '@/types';

export function buildAiPanel(lines: string[]): PanelSnapshot {
  return {
    conclusion: lines[0] ?? 'AI reasoning layer idle.',
    bullets: lines.slice(1, 4),
    metrics: [
      { label: 'Planner', value: 'minimum-tool', tone: 'bullish' },
      { label: 'Discipline', value: 'uncertainty-on', tone: 'alert' },
      { label: 'Mode', value: 'terminal analyst', tone: 'neutral' },
    ],
    alerts: lines.length > 3 ? [lines[lines.length - 1] ?? ''] : [],
    status: 'mixed',
  };
}
