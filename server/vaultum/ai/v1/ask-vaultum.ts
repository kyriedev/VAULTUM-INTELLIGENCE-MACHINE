import { callVaultumAiTool, type VaultumAiToolName } from './tool-dispatch';
import { VAULTUM_SYSTEM_PROMPT, type VaultumAiStructuredAnswer, callChatProvider, discoverAiProviders } from './_shared';
import { classifyIntent, planTools } from './planner';

function asLines(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((item) => String(item));
  return [String(value)];
}

function compactContext(toolResults: Array<{ name: string; data: any }>): { confirmed: string[]; inferred: string[]; estimated: string[]; missing: string[]; summary: string[] } {
  const confirmed: string[] = [];
  const inferred: string[] = [];
  const estimated: string[] = [];
  const missing: string[] = [];
  const summary: string[] = [];

  toolResults.forEach(({ name, data }) => {
    if (!data) {
      missing.push(`${name}: unavailable`);
      return;
    }

    if (name === 'macro.get_macro_signals') {
      confirmed.push(`macro regime ${data.regime ?? 'unknown'}`);
      confirmed.push(`gold bias ${data.goldBias ?? 'unknown'}`);
      inferred.push(`dollar liquidity pressure ${data.inferred?.dollarLiquidityPressure ?? 'unknown'}`);
      inferred.push(`carry stress ${data.inferred?.carryStress ?? 'unknown'}`);
      summary.push(`macro ${data.regime ?? 'unknown'} / gold ${data.goldBias ?? 'unknown'} / haven ${data.safeHavenPressure ?? 'unknown'}`);
    }

    if (name === 'market.list_market_quotes') {
      const quotes = data.quotes ?? [];
      const important = quotes.slice(0, 5).map((quote: any) => `${quote.symbol} ${quote.change >= 0 ? '+' : ''}${Number(quote.change).toFixed(2)}%`);
      confirmed.push(...important);
      if (data.rateLimited) missing.push('market quotes rate-limited');
    }

    if (name === 'market.list_commodity_quotes') {
      const quotes = data.quotes ?? [];
      confirmed.push(...quotes.slice(0, 3).map((quote: any) => `${quote.symbol} ${quote.change >= 0 ? '+' : ''}${Number(quote.change).toFixed(2)}%`));
    }

    if (name === 'market.get_sector_summary') {
      const leader = [...(data.sectors ?? [])].sort((a: any, b: any) => b.change - a.change)[0];
      if (leader) inferred.push(`sector leadership ${leader.symbol} ${leader.change >= 0 ? '+' : ''}${Number(leader.change).toFixed(2)}%`);
    }

    if (name === 'prediction.list_prediction_markets') {
      const market = data.markets?.[0];
      if (market) inferred.push(`prediction market ${market.title} ${(market.probability * 100).toFixed(1)}%`);
      if (data.unavailable) missing.push('prediction market layer unavailable');
    }

    if (name === 'options.get_gamma_levels') {
      confirmed.push(`call wall ${data.callWall}`);
      confirmed.push(`put wall ${data.putWall}`);
      inferred.push(`gamma flip ${data.gammaFlip}`);
    }

    if (name === 'options.get_dealer_pressure') {
      inferred.push(data.conclusion);
    }

    if (name === 'positioning.get_cot_summary') {
      inferred.push(data.summary);
    }

    if (name === 'positioning.get_positioning_regime') {
      inferred.push(`positioning regime ${data.regime}`);
    }

    if (name.startsWith('liquidity.')) {
      summary.push(...asLines(data.conclusion ?? data.regime).slice(0, 1));
    }

    if (name === 'trade.get_trade_restrictions') {
      const top = data.restrictions?.[0];
      if (top) confirmed.push(`trade restriction proxy ${top.reporter} ${Number(top.tariffRate).toFixed(1)}%`);
      if (data.unavailable) missing.push('trade restriction layer unavailable');
    }

    if (name === 'intelligence.get_proxy_tension_status') {
      summary.push(data.conclusion);
    }

    if (name === 'intelligence.get_country_intel_brief') {
      summary.push(data.brief);
    }

    if (name === 'intelligence.search_news_documents') {
      inferred.push(...(data.results ?? []).slice(0, 2).map((result: any) => `${result.type}: ${result.title}`));
    }

    if (name === 'benner.get_cycle_state') {
      inferred.push(`benner cycle ${data.phase ?? 'unknown'} / ${data.bias ?? 'unknown'}`);
      summary.push(`cycle ${data.phase ?? 'unknown'} / turn ${data.turnWindow ?? 'unknown'}`);
    }

    if (name === 'volume.get_profile') {
      estimated.push(`volume profile ${data.mode ?? 'unknown'} mode`);
      confirmed.push(`value area ${data.valueAreaPosition ?? 'unknown'}`);
      inferred.push(`POC distance ${data.pocDistance ?? 'n/a'}`);
      if (data.unavailable) missing.push('volume profile unavailable');
    }

    if (name === 'pivots.get_levels') {
      confirmed.push(`pivot structure ${data.structure ?? 'unknown'}`);
      inferred.push(`pivot distance ${data.pivotDistance ?? 'n/a'}`);
      if (data.unavailable) missing.push('pivot structure unavailable');
    }

    if (name === 'pressure.get_buyer_seller_pressure') {
      estimated.push(`buyer/seller pressure ${data.mode ?? 'unknown'} mode`);
      inferred.push(`${data.dominance ?? 'unknown'} pressure`);
      if (data.mode !== 'direct') estimated.push(data.sourceLabel ?? 'proxy pressure only');
      if (data.unavailable) missing.push('buyer/seller pressure unavailable');
    }
  });

  return {
    confirmed: [...new Set(confirmed)].slice(0, 6),
    inferred: [...new Set(inferred)].slice(0, 6),
    estimated: [...new Set(estimated)].slice(0, 6),
    missing: [...new Set(missing)].slice(0, 6),
    summary: [...new Set(summary)].slice(0, 6),
  };
}

