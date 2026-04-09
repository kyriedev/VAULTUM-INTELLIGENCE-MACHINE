import {
  clamp01,
  confidenceFromParts,
  type IntelligenceBias,
  magnitudeToStrength,
  marketAssetKey,
  normalizeMarket,
  round,
  signedScoreToBias,
  type NewsHeadlineInterpretation,
  type NewsIntelligenceOutput,
  type NormalizedHeadlineInput,
} from './shared.ts';

type AssetImpactKey =
  | 'gold'
  | 'usd'
  | 'oil'
  | 'indices'
  | 'jpy'
  | 'eurusd'
  | 'gbpusd'
  | 'usdjpy'
  | 'gbpjpy';

const SOURCE_TIER_RULES: Array<{ pattern: RegExp; tier: NewsHeadlineInterpretation['sourceTier']; score: number }> = [
  { pattern: /(federal reserve|white house|u\.?s\.? treasury|ecb|boj|boe|reuters|bloomberg|dow jones|wsj|cnbc)/i, tier: 'tier1', score: 0.92 },
  { pattern: /(financial times|ap|nikkei|zerohedge verified|walter bloomberg|fxhedgers|live squawk|marketwatch)/i, tier: 'tier2', score: 0.82 },
  { pattern: /(analyst|macro desk|commentary|substack|blog|finviz|yahoo)/i, tier: 'tier3', score: 0.68 },
];

