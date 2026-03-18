import { SnapshotPanel } from '@/components/panels/_shared';

export class GeopoliticalRiskPanel extends SnapshotPanel {
  constructor() {
    super({ id: 'geopolitical-risk', title: 'Geopolitical Risk', kicker: 'Proxy Stress', tag: 'geo', tone: 'alert' });
  }
}
