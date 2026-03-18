import { SnapshotPanel } from '@/components/panels/_shared';

export class OptionsGammaPanel extends SnapshotPanel {
  constructor() {
    super({ id: 'options-gamma', title: 'Options Gamma', kicker: 'Dealer Pressure', tag: 'gamma', tone: 'bearish' });
  }
}
