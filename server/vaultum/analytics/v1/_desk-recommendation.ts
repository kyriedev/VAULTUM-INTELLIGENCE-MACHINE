type RecommendationStatus = 'confirmed' | 'derived' | 'estimated';

export type DeskRecommendationQuote = {
  label: string;
  quote: string;
  source: string;
  status: RecommendationStatus;
};

export type DeskRecommendation = {
  bias: string;
  biasScore: number;
  biasConfidence: 'low' | 'medium' | 'high';
  institutionalSummary: string;
  entrySuggestion: string;
  reEntrySuggestion: string;
  exitSuggestion: string;
  monteCarloSummary: string;
  optionsMathSummary: string;
  quotedEvidence: DeskRecommendationQuote[];
};

type ExecutionSnapshot = {
  action: 'lean-long' | 'lean-short' | 'wait' | 'stand-down';
  stance: string;
  confidence: 'low' | 'medium' | 'high';
  ensembleScore: number;
  summary: string;
  actionPlan: string;
};

type RiskEnvelopeSnapshot = {
  actionMode: 'aggressive' | 'standard' | 'cautious' | 'suppressed';
  sizeBand: 'full' | 'standard' | 'reduced' | 'small' | 'stand-down';
  riskBudgetPct: number;
  riskScore: number;
  tradeSuppression: boolean;
  body: string;
};

type EntryMapSnapshot = {
  biasLabel?: string;
  phase?: string;
  readiness?: string;
  direction?: 'long' | 'short' | 'neutral';
  confidenceLabel?: 'low' | 'medium' | 'high';
  executionRead?: string;
  phaseSummary?: string;
  entryZone?: string;
  trimZone?: string;
  invalidationLevel?: string;
  triggerPattern?: string;
  institutionalReference?: string;
  institutionalReferenceZone?: string;
  tradeThesisSummary?: string;
  macroContext?: string;
  macroReflexivity?: string;
  macroBlindspots?: string[];
  precisionEntryPlan?: string;
  pyramidingPlan?: string;
  sourceLabel?: string;
  doNotExecute?: boolean;
};

type ScenarioSnapshot = {
  horizonLabel?: string;
  pathBias?: string;
  targetLevel?: number | null;
  invalidationLevel?: number | null;
  supportLevel?: number | null;
  targetFirstProbability?: number | null;
  invalidationFirstProbability?: number | null;
  supportHoldProbability?: number | null;
  breakEvenProbability?: number | null;
  medianMaxDrawdownPct?: number | null;
  expectedMovePct?: number | null;
  sourceLabel?: string;
};

type FlowProxySnapshot = {
  flowBias?: string;
  dealerPositioning?: string;
  squeezeRisk?: string;
  callWall?: number | null;
  putWall?: number | null;
  gammaFlip?: number | null;
  pricingModel?: string;
  theoreticalAtmVol?: number | null;
  downsideSkew?: number | null;
  expectedMove1w?: number | null;
  expectedMove1m?: number | null;
  dealerCorridorWidth?: number | null;
  surfaceFit?: {
    quality?: string;
    rmse?: number | null;
  };
  featuredStrategy?: string;
  featuredStrategySummary?: string;
  americanExerciseRisk?: string;
  sourceLabel?: string;
};

type GammaSnapshot = {
  pricingModel?: string;
  greekAgreementScore?: number | null;
  greekAgreementLabel?: string;
  greekAgreementNote?: string;
  ivSolverMethod?: string;
  ivSolverIterations?: number | null;
  ivSolverResidual?: number | null;
  ivSolverConverged?: boolean;
  surfaceFit?: {
    quality?: string;
    rmse?: number | null;
    riskReversal1m?: number | null;
    butterfly1m?: number | null;
  };
  sourceLabel?: string;
};

type DealerSnapshot = {
  conclusion?: string;
  bias?: string;
  pressureScore?: number | null;
  expansionRisk?: string;
  sourceLabel?: string;
};

type PressureSnapshot = {
  dominance?: string;
  score?: number | null;
  sourceLabel?: string;
};

