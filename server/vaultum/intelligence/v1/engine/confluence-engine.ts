import {
  biasScoreFromLabel,
  confidenceFromParts,
  magnitudeToStrength,
  round,
  signedScoreToBias,
  type ConfluenceDecisionOutput,
  type CotIntelligenceOutput,
  type MonteCarloRiskOutput,
  type NewsIntelligenceOutput,
  type OptionsIntelligenceOutput,
} from './shared.ts';

function leadingStrike(levels: Array<{ strike: number }> | undefined): number[] {
  return (levels ?? []).slice(0, 3).map((item) => item.strike);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function trustHaircuts(input: {
  news: NewsIntelligenceOutput | null;
  cot: CotIntelligenceOutput | null;
  options: OptionsIntelligenceOutput | null;
  monteCarloRisk: MonteCarloRiskOutput | null;
}): Array<{ label: string; haircut: number; reason: string }> {
  const haircuts: Array<{ label: string; haircut: number; reason: string }> = [];

  if ((input.news?.derivedMetrics.contradictions?.length ?? 0) > 0) {
    haircuts.push({
      label: 'News contradiction',
      haircut: 0.06,
      reason: 'Conflicting headline flow is active, so news confidence should be clipped until the narrative converges.',
    });
  }

  const cotAgeDays = input.cot?.timestamp
    ? Math.max((Date.now() - new Date(input.cot.timestamp).getTime()) / (24 * 60 * 60 * 1000), 0)
    : null;
  if (cotAgeDays != null && cotAgeDays > 8) {
    haircuts.push({
      label: 'COT age',
      haircut: 0.05,
      reason: 'COT is a weekly posture lens, so the current report is old enough to warrant a small timing haircut.',
    });
  }

  const optionsMode = input.options?.rawInputs.sourceMode ?? 'unavailable';
  if (optionsMode === 'synthetic-live') {
    haircuts.push({
      label: 'Synthetic options',
      haircut: 0.14,
      reason: 'Options pressure is being inferred from synthetic-live structure rather than direct chain truth.',
    });
  } else if (optionsMode === 'ocr-heuristic') {
    haircuts.push({
      label: 'OCR options',
      haircut: 0.09,
      reason: 'Strike pressure is coming from screenshot OCR, so it stays heuristic until nearby chain structure confirms it.',
    });
  } else if (optionsMode === 'structured-input') {
    haircuts.push({
      label: 'Manual options rows',
      haircut: 0.03,
      reason: 'Options pressure uses structured user-supplied rows, which is usable but narrower than a live full chain.',
    });
  }

  if (input.monteCarloRisk?.derivedMetrics.riskLabel === 'pause') {
    haircuts.push({
      label: 'Risk regime pause',
      haircut: 0.04,
      reason: 'The risk engine is already warning that scaling conditions are poor, so confluence confidence should be tempered.',
    });
  }

  return haircuts;
}

export function buildConfluenceDecision(input: {
  market: string;
  news: NewsIntelligenceOutput | null;
  cot: CotIntelligenceOutput | null;
  monteCarloRisk: MonteCarloRiskOutput | null;
  options: OptionsIntelligenceOutput | null;
}): ConfluenceDecisionOutput {
  const newsScore = (biasScoreFromLabel(input.news?.bias ?? 'neutral') * (input.news?.confidence ?? 0)) * 0.34;
  const cotScore = (biasScoreFromLabel(input.cot?.bias ?? 'neutral') * (input.cot?.confidence ?? 0)) * 0.2;
  const optionsScore = (biasScoreFromLabel(input.options?.bias ?? 'neutral') * (input.options?.confidence ?? 0)) * 0.31;
  const riskPenalty = input.monteCarloRisk
    ? (input.monteCarloRisk.derivedMetrics.riskLabel === 'pause'
      ? 0.12
      : input.monteCarloRisk.derivedMetrics.riskLabel === 'reduce'
        ? 0.06
        : 0.02)
    : 0.03;
  const overallScore = round(newsScore + cotScore + optionsScore - riskPenalty, 3);
  const overallBias = signedScoreToBias(overallScore);
  const biasStrength = magnitudeToStrength(Math.abs(overallScore));
  const support = leadingStrike(input.options?.derivedMetrics.supportCandidates);
  const resistance = leadingStrike(input.options?.derivedMetrics.resistanceCandidates);
  const macroPosture = [
    input.news?.derivedMetrics.narrative ?? null,
    input.cot?.derivedMetrics.posture ? `hedgers ${input.cot.derivedMetrics.posture}` : null,
  ].filter((item): item is string => Boolean(item)).join(' / ') || 'macro posture is mixed';
  const riskRegime = input.monteCarloRisk
    ? `${input.monteCarloRisk.derivedMetrics.riskLabel.replaceAll('-', ' ')} with survival ${(input.monteCarloRisk.derivedMetrics.survivalProbability * 100).toFixed(0)}%`
    : 'risk regime unavailable';
  const scenarioA = overallBias === 'bearish'
    ? `Rallies into ${resistance[0] ?? 'overhead pressure'} are more likely to fade while the current narrative and strike pressure stay intact.`
    : overallBias === 'bullish'
      ? `Pullbacks into ${support[0] ?? 'support'} are more likely to attract demand while the current narrative and strike pressure stay intact.`
      : 'The tape is mixed enough that scenario A is a wait-and-confirm state rather than a directional push.';
  const scenarioB = overallBias === 'bearish'
    ? `If price reclaims ${resistance[0] ?? 'resistance'} and headline pressure softens, bearish pressure weakens and fade logic should be reduced.`
    : overallBias === 'bullish'
      ? `If price loses ${support[0] ?? 'support'} and options pressure flips defensive, bullish pullback logic weakens fast.`
      : 'A clean break away from the current strike cluster or a headline shift is needed before bias improves.';
  const invalidation = overallBias === 'bearish'
    ? `Sustained acceptance above ${resistance[0] ?? 'the lead resistance strike'} invalidates the current bearish pressure map.`
    : overallBias === 'bullish'
      ? `Sustained acceptance below ${support[0] ?? 'the lead support strike'} invalidates the current bullish pressure map.`
      : 'The current mixed state is invalidated only when one side of the pressure map clearly takes control.';
  const confidence = confidenceFromParts([
    input.news?.confidence ?? 0.42,
    input.cot?.confidence ?? 0.4,
    input.options?.confidence ?? 0.5,
    input.monteCarloRisk?.confidence ?? 0.45,
    1 - (Math.abs(newsScore - optionsScore) > 0.32 ? 0.18 : 0.04),
  ]);
  const haircutDetails = trustHaircuts(input);
  const effectiveConfidence = round(clamp01(
    confidence - haircutDetails.reduce((sum, item) => sum + item.haircut, 0),
  ), 3);
  const alignmentScore = round(Math.max(0, Math.min(1, 1 - Math.abs(newsScore - optionsScore) - Math.abs(cotScore - optionsScore))), 3);

  const summary = [
    `Overall bias is ${overallBias} with ${biasStrength} strength and ${(effectiveConfidence * 100).toFixed(0)}% confidence.`,
    input.news?.uiSummary ?? 'News engine unavailable.',
    input.cot?.uiSummary ?? 'COT engine unavailable.',
    input.options?.uiSummary ?? 'Options engine unavailable.',
    input.monteCarloRisk?.uiSummary ?? 'Monte Carlo risk engine unavailable.',
    haircutDetails[0] ? `${haircutDetails[0].label} is clipping trust: ${haircutDetails[0].reason}` : '',
  ].join(' ');

  return {
    source: 'Vaultum confluence / decision fusion engine',
    timestamp: new Date().toISOString(),
    asset: input.market,
    bias: overallBias,
    strength: biasStrength,
    confidence: effectiveConfidence,
    summary,
    uiSummary: `Overall ${overallBias} bias with ${biasStrength} strength. ${scenarioA}`,
    notes: [
      'Fusion weights macro/news, hedger posture, strike pressure, and risk distribution without letting any one heuristic dominate by itself.',
      'COT remains higher-timeframe posture, options remain shorter-term pressure, and Monte Carlo remains risk distribution rather than price prediction.',
    ],
    rawInputs: input,
    derivedMetrics: {
      overallBias,
      biasStrength,
      macroPosture,
      optionsPressureMap: {
        support: input.options?.derivedMetrics.supportCandidates ?? [],
        resistance: input.options?.derivedMetrics.resistanceCandidates ?? [],
        magnets: input.options?.derivedMetrics.magnetStrikes ?? [],
      },
      riskRegime,
      keyLevels: {
        support,
        resistance,
      },
      scenarioA,
      scenarioB,
      invalidation,
      alignmentScore,
      effectiveConfidence,
      trustHaircuts: haircutDetails,
    },
  };
}
