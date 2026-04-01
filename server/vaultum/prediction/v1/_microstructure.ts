export type PredictionOrderLevel = {
  price: number;
  size: number;
};

export type PredictionOrderBook = {
  bids: PredictionOrderLevel[];
  asks: PredictionOrderLevel[];
  timestamp?: number;
};

export type ExecutionEstimate = {
  simulatedContracts: number;
  price: number | null;
  filledAmount: number;
  fullyFilled: boolean;
  slippageBps: number | null;
};

export type PredictionMicrostructure = {
  bestBid: number | null;
  bestAsk: number | null;
  midPrice: number | null;
  spreadBps: number | null;
  bidDepth: number;
  askDepth: number;
  orderbookImbalance: number | null;
  liquidityGrade: 'deep' | 'tradable' | 'thin' | 'unavailable';
  executionBuy: ExecutionEstimate;
  executionSell: ExecutionEstimate;
  executionQualityScore: number;
};

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

export function normalizePolymarketOrderBook(raw: any): PredictionOrderBook {
  const bids = Array.isArray(raw?.bids)
    ? raw.bids
      .map((level: any) => ({
        price: Number.parseFloat(String(level?.price ?? '0')),
        size: Number.parseFloat(String(level?.size ?? '0')),
      }))
      .filter((level: PredictionOrderLevel) => Number.isFinite(level.price) && Number.isFinite(level.size) && level.size > 0)
      .sort((left: PredictionOrderLevel, right: PredictionOrderLevel) => right.price - left.price)
    : [];

  const asks = Array.isArray(raw?.asks)
    ? raw.asks
      .map((level: any) => ({
        price: Number.parseFloat(String(level?.price ?? '0')),
        size: Number.parseFloat(String(level?.size ?? '0')),
      }))
      .filter((level: PredictionOrderLevel) => Number.isFinite(level.price) && Number.isFinite(level.size) && level.size > 0)
      .sort((left: PredictionOrderLevel, right: PredictionOrderLevel) => left.price - right.price)
    : [];

  return {
    bids,
    asks,
    timestamp: Number.isFinite(Number(raw?.timestamp)) ? Number(raw.timestamp) : Date.now(),
  };
}

export function normalizeKalshiYesOrderBook(raw: any): PredictionOrderBook {
  const book = raw?.orderbook_fp;
  const bids = Array.isArray(book?.yes_dollars)
    ? book.yes_dollars
      .map((level: any) => ({
        price: Number.parseFloat(String(level?.[0] ?? '0')),
        size: Number.parseFloat(String(level?.[1] ?? '0')),
      }))
      .filter((level: PredictionOrderLevel) => Number.isFinite(level.price) && Number.isFinite(level.size) && level.size > 0)
      .sort((left: PredictionOrderLevel, right: PredictionOrderLevel) => right.price - left.price)
    : [];

  const asks = Array.isArray(book?.no_dollars)
    ? book.no_dollars
      .map((level: any) => ({
        price: round(1 - Number.parseFloat(String(level?.[0] ?? '0'))),
        size: Number.parseFloat(String(level?.[1] ?? '0')),
      }))
      .filter((level: PredictionOrderLevel) => Number.isFinite(level.price) && Number.isFinite(level.size) && level.size > 0)
      .sort((left: PredictionOrderLevel, right: PredictionOrderLevel) => left.price - right.price)
    : [];

  return {
    bids,
    asks,
    timestamp: Date.now(),
  };
}