type OrderflowSnapshot = {
  dominance?: string;
  buySellPressure?: number | null;
  priceDeltaDivergence?: string;
  divergenceDetail?: string;
  sourceLabel?: string;
};

type MacroSnapshot = {
  regime?: string;
  goldBias?: string;
  focus?: {
    market?: string;
    bias?: string;
    convictionScore?: number;
    reflexivityState?: string;
    summary?: string;
  } | null;
};

function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function fmtPlainPct(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return `${value.toFixed(digits)}%`;
}

function fmtLevel(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return value.toFixed(2);
}

function sanitizeScore(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.max(-100, Math.min(100, Number(value.toFixed(1))));
}

function biasLabel(action: ExecutionSnapshot['action'], stance: string): string {
  if (action === 'lean-long') return 'Bullish bias';
  if (action === 'lean-short') return 'Bearish bias';
  if (action === 'stand-down') return 'Transition / stand down';
  if (/bull/i.test(stance)) return 'Bullish bias';
  if (/bear|defensive/i.test(stance)) return 'Bearish bias';
  return 'Neutral / wait';
}

function pricingModelSummary(model: string | null | undefined): string {
  switch ((model || '').toLowerCase()) {
    case 'black-76':
      return 'Black-76 futures carry model';
    case 'garman-kohlhagen':
      return 'Garman-Kohlhagen FX carry model';
    case 'merton':
      return 'Merton dividend-adjusted Black-Scholes';
    case 'black-scholes':
      return 'Black-Scholes spot-diffusion model';
    default:
      return 'carry-adjusted synthetic options model';
  }
}

function zoneOrFallback(primary: string | null | undefined, fallback: string): string {
  return primary && primary.trim().length ? primary : fallback;
}

function buildEntrySuggestion(input: {
  market: string;
  execution: ExecutionSnapshot;
  riskEnvelope: RiskEnvelopeSnapshot;
  entryMap: EntryMapSnapshot | null;
  scenario: ScenarioSnapshot | null;
  flowProxy: FlowProxySnapshot | null;
  technicalPattern: string;
}): string {
  if (input.entryMap?.precisionEntryPlan) {
    const invalidation = input.entryMap?.invalidationLevel ?? fmtLevel(input.scenario?.invalidationLevel ?? null);
    return `${input.entryMap.precisionEntryPlan} Keep risk at ${input.riskEnvelope.sizeBand} size and invalidate the initial idea on a clean loss of ${invalidation}.`;
  }

  const entryZone = zoneOrFallback(
    input.entryMap?.entryZone,
    input.execution.action === 'lean-short'
      ? `resistance cluster ${fmtLevel(input.flowProxy?.callWall ?? input.scenario?.targetLevel ?? null)}`
      : `support cluster ${fmtLevel(input.flowProxy?.putWall ?? input.scenario?.supportLevel ?? null)}`,
  );
  const invalidation = input.entryMap?.invalidationLevel ?? fmtLevel(input.scenario?.invalidationLevel ?? null);
  const trigger = input.entryMap?.triggerPattern ?? input.technicalPattern;

  if (input.execution.action === 'lean-long') {
    return `Buy weakness into ${entryZone} only after ${trigger} confirms, keep risk at ${input.riskEnvelope.sizeBand} size, and invalidate the initial idea on a clean loss of ${invalidation}.`;
  }

  if (input.execution.action === 'lean-short') {
    return `Sell failed rallies into ${entryZone} only after ${trigger} rejects, keep risk at ${input.riskEnvelope.sizeBand} size, and invalidate the downside idea on a clean reclaim of ${invalidation}.`;
  }

  if (input.execution.action === 'stand-down') {
    return `Do not open fresh ${input.market} risk while the risk gate is ${input.riskEnvelope.actionMode}; wait for cleaner structure, better committee alignment, and lower event stress before re-engaging.`;
  }

  return `No fresh entry is preferred yet; wait for price to resolve around ${entryZone} and let ${trigger} align with the committee before putting on new risk.`;
}

