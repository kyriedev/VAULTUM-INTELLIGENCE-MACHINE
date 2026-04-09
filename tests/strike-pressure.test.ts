import assert from 'node:assert/strict';

import { interpretStrikePressureFromOcr, interpretStrikePressureFromRows } from '../server/vaultum/options/v1/_strike-pressure.ts';

export function runStrikePressureTests(): void {
  {
    const response = interpretStrikePressureFromRows({
      symbol: 'XAUUSD',
      spotPrice: 4752,
      focusStrike: 4760,
      rows: [
        { strike: 4750, kind: 'put', price: 22, delta: -0.46, openInterest: 1400, totalVolume: 220 },
        { strike: 4750, kind: 'call', price: 19, delta: 0.39, openInterest: 1380, totalVolume: 210 },
        { strike: 4760, kind: 'put', price: 31, delta: -0.61, openInterest: 2600, totalVolume: 430 },
        { strike: 4760, kind: 'call', price: 17, delta: 0.33, openInterest: 2250, totalVolume: 390 },
        { strike: 4770, kind: 'put', price: 29, delta: -0.57, openInterest: 2100, totalVolume: 360 },
        { strike: 4770, kind: 'call', price: 18, delta: 0.35, openInterest: 2010, totalVolume: 310 },
      ],
    });

    assert.equal(response.sourceMode, 'structured-input');
    assert.equal(response.focusStrike, 4760);
    assert.equal(response.focusReading?.pressureRead, 'bearish pressure zone');
    assert.equal(response.focusReading?.levelRole, 'resistance candidate');
    assert.ok((response.focusReading?.bearishScore ?? 0) > (response.focusReading?.bullishScore ?? 0));
    assert.ok((response.focusReading?.confidence ?? 0) >= 60);
  }

  {
    const response = interpretStrikePressureFromRows({
      symbol: 'US30',
      spotPrice: 39110,
      focusStrike: 39100,
      rows: [
        { strike: 39000, kind: 'put', price: 110, delta: -0.31, openInterest: 1800, totalVolume: 140 },
        { strike: 39000, kind: 'call', price: 126, delta: 0.37, openInterest: 1840, totalVolume: 160 },
        { strike: 39100, kind: 'put', price: 102, delta: -0.28, openInterest: 2500, totalVolume: 220 },
        { strike: 39100, kind: 'call', price: 149, delta: 0.44, openInterest: 2720, totalVolume: 280 },
        { strike: 39200, kind: 'put', price: 96, delta: -0.24, openInterest: 1900, totalVolume: 160 },
        { strike: 39200, kind: 'call', price: 142, delta: 0.39, openInterest: 2010, totalVolume: 190 },
      ],
    });

    assert.equal(response.focusReading?.pressureRead, 'bullish pressure zone');
    assert.equal(response.focusReading?.levelRole, 'support candidate');
    assert.ok((response.focusReading?.bullishScore ?? 0) > (response.focusReading?.bearishScore ?? 0));
  }

  {
    const structured = interpretStrikePressureFromRows({
      symbol: 'XAUUSD',
      spotPrice: 4761.3,
      focusStrike: 4761.3,
      rows: [
        { strike: 4761.3, kind: 'put', price: 8.9, delta: -0.54, openInterest: 1200, totalVolume: 180 },
        { strike: 4761.3, kind: 'call', price: 5.4, delta: 0.41, openInterest: 1180, totalVolume: 170 },
      ],
    });
    const ocr = interpretStrikePressureFromOcr({
      symbol: 'XAUUSD',
      spotPrice: 4761.3,
      focusStrike: 4761.3,
      ocrText: `
        Spot: 4761.3
        Call Price | Call Delta | Strike | Put Delta | Put Price
        5.4 | 0.41 | 4761.3 | -0.54 | 8.9
      `,
    });

    assert.equal(ocr.sourceMode, 'ocr-heuristic');
    assert.equal(ocr.focusReading?.pressureRead, 'bearish pressure zone');
    assert.ok((ocr.focusReading?.confidence ?? 0) < (structured.focusReading?.confidence ?? 100));
    assert.ok(ocr.notes.some((note) => /heuristic/i.test(note)));
  }
}