export function getExecutionPriceDetailed(
  orderBook: PredictionOrderBook,
  side: 'buy' | 'sell',
  amount: number,
): ExecutionEstimate {
  if (!(amount > 0)) {
    return {
      simulatedContracts: amount,
      price: null,
      filledAmount: 0,
      fullyFilled: false,
      slippageBps: null,
    };
  }

  const levels = (side === 'buy' ? orderBook.asks : orderBook.bids)
    .filter((level) => level.size > 0)
    .slice()
    .sort((left, right) => side === 'buy' ? left.price - right.price : right.price - left.price);

  if (!levels.length) {
    return {
      simulatedContracts: amount,
      price: null,
      filledAmount: 0,
      fullyFilled: false,
      slippageBps: null,
    };
  }

  let remaining = amount;
  let totalCost = 0;
  let filledAmount = 0;

  for (const level of levels) {
    if (remaining <= 0) break;
    const fillSize = Math.min(remaining, level.size);
    totalCost += fillSize * level.price;
    filledAmount += fillSize;
    remaining -= fillSize;
  }

  const price = filledAmount > 0 ? totalCost / filledAmount : null;
  const fullyFilled = remaining <= 0.0000001;
  const bestReference = side === 'buy' ? levels[0]?.price ?? null : levels[0]?.price ?? null;
  let slippageBps: number | null = null;
  if (price != null && bestReference != null && bestReference > 0) {
    slippageBps = side === 'buy'
      ? ((price - bestReference) / bestReference) * 10000
      : ((bestReference - price) / bestReference) * 10000;
  }

  return {
    simulatedContracts: amount,
    price: price != null ? round(price) : null,
    filledAmount: round(filledAmount, 2),
    fullyFilled,
    slippageBps: slippageBps != null ? round(slippageBps, 1) : null,
  };
}

export function analyzePredictionMicrostructure(orderBook: PredictionOrderBook, simulatedContracts = 100): PredictionMicrostructure {
  const bestBid = orderBook.bids[0]?.price ?? null;
  const bestAsk = orderBook.asks[0]?.price ?? null;
  const midPrice = bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null;
  const spreadBps = bestBid != null && bestAsk != null && midPrice != null && midPrice > 0 && bestAsk >= bestBid
    ? round(((bestAsk - bestBid) / midPrice) * 10000, 1)
    : null;

  const bidDepth = round(orderBook.bids.reduce((sum, level) => sum + level.size, 0), 2);
  const askDepth = round(orderBook.asks.reduce((sum, level) => sum + level.size, 0), 2);
  const totalDepth = bidDepth + askDepth;
  const orderbookImbalance = totalDepth > 0
    ? round(((bidDepth - askDepth) / totalDepth) * 100, 1)
    : null;

  const executionBuy = getExecutionPriceDetailed(orderBook, 'buy', simulatedContracts);
  const executionSell = getExecutionPriceDetailed(orderBook, 'sell', simulatedContracts);
  const meanSlippageBps = [executionBuy.slippageBps, executionSell.slippageBps]
    .filter((value): value is number => value != null);
  const averageSlippage = meanSlippageBps.length
    ? meanSlippageBps.reduce((sum, value) => sum + value, 0) / meanSlippageBps.length
    : null;

  let liquidityGrade: PredictionMicrostructure['liquidityGrade'] = 'unavailable';
  if (bestBid != null && bestAsk != null) {
    if (executionBuy.fullyFilled && executionSell.fullyFilled && (spreadBps ?? 99999) <= 250 && totalDepth >= simulatedContracts * 4) {
      liquidityGrade = 'deep';
    } else if ((executionBuy.fullyFilled || executionSell.fullyFilled) && (spreadBps ?? 99999) <= 700) {
      liquidityGrade = 'tradable';
    } else {
      liquidityGrade = 'thin';
    }
  }

  const executionQualityScore = Math.max(0, Math.min(100,
    (executionBuy.fullyFilled ? 35 : (executionBuy.filledAmount / Math.max(simulatedContracts, 1)) * 35)
    + (executionSell.fullyFilled ? 35 : (executionSell.filledAmount / Math.max(simulatedContracts, 1)) * 35)
    + (averageSlippage == null ? 0 : Math.max(0, 30 - Math.min(30, averageSlippage / 20))),
  ));

  return {
    bestBid: bestBid != null ? round(bestBid) : null,
    bestAsk: bestAsk != null ? round(bestAsk) : null,
    midPrice: midPrice != null ? round(midPrice) : null,
    spreadBps,
    bidDepth,
    askDepth,
    orderbookImbalance,
    liquidityGrade,
    executionBuy,
    executionSell,
    executionQualityScore: round(executionQualityScore, 1),
  };
}
