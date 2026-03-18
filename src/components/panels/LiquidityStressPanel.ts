import { SnapshotPanel } from '@/components/panels/_shared';

export class LiquidityStressPanel extends SnapshotPanel {
  constructor() {
    super({ id: 'liquidity-stress', title: 'Liquidity Stress', kicker: 'Dollar Funding', tag: 'liquidity', tone: 'alert' });
  }
}
