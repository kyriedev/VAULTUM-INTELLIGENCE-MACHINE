import { SnapshotPanel } from '@/components/panels/_shared';

export class TradePolicyPanel extends SnapshotPanel {
  constructor() {
    super({ id: 'trade-policy', title: 'Trade Policy', kicker: 'Tariffs / Restrictions', tag: 'wto', tone: 'alert' });
  }
}
