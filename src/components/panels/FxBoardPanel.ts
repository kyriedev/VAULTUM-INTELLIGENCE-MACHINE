import { SnapshotPanel } from '@/components/panels/_shared';

export class FxBoardPanel extends SnapshotPanel {
  constructor() {
    super({ id: 'fx-board', title: 'FX Board', kicker: 'Central Bank Divergence', tag: 'fx', tone: 'neutral' });
  }
}
