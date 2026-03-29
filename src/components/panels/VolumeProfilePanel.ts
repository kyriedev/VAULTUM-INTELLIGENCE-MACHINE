import { SnapshotPanel } from '@/components/panels/_shared';

export class VolumeProfilePanel extends SnapshotPanel {
  constructor() {
    super({ id: 'volume-profile', title: 'Volume Profile / Levels', kicker: 'Structure', tag: 'profile', tone: 'neutral' });
  }
}
