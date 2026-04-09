import { fetchYahooChart, type YahooNormalizedCandle } from '../../../_shared/yahoo';
import { ASSET_SYMBOL_MAP } from './rules';
import { clamp, minutesAgo } from './helpers';
import type { ImpactAssessment, MarketReactionValidation, XImpactDirection, XMarketAsset } from './types';

type AssetChart = {
  asset: XMarketAsset;
  candles: YahooNormalizedCandle[];
};

function pickPreEvent(candles: YahooNormalizedCandle[], eventTs: number): YahooNormalizedCandle | null {
  for (let index = candles.length - 1; index >= 0; index -= 1) {
    const candle = candles[index];
    if (candle && candle.timestamp * 1000 <= eventTs) return candle;
  }
  return candles[0] ?? null;
}

function pickAfterWindow(candles: YahooNormalizedCandle[], targetTs: number): YahooNormalizedCandle | null {
  return candles.find((candle) => candle.timestamp * 1000 >= targetTs) ?? candles[candles.length - 1] ?? null;
}

function pctMove(base: YahooNormalizedCandle | null, next: YahooNormalizedCandle | null): number | null {
  if (!base || !next || !base.close || !next.close) return null;
  return Number((((next.close - base.close) / base.close) * 100).toFixed(3));
}

function aligned(direction: XImpactDirection, move: number | null): boolean | null {
  if (direction === 'mixed' || move == null) return null;
  if (direction === 'bullish') return move > 0.05;
  return move < -0.05;
}

async function loadCharts(assets: XMarketAsset[], eventTimestamp: string): Promise<Map<XMarketAsset, AssetChart>> {
  const ageMinutes = minutesAgo(eventTimestamp);
  const range = ageMinutes <= 1440 ? '1d' : '5d';
  const interval = ageMinutes <= 1440 ? '1m' : '5m';
  const entries = await Promise.all(
    [...new Set(assets)]
      .map(async (asset) => {
        const symbol = ASSET_SYMBOL_MAP[asset];
        if (!symbol) return null;
        const result = await fetchYahooChart(symbol, range, interval).catch(() => null);
        if (!result?.candles?.length) return null;
        return [asset, { asset, candles: result.candles }] as const;
      }),
  );
  return new Map(entries.filter((entry): entry is readonly [XMarketAsset, AssetChart] => Boolean(entry)));
}

export async function validateEventImpact(input: {
  eventTimestamp: string;
  impactAssessment: ImpactAssessment;
  override?: MarketReactionValidation | null;
}): Promise<MarketReactionValidation> {
  if (input.override) return input.override;

  const assets = input.impactAssessment.impactedAssets.slice(0, 5).map((item) => item.asset);
  if (!assets.length) {
    return {
      reactionValidation: 'not_confirmed',
      observedMoves: [],
      crossAssetAlignmentScore: 0,
      explanation: 'No impacted assets were mapped, so live validation could not run.',
    };
  }

  const charts = await loadCharts(assets, input.eventTimestamp);
  const eventTs = new Date(input.eventTimestamp).getTime();
  const observedMoves = input.impactAssessment.impactedAssets.slice(0, 5).map((impact) => {
    const chart = charts.get(impact.asset);
    const base = chart ? pickPreEvent(chart.candles, eventTs) : null;
    const one = chart ? pickAfterWindow(chart.candles, eventTs + 60_000) : null;
    const five = chart ? pickAfterWindow(chart.candles, eventTs + (5 * 60_000)) : null;
    const fifteen = chart ? pickAfterWindow(chart.candles, eventTs + (15 * 60_000)) : null;
    const sixty = chart ? pickAfterWindow(chart.candles, eventTs + (60 * 60_000)) : null;
    const oneMinuteMovePct = pctMove(base, one);
    const fiveMinuteMovePct = pctMove(base, five);
    const fifteenMinuteMovePct = pctMove(base, fifteen);
    const sixtyMinuteMovePct = pctMove(base, sixty);
    const alignState =
      aligned(impact.directionBias, fiveMinuteMovePct)
      ?? aligned(impact.directionBias, fifteenMinuteMovePct)
      ?? aligned(impact.directionBias, sixtyMinuteMovePct);

    return {
      asset: impact.asset,
      expectedDirection: impact.directionBias,
      oneMinuteMovePct,
      fiveMinuteMovePct,
      fifteenMinuteMovePct,
      sixtyMinuteMovePct,
      aligned: alignState,
    };
  });

  const alignedCount = observedMoves.filter((item) => item.aligned === true).length;
  const contradictedCount = observedMoves.filter((item) => item.aligned === false).length;
  const meaningfulCount = observedMoves.filter((item) => item.aligned != null).length || 1;
  const crossAssetAlignmentScore = clamp(Number((((alignedCount - contradictedCount) / meaningfulCount) * 50 + 50).toFixed(1)), 0, 100);
  const reactionValidation =
    contradictedCount >= Math.max(2, alignedCount + 1) ? 'contradictory'
      : alignedCount >= Math.max(2, Math.ceil(meaningfulCount * 0.6)) ? 'confirmed'
        : alignedCount >= 1 ? 'partial'
          : 'not_confirmed';

  return {
    reactionValidation,
    observedMoves,
    crossAssetAlignmentScore,
    explanation:
      reactionValidation === 'confirmed'
        ? 'Multiple linked assets reacted in the expected direction after the event.'
        : reactionValidation === 'partial'
          ? 'Some assets confirmed the event map, but cross-asset alignment is incomplete.'
          : reactionValidation === 'contradictory'
            ? 'Observed market behavior is fighting the inferred event map.'
            : 'Live market reaction is too weak or too mixed to confirm the event yet.',
  };
}
