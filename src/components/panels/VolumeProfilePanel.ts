import { SnapshotPanel } from '@/components/panels/_shared';

export class VolumeProfilePanel extends SnapshotPanel {
  constructor() {
    super({ id: 'volume-profile', title: 'Volume Profile / Pivot', kicker: 'Structure', tag: 'profile', tone: 'neutral' });
  }
}