const EVENT_RULES: Array<{
  type: string;
  intensity: number;
  surpriseWeight: number;
  transmissionPath: string;
  pattern: RegExp;
  assetTilt: Partial<Record<AssetImpactKey, number>>;
}> = [
  {
    type: 'war_escalation',
    intensity: 0.95,
    surpriseWeight: 0.92,
    transmissionPath: 'geopolitical stress -> haven demand / oil supply risk / equity risk-off',
    pattern: /(missile|airstrike|retaliation|war escalat|military escalat|attack on|drone strike|troops|bombardment)/i,
    assetTilt: { gold: 0.7, oil: 0.85, usd: 0.4, indices: -0.75, jpy: 0.55, usdjpy: -0.45 },
  },
  {
    type: 'ceasefire_deescalation',
    intensity: 0.82,
    surpriseWeight: 0.8,
    transmissionPath: 'de-escalation -> oil premium compresses / haven demand cools / equities stabilize',
    pattern: /(ceasefire|truce|de-escalat|talks progress|diplomatic breakthrough|peace deal)/i,
    assetTilt: { gold: -0.45, oil: -0.72, usd: -0.15, indices: 0.62, jpy: -0.3, usdjpy: 0.3 },
  },
  {
    type: 'tariff_escalation',
    intensity: 0.88,
    surpriseWeight: 0.84,
    transmissionPath: 'trade shock -> inflation fear / growth drag / risk-off repricing',
    pattern: /(tariff|trade war|export control|sanction|import duty|retaliatory duty)/i,
    assetTilt: { gold: 0.48, usd: 0.32, oil: -0.12, indices: -0.68, eurusd: -0.12, gbpusd: -0.1, jpy: 0.22 },
  },
  {
    type: 'dovish_central_bank',
    intensity: 0.78,
    surpriseWeight: 0.75,
    transmissionPath: 'dovish rates path -> lower USD / lower real yields / support risk assets and gold',
    pattern: /(dovish|rate cut|cuts likely|policy easing|lower for longer|disinflation progress)/i,
    assetTilt: { gold: 0.62, usd: -0.72, indices: 0.42, eurusd: 0.38, gbpusd: 0.38, usdjpy: -0.35 },
  },
  {
    type: 'hawkish_central_bank',
    intensity: 0.82,
    surpriseWeight: 0.8,
    transmissionPath: 'hawkish rates path -> stronger USD / higher yields / pressure gold and risk assets',
    pattern: /(hawkish|higher for longer|rate hike|rate hikes|inflation still high|no cuts|policy tightening)/i,
    assetTilt: { gold: -0.66, usd: 0.76, indices: -0.48, eurusd: -0.42, gbpusd: -0.42, usdjpy: 0.34 },
  },
  {
    type: 'inflation_signal',
    intensity: 0.74,
    surpriseWeight: 0.76,
    transmissionPath: 'inflation surprise -> rates repricing / USD / gold real-yield sensitivity',
    pattern: /(cpi|ppi|pce|inflation|core prices|sticky inflation|disinflation)/i,
    assetTilt: { gold: -0.15, usd: 0.22, indices: -0.18 },
  },
  {
    type: 'growth_signal',
    intensity: 0.66,
    surpriseWeight: 0.64,
    transmissionPath: 'growth surprise -> equity / cyclical / USD rate-differential repricing',
    pattern: /(gdp|pmi|ism|retail sales|consumer spending|industrial production|growth)/i,
    assetTilt: { indices: 0.34, usd: 0.1, gold: -0.08 },
  },
  {
    type: 'labor_signal',
    intensity: 0.72,
    surpriseWeight: 0.7,
    transmissionPath: 'labor surprise -> Fed path / yields / dollar / gold sensitivity',
    pattern: /(nfp|nonfarm|payrolls|jobs|jobless claims|unemployment|wage growth)/i,
    assetTilt: { usd: 0.24, gold: -0.18, indices: -0.08 },
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function safeText(input: NormalizedHeadlineInput): string {
  return `${input.headline || ''} ${input.bodyText || ''}`.trim();
}

function sourceProfile(source: string): { tier: NewsHeadlineInterpretation['sourceTier']; score: number } {
  const match = SOURCE_TIER_RULES.find((rule) => rule.pattern.test(source));
  return match ?? { tier: 'tier4', score: 0.48 };
}

function recencyWeight(timestamp: string): number {
  const ageMinutes = Math.max((Date.now() - new Date(timestamp).getTime()) / 60_000, 0);
  if (ageMinutes <= 15) return 1;
  if (ageMinutes <= 60) return 0.94;
  if (ageMinutes <= 240) return 0.82;
  if (ageMinutes <= 1440) return 0.64;
  if (ageMinutes <= 4320) return 0.38;
  return 0.2;
}

function detectEvent(text: string): typeof EVENT_RULES[number] {
  const match = EVENT_RULES.find((rule) => rule.pattern.test(text));
  return match ?? {
    type: 'narrative_noise',
    intensity: 0.22,
    surpriseWeight: 0.22,
    transmissionPath: 'commentary / narrative drift without a clear macro trigger',
    pattern: /$^/,
    assetTilt: {},
  };
}

function extractEntities(text: string): string[] {
  const hits = [
    'Fed', 'ECB', 'BOJ', 'BOE', 'Trump', 'Iran', 'China', 'EU', 'Middle East', 'Treasury', 'CPI', 'NFP', 'PMI',
  ].filter((token) => new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text));
  return hits;
}

function assetMapForEvent(text: string, event: typeof EVENT_RULES[number]): Record<AssetImpactKey, number> {
  const map: Record<AssetImpactKey, number> = {
    gold: 0,
    usd: 0,
    oil: 0,
    indices: 0,
    jpy: 0,
    eurusd: 0,
    gbpusd: 0,
    usdjpy: 0,
    gbpjpy: 0,
  };
  Object.entries(event.assetTilt).forEach(([asset, value]) => {
    map[asset as AssetImpactKey] += value ?? 0;
  });
  if (/(risk-on|equities rally|stocks rise)/i.test(text)) map.indices += 0.28;
  if (/(risk-off|selloff|flight to safety|volatility spike)/i.test(text)) {
    map.indices -= 0.34;
    map.gold += 0.18;
    map.jpy += 0.18;
  }
  if (/(dollar up|usd gains|higher yields)/i.test(text)) {
    map.usd += 0.24;
    map.gold -= 0.18;
  }
  if (/(dollar down|usd slips|yields fall)/i.test(text)) {
    map.usd -= 0.24;
    map.gold += 0.18;
  }
  return map;
}

function contradictionKey(text: string, eventType: string): string {
  const compact = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `${eventType}:${compact.slice(0, 60)}`;
}

function assetScoreForMarket(assetMap: Record<AssetImpactKey, number>, market: string): number {
  const key = marketAssetKey(market);
  if (key === 'gold') return assetMap.gold;
  if (key === 'usd') return assetMap.usd;
  if (key === 'oil') return assetMap.oil;
  if (key === 'indices') return assetMap.indices;
  if (key === 'eurusd') return (assetMap.eurusd + (assetMap.usd * -0.5)) / 1.5;
  if (key === 'gbpusd') return (assetMap.gbpusd + (assetMap.usd * -0.5)) / 1.5;
  if (key === 'usdjpy') return (assetMap.usdjpy + (assetMap.usd * 0.4) - (assetMap.jpy * 0.6)) / 2;
  if (key === 'gbpjpy') return (assetMap.gbpusd * 0.4) + (assetMap.gbpjpy * 0.4) - (assetMap.jpy * 0.35);
  return 0;
}

function contradictionSummary(items: NewsHeadlineInterpretation[]): string[] {
  const grouped = new Map<string, NewsHeadlineInterpretation[]>();
  items.forEach((item) => {
    const key = contradictionKey(item.headline, item.eventCategory);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  });
  const contradictions: string[] = [];
  grouped.forEach((group) => {
    const bullish = group.some((item) => item.sentimentScore > 0.12);
    const bearish = group.some((item) => item.sentimentScore < -0.12);
    if (bullish && bearish) {
      contradictions.push(`${group[0]?.eventCategory ?? 'headline'} headlines are conflicting across sources.`);
      group.forEach((item) => { item.contradictionFlag = true; });
    }
  });
  return contradictions;
}

function narrativeLabel(eventCounts: Array<[string, number]>, targetBias: IntelligenceBias): string {
  const lead = eventCounts[0]?.[0] ?? 'mixed narrative';
  if (lead === 'war_escalation') return 'geopolitical stress is dominating the tape';
  if (lead === 'ceasefire_deescalation') return 'de-escalation headlines are driving the tape';
  if (lead === 'tariff_escalation') return 'trade-policy shock is dominating the narrative';
  if (lead === 'hawkish_central_bank') return `hawkish policy repricing is the dominant ${targetBias} narrative`;
  if (lead === 'dovish_central_bank') return `dovish policy repricing is the dominant ${targetBias} narrative`;
  return `${lead.replaceAll('_', ' ')} remains the dominant narrative`;
}

export function buildNewsIntelligence(input: {
  market: string;
  headlines: NormalizedHeadlineInput[];
  observedMovePct?: number | null;
  source?: string;
}): NewsIntelligenceOutput {
  const market = normalizeMarket(input.market);
  const interpretations: NewsHeadlineInterpretation[] = input.headlines.map((headline, index) => {
    const text = safeText(headline);
    const source = sourceProfile(headline.source);
    const event = detectEvent(text);
    const recency = recencyWeight(headline.timestamp);
    const assetMap = assetMapForEvent(text, event);
    const marketScore = assetScoreForMarket(assetMap, market);
    const sentimentScore = round(Math.max(-1, Math.min(1, marketScore * event.intensity * recency)), 3);
    const impactScore = round(clamp01((event.intensity * 0.6) + (source.score * 0.25) + (recency * 0.15)), 3);
    const confidenceScore = round(clamp01((source.score * 0.45) + (recency * 0.2) + (event.surpriseWeight * 0.2) + (impactScore * 0.15)), 3);
    return {
      id: headline.id ?? `${headline.source}-${index}`,
      headline: headline.headline,
      source: headline.source,
      timestamp: headline.timestamp,
      eventCategory: event.type,
      sourceTier: source.tier,
      sentimentScore,
      impactScore,
      confidenceScore,
      recencyWeight: round(recency, 3),
      contradictionFlag: false,
      assetRelevance: Object.fromEntries(Object.entries(assetMap).map(([asset, value]) => [asset, round(clamp01(Math.abs(value)), 3)])),
      dominantTransmissionPath: event.transmissionPath,
      summary: `${event.type.replaceAll('_', ' ')} / ${headline.source}: ${headline.headline}`,
    };
  });

  const contradictions = contradictionSummary(interpretations);
  const assetTotals = new Map<string, number>();
  interpretations.forEach((item) => {
    Object.entries(item.assetRelevance).forEach(([asset, value]) => {
      assetTotals.set(asset, round((assetTotals.get(asset) ?? 0) + value, 3));
    });
  });
  const dominantAssets = [...assetTotals.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([asset, score]) => ({ asset, score }));

  const weightedSentiment = interpretations.reduce((sum, item) => sum + (item.sentimentScore * item.confidenceScore * item.impactScore), 0);
  const weightedImpact = interpretations.reduce((sum, item) => sum + item.impactScore, 0);
  const normalizedSentiment = interpretations.length ? round(weightedSentiment / interpretations.length, 3) : 0;
  const regimeBias = signedScoreToBias(normalizedSentiment);
  const strength = magnitudeToStrength(normalizedSentiment);
  const confidence = confidenceFromParts([
    interpretations.length ? 0.52 : 0.22,
    clamp01(weightedImpact / Math.max(interpretations.length, 1)),
    clamp01(1 - (contradictions.length * 0.18)),
  ]);
  const eventCounts = new Map<string, number>();
  interpretations.forEach((item) => eventCounts.set(item.eventCategory, (eventCounts.get(item.eventCategory) ?? 0) + 1));
  const sortedEvents = [...eventCounts.entries()].sort((left, right) => right[1] - left[1]);
  const narrative = narrativeLabel(sortedEvents, regimeBias);
  const confirmsCurrentMove = input.observedMovePct == null
    ? 'insufficient-data'
    : normalizedSentiment === 0
      ? 'insufficient-data'
      : (input.observedMovePct > 0 && normalizedSentiment > 0) || (input.observedMovePct < 0 && normalizedSentiment < 0)
        ? 'confirms'
        : 'contradicts';

  const summary = [
    `${narrative}.`,
    `News bias for ${market} is ${regimeBias} with ${strength} strength and ${(confidence * 100).toFixed(0)}% confidence.`,
    contradictions.length ? `Conflicting headlines remain active: ${contradictions[0]}` : 'Headline flow is broadly aligned.',
  ].join(' ');

  return {
    source: input.source ?? 'Vaultum news intelligence engine',
    timestamp: nowIso(),
    asset: market,
    bias: regimeBias,
    strength,
    confidence,
    summary,
    uiSummary: `${narrative}. Net news bias is ${regimeBias} with ${(confidence * 100).toFixed(0)}% confidence.`,
    notes: [
      'News influence decays with time and is weighted by source quality.',
      'Contradictory headlines reduce confidence even when the dominant narrative is clear.',
      interpretations[0]?.dominantTransmissionPath ? `Transmission path: ${interpretations[0].dominantTransmissionPath}.` : 'Transmission path is not clear yet.',
    ],
    rawInputs: {
      market,
      headlines: input.headlines,
      observedMovePct: input.observedMovePct ?? null,
    },
    derivedMetrics: {
      narrative,
      headlinesAnalyzed: interpretations,
      dominantAssets,
      netSentiment: normalizedSentiment,
      impactLevel: round(clamp01(weightedImpact / Math.max(interpretations.length, 1)), 3),
      regimeBias,
      contradictions,
      confirmsCurrentMove,
    },
  };
}

export function buildHeadlineInputsFromVaultumNewsPayload(input: {
  market: string;
  newsIntel: any;
}): NormalizedHeadlineInput[] {
  const rows: NormalizedHeadlineInput[] = [];
  const payload = input.newsIntel ?? {};
  const pushRow = (headline: string, source: string, timestamp: string | null | undefined, bodyText?: string | null, url?: string | null): void => {
    const cleaned = String(headline || '').trim();
    if (!cleaned) return;
    rows.push({
      id: `${source}-${timestamp ?? cleaned.slice(0, 18)}`,
      headline: cleaned,
      source,
      timestamp: timestamp ?? nowIso(),
      bodyText: bodyText ?? null,
      url: url ?? null,
      assetTags: [normalizeMarket(input.market)],
    });
  };

  (payload.catalysts ?? []).forEach((item: any) => {
    pushRow(item.title, item.source ?? 'news-feed', item.publishedAt, item.summary, item.url);
  });
  (payload.xIntel?.clusters ?? []).forEach((item: any) => {
    pushRow(item.headline ?? item.cleanedSummary ?? 'cluster update', `x:${(item.sourceHandles ?? [])[0] ?? 'tracked-account'}`, item.latestUpdateAt, item.explanation?.whyItMatters, null);
  });
  (payload.xIntel?.posts ?? []).forEach((item: any) => {
    pushRow(item.cleanedText ?? item.text, `x:@${item.authorHandle ?? 'tracked'}`, item.createdAt, item.whyItMatters, item.url);
  });
  (payload.releasedEventPatterns ?? []).forEach((item: any) => {
    pushRow(`${item.currency} ${item.event}: ${item.pattern}`, 'economic-calendar', payload.generatedAt, `${item.bias} released-event pattern`, null);
  });

  const deduped = new Map<string, NormalizedHeadlineInput>();
  rows.forEach((row) => {
    const key = row.headline.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!deduped.has(key)) deduped.set(key, row);
  });
  return [...deduped.values()].slice(0, 18);
}
