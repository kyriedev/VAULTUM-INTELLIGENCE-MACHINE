import assert from 'node:assert/strict';

import { buildChartLogicFromOhlcBars } from '../server/vaultum/analytics/v1/get-chart-logic.ts';

type Candle = [string, number, number, number, number, number];

function makeTrendSeries(direction: 'up' | 'down', withPullback = false): Candle[] {
  const bars: Candle[] = [];
  let close = direction === 'up' ? 100 : 200;
  const start = Date.now() - (30 * 60 * 1000);

  for (let index = 0; index < 30; index += 1) {
    const open = close;
    const drift = direction === 'up' ? 0.8 : -0.8;
    const pullback = withPullback && index > 18 && index < 24 ? (direction === 'up' ? -0.45 : 0.45) : 0;
    close = open + drift + pullback;
    const high = Math.max(open, close) + 0.35;
    const low = Math.min(open, close) - 0.3;
    bars.push([
      new Date(start + (index * 60_000)).toISOString(),
      open,
      high,
      low,
      close,
      1000 + (index * 10),
    ]);
  }

  return bars;
}

function makeRangeSeries(): Candle[] {
  const bars: Candle[] = [];
  const start = Date.now() - (24 * 60 * 1000);

  for (let index = 0; index < 24; index += 1) {
    const base = 150 + ((index % 2 === 0) ? 1.2 : -1.2);
    bars.push([
      new Date(start + (index * 60_000)).toISOString(),
      base,
      base + 0.8,
      base - 0.8,
      150 + ((index % 3 === 0) ? 0.2 : -0.2),
      800 + (index * 8),
    ]);
  }

  return bars;
}

export function runChartLogicTests(): void {
  {
    const logic = buildChartLogicFromOhlcBars({
      bars: makeTrendSeries('up', true),
      market: 'XAUUSD',
      timeframe: '1h',
    });

    assert.equal(logic.bias, 'bullish');
    assert.ok(['continuation', 'reversal'].includes(logic.setupType));
    assert.ok(logic.actionLines.some((line) => /Plot zone/i.test(line)));
    assert.notEqual(logic.bestEntryPrice, 'n/a');
  }

  {
    const logic = buildChartLogicFromOhlcBars({
      bars: makeRangeSeries(),
      market: 'US30',
      timeframe: '15m',
    });

    assert.equal(logic.setupType, 'no-trade');
    assert.equal(logic.actionLines[0], 'No trade.');
  }
}
