import { confidenceFromParts, type IntelligenceBias, round, signedScoreToBias } from '../shared.ts';

export function buildDealerLogic(input: {
  spotPrice: number | null;
  focusStrike: number | null;
  focusPressureRead?: string | null;
  focusLevelRole?: string | null;
  focusConfidence?: number | null;
  gammaLevels?: {
    netGamma?: number | null;
    gammaFlip?: number | null;
    volatilityZone?: string | null;
    chainAvailable?: boolean;
    sourceLabel?: string | null;
  } | null;
  dealerPressure?: {
    bias?: string | null;
    pressureScore?: number | null;
    expansionRisk?: string | null;
    chainAvailable?: boolean;
    sourceLabel?: string | null;
  } | null;
  crowdedStrikes?: Array<{ strike: number; score: number }> | null;
}): {
  gammaRegime: string;
  hedgePressure: string;
  tendency: string;
  pinRisk: string;
  confidence: number;
  label: 'synthetic dealer logic' | 'inferred hedge pressure' | 'heuristic gamma regime';
  bias: IntelligenceBias;
  summary: string;
} {
  const netGamma = Number(input.gammaLevels?.netGamma ?? 0);
  const nearFocus = input.spotPrice != null && input.focusStrike != null
    ? Math.abs(input.spotPrice - input.focusStrike) / Math.max(Math.abs(input.focusStrike), 1)
    : null;
  const gammaRegime = netGamma > 0
    ? 'likely long gamma / mean reversion tendency'
    : netGamma < 0
      ? 'likely short gamma / expansion tendency'
      : 'gamma regime unclear';
  const tendency = netGamma > 0 && input.dealerPressure?.expansionRisk !== 'high'
    ? 'dealers are more likely to fade extensions and damp volatility around crowded strikes'
    : netGamma < 0 || input.dealerPressure?.expansionRisk === 'high'
      ? 'dealers are more likely to amplify movement once price escapes crowded strikes'
      : 'dealer response looks mixed and should be treated cautiously';
  const hedgePressure = input.focusLevelRole === 'support candidate'
    ? 'possible buy-on-dip hedge pressure near the focus strike'
    : input.focusLevelRole === 'resistance candidate'
      ? 'possible sell-into-rally hedge pressure near the focus strike'
      : 'hedge pressure is possible but not directionally clear yet';
  const pinRisk = nearFocus != null && nearFocus <= 0.004 && (input.crowdedStrikes?.length ?? 0) > 0
    ? 'pin risk is elevated because spot is close to a crowded strike cluster'
    : 'pin risk is not elevated enough to dominate the read';
  const biasScore = (input.focusLevelRole === 'support candidate' ? 0.34 : input.focusLevelRole === 'resistance candidate' ? -0.34 : 0)
    + (netGamma > 0 ? 0.08 : netGamma < 0 ? -0.08 : 0)
    + (input.dealerPressure?.bias?.includes('bear') ? -0.1 : input.dealerPressure?.bias?.includes('bull') ? 0.1 : 0);
  const bias = signedScoreToBias(biasScore);
  const confidence = confidenceFromParts([
    input.gammaLevels?.chainAvailable ? 0.82 : 0.58,
    input.focusConfidence != null ? input.focusConfidence / 100 : 0.46,
    input.dealerPressure?.pressureScore != null ? Math.min(input.dealerPressure.pressureScore / 100, 0.95) : 0.52,
  ]);
  const label = input.gammaLevels?.chainAvailable || input.dealerPressure?.chainAvailable
    ? 'inferred hedge pressure'
    : netGamma !== 0
      ? 'heuristic gamma regime'
      : 'synthetic dealer logic';

  return {
    gammaRegime,
    hedgePressure,
    tendency,
    pinRisk,
    confidence: round(confidence, 3),
    label,
    bias,
    summary: `${gammaRegime}; ${hedgePressure}; ${tendency}. ${pinRisk}.`,
  };
}
