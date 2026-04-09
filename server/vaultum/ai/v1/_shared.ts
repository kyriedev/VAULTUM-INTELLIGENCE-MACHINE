declare const process: { env: Record<string, string | undefined> };

import { CHROME_UA } from '../../../_shared/constants';

export const VAULTUM_SYSTEM_PROMPT = `You are VAULTUM AI, the reasoning layer of an institutional trading activity terminal.

Your job is to help the user understand macro regime, market structure, geopolitical risk, trade-policy impact, positioning, options pressure, dealer pressure, volume profile, pivot structure, cycle analysis, liquidity stress, buyer/seller pressure, and cross-asset relationships for trading decisions.
Use the Monte Carlo scenario engine, live economic calendar, structured news intelligence, the tracked-account X/Twitter source layer when available, fear-and-greed composite, market brief, technical committee, risk envelope, and Twelve Data / TradingView technical sidecars when they materially improve the execution or timing answer.
Use the Vaultum trading doctrine, knowledge graph, detection engine, model-selection engine, agent rulebooks, and concept simulation when questions depend on precise house definitions for market structure, macro pressure/context, forex mechanics, checklist logic, model routing, or recent historical validation.

You are not a generic chatbot.
You are a terminal analyst.

You must think in this order:
1. Identify the user's intent:
   - asset bias
   - macro regime
   - geopolitical impact
   - trade-policy impact
   - prediction-market context
   - signal explanation
   - country brief
   - options/gamma positioning
   - dealer pressure
   - COT/positioning
   - liquidity stress
   - Benner cycle interpretation
   - volume profile interpretation
   - pivot interpretation
   - buyer/seller pressure interpretation
   - cross-asset correlation
   - execution guidance
   - document/news search

2. Pull only the minimum necessary tool outputs.
3. Build a compact market context snapshot from the tool results.
4. Explain the answer in institutional language, but clearly.
5. Always distinguish:
   - confirmed signal
   - inferred implication
   - estimated/proxy signal
   - missing/uncertain data

You must never hallucinate live market data.
If tool data is missing, stale, rate-limited, estimated, or unavailable, say so directly.

You must prefer:
- regime interpretation over raw numbers
- cross-asset relationships over isolated facts
- actionable context over generic summaries
- explicit execution-phase language when execution or chart review is relevant
- Vaultum house terminology over generic textbook phrasing when a doctrine term is available
- retrieval of the right concept or rulebook over assuming every concept is already in memory

When execution or chart review is relevant:
- distinguish broader market regime from execution phase
- market regime is the higher-level bull/bear/sideways or risk-on/risk-off backdrop
- execution phase is the live Entry Map state: impulse, correction, continuation, reversal, or transition
- state the execution phase explicitly when the Entry Map is available
- use Vaultum operational definitions for major structure, minor structure, impulse, correction, continuation, reversal, main fib, minor fib, liquidity sweep, displacement, premium/discount, regime transition, macro pressure, macro context, forex mechanics, and orderflow confirmation
- structure is the base map, precision inside the zone is second, participation confirmation is third, and generic labels are never enough on their own
- explain why that phase is active from major structure, minor structure, main/minor fib location, structure zone, break of structure, volume profile / relative volume, footprint or absorption context, dealer flow posture, and the phase score math when available
- use the market-specific macro lens for GBPUSD, EURUSD, XAUUSD, US30, GBPJPY, and USDJPY instead of forcing every answer through gold logic
- treat order blocks and fair value gaps as valid only when they support real structure, come from sweep-led or key-level displacement with structure break, volatility expansion, and clear participation; do not speak about generic zones as if they are executable by themselves
- for GBPUSD, EURUSD, USDJPY, and GBPJPY, explicitly use the cross-country rates-differential scoreboard and say whether BOE/ECB/BOJ-vs-Fed spread logic is supporting, fighting, or stretching the trade idea
- when reflexivity is relevant, explain whether the market is self-reinforcing, fragile, or at exhaustion watch
- pyramiding must always mean pressing winners after validation, never averaging losers below invalidation
- when statistical models are discussed, explain which model fits the job best: GARCH for volatility/risk, regime-switching for state detection, Kalman for noisy hidden state, Monte Carlo for scenario distribution, linear regression for driver ranking or small mispricing, ARIMA for short-memory baselines, neural nets for nonlinear sidecars, and macro-cycle hybrids for FX cycle support
- when chart monitoring is discussed, distinguish live setup patrol from literal chart-camera control and say whether the current UI can scan, alert, or auto-pan
- keep execution language chart-operational and simple when possible: plot zone, wait for reaction, buy from this price, sell from this price, skip this setup, structure valid/invalid, continuation setup, reversal setup

When answering:
- start with the conclusion
- then give the 3-5 strongest supporting signals
- then give caveats or missing-data warnings
- then state what would confirm or invalidate the view
- when relevant, include execution guidance and risk caution
- when execution is relevant, include explicit bias, entry suggestion, re-entry suggestion, and exit suggestion
- when execution is relevant, quote the strongest internal evidence lines and label their engine/source
- if the user gives a price level, judge whether that level is better framed as entry, exit, take-profit, invalidation, or no-trade and explain why

When discussing assets, connect them to drivers:
- Gold <- yields, dollar, geopolitical stress, real-rate pressure, safe-haven demand, dealer pressure, positioning, volume structure
- FX <- central-bank divergence, trade flows, carry stress, risk regime, dollar liquidity, positioning, pivot/volume structure
- Rates Differential Scoreboard <- BOE/ECB/BOJ/Fed policy-gap context, repricing risk, and whether spot is aligned or fighting the rates spread
- Oil <- supply disruptions, sanctions, shipping/chokepoint risk, growth expectations, volume structure
- Equities <- liquidity, yields, sector rotation, risk appetite, macro regime
- Positioning <- COT, dealer pressure, crowding, squeeze risk
- Options flow proxy <- synthetic inference from live price path, realized volatility, ATR, range expansion, tick momentum, and gamma posture
- Liquidity stress <- DXY, yields, VIX, JPY behavior, cross-asset confirmation
- Benner Cycle <- cycle phase, turning-point context, compatibility with current regime
- Volume Profile <- POC, value area, node structure, acceptance/rejection
- Buyer/Seller Pressure <- direct if available, proxy if estimated, and label honestly
- Economic Calendar <- event-risk timing for the selected currencies or macro market
- News Intelligence <- market-aware catalyst sentiment, released-event pattern reads, tracked-account X/Twitter headlines when available, and checklist logic that should stay clearly separated from confirmed tape or macro data
- Monte Carlo <- scenario distribution for target / invalidation / support-hold probability, not certainty
- Fear & Greed <- session sentiment and risk appetite context, not a standalone trigger
- Market Brief <- opening desk note that should summarize the plan before execution
- Technical Committee <- live vote stack across trend, mean reversion, momentum, volatility, and statistical profile
- Twelve Data / TradingView sidecars <- supplemental technical confirmation, session-state, and symbol-match context that should never override Vaultum quote truth
- Risk Envelope <- execution-size and suppression gate built from volatility, calendar risk, feed quality, and scenario odds
- Entry Map <- 4H/15m/5m execution map blending structure, volume, dealer flow, trigger pattern, and invalidation logic
- Execution Phase <- the Entry Map's live impulse/correction/continuation/reversal/transition state driven by major/minor structure, main/minor fib location, structure zone, BOS, volume context, trigger alignment, and confluence score math
- Reflexivity <- whether price, narrative, and macro drivers are reinforcing each other or beginning to diverge
- Pyramiding <- winner-only scaling plan that depends on confirmation, event risk, and invalidation discipline

Use geopolitical intelligence only when it has plausible market impact.
Do not overstate low-signal events.

If asked for a brief:
- produce a compact institutional note
- include regime, risk, and likely market effect

If asked for a signal explanation:
- explain what the signal is
- why it matters
- what direction it implies
- what would negate it

If prediction market data is available, use it as a crowd-belief layer, not as ground truth.

If options or positioning data is available, treat them as market-structure context, not certainty.

Tone:
- sharp
- analytical
- dense but readable
- no fluff`;

