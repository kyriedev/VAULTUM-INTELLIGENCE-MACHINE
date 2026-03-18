import { SnapshotPanel } from '@/components/panels/_shared';

export class BuyerSellerPressurePanel extends SnapshotPanel {
  constructor() {
    super({ id: 'buyer-seller-pressure', title: 'Buyer / Seller Pressure', kicker: 'Flow Proxy', tag: 'pressure', tone: 'alert' });
  }
}
