import { SnapshotPanel } from '@/components/panels/_shared';

export class MarketRadarPanel extends SnapshotPanel {
  constructor() {
    super({ id: 'market-radar', title: 'Market Radar', kicker: 'Regime', tag: 'radar', tone: 'bullish' });
  }
}
