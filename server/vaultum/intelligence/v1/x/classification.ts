import { EVENT_PATTERNS, EVENT_TYPE_ORDER } from './rules';
import type { ParsedEvent, RawSocialPost, XEventIntensity, XEventType } from './types';

type EventChannels = {
  usdBullish: number;
  usdBearish: number;
  riskOn: number;
  riskOff: number;
  yieldUp: number;
  yieldDown: number;
  havenUp: number;
  inflationHot: number;
  inflationCool: number;
  jpyBullish: number;
  jpyBearish: number;
};

function score(pattern: RegExp, input: string): number {
  return pattern.test(input) ? 1 : 0;
}

export function extractChannels(text: string): EventChannels {
  const lower = text.toLowerCase();
  return {
    usdBullish: score(/(strong dollar|dollar rises|dollar gains|hawkish fed|higher for longer|yields? rise|hot inflation|strong payrolls)/, lower),
    usdBearish: score(/(weak dollar|dollar falls|dovish fed|rate cut|yields? fall|cooling inflation|soft payrolls)/, lower),
    riskOn: score(/(risk-on|equities rise|stocks rally|optimism|constructive talks|de-escalat|ceasefire)/, lower),
    riskOff: score(/(risk-off|selloff|war|missile|strike|tariff|sanction|shipping disruption|oil supply risk)/, lower),
    yieldUp: score(/(yield(s)? rise|treasury selloff|higher real yields)/, lower),
    yieldDown: score(/(yield(s)? fall|treasury rally|lower real yields)/, lower),
    havenUp: score(/(safe haven|gold demand|flight to safety|stress bid)/, lower),
    inflationHot: score(/(hot inflation|inflation beat|cpi beat|ppi beat)/, lower),
    inflationCool: score(/(cooling inflation|inflation miss|disinflation|cpi cools)/, lower),
    jpyBullish: score(/(yen gains|yen strengthens|intervention risk|safe haven yen)/, lower),
    jpyBearish: score(/(yen weakens|carry trade|yield gap widens)/, lower),
  };
}

export function biasLabelFromScore(scoreValue: number): 'bullish' | 'bearish' | 'mixed' | 'neutral' {
  if (scoreValue >= 14) return 'bullish';
  if (scoreValue <= -14) return 'bearish';
  if (Math.abs(scoreValue) >= 6) return 'mixed';
  return 'neutral';
}

export function scoreTextForMarket(market: string, text: string): { biasScore: number; bias: 'bullish' | 'bearish' | 'mixed' | 'neutral' } {
  const channels = extractChannels(text);
  let scoreValue = 0;

  if (market === 'XAUUSD') {
    scoreValue += (channels.usdBearish * 12) - (channels.usdBullish * 13);
    scoreValue += (channels.yieldDown * 10) - (channels.yieldUp * 11);
    scoreValue += (channels.havenUp * 9) + (channels.riskOff * 7) - (channels.riskOn * 4);
    scoreValue += (channels.inflationHot * 2) + (channels.inflationCool * 4);
  } else if (market === 'US30') {
    scoreValue += (channels.riskOn * 11) - (channels.riskOff * 13);
    scoreValue += (channels.yieldDown * 8) - (channels.yieldUp * 9);
    scoreValue += (channels.inflationCool * 6) - (channels.inflationHot * 8);
  } else if (market === 'EURUSD' || market === 'GBPUSD') {
    scoreValue += (channels.usdBearish * 11) - (channels.usdBullish * 11);
    scoreValue += (channels.yieldDown * 3) - (channels.yieldUp * 3);
    scoreValue += (channels.riskOn * 3) - (channels.riskOff * 3);
  } else if (market === 'USDJPY') {
    scoreValue += (channels.usdBullish * 9) - (channels.usdBearish * 9);
    scoreValue += (channels.yieldUp * 9) - (channels.yieldDown * 8);
    scoreValue += (channels.jpyBullish * -10) + (channels.jpyBearish * 9);
    scoreValue += (channels.riskOn * 3) - (channels.riskOff * 7);
  }

  return {
    biasScore: scoreValue,
    bias: biasLabelFromScore(scoreValue),
  };
}

function matchedEventTypes(text: string): XEventType[] {
  const lower = text.toLowerCase();
  const types = EVENT_PATTERNS
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(lower)))
    .map((rule) => rule.eventType);
  if (!types.length && /(opinion|thread|watchlist|chart idea|recap)/.test(lower)) return ['narrative_noise'];
  if (!types.length) return ['narrative_noise'];
  return EVENT_TYPE_ORDER.filter((item) => types.includes(item));
}

function geography(text: string, post: RawSocialPost): string[] {
  const lower = text.toLowerCase();
  const list = [
    ...(post.detectedEntities.countries.includes('us') || /\bwhite house\b|\btreasury\b|\bwashington\b/i.test(lower) ? ['US'] : []),
    ...(post.detectedEntities.countries.includes('china') ? ['China'] : []),
    ...(post.detectedEntities.countries.includes('eu') || post.detectedEntities.countries.includes('europe') ? ['EU'] : []),
    ...(post.detectedEntities.countries.includes('iran') || post.detectedEntities.countries.includes('israel') || post.detectedEntities.countries.includes('saudi') ? ['Middle East'] : []),
    ...(post.detectedEntities.countries.includes('uk') ? ['UK'] : []),
    ...(post.detectedEntities.countries.includes('japan') ? ['Japan'] : []),
  ];
  return [...new Set(list.length ? list : ['Global'])];
}

function intensity(text: string, eventType: XEventType): XEventIntensity {
  const lower = text.toLowerCase();
  if (/(breaking|urgent|immediately|emergency|major|broad package|new tariffs|fresh strike|supply risk)/.test(lower)) return 'high';
  if (eventType === 'rumor_unconfirmed' || eventType === 'narrative_noise') return 'low';
  if (/(said|comment|watch|monitor|possible|consider)/.test(lower)) return 'medium';
  return 'medium';
}

function surpriseLevel(text: string): 'expected' | 'semi-surprise' | 'shock' {
  const lower = text.toLowerCase();
  if (/(shock|unexpected|surprise|breaking|urgent|emergency)/.test(lower)) return 'shock';
  if (/(fresh|new|sudden|reportedly|hearing)/.test(lower)) return 'semi-surprise';
  return 'expected';
}

export function classifyPost(post: RawSocialPost): ParsedEvent {
  const types = matchedEventTypes(post.cleanedText || post.rawText);
  const primary = types[0] ?? 'narrative_noise';
  const entities = [
    ...post.detectedEntities.people,
    ...post.detectedEntities.countries,
    ...post.detectedEntities.institutions,
    ...post.detectedEntities.commodities,
    ...post.detectedEntities.indices,
    ...post.detectedEntities.currencies,
  ];

  return {
    eventType: primary,
    subtypes: types.slice(1),
    geography: geography(post.cleanedText || post.rawText, post),
    intensity: intensity(post.cleanedText || post.rawText, primary),
    surpriseLevel: surpriseLevel(post.cleanedText || post.rawText),
    keywords: post.detectedEntities.keywords.slice(0, 10),
    entities: [...new Set(entities)].slice(0, 10),
    classificationReason: `${primary.replaceAll('_', ' ')} detected from entities and event keywords in the tracked post.`,
  };
}
