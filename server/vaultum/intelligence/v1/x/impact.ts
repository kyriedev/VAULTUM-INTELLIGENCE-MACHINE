import { EVENT_IMPACT_RULES } from './rules';
import { clamp, formatDirectionLabel } from './helpers';
import { extractChannels } from './classification';
import type { ImpactAssessment, ParsedEvent, XMarketAsset } from './types';

function dynamicMacroImpacts(event: ParsedEvent, text: string): ImpactAssessment {
  const channels = extractChannels(text);
  const impacts: ImpactAssessment['impactedAssets'] = [];

  if (event.eventType === 'central_bank_comment' || event.eventType === 'inflation_signal' || event.eventType === 'growth_signal' || event.eventType === 'fiscal_signal') {
    if (channels.usdBullish || channels.yieldUp || channels.inflationHot) {
      impacts.push(
        { asset: 'DXY', directionBias: 'bullish', impactMagnitude: 68, horizon: 'instant', reason: 'Dollar and rates can firm under hawkish or inflationary surprises.', role: 'primary' },
        { asset: 'XAUUSD', directionBias: 'bearish', impactMagnitude: 62, horizon: 'intraday', reason: 'Gold can soften when real-rate and dollar pressure rises.', role: 'secondary' },
        { asset: 'US30', directionBias: 'bearish', impactMagnitude: 64, horizon: 'intraday', reason: 'Higher discount-rate pressure can weigh on equities.', role: 'secondary' },
        { asset: 'US10Y', directionBias: 'bullish', impactMagnitude: 66, horizon: 'instant', reason: 'Yields can rise when inflation or hawkishness is the transmission path.', role: 'primary' },
      );
    }
    if (channels.usdBearish || channels.yieldDown || channels.inflationCool) {
      impacts.push(
        { asset: 'DXY', directionBias: 'bearish', impactMagnitude: 64, horizon: 'instant', reason: 'Dollar can soften under dovish or cooling-inflation reads.', role: 'primary' },
        { asset: 'XAUUSD', directionBias: 'bullish', impactMagnitude: 58, horizon: 'intraday', reason: 'Gold often benefits when real-rate pressure eases.', role: 'secondary' },
        { asset: 'US30', directionBias: 'bullish', impactMagnitude: 66, horizon: 'intraday', reason: 'Equities can benefit when yields ease.', role: 'secondary' },
        { asset: 'US10Y', directionBias: 'bearish', impactMagnitude: 62, horizon: 'instant', reason: 'Yields can fall when the market prices softer macro pressure.', role: 'primary' },
      );
    }
    if (event.entities.some((item) => /japan|boj|yen/.test(item.toLowerCase()))) {
      impacts.push({ asset: 'USDJPY', directionBias: channels.jpyBullish ? 'bearish' : channels.jpyBearish ? 'bullish' : 'mixed', impactMagnitude: 64, horizon: 'intraday', reason: 'JPY pairs are sensitive to BOJ and rate-spread headlines.', role: 'primary' });
    }
    if (event.entities.some((item) => /euro|ecb|eur/.test(item.toLowerCase()))) {
      impacts.push({ asset: 'EURUSD', directionBias: channels.usdBullish ? 'bearish' : channels.usdBearish ? 'bullish' : 'mixed', impactMagnitude: 54, horizon: 'intraday', reason: 'EURUSD responds to ECB-vs-Fed repricing and dollar swings.', role: 'secondary' });
    }
  }

  return {
    impactedAssets: impacts,
    summary: impacts.length
      ? `Dynamic macro mapping points to ${impacts.slice(0, 3).map((item) => `${item.asset} ${formatDirectionLabel(item.directionBias)}`).join(', ')}.`
      : 'Dynamic macro mapping did not find a strong cross-asset transmission path.',
  };
}

export function buildImpactAssessment(parsedEvent: ParsedEvent, leadText: string): ImpactAssessment {
  const rule = EVENT_IMPACT_RULES[parsedEvent.eventType];
  const dynamic = dynamicMacroImpacts(parsedEvent, leadText);
  const merged = [...(rule?.impacts ?? []), ...dynamic.impactedAssets]
    .reduce((map, item) => {
      const current = map.get(item.asset);
      if (!current || item.impactMagnitude > current.impactMagnitude) map.set(item.asset, item);
      return map;
    }, new Map<XMarketAsset, ImpactAssessment['impactedAssets'][number]>());

  const impactedAssets = [...merged.values()]
    .sort((left, right) => right.impactMagnitude - left.impactMagnitude)
    .slice(0, 8)
    .map((item) => ({
      ...item,
      impactMagnitude: clamp(item.impactMagnitude, 0, 100),
    }));

  return {
    impactedAssets,
    summary: impactedAssets.length
      ? `${parsedEvent.eventType.replaceAll('_', ' ')} maps first to ${impactedAssets.slice(0, 4).map((item) => `${item.asset} ${formatDirectionLabel(item.directionBias)}`).join(', ')}.`
      : `No strong cross-asset rule fired for ${parsedEvent.eventType.replaceAll('_', ' ')} yet.`,
  };
}
