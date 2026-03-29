import { SnapshotPanel } from '@/components/panels/_shared';

export class ExecutionPlaybookPanel extends SnapshotPanel {
  constructor() {
    super({ id: 'execution-playbook', title: 'Execution Playbook', kicker: 'Entry / Exit Map', tag: 'execution', tone: 'bullish' });
  }
}
