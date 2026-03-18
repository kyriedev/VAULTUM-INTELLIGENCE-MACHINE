import { SnapshotPanel } from '@/components/panels/_shared';

export class NewsIntelPanel extends SnapshotPanel {
  constructor() {
    super({ id: 'news-intel', title: 'News Intelligence', kicker: 'Signal Separation', tag: 'news', tone: 'neutral' });
  }
}
