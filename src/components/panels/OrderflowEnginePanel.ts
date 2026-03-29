import { SnapshotPanel } from '@/components/panels/_shared';

export class OrderflowEnginePanel extends SnapshotPanel {
  constructor() {
    super({ id: 'orderflow-engine', title: 'Orderflow Engine', kicker: 'Footprint Proxy', tag: 'flow', tone: 'alert' });
  }
}
