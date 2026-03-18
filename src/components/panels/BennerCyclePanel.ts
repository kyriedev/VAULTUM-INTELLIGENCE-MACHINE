import { SnapshotPanel } from '@/components/panels/_shared';

export class BennerCyclePanel extends SnapshotPanel {
  constructor() {
    super({ id: 'benner-cycle', title: 'Benner Cycle', kicker: 'Temporal Overlay', tag: 'cycle', tone: 'neutral' });
  }
}