function buildReEntrySuggestion(input: {
  execution: ExecutionSnapshot;
  riskEnvelope: RiskEnvelopeSnapshot;
  entryMap: EntryMapSnapshot | null;
  scenario: ScenarioSnapshot | null;
  flowProxy: FlowProxySnapshot | null;
  pressure: PressureSnapshot | null;
  orderflow: OrderflowSnapshot | null;
}): string {
  if (input.entryMap?.pyramidingPlan) {
    return input.entryMap.pyramidingPlan;
  }

  const entryZone = zoneOrFallback(
    input.entryMap?.entryZone,
    input.execution.action === 'lean-short'
      ? `resistance near ${fmtLevel(input.flowProxy?.callWall ?? input.scenario?.targetLevel ?? null)}`
      : `support near ${fmtLevel(input.flowProxy?.putWall ?? input.scenario?.supportLevel ?? null)}`,
  );
  const invalidation = input.entryMap?.invalidationLevel ?? fmtLevel(input.scenario?.invalidationLevel ?? null);
  const scenarioGate = input.scenario?.targetFirstProbability != null && input.scenario?.invalidationFirstProbability != null
    ? `Only reload if target-first ${fmtPlainPct(input.scenario.targetFirstProbability)} still leads invalidation-first ${fmtPlainPct(input.scenario.invalidationFirstProbability)}.`
    : 'Only reload if the scenario edge remains constructive.';
  const longOrderflowGuard = input.orderflow?.priceDeltaDivergence && input.orderflow.priceDeltaDivergence !== 'none'
    ? `and without fresh ${input.orderflow.priceDeltaDivergence} against the trade`
    : 'and orderflow stays aligned';
  const shortOrderflowGuard = input.orderflow?.priceDeltaDivergence && input.orderflow.priceDeltaDivergence !== 'none'
    ? 'and without a bullish orderflow reversal against the trade'
    : 'and orderflow stays aligned';

  if (input.execution.action === 'lean-long') {
    return `After trimming or missing the first move, reload only on an accepted retest back into ${entryZone} with ${input.pressure?.dominance ?? 'supportive'} pressure ${longOrderflowGuard}; abandon the reload idea if ${invalidation} gives way. ${scenarioGate}`;
  }

  if (input.execution.action === 'lean-short') {
    return `After covering part of the move, reload only on failed retests into ${entryZone} while ${input.pressure?.dominance ?? 'pressure'} stays defensive ${shortOrderflowGuard}; abandon the reload idea if ${invalidation} is reclaimed. ${scenarioGate}`;
  }

  return `Re-entry is not active yet. Wait until the risk gate reopens and the entry map stops reading ${input.entryMap?.phase ?? 'transition'} / ${input.entryMap?.readiness ?? 'watch'} before planning reloads.`;
}

function buildExitSuggestion(input: {
  execution: ExecutionSnapshot;
  entryMap: EntryMapSnapshot | null;
  scenario: ScenarioSnapshot | null;
  flowProxy: FlowProxySnapshot | null;
  riskEnvelope: RiskEnvelopeSnapshot;
  orderflow: OrderflowSnapshot | null;
}): string {
  const trimZone = zoneOrFallback(
    input.entryMap?.trimZone,
    input.execution.action === 'lean-short'
      ? `${fmtLevel(input.flowProxy?.putWall ?? input.scenario?.supportLevel ?? null)}`
      : `${fmtLevel(input.flowProxy?.callWall ?? input.scenario?.targetLevel ?? null)}`,
  );
  const invalidation = input.entryMap?.invalidationLevel ?? fmtLevel(input.scenario?.invalidationLevel ?? null);
  const flowWarning = input.orderflow?.priceDeltaDivergence && input.orderflow.priceDeltaDivergence !== 'none'
    ? `Respect ${input.orderflow.divergenceDetail ?? input.orderflow.priceDeltaDivergence} as an early exit warning.`
    : 'Respect fresh orderflow divergence as an early exit warning.';

  if (input.execution.action === 'lean-long') {
    return `Scale profits into ${trimZone}, keep only reduced runners once that zone is hit, and fully step aside on a clean loss of ${invalidation} or if the risk gate shifts back toward ${input.riskEnvelope.actionMode}. ${flowWarning}`;
  }

  if (input.execution.action === 'lean-short') {
    return `Scale covers into ${trimZone}, keep only reduced runners once downside objectives are met, and fully step aside on a clean reclaim of ${invalidation}. ${flowWarning}`;
  }

  return `Exit guidance is conditional because no aggressive position is preferred; if already in risk, use ${trimZone} as the next reaction pocket and respect ${invalidation} as the hard line.`;
}

