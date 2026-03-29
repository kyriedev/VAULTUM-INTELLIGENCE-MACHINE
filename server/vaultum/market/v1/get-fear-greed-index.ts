import { cacheKey } from '../../../_shared/cache-keys';
import { fetchJson } from '../../../_shared/fetch-json';
import { getCachedOrCompute } from '../../../_shared/redis';
import { getLiquidityStress } from '../../liquidity/v1/get-liquidity-stress';
import { getCrossAssetRegime } from '../../liquidity/v1/get-cross-asset-regime';
import { getMacroSignals } from '../../macro/v1/get-macro-signals';
import { getSectorSummary } from './get-sector-summary';

type YahooChart = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
      };
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
  };
};

type SentimentCategory = {
  key: string;
  label: string;
  score: number;
  weight: number;
  contribution: number;
  detail: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0.5;
  if (max === min) return 0.5;
  return clamp((value - min) / (max - min), 0, 1);
}

function scoreFromRange(value: number, min: number, max: number, inverse = false): number {
  const scaled = normalize(value, min, max) * 100;
  return round(inverse ? 100 - scaled : scaled, 1);
}

function closesFromChart(chart: YahooChart | null): number[] {
  return chart?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((value): value is number => value != null) ?? [];
}

function latest(prices: number[]): number | null {
  return prices.length ? prices[prices.length - 1]! : null;
}

function roc(prices: number[], lookback: number): number | null {
  if (prices.length < lookback + 1) return null;
  const current = prices[prices.length - 1]!;
  const prior = prices[prices.length - 1 - lookback]!;
  if (!prior) return null;
  return ((current - prior) / prior) * 100;
}

function sma(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const sample = prices.slice(-period);
  return sample.reduce((sum, value) => sum + value, 0) / sample.length;
}

function labelForScore(score: number): string {
  if (score <= 20) return 'Extreme Fear';
  if (score <= 40) return 'Fear';
  if (score <= 60) return 'Neutral';
  if (score <= 80) return 'Greed';
  return 'Extreme Greed';
}

function buildCategory(
  key: string,
  label: string,
  weight: number,
  score: number,
  detail: string,
): SentimentCategory {
  const safeScore = round(clamp(score, 0, 100), 1);
  return {
    key,
    label,
    weight,
    score: safeScore,
    contribution: round((safeScore * weight) / 100, 2),
    detail,
  };
}

