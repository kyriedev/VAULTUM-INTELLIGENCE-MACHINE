import type { PanelSnapshot } from '@/types';

type SurfaceFitSummary = {
  quality?: string;
  rmse?: number;
  riskReversal1m?: number;
  butterfly1m?: number;
  termSlope?: number;
  convexity?: number;
  calibratedTenors?: string[];
};

type GreeksSummary = { delta?: number; gamma?: number; theta?: number; vega?: number; rho?: number };
type AmericanStyleSummary = {
  model?: string;
  steps?: number;
  europeanPremium?: number;
  americanPremium?: number;
  intrinsicValue?: number;
  earlyExercisePremium?: number;
  premiumRatioPct?: number;
  exerciseStyle?: string;
  likelyDriver?: string;
};
type StrategyPackageSummary = {
  name?: string;
  thesis?: string;
  structure?: string;
  tenorDays?: number;
  netPremium?: number;
  maxGain?: number | null;
  maxLoss?: number;
  breakEvenLow?: number | null;
  breakEvenHigh?: number | null;
  netGreeks?: GreeksSummary;
  summary?: string;
};
type ShockLadderSummary = {
  label?: string;
  driver?: string;
  premium?: number;
  pnl?: number;
  tone?: string;
};

export function buildOptionsPanels(input: {
  gamma?: {
    symbol?: string;
    sourceSymbol?: string;
    pricingModel?: string;
    callWall?: number;
    putWall?: number;
    gammaFlip?: number;
    netGamma?: number;
    volatilityZone?: string;
    keyStrikes?: number[];
    price?: number;
    atr14?: number;
    realizedVol20?: number;
    realizedVol60?: number;
    volPercentile?: number;
    momentum20?: number;
    tickMomentum?: number;
    rangeExpansion?: number;
    theoreticalAtmVol?: number;
    downsideSkew?: number;
    expectedMove1w?: number;
    expectedMove1m?: number;
    dealerCorridorWidth?: number;
    chainProxyUnderlying?: string | null;
    chainAvailable?: boolean;
    topStrikes?: Array<{ strike: number; kind: 'call' | 'put' | 'balance'; gammaWeight?: number }>;
    atmGreeks?: GreeksSummary;
    numericalGreeks?: GreeksSummary;
    greekAgreementScore?: number;
    greekAgreementLabel?: string;
    greekAgreementNote?: string;
    ivSolverMethod?: string;
    ivSolverIterations?: number;
    ivSolverResidual?: number;
    ivSolverConverged?: boolean;
    ivSolverBounded?: boolean;
    limitedIv?: number;
    limitedIvConverged?: boolean;
    ivSurface?: Array<{ tenor: string; tenorDays?: number; atmVol?: number; putWingVol?: number; callWingVol?: number; skew?: number }>;
    surfaceFit?: SurfaceFitSummary;
    americanDiagnostics?: { call?: AmericanStyleSummary; put?: AmericanStyleSummary };
    strategyPackages?: StrategyPackageSummary[];
    featuredStrategy?: string;
    featuredStrategySummary?: string;
    shockLadder?: ShockLadderSummary[];
    mode?: string;
    sourceLabel?: string;
  } | null;
  dealer?: {
    symbol?: string;
    sourceSymbol?: string;
    conclusion?: string;
    bias?: string;
    pressureScore?: number;
    expansionRisk?: string;
    pricingModel?: string;
    price?: number;
    atr14?: number;
    realizedVol20?: number;
    realizedVol60?: number;
    volPercentile?: number;
    tickMomentum?: number;
    rangeExpansion?: number;
    theoreticalAtmVol?: number;
    downsideSkew?: number;
    expectedMove1w?: number;
    expectedMove1m?: number;
    dealerCorridorWidth?: number;
    callOpenInterestProxy?: number;
    putOpenInterestProxy?: number;
    totalInterestProxy?: number;
    chainProxyUnderlying?: string | null;
    chainAvailable?: boolean;
    atmGreeks?: GreeksSummary;
    numericalGreeks?: GreeksSummary;
    greekAgreementScore?: number;
    greekAgreementLabel?: string;
    greekAgreementNote?: string;
    ivSolverMethod?: string;
    ivSolverIterations?: number;
    ivSolverResidual?: number;
    ivSolverConverged?: boolean;
    ivSolverBounded?: boolean;
    limitedIv?: number;
    limitedIvConverged?: boolean;
    ivSurface?: Array<{ tenor: string; tenorDays?: number; atmVol?: number; putWingVol?: number; callWingVol?: number; skew?: number }>;
    surfaceFit?: SurfaceFitSummary;
    americanDiagnostics?: { call?: AmericanStyleSummary; put?: AmericanStyleSummary };
    strategyPackages?: StrategyPackageSummary[];
    featuredStrategy?: string;
    featuredStrategySummary?: string;
    shockLadder?: ShockLadderSummary[];
    mode?: string;
    sourceLabel?: string;
  } | null;
  snapshots?: {
    symbol?: string;
    sourceSymbol?: string;
    mode?: string;
    sourceLabel?: string;
    pricingModel?: string;
    theoreticalAtmVol?: number;
    downsideSkew?: number;
    expectedMove1w?: number;
    expectedMove1m?: number;
    chainProxyUnderlying?: string | null;
    chainAvailable?: boolean;
    atmGreeks?: GreeksSummary;
    numericalGreeks?: GreeksSummary;
    greekAgreementScore?: number;
    greekAgreementLabel?: string;
    greekAgreementNote?: string;
    ivSolverMethod?: string;
    ivSolverIterations?: number;
    ivSolverResidual?: number;
    ivSolverConverged?: boolean;
    ivSolverBounded?: boolean;
    limitedIv?: number;
    limitedIvConverged?: boolean;
    ivSurface?: Array<{ tenor: string; tenorDays?: number; atmVol?: number; putWingVol?: number; callWingVol?: number; skew?: number }>;
    surfaceFit?: SurfaceFitSummary;
    americanDiagnostics?: { call?: AmericanStyleSummary; put?: AmericanStyleSummary };
    strategyPackages?: StrategyPackageSummary[];
    featuredStrategy?: string;
    featuredStrategySummary?: string;
    shockLadder?: ShockLadderSummary[];
    snapshots?: Array<{ tenor: string; bias: string; impliedVol?: number; expectedMove?: number; atmCall?: number; atmPut?: number; model?: string }>;
  } | null;
}): Record<string, PanelSnapshot> {
  return {
    'options-gamma': {
      conclusion: input.gamma
        ? `${input.gamma.symbol} walls cluster at ${input.gamma.putWall} / ${input.gamma.gammaFlip} / ${input.gamma.callWall} with ${input.gamma.volatilityZone}, ${input.gamma.pricingModel ?? 'options'} surface math, and ${input.gamma.surfaceFit?.quality ?? 'raw'} smile calibration.`
        : 'Options gamma levels unavailable.',
      metrics: [
        { label: 'Call Wall', value: input.gamma?.callWall != null ? String(input.gamma.callWall) : 'n/a', tone: 'bullish' },
        { label: 'Put Wall', value: input.gamma?.putWall != null ? String(input.gamma.putWall) : 'n/a', tone: 'bearish' },
        { label: 'Gamma Flip', value: input.gamma?.gammaFlip != null ? String(input.gamma.gammaFlip) : 'n/a', tone: 'alert' },
        { label: 'Net Gamma', value: input.gamma?.netGamma != null ? String(input.gamma.netGamma) : 'n/a', tone: (input.gamma?.netGamma ?? 0) >= 0 ? 'bullish' : 'bearish' },
        { label: 'ATM IV', value: input.gamma?.theoreticalAtmVol != null ? `${input.gamma.theoreticalAtmVol}%` : 'n/a', tone: (input.gamma?.theoreticalAtmVol ?? 0) >= (input.gamma?.realizedVol20 ?? 999) ? 'alert' : 'neutral' },
        { label: 'Skew', value: input.gamma?.downsideSkew != null ? `${input.gamma.downsideSkew}` : 'n/a', tone: (input.gamma?.downsideSkew ?? 0) > 1.5 ? 'alert' : 'neutral' },
        { label: 'Greek QA', value: input.gamma?.greekAgreementScore != null ? `${input.gamma.greekAgreementScore}` : 'n/a', tone: input.gamma?.greekAgreementScore != null && input.gamma.greekAgreementScore >= 90 ? 'bullish' : 'neutral' },
        { label: 'IV Solver', value: input.gamma?.ivSolverMethod ?? 'n/a', tone: input.gamma?.ivSolverConverged ? 'bullish' : 'alert' },
        { label: 'Vol Zone', value: input.gamma?.volatilityZone ?? 'unknown', tone: input.gamma?.volatilityZone?.includes('expansion') ? 'alert' : 'neutral' },
        { label: 'Smile Fit', value: input.gamma?.surfaceFit?.quality ?? 'n/a', tone: input.gamma?.surfaceFit?.quality === 'tight' ? 'bullish' : input.gamma?.surfaceFit?.quality === 'loose' ? 'alert' : 'neutral' },
        { label: 'Strategy', value: input.snapshots?.featuredStrategy ?? 'n/a', tone: input.snapshots?.featuredStrategy?.includes('Straddle') || input.snapshots?.featuredStrategy?.includes('Strangle') ? 'alert' : 'neutral' },
        { label: 'Exercise', value: input.snapshots?.americanDiagnostics?.put?.exerciseStyle ?? 'n/a', tone: input.snapshots?.americanDiagnostics?.put?.exerciseStyle === 'exercise-active' ? 'alert' : 'neutral' },
      ],
      charts: input.gamma
        ? [
          {
            label: 'Vol Stack',
            points: [
              input.gamma.realizedVol60 ?? 0,
              input.gamma.realizedVol20 ?? 0,
              input.gamma.volPercentile ?? 0,
              Math.max((input.gamma.rangeExpansion ?? 0) * 25, 0),
            ],
            tone: input.gamma.netGamma != null && input.gamma.netGamma < 0 ? 'alert' : 'bullish',
          },
        ]
        : [],
      bullets: [
        `Source mode: ${input.gamma?.mode ?? input.snapshots?.mode ?? 'unknown'}.`,
        `Spot ${input.gamma?.price ?? 'n/a'} | ATR14 ${input.gamma?.atr14 ?? 'n/a'} | RV20 ${input.gamma?.realizedVol20 ?? 'n/a'}% | ATM IV ${input.gamma?.theoreticalAtmVol ?? input.snapshots?.theoreticalAtmVol ?? 'n/a'}% | skew ${input.gamma?.downsideSkew ?? input.snapshots?.downsideSkew ?? 'n/a'}.`,
        `ATM greeks delta ${input.snapshots?.atmGreeks?.delta ?? input.gamma?.atmGreeks?.delta ?? 'n/a'} | gamma ${input.snapshots?.atmGreeks?.gamma ?? input.gamma?.atmGreeks?.gamma ?? 'n/a'} | theta ${input.snapshots?.atmGreeks?.theta ?? input.gamma?.atmGreeks?.theta ?? 'n/a'} | vega ${input.snapshots?.atmGreeks?.vega ?? input.gamma?.atmGreeks?.vega ?? 'n/a'} | rho ${input.snapshots?.atmGreeks?.rho ?? input.gamma?.atmGreeks?.rho ?? 'n/a'}.`,
        `Greeks cross-check ${input.snapshots?.greekAgreementLabel ?? input.gamma?.greekAgreementLabel ?? 'unknown'} (${input.snapshots?.greekAgreementScore ?? input.gamma?.greekAgreementScore ?? 'n/a'}) | solver ${input.snapshots?.ivSolverMethod ?? input.gamma?.ivSolverMethod ?? 'unknown'} in ${input.snapshots?.ivSolverIterations ?? input.gamma?.ivSolverIterations ?? 'n/a'} steps.`,
        `Expected move 1W ${input.gamma?.expectedMove1w ?? input.snapshots?.expectedMove1w ?? 'n/a'} | 1M ${input.gamma?.expectedMove1m ?? input.snapshots?.expectedMove1m ?? 'n/a'} | corridor ${input.gamma?.dealerCorridorWidth ?? 'n/a'}.`,
        `Smile fit ${input.snapshots?.surfaceFit?.quality ?? input.gamma?.surfaceFit?.quality ?? 'unknown'} | rmse ${input.snapshots?.surfaceFit?.rmse ?? input.gamma?.surfaceFit?.rmse ?? 'n/a'} | RR25 ${input.snapshots?.surfaceFit?.riskReversal1m ?? input.gamma?.surfaceFit?.riskReversal1m ?? 'n/a'} | BF25 ${input.snapshots?.surfaceFit?.butterfly1m ?? input.gamma?.surfaceFit?.butterfly1m ?? 'n/a'}.`,
        input.snapshots?.featuredStrategySummary ?? 'Options strategy package view unavailable.',
        input.snapshots?.americanDiagnostics?.put
          ? `American lens: put ${input.snapshots.americanDiagnostics.put.exerciseStyle} (${input.snapshots.americanDiagnostics.put.earlyExercisePremium ?? 'n/a'} premium edge, ${input.snapshots.americanDiagnostics.put.premiumRatioPct ?? 'n/a'}% of euro value) | call ${input.snapshots?.americanDiagnostics?.call?.exerciseStyle ?? 'n/a'}.`
          : 'American-style exercise diagnostics unavailable.',
        input.snapshots?.shockLadder?.length
          ? `Shock ladder: ${input.snapshots.shockLadder.slice(0, 4).map((item) => `${item.label} ${item.pnl != null ? (item.pnl >= 0 ? '+' : '') + item.pnl.toFixed(2) : 'n/a'}`).join(' / ')}.`
          : 'Shock ladder unavailable.',
        `Model ${input.gamma?.pricingModel ?? input.snapshots?.pricingModel ?? 'unknown'}${(input.gamma?.chainAvailable ?? input.snapshots?.chainAvailable) ? ` | chain proxy ${input.gamma?.chainProxyUnderlying ?? input.snapshots?.chainProxyUnderlying ?? 'available'}` : ''}.`,
        ...(input.snapshots?.snapshots ?? []).slice(0, 2).map((item) => `${item.tenor}: ${item.bias} / exp move ${item.expectedMove ?? 'n/a'}`),
        input.snapshots?.greekAgreementNote ?? input.gamma?.greekAgreementNote ?? 'ATM greeks and IV inversion diagnostics are unavailable.',
        input.gamma?.sourceLabel ?? input.snapshots?.sourceLabel ?? 'Treat options structure as market context, not certainty.',
      ],
      table: {
        columns: ['Tenor', 'ATM IV', 'Put Wing', 'Call Wing', 'Skew', 'Move'],
        rows: (input.snapshots?.ivSurface ?? []).slice(0, 5).map((item, index) => [
          item.tenor,
          item.atmVol != null ? `${item.atmVol.toFixed(1)}%` : 'n/a',
          item.putWingVol != null ? `${item.putWingVol.toFixed(1)}%` : 'n/a',
          item.callWingVol != null ? `${item.callWingVol.toFixed(1)}%` : 'n/a',
          item.skew != null ? `${item.skew.toFixed(2)}` : 'n/a',
          input.snapshots?.snapshots?.[index]?.expectedMove != null ? String(input.snapshots.snapshots[index]!.expectedMove) : 'n/a',
        ]),
      },
      alerts: input.gamma?.keyStrikes?.length
        ? [
          `Key strikes clustered near ${input.gamma.keyStrikes.slice(0, 3).join(', ')}; expect pinning or squeeze behavior around those zones.`,
          ...(input.snapshots?.featuredStrategy ? [`Featured package: ${input.snapshots.featuredStrategy}.`] : []),
          ...(input.snapshots?.strategyPackages?.length ? [`Strategy stack: ${input.snapshots.strategyPackages.slice(0, 3).map((item) => item.name).join(' / ')}.`] : []),
          ...(input.snapshots?.shockLadder?.length ? [`Best positive shock: ${[...input.snapshots.shockLadder].sort((left, right) => (right.pnl ?? -999) - (left.pnl ?? -999))[0]?.label ?? 'n/a'}.`] : []),
          ...(input.gamma.topStrikes?.length ? [`Top strike interest: ${input.gamma.topStrikes.map((item) => `${item.kind} ${item.strike}`).join(' / ')}.`] : []),
          input.gamma.sourceLabel ?? 'Synthetic proxy mode.',
        ]
        : (input.gamma?.sourceLabel ? [input.gamma.sourceLabel] : []),
      status: input.gamma ? 'mixed' : 'stale',
    },
    'dealer-pressure': {
      conclusion: input.dealer?.conclusion ?? 'Dealer pressure unavailable.',
      metrics: [
        { label: 'Bias', value: input.dealer?.bias ?? 'unknown', tone: input.dealer?.bias?.includes('expansion') ? 'alert' : 'neutral' },
        { label: 'Pressure', value: input.dealer?.pressureScore != null ? `${input.dealer.pressureScore}` : 'n/a', tone: (input.dealer?.pressureScore ?? 0) >= 65 ? 'alert' : 'neutral' },
        { label: 'Expansion', value: input.dealer?.expansionRisk ?? 'unknown', tone: input.dealer?.expansionRisk === 'high' ? 'alert' : 'neutral' },
        { label: 'RV20', value: input.dealer?.realizedVol20 != null ? `${input.dealer.realizedVol20}%` : 'n/a', tone: (input.dealer?.realizedVol20 ?? 0) >= (input.dealer?.realizedVol60 ?? 999) ? 'alert' : 'neutral' },
        { label: 'ATM IV', value: input.dealer?.theoreticalAtmVol != null ? `${input.dealer.theoreticalAtmVol}%` : 'n/a', tone: (input.dealer?.theoreticalAtmVol ?? 0) >= (input.dealer?.realizedVol20 ?? 999) ? 'alert' : 'neutral' },
        { label: 'Greek QA', value: input.dealer?.greekAgreementScore != null ? `${input.dealer.greekAgreementScore}` : 'n/a', tone: input.dealer?.greekAgreementScore != null && input.dealer?.greekAgreementScore >= 90 ? 'bullish' : 'neutral' },
        { label: 'Smile Fit', value: input.dealer?.surfaceFit?.quality ?? 'n/a', tone: input.dealer?.surfaceFit?.quality === 'tight' ? 'bullish' : input.dealer?.surfaceFit?.quality === 'loose' ? 'alert' : 'neutral' },
      ],
      charts: input.dealer
        ? [
          {
            label: 'Pressure Stack',
            points: [
              input.dealer.realizedVol60 ?? 0,
              input.dealer.realizedVol20 ?? 0,
              input.dealer.volPercentile ?? 0,
              input.dealer.pressureScore ?? 0,
            ],
            tone: input.dealer.pressureScore != null && input.dealer.pressureScore >= 65 ? 'alert' : 'neutral',
          },
        ]
        : [],
      bullets: [
        `Bias: ${input.dealer?.bias ?? 'unknown'}.`,
        `Structure source: ${input.dealer?.sourceSymbol ?? input.snapshots?.sourceSymbol ?? input.dealer?.symbol ?? 'n/a'}${input.dealer?.chainAvailable ? ` | chain proxy ${input.dealer.chainProxyUnderlying ?? 'available'}` : ''}.`,
        `Price ${input.dealer?.price ?? 'n/a'} | ATR14 ${input.dealer?.atr14 ?? 'n/a'} | range expansion ${input.dealer?.rangeExpansion ?? 'n/a'} | tick momentum ${input.dealer?.tickMomentum ?? 'n/a'}%.`,
        `Model ${input.dealer?.pricingModel ?? input.snapshots?.pricingModel ?? 'unknown'} | ATM IV ${input.dealer?.theoreticalAtmVol ?? 'n/a'}% | skew ${input.dealer?.downsideSkew ?? 'n/a'} | 1W move ${input.dealer?.expectedMove1w ?? 'n/a'}.`,
        `ATM greeks delta ${input.dealer?.atmGreeks?.delta ?? 'n/a'} | gamma ${input.dealer?.atmGreeks?.gamma ?? 'n/a'} | theta ${input.dealer?.atmGreeks?.theta ?? 'n/a'} | vega ${input.dealer?.atmGreeks?.vega ?? 'n/a'} | rho ${input.dealer?.atmGreeks?.rho ?? 'n/a'}.`,
        `Solver ${input.dealer?.ivSolverMethod ?? 'unknown'} in ${input.dealer?.ivSolverIterations ?? 'n/a'} steps | bounded ${input.dealer?.ivSolverBounded ? 'yes' : 'no'} | limited IV ${input.dealer?.limitedIv ?? 'n/a'}%.`,
        `Smile fit ${input.dealer?.surfaceFit?.quality ?? 'unknown'} | rmse ${input.dealer?.surfaceFit?.rmse ?? 'n/a'} | RR25 ${input.dealer?.surfaceFit?.riskReversal1m ?? 'n/a'} | BF25 ${input.dealer?.surfaceFit?.butterfly1m ?? 'n/a'} | convexity ${input.dealer?.surfaceFit?.convexity ?? 'n/a'}.`,
        input.dealer?.greekAgreementNote ?? 'Analytical and numerical Greeks are not yet available.',
        input.dealer?.sourceLabel ?? 'Dealer flow matters most around crowded strikes and catalyst windows.',
      ],
      table: {
        columns: ['Lens', 'Reading'],
        rows: [
          ['Symbol', input.dealer?.symbol ?? input.snapshots?.symbol ?? 'n/a'],
          ['Source', input.dealer?.sourceSymbol ?? input.snapshots?.sourceSymbol ?? 'n/a'],
          ['Bias', input.dealer?.bias ?? 'unknown'],
          ['Expansion Risk', input.dealer?.expansionRisk ?? 'unknown'],
          ['Interest', input.dealer?.totalInterestProxy != null ? String(input.dealer.totalInterestProxy) : 'n/a'],
          ['Call/Put', input.dealer?.callOpenInterestProxy != null && input.dealer?.putOpenInterestProxy != null ? `${input.dealer.callOpenInterestProxy} / ${input.dealer.putOpenInterestProxy}` : 'n/a'],
          ['Greek QA', input.dealer?.greekAgreementScore != null ? `${input.dealer.greekAgreementScore} ${input.dealer.greekAgreementLabel ?? ''}`.trim() : 'n/a'],
          ['Solver', input.dealer?.ivSolverMethod != null ? `${input.dealer.ivSolverMethod} / ${input.dealer.ivSolverIterations ?? 'n/a'} steps` : 'n/a'],
        ],
      },
      alerts: input.dealer?.sourceLabel ? [input.dealer.sourceLabel] : [],
      status: input.dealer ? 'mixed' : 'stale',
    },
  };
}
