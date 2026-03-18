import type { PanelSnapshot } from '@/types';

export function mergePanels(...panelSets: Array<Record<string, PanelSnapshot>>): Record<string, PanelSnapshot> {
  return Object.assign({}, ...panelSets);
}