function buildDeterministicAnswer(question: string, intent: string, context: ReturnType<typeof compactContext>, provider: string, toolsUsed: string[]): VaultumAiStructuredAnswer {
  const conclusion =
    context.summary[0]
      ?? context.confirmed[0]
      ?? `Question assessed under ${intent} with partial market context.`;

  const supportingSignals = [...context.confirmed, ...context.inferred].slice(0, 5);
  const caveats = context.missing.length ? context.missing : ['No major missing-data warning surfaced in the selected tool set.'];
  const watchItems = [
    'Watch whether price action confirms the regime rather than diverges from it.',
    'Watch dollar, yields, and volatility together for confirmation or invalidation.',
    'Watch options and positioning only as market-structure context, not certainty.',
    'Watch execution quality only when structure, pressure, and regime line up together.',
  ];
  const executionGuidance = [
    'Prefer entries when price is aligned with regime, pivot structure, and pressure state.',
    'Avoid fresh execution when risk proxies are elevated or the data mix is degraded.',
  ];

  const answer = [
    `Conclusion: ${conclusion}`,
    `Strongest supporting signals: ${supportingSignals.join(' | ') || 'insufficient live signals'}`,
    `Caveats: ${caveats.join(' | ')}`,
    `Estimated/proxy signals: ${context.estimated.join(' | ') || 'none'}`,
    `Confirm / invalidate: follow price acceptance around pivots, POC, and macro confirmation.`,
    `What to watch: ${watchItems.join(' | ')}`,
    `Execution guidance: ${executionGuidance.join(' | ')}`,
    `Confidence: ${context.missing.length >= 2 ? 'low' : 'medium'}`,
  ].join('\n');

  return {
    provider,
    intent: intent as VaultumAiStructuredAnswer['intent'],
    toolsUsed,
    confidence: context.missing.length >= 2 ? 'low' : 'medium',
    conclusion,
    supportingSignals,
    caveats,
    watchItems,
    confirmedSignals: context.confirmed,
    inferredImplications: context.inferred,
    estimatedSignals: context.estimated,
    missingData: context.missing,
    answer,
    contextSnapshot: [
      `Question: ${question}`,
      `Intent: ${intent}`,
      `Confirmed: ${context.confirmed.join('; ') || 'none'}`,
      `Inferred: ${context.inferred.join('; ') || 'none'}`,
      `Estimated: ${context.estimated.join('; ') || 'none'}`,
      `Missing: ${context.missing.join('; ') || 'none'}`,
    ].join('\n'),
  };
}

export async function askVaultum(input: { question: string }): Promise<VaultumAiStructuredAnswer> {
  const question = (input.question || '').trim();
  const intent = classifyIntent(question || 'macro regime');
  const plannedTools = planTools(question, intent);

  const toolResults = await Promise.all(
    plannedTools.map(async (tool) => ({
      name: tool.name,
      data: await callVaultumAiTool(tool.name as VaultumAiToolName, tool.input),
    })),
  );

  const context = compactContext(toolResults);
  const providerFallback = discoverAiProviders()[0]?.provider ?? 'deterministic-fallback';
  const structured = buildDeterministicAnswer(question, intent, context, providerFallback, plannedTools.map((tool) => tool.name));

  const external = await callChatProvider(
    VAULTUM_SYSTEM_PROMPT,
    [
      `Question: ${question}`,
      `Intent: ${intent}`,
      `Tools used: ${plannedTools.map((tool) => tool.name).join(', ')}`,
      `Confirmed signal: ${context.confirmed.join(' | ') || 'none'}`,
      `Inferred implication: ${context.inferred.join(' | ') || 'none'}`,
      `Estimated/proxy signal: ${context.estimated.join(' | ') || 'none'}`,
      `Missing/uncertain data: ${context.missing.join(' | ') || 'none'}`,
      'Return the answer in terminal analyst style with conclusion, strongest supporting signals, caveats, confirm/invalidate levels, what to watch, confidence, and execution guidance if relevant.',
    ].join('\n'),
  );

  if (!external) return structured;

  return {
    ...structured,
    provider: external.provider,
    answer: external.content,
  };
}