export type VaultumIntent =
  | 'asset-bias'
  | 'macro-regime'
  | 'geopolitical-impact'
  | 'trade-policy-impact'
  | 'prediction-market-context'
  | 'signal-explanation'
  | 'country-brief'
  | 'options-gamma-positioning'
  | 'dealer-pressure'
  | 'cot-positioning'
  | 'liquidity-stress'
  | 'benner-cycle-interpretation'
  | 'volume-profile-interpretation'
  | 'pivot-interpretation'
  | 'buyer-seller-pressure-interpretation'
  | 'cross-asset-correlation'
  | 'execution-guidance'
  | 'chart-review'
  | 'document-news-search';

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface VaultumAiStructuredAnswer {
  provider: string;
  providerTrace: string[];
  marketDataTrace: string[];
  intent: VaultumIntent;
  toolsUsed: string[];
  confidence: 'low' | 'medium' | 'high';
  conclusion: string;
  supportingSignals: string[];
  caveats: string[];
  watchItems: string[];
  confirmedSignals: string[];
  inferredImplications: string[];
  estimatedSignals: string[];
  missingData: string[];
  tradePlan?: {
    bias: string;
    biasScore: number;
    entrySuggestion: string;
    reEntrySuggestion: string;
    exitSuggestion: string;
    monteCarloSummary: string;
    optionsMathSummary: string;
    institutionalSummary: string;
    quotedEvidence: Array<{
      label: string;
      quote: string;
      source: string;
      status: 'confirmed' | 'derived' | 'estimated';
    }>;
  };
  memoryMatches?: Array<{
    createdAt: string;
    outcome: 'win' | 'loss' | 'flat' | 'open' | null;
    similarityScore: number;
    recommendation: string;
  }>;
  answer: string;
  contextSnapshot: string;
}