export async function getFearGreedIndex(): Promise<any> {
  return getCachedOrCompute(cacheKey('market', 'fear-greed'), async () => {
    const yahooBase = 'https://query1.finance.yahoo.com/v8/finance/chart';
    const [
      spxChart,
      ndxChart,
      vixChart,
      hygChart,
      tltChart,
      dxyChart,
      goldChart,
      sectorSummary,
      macroSignals,
      liquidityStress,
      crossAssetRegime,
    ] = await Promise.all([
      fetchJson<YahooChart>(`${yahooBase}/^GSPC?range=6mo&interval=1d`),
      fetchJson<YahooChart>(`${yahooBase}/^IXIC?range=6mo&interval=1d`),
      fetchJson<YahooChart>(`${yahooBase}/^VIX?range=6mo&interval=1d`),
      fetchJson<YahooChart>(`${yahooBase}/HYG?range=6mo&interval=1d`),
      fetchJson<YahooChart>(`${yahooBase}/TLT?range=6mo&interval=1d`),
      fetchJson<YahooChart>(`${yahooBase}/DX-Y.NYB?range=6mo&interval=1d`),
      fetchJson<YahooChart>(`${yahooBase}/GC=F?range=6mo&interval=1d`),
      getSectorSummary(),
      getMacroSignals(),
      getLiquidityStress(),
      getCrossAssetRegime(),
    ]);

    const spx = closesFromChart(spxChart);
    const ndx = closesFromChart(ndxChart);
    const vix = closesFromChart(vixChart);
    const hyg = closesFromChart(hygChart);
    const tlt = closesFromChart(tltChart);
    const dxy = closesFromChart(dxyChart);
    const gold = closesFromChart(goldChart);

    const spxLast = latest(spx) ?? 0;
    const ndxLast = latest(ndx) ?? 0;
    const vixLast = latest(vix) ?? 0;
    const dxyLast = latest(dxy) ?? 0;
    const goldLast = latest(gold) ?? 0;

    const spxRoc20 = roc(spx, 20) ?? 0;
    const ndxRoc20 = roc(ndx, 20) ?? 0;
    const vixRoc5 = roc(vix, 5) ?? 0;
    const dxyRoc20 = roc(dxy, 20) ?? 0;
    const goldRoc20 = roc(gold, 20) ?? 0;
    const hygRoc20 = roc(hyg, 20) ?? 0;
    const tltRoc20 = roc(tlt, 20) ?? 0;

    const spxSma50 = sma(spx, 50) ?? spxLast;
    const ndxSma50 = sma(ndx, 50) ?? ndxLast;
    const breadthPositiveCount = (sectorSummary?.sectors ?? []).filter((sector: { change: number }) => sector.change >= 0).length;
    const breadthTotal = (sectorSummary?.sectors ?? []).length || 1;
    const breadthPct = (breadthPositiveCount / breadthTotal) * 100;

    const liquidityText = String(liquidityStress?.conclusion ?? '').toLowerCase();
    const crossAssetText = String(crossAssetRegime?.regime ?? '').toLowerCase();
    const macroText = String(macroSignals?.regime ?? '').toLowerCase();

    const volatilityScore = (scoreFromRange(vixLast, 12, 35, true) * 0.7) + (scoreFromRange(vixRoc5, -20, 35, true) * 0.3);
    const trendScore = (
      ((spxLast >= spxSma50 ? 70 : 30) + scoreFromRange(spxRoc20, -12, 12)) * 0.55 +
      ((ndxLast >= ndxSma50 ? 70 : 30) + scoreFromRange(ndxRoc20, -16, 16)) * 0.45
    ) / 2;
    const breadthScore = scoreFromRange(breadthPct, 20, 85);
    const momentumScore = scoreFromRange((spxRoc20 + ndxRoc20) / 2, -10, 12);
    const creditScore = scoreFromRange((hygRoc20 - tltRoc20), -8, 8);
    const dollarLiquidityScore = scoreFromRange(dxyRoc20, -5, 6, true);
    const safeHavenScore = scoreFromRange((goldRoc20 - spxRoc20), -12, 12, true);

    const liquidityAdjustment =
      liquidityText.includes('elevated')
        ? 28
        : liquidityText.includes('moderate')
          ? 48
          : 68;
    const macroAdjustment =
      macroText.includes('risk-on')
        ? 72
        : macroText.includes('risk-off')
          ? 28
          : 50;
    const crossAssetAdjustment =
      crossAssetText.includes('risk-on')
        ? 72
        : crossAssetText.includes('fragile') || crossAssetText.includes('risk-off')
          ? 30
          : 50;

    const categories: SentimentCategory[] = [
      buildCategory('volatility', 'Volatility', 18, volatilityScore, `VIX ${round(vixLast, 2)} with 5d ROC ${round(vixRoc5, 2)}%.`),
      buildCategory('trend', 'Trend', 16, trendScore, `SPX vs 50d ${round(spxLast - spxSma50, 2)} and NDX vs 50d ${round(ndxLast - ndxSma50, 2)}.`),
      buildCategory('breadth', 'Breadth', 14, breadthScore, `${breadthPositiveCount}/${breadthTotal} tracked sectors are positive.`),
      buildCategory('momentum', 'Momentum', 12, momentumScore, `SPX 20d ROC ${round(spxRoc20, 2)}%, NDX 20d ROC ${round(ndxRoc20, 2)}%.`),
      buildCategory('credit', 'Credit', 12, creditScore, `HYG/TLT relative ROC ${round(hygRoc20 - tltRoc20, 2)}.`),
      buildCategory('dollar-liquidity', 'Dollar Liquidity', 10, dollarLiquidityScore, `DXY 20d ROC ${round(dxyRoc20, 2)}%.`),
      buildCategory('safe-haven', 'Safe Haven', 8, safeHavenScore, `Gold 20d ROC ${round(goldRoc20, 2)}% versus SPX ${round(spxRoc20, 2)}%.`),
      buildCategory('macro', 'Macro Regime', 5, macroAdjustment, `Macro regime reads ${macroSignals?.regime ?? 'unknown'}.`),
      buildCategory('cross-asset', 'Cross-Asset', 3, crossAssetAdjustment, `Cross-asset regime reads ${crossAssetRegime?.regime ?? 'unknown'}.`),
      buildCategory('liquidity-stress', 'Liquidity Stress', 2, liquidityAdjustment, `Liquidity engine reads ${liquidityStress?.conclusion ?? 'unknown'}.`),
    ];

    const compositeScore = round(categories.reduce((sum, category) => sum + category.contribution, 0), 1);
    const compositeLabel = labelForScore(compositeScore);
    const warnings: string[] = [];
    if (vixLast > 24) warnings.push(`VIX is elevated at ${round(vixLast, 2)}, which keeps broad risk sentiment fragile.`);
    if (Math.abs(spxRoc20 - goldRoc20) > 10) warnings.push('Gold and equities are moving far apart, which usually means macro stress is dominating one side of the tape.');
    if (breadthPct < 40) warnings.push('Sector breadth is thin enough to question index-level breakouts.');
    if (Math.abs(dollarLiquidityScore - momentumScore) > 25) warnings.push('Dollar/liquidity conditions disagree sharply with pure price momentum, so chase risk is higher.');

    return {
      generatedAt: new Date().toISOString(),
      compositeScore,
      compositeLabel,
      stance: compositeScore >= 60 ? 'risk-on' : compositeScore <= 40 ? 'risk-off' : 'mixed',
      sourceLabel: 'Vaultum live composite built from Yahoo market data, sector breadth, macro regime, and liquidity engines.',
      summary: `Vaultum sentiment reads ${compositeLabel.toLowerCase()} at ${compositeScore.toFixed(1)} with ${warnings.length ? 'important divergence warnings active' : 'no major structural divergence warning'}.`,
      categories,
      headerMetrics: {
        vix: round(vixLast, 2),
        spx20d: round(spxRoc20, 2),
        ndx20d: round(ndxRoc20, 2),
        dxy20d: round(dxyRoc20, 2),
        gold20d: round(goldRoc20, 2),
        creditSpreadProxy: round(hygRoc20 - tltRoc20, 2),
        breadthPct: round(breadthPct, 1),
      },
      warnings,
      regimes: {
        macro: macroSignals?.regime ?? 'unknown',
        liquidity: liquidityStress?.conclusion ?? 'unknown',
        crossAsset: crossAssetRegime?.regime ?? 'unknown',
      },
      marketSnapshot: {
        spx: round(spxLast, 2),
        ndx: round(ndxLast, 2),
        vix: round(vixLast, 2),
        dxy: round(dxyLast, 2),
        gold: round(goldLast, 2),
      },
    };
  }, 900);
}