function buildMonteCarloSummary(scenario: ScenarioSnapshot | null): string {
  if (!scenario) {
    return 'Monte Carlo summary is unavailable for the current request.';
  }

  return `Monte Carlo over ${scenario.horizonLabel ?? 'the active horizon'} still reads ${scenario.pathBias ?? 'mixed'}, with target-first ${fmtPlainPct(scenario.targetFirstProbability)}, invalidation-first ${fmtPlainPct(scenario.invalidationFirstProbability)}, support-hold ${fmtPlainPct(scenario.supportHoldProbability)}, break-even ${fmtPlainPct(scenario.breakEvenProbability)}, median max drawdown ${fmtPlainPct(scenario.medianMaxDrawdownPct)}, and expected move ${fmtPct(scenario.expectedMovePct)}.`;
}

function buildOptionsMathSummary(input: {
  flowProxy: FlowProxySnapshot | null;
  gammaLevels: GammaSnapshot | null;
  dealerPressure: DealerSnapshot | null;
}): string {
  const model = input.gammaLevels?.pricingModel ?? input.flowProxy?.pricingModel ?? null;
  const modelLabel = pricingModelSummary(model);
  const greekQA = input.gammaLevels?.greekAgreementScore != null
    ? `${Math.round(input.gammaLevels.greekAgreementScore)} ${input.gammaLevels.greekAgreementLabel ?? 'qa'}`
    : 'n/a';
  const solver = input.gammaLevels?.ivSolverMethod
    ? `${input.gammaLevels.ivSolverMethod} solver${input.gammaLevels?.ivSolverIterations != null ? ` (${input.gammaLevels.ivSolverIterations} iterations)` : ''}`
    : 'surface solver unavailable';
  const surface = input.flowProxy?.surfaceFit?.quality ?? input.gammaLevels?.surfaceFit?.quality ?? 'unknown';
  const rmse = input.gammaLevels?.surfaceFit?.rmse ?? input.flowProxy?.surfaceFit?.rmse ?? null;
  const dealerConclusion = input.dealerPressure?.conclusion ?? 'dealer-pressure conclusion unavailable';
  const gammaMap = `${fmtLevel(input.flowProxy?.putWall ?? null)} / ${fmtLevel(input.flowProxy?.gammaFlip ?? null)} / ${fmtLevel(input.flowProxy?.callWall ?? null)}`;

  return `Options mathematics are running on ${modelLabel}, with ATM IV ${fmtPlainPct(input.flowProxy?.theoreticalAtmVol)}, downside skew ${fmtLevel(input.flowProxy?.downsideSkew ?? null)} pts, ${surface} surface calibration${rmse != null ? ` (${rmse.toFixed(3)} rmse)` : ''}, Greek QA ${greekQA}, ${solver}, dealer posture ${input.flowProxy?.dealerPositioning ?? 'unknown'}, corridor ${fmtLevel(input.flowProxy?.dealerCorridorWidth ?? null)}, 1W expected move ${fmtPlainPct(input.flowProxy?.expectedMove1w)}, 1M expected move ${fmtPlainPct(input.flowProxy?.expectedMove1m)}, gamma map ${gammaMap}, featured structure ${input.flowProxy?.featuredStrategy ?? 'unknown'}, and ${dealerConclusion}.`;
}

