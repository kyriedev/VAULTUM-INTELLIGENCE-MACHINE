import type { PanelSnapshot } from '@/types';

export function buildPredictionPanels(input: {
  prediction?: { markets?: Array<{ title: string; probability: number; volume: number; url: string }>; unavailable?: boolean } | null;
}): Record<string, PanelSnapshot> {
  const markets = input.prediction?.markets ?? [];
  return {
    prediction: {
      conclusion: markets.length
        ? `Prediction markets show ${markets[0].title} at ${(markets[0].probability * 100).toFixed(1)}% with volume ${markets[0].volume.toFixed(0)}.`
        : 'Prediction-market context unavailable or blocked; treat crowd-belief layer as missing.',
      metrics: [
        { label: 'Top Odds', value: markets[0] ? `${(markets[0].probability * 100).toFixed(1)}%` : 'n/a', tone: markets[0] && markets[0].probability >= 0.6 ? 'alert' : 'neutral' },
        { label: 'Top Volume', value: markets[0] ? markets[0].volume.toFixed(0) : 'n/a', tone: 'neutral' },
        { label: 'Markets', value: String(markets.length), tone: markets.length ? 'bullish' : 'alert' },
      ],
      bullets: markets.slice(0, 3).map((item) => `${item.title} ${(item.probability * 100).toFixed(1)}% vol ${item.volume.toFixed(0)}`),
      table: {
        columns: ['Market', 'Probability', 'Volume'],
        rows: markets.slice(0, 5).map((item) => [item.title, `${(item.probability * 100).toFixed(1)}%`, item.volume.toFixed(0)]),
      },
      alerts: input.prediction?.unavailable ? ['Prediction-market crowd-belief layer is unavailable; do not infer consensus from absence of data.'] : [],
      status: markets.length ? 'mixed' : 'stale',
    },
  };
}
