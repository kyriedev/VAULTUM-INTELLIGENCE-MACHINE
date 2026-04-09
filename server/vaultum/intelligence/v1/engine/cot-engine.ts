import {
  confidenceFromParts,
  clamp,
  percentileFromHistory,
  round,
  signedScoreToBias,
  magnitudeToStrength,
  type CotIntelligenceInput,
  type CotIntelligenceOutput,
} from './shared.ts';

function approximatePercentile(value: number): number {
  return clamp(round(50 + (value * 2.2), 1), 1, 99);
}

export function buildCotIntelligence(input: CotIntelligenceInput): CotIntelligenceOutput {
  const hedgerNet = input.commercialLong - input.commercialShort;
  const specNet = input.nonCommercialLong - input.nonCommercialShort;
  const hedgerDelta = Number(input.weeklyCommercialChange ?? 0);
  const specDelta = Number(input.weeklySpecChange ?? 0);
  const openInterest = Math.max(Number(input.openInterest ?? 0), 0);
  const hedgerShare = openInterest > 0 ? round((hedgerNet / openInterest) * 100, 2) : null;
  const specShare = openInterest > 0 ? round((specNet / openInterest) * 100, 2) : null;
  const hedgerPercentile = input.historicalSeries?.length
    ? percentileFromHistory(hedgerNet, input.historicalSeries.map((item) => item.hedgerNet))
    : approximatePercentile(hedgerShare ?? hedgerNet / 10_000);
  const speculatorPercentile = input.historicalSeries?.length
    ? percentileFromHistory(specNet, input.historicalSeries.map((item) => item.specNet))
    : approximatePercentile(specShare ?? specNet / 10_000);
  const divergenceScore = round(clamp(Math.abs((hedgerShare ?? 0) - (specShare ?? 0)) / 25, 0, 1), 3);
  const deltaSignificance = round(clamp(Math.abs(hedgerDelta) / Math.max(openInterest * 0.01, 3_500), 0, 1), 3);

  let posture: CotIntelligenceOutput['derivedMetrics']['posture'] = 'neutral';
  if ((hedgerShare ?? 0) <= -8 && hedgerPercentile >= 82) posture = 'defensive';
  else if (hedgerNet > 0 && hedgerDelta >= 0) posture = 'bullish';
  else if (hedgerNet < 0 && hedgerDelta <= 0) posture = 'bearish';
  else if (Math.abs(hedgerDelta) >= Math.max(openInterest * 0.005, 1_500)) posture = hedgerDelta > 0 ? 'bullish' : 'defensive';

  const postureStrength = round(clamp(((Math.abs(hedgerShare ?? 0) / 15) * 0.45) + (deltaSignificance * 0.35) + (divergenceScore * 0.2), 0, 1), 3);
  const macroBiasScore = posture === 'bullish'
    ? 0.62 + (postureStrength * 0.22)
    : posture === 'bearish'
      ? -0.62 - (postureStrength * 0.18)
      : posture === 'defensive'
        ? -0.34 - (postureStrength * 0.12)
        : 0;
  const macroBias = signedScoreToBias(macroBiasScore);
  const confidence = confidenceFromParts([
    openInterest > 0 ? 0.88 : 0.55,
    input.historicalSeries?.length ? 0.86 : 0.58,
    1 - (Math.abs(specDelta) > Math.abs(hedgerDelta) * 1.6 ? 0.18 : 0.06),
  ]);
  const strength = magnitudeToStrength(Math.abs(macroBiasScore));

  const summary = [
    `Hedgers / commercials are ${posture} with ${(postureStrength * 100).toFixed(0)}% posture strength.`,
    `Weekly hedger change is ${hedgerDelta >= 0 ? '+' : ''}${hedgerDelta.toLocaleString()} contracts and percentile is ${hedgerPercentile.toFixed(1)}.`,
    `Use this as higher-timeframe institutional posture, not precise execution timing.`,
  ].join(' ');

  return {
    source: input.source ?? 'Vaultum hedger-focused COT engine',
    timestamp: input.timestamp ?? new Date().toISOString(),
    asset: input.market,
    bias: macroBias,
    strength,
    confidence,
    summary,
    uiSummary: `Hedgers are ${posture} with ${(confidence * 100).toFixed(0)}% confidence and ${hedgerPercentile.toFixed(1)} percentile pressure.`,
    notes: [
      'COT is a higher-timeframe posture filter and should not be used as a standalone timing trigger.',
      divergenceScore >= 0.55 ? 'Hedger/spec divergence is large enough to matter.' : 'Hedger/spec divergence is present but not extreme.',
      hedgerPercentile >= 85 || hedgerPercentile <= 15 ? 'Hedger positioning is near an extreme historical zone.' : 'Hedger positioning is not at a historical extreme.',
    ],
    rawInputs: input,
    derivedMetrics: {
      hedgerNet,
      hedgerDeltaWow: hedgerDelta,
      hedgerPercentile,
      speculatorPercentile,
      divergenceScore,
      posture,
      postureStrength,
      macroBias,
      hedgerNetShare: hedgerShare,
      speculatorNetShare: specShare,
    },
  };
}
