import type { BootstrapSnapshot, PanelDefinition, TerminalIntent } from '@/types';

export interface VaultumAppContext {
  snapshot: BootstrapSnapshot | null;
  panels: PanelDefinition[];
  activeIntent: TerminalIntent;
  searchQuery: string;
  lastUpdatedAt: string | null;
}

export function createDefaultContext(): VaultumAppContext {
  return {
    snapshot: null,
    panels: [],
    activeIntent: 'macro-regime',
    searchQuery: '',
    lastUpdatedAt: null,
  };
}
