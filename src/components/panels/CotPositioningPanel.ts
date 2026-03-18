import { SnapshotPanel } from '@/components/panels/_shared';

export class CotPositioningPanel extends SnapshotPanel {
  constructor() {
    super({ id: 'cot-positioning', title: 'COT Positioning', kicker: 'Crowdedness', tag: 'futures', tone: 'neutral' });
  }
}