function evidenceQuote(
  label: string,
  quote: string,
  source: string,
  status: RecommendationStatus,
): DeskRecommendationQuote {
  return { label, quote, source, status };
}

export function buildDeskRecommendation(input: {
  market: string;
  timeframe: string;
  execution: ExecutionSnapshot;
  riskEnvelope: RiskEnvelopeSnapshot;
  entryMap: EntryMapSnapshot | null;
  scenario: ScenarioSnapshot | null;
  flowProxy: FlowProxySnapshot | null;
  gammaLevels: GammaSnapshot | null;
  dealerPressure: DealerSnapshot | null;
  pressure: PressureSnapshot | null;
  orderflow: OrderflowSnapshot | null;
  macroSignals: MacroSnapshot | null;
  technicalPattern: string;
}): DeskRecommendation {
  const bias = biasLabel(input.execution.action, input.execution.stance);
  const biasScore = sanitizeScore(input.execution.ensembleScore);
  const monteCarloSummary = buildMonteCarloSummary(input.scenario);
  const optionsMathSummary = buildOptionsMathSummary({
    flowProxy: input.flowProxy,
    gammaLevels: input.gammaLevels,
    dealerPressure: input.dealerPressure,
  });
  const institutionalSummary = `${bias} in ${input.market} on ${input.timeframe.toUpperCase()}, with committee score ${biasScore}, macro ${input.macroSignals?.focus?.summary ?? input.macroSignals?.regime ?? 'unknown'}, pressure ${input.pressure?.dominance ?? 'unknown'}, orderflow ${input.orderflow?.dominance ?? 'unknown'}, risk envelope ${input.riskEnvelope.sizeBand}, and ${input.scenario?.pathBias ?? 'mixed'} scenario odds.`;

  const entrySuggestion = buildEntrySuggestion({
    market: input.market,
    execution: input.execution,
    riskEnvelope: input.riskEnvelope,
    entryMap: input.entryMap,
    scenario: input.scenario,
    flowProxy: input.flowProxy,
    technicalPattern: input.technicalPattern,
  });

  const reEntrySuggestion = buildReEntrySuggestion({
    execution: input.execution,
    riskEnvelope: input.riskEnvelope,
    entryMap: input.entryMap,
    scenario: input.scenario,
    flowProxy: input.flowProxy,
    pressure: input.pressure,
    orderflow: input.orderflow,
  });

  const exitSuggestion = buildExitSuggestion({
    execution: input.execution,
    entryMap: input.entryMap,
    scenario: input.scenario,
    flowProxy: input.flowProxy,
    riskEnvelope: input.riskEnvelope,
    orderflow: input.orderflow,
  });

  const quotedEvidence = [
    evidenceQuote(
      'Bias',
      institutionalSummary,
      'Execution committee / macro / pressure / orderflow',
      'derived',
    ),
    evidenceQuote(
      'Entry',
      entrySuggestion,
      input.entryMap?.sourceLabel ?? 'Entry map / structure stack',
      input.entryMap?.confidenceLabel === 'high' ? 'derived' : 'estimated',
    ),
    evidenceQuote(
      'Re-entry',
      reEntrySuggestion,
      'Entry map / scenario / orderflow',
      'derived',
    ),
    evidenceQuote(
      'Exit',
      exitSuggestion,
      'Entry map / scenario / gamma map / risk envelope',
      'derived',
    ),
    evidenceQuote(
      'Monte Carlo',
      monteCarloSummary,
      input.scenario?.sourceLabel ?? 'Monte Carlo scenario engine',
      'derived',
    ),
    evidenceQuote(
      'Options Math',
      optionsMathSummary,
      input.gammaLevels?.sourceLabel ?? input.flowProxy?.sourceLabel ?? 'Synthetic options proxy',
      'estimated',
    ),
  ];

  return {
    bias,
    biasScore,
    biasConfidence: input.execution.confidence,
    institutionalSummary,
    entrySuggestion,
    reEntrySuggestion,
    exitSuggestion,
    monteCarloSummary,
    optionsMathSummary,
    quotedEvidence,
  };
}
