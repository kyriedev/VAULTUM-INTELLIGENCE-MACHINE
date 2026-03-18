import { SnapshotPanel } from '@/components/panels/_shared';

export class MacroRegimePanel extends SnapshotPanel {
  constructor() {
    super({ id: 'macro-regime', title: 'Macro Regime', kicker: 'Macro', tag: 'rates/liquidity', tone: 'neutral' });
  }
}