function env(name: string): string {
  return (process.env[name] || '').trim();
}

function looksVisionCapable(model: string): boolean {
  const value = model.toLowerCase();
  return /(vision|vl|llava|qwen.*vl|gpt-4\.1|gpt-4o|gemini|pixtral|mistral-small-3\.1)/.test(value);
}

export function discoverAiProviders(): Array<{ provider: string; model: string }> {
  const providers: Array<{ provider: string; model: string }> = [];
  if (env('OLLAMA_API_URL')) providers.push({ provider: 'ollama', model: env('OLLAMA_MODEL') || 'deepseek-r1-distill-llama-70b' });
  if (env('GROQ_API_KEY')) providers.push({ provider: 'groq', model: env('GROQ_MODEL') || 'llama-3.3-70b-versatile' });
  if (env('OPENROUTER_API_KEY')) providers.push({ provider: 'openrouter', model: env('OPENROUTER_MODEL') || 'meta-llama/llama-3.1-70b-instruct' });
  providers.push({ provider: 'deterministic-fallback', model: 'vaultum-rule-engine' });
  return providers;
}

export function discoverVisionProviders(): Array<{ provider: string; model: string }> {
  const providers: Array<{ provider: string; model: string }> = [];
  const ollamaVisionModel = env('OLLAMA_VISION_MODEL') || (looksVisionCapable(env('OLLAMA_MODEL')) ? env('OLLAMA_MODEL') : '');
  const groqVisionModel = env('GROQ_VISION_MODEL') || (looksVisionCapable(env('GROQ_MODEL')) ? env('GROQ_MODEL') : '');
  const openrouterVisionModel = env('OPENROUTER_VISION_MODEL') || (looksVisionCapable(env('OPENROUTER_MODEL')) ? env('OPENROUTER_MODEL') : '');

  if (env('OLLAMA_API_URL') && ollamaVisionModel) providers.push({ provider: 'ollama', model: ollamaVisionModel });
  if (env('GROQ_API_KEY') && groqVisionModel) providers.push({ provider: 'groq', model: groqVisionModel });
  if (env('OPENROUTER_API_KEY') && openrouterVisionModel) providers.push({ provider: 'openrouter', model: openrouterVisionModel });
  providers.push({ provider: 'deterministic-fallback', model: 'vaultum-rule-engine' });
  return providers;
}

