declare const process: { env: Record<string, string | undefined> };

import { CHROME_UA } from '../../../_shared/constants';

export const VAULTUM_SYSTEM_PROMPT = `You are VAULTUM AI, the reasoning layer of an institutional trading activity terminal.

Your job is to help the user understand macro regime, market structure, geopolitical risk, trade-policy impact, positioning, options pressure, dealer pressure, volume profile, pivot structure, cycle analysis, liquidity stress, buyer/seller pressure, and cross-asset relationships for trading decisions.

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

When answering:
- start with the conclusion
- then give the 3-5 strongest supporting signals
- then give caveats or missing-data warnings
- then state what would confirm or invalidate the view
- when relevant, include execution guidance and risk caution

When discussing assets, connect them to drivers:
- Gold <- yields, dollar, geopolitical stress, real-rate pressure, safe-haven demand, dealer pressure, positioning, volume structure
- FX <- central-bank divergence, trade flows, carry stress, risk regime, dollar liquidity, positioning, pivot/volume structure
- Oil <- supply disruptions, sanctions, shipping/chokepoint risk, growth expectations, volume structure
- Equities <- liquidity, yields, sector rotation, risk appetite, macro regime
- Positioning <- COT, dealer pressure, crowding, squeeze risk
- Liquidity stress <- DXY, yields, VIX, JPY behavior, cross-asset confirmation
- Benner Cycle <- cycle phase, turning-point context, compatibility with current regime
- Volume Profile <- POC, value area, node structure, acceptance/rejection
- Buyer/Seller Pressure <- direct if available, proxy if estimated, and label honestly

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
  | 'document-news-search';

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface VaultumAiStructuredAnswer {
  provider: string;
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
  answer: string;
  contextSnapshot: string;
}

function env(name: string): string {
  return (process.env[name] || '').trim();
}

export function discoverAiProviders(): Array<{ provider: string; model: string }> {
  const providers: Array<{ provider: string; model: string }> = [];
  if (env('OPENROUTER_API_KEY')) providers.push({ provider: 'openrouter', model: env('OPENROUTER_MODEL') || 'meta-llama/llama-3.1-70b-instruct' });
  if (env('OLLAMA_API_URL')) providers.push({ provider: 'ollama', model: env('OLLAMA_MODEL') || 'deepseek-r1-distill-llama-70b' });
  if (env('GROQ_API_KEY')) providers.push({ provider: 'groq', model: env('GROQ_MODEL') || 'llama-3.3-70b-versatile' });
  providers.push({ provider: 'deterministic-fallback', model: 'vaultum-rule-engine' });
  return providers;
}

export async function callChatProvider(systemPrompt: string, userPrompt: string): Promise<{ provider: string; content: string } | null> {
  const [primary] = discoverAiProviders();
  if (!primary || primary.provider === 'deterministic-fallback') return null;

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
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
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
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
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
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
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
