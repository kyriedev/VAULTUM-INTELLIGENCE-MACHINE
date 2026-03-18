import { SnapshotPanel } from '@/components/panels/_shared';

export class DealerPressurePanel extends SnapshotPanel {
  constructor() {
    super({ id: 'dealer-pressure', title: 'Dealer Pressure', kicker: 'Market Structure', tag: 'dealers', tone: 'bearish' });
  }
}