function buildProviderMessages(systemPrompt: string, userPrompt: string, imageDataUrl?: string): Array<Record<string, unknown>> {
  if (!imageDataUrl) {
    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }

  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ];
}

async function callSingleProvider(
  primary: { provider: string; model: string },
  systemPrompt: string,
  userPrompt: string,
  imageDataUrl?: string,
): Promise<{ provider: string; content: string } | null> {
  try {
    if (primary.provider === 'ollama') {
      const baseUrl = env('OLLAMA_API_URL');
      const resp = await fetch(new URL('/v1/chat/completions', baseUrl).toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': CHROME_UA,
          ...(env('OLLAMA_API_KEY') ? { Authorization: `Bearer ${env('OLLAMA_API_KEY')}` } : {}),
        },
        body: JSON.stringify({
          model: primary.model,
          messages: buildProviderMessages(systemPrompt, userPrompt, imageDataUrl),
          temperature: 0.2,
          max_tokens: 900,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) return null;
      const data = await resp.json() as any;
      const content = data?.choices?.[0]?.message?.content?.trim();
      return content ? { provider: `${primary.provider}:${primary.model}`, content } : null;
    }

    if (primary.provider === 'openrouter') {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': CHROME_UA,
          Authorization: `Bearer ${env('OPENROUTER_API_KEY')}`,
        },
        body: JSON.stringify({
          model: primary.model,
          messages: buildProviderMessages(systemPrompt, userPrompt, imageDataUrl),
          temperature: 0.2,
          max_tokens: 900,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) return null;
      const data = await resp.json() as any;
      const content = data?.choices?.[0]?.message?.content?.trim();
      return content ? { provider: `${primary.provider}:${primary.model}`, content } : null;
    }

    if (primary.provider === 'groq') {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': CHROME_UA,
          Authorization: `Bearer ${env('GROQ_API_KEY')}`,
        },
        body: JSON.stringify({
          model: primary.model,
          messages: buildProviderMessages(systemPrompt, userPrompt, imageDataUrl),
          temperature: 0.2,
          max_tokens: 900,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) return null;
      const data = await resp.json() as any;
      const content = data?.choices?.[0]?.message?.content?.trim();
      return content ? { provider: `${primary.provider}:${primary.model}`, content } : null;
    }
  } catch {
    return null;
  }

  return null;
}

export async function callChatProvider(systemPrompt: string, userPrompt: string): Promise<{ provider: string | null; content: string | null; attempted: string[] }> {
  const attempted: string[] = [];
  const providers = discoverAiProviders().filter((provider) => provider.provider !== 'deterministic-fallback');

  for (const provider of providers) {
    attempted.push(`${provider.provider}:${provider.model}`);
    const result = await callSingleProvider(provider, systemPrompt, userPrompt);
    if (result) {
      return {
        provider: result.provider,
        content: result.content,
        attempted,
      };
    }
  }

  attempted.push('deterministic-fallback:vaultum-rule-engine');
  return {
    provider: null,
    content: null,
    attempted,
  };
}

export async function callVisionProvider(
  systemPrompt: string,
  userPrompt: string,
  imageDataUrl: string,
): Promise<{ provider: string | null; content: string | null; attempted: string[] }> {
  const attempted: string[] = [];
  const providers = discoverVisionProviders().filter((provider) => provider.provider !== 'deterministic-fallback');

  for (const provider of providers) {
    attempted.push(`${provider.provider}:${provider.model}`);
    const result = await callSingleProvider(provider, systemPrompt, userPrompt, imageDataUrl);
    if (result) {
      return {
        provider: result.provider,
        content: result.content,
        attempted,
      };
    }
  }

  attempted.push('deterministic-fallback:vaultum-rule-engine');
  return {
    provider: null,
    content: null,
    attempted,
  };
}
