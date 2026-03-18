import { SnapshotPanel } from '@/components/panels/_shared';

export class EconomicPanel extends SnapshotPanel {
  constructor() {
    super({ id: 'economic', title: 'Economic Calendar', kicker: 'Macro Data', tag: 'calendar', tone: 'neutral' });
  }
}
