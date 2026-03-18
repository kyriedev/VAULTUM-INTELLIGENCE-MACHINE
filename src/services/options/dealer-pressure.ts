import { gammaRegime } from '@/services/options/gamma';

export function dealerPressureSummary(netGamma: number): string {
  const regime = gammaRegime(netGamma);
  return regime === 'short-gamma'
    ? 'Dealer positioning can amplify directional moves and gap risk.'
    : regime === 'long-gamma'
      ? 'Dealer positioning should damp realized volatility on small shocks.'
      : 'Dealer positioning is neutral; macro catalysts should dominate.';
}
