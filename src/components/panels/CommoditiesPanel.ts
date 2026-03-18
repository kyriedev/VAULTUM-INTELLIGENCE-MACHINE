import { SnapshotPanel } from '@/components/panels/_shared';

export class CommoditiesPanel extends SnapshotPanel {
  constructor() {
    super({ id: 'commodities', title: 'Commodities', kicker: 'Supply / Demand', tag: 'oil-metals', tone: 'alert' });
  }
}
