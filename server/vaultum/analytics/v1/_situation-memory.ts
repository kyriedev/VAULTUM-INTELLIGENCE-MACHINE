import { getCachedJson, setCachedJson } from '../../../_shared/redis';

export type SituationMemoryEntry = {
  id: string;
  namespace: string;
  market: string;
  timeframe: string;
  createdAt: string;
  updatedAt: string;
  situation: string;
  recommendation: string;
  outcome: 'win' | 'loss' | 'flat' | 'open' | null;
  tags: string[];
};

export type SituationMemoryMatch = SituationMemoryEntry & {
  similarityScore: number;
};

const MAX_MEMORY_ENTRIES = 48;
const MEMORY_TTL_SECONDS = 60 * 60 * 24 * 180;

function memoryKey(namespace: string, market: string): string {
  return `vaultum:memory:${namespace}:${market.toUpperCase()}`;
}

function tokenize(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9.%\s/-]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function unique(tokens: string[]): string[] {
  return [...new Set(tokens)];
}

function overlapScore(left: string, right: string): number {
  const leftTokens = unique(tokenize(left));
  const rightTokens = unique(tokenize(right));
  if (!leftTokens.length || !rightTokens.length) return 0;

  const rightSet = new Set(rightTokens);
  const shared = leftTokens.filter((token) => rightSet.has(token)).length;
  return shared / Math.max(leftTokens.length, rightTokens.length, 1);
}

function recencyBoost(createdAt: string): number {
  const ageMs = Math.max(Date.now() - new Date(createdAt).getTime(), 0);
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 1) return 0.12;
  if (ageDays <= 7) return 0.08;
  if (ageDays <= 30) return 0.04;
  return 0;
}

function outcomeBoost(outcome: SituationMemoryEntry['outcome']): number {
  if (outcome === 'win') return 0.12;
  if (outcome === 'loss') return 0.08;
  if (outcome === 'flat') return 0.04;
  return 0;
}

function buildEntryId(namespace: string, market: string, timeframe: string): string {
  return `${namespace}:${market.toUpperCase()}:${timeframe.toLowerCase()}:${Date.now().toString(36)}`;
}

export async function rememberSituation(input: {
  namespace: string;
  market: string;
  timeframe: string;
  situation: string;
  recommendation: string;
  outcome?: SituationMemoryEntry['outcome'];
  tags?: string[];
}): Promise<SituationMemoryEntry> {
  const market = String(input.market || 'XAUUSD').toUpperCase();
  const timeframe = String(input.timeframe || '1h').toLowerCase();
  const namespace = String(input.namespace || 'trader-report').trim() || 'trader-report';
  const situation = String(input.situation || '').trim();
  const recommendation = String(input.recommendation || '').trim();
  const now = new Date().toISOString();

  const entry: SituationMemoryEntry = {
    id: buildEntryId(namespace, market, timeframe),
    namespace,
    market,
    timeframe,
    createdAt: now,
    updatedAt: now,
    situation,
    recommendation,
    outcome: input.outcome ?? null,
    tags: unique((input.tags ?? []).map((tag) => String(tag || '').toLowerCase()).filter(Boolean)),
  };

  const key = memoryKey(namespace, market);
  const existing = (await getCachedJson<SituationMemoryEntry[]>(key)) ?? [];
  const deduped = existing.filter((item) => {
    const sameSituation = item.situation.trim() === situation;
    const sameRecommendation = item.recommendation.trim() === recommendation;
    const sameTimeframe = item.timeframe === timeframe;
    return !(sameSituation && sameRecommendation && sameTimeframe);
  });

  const next = [entry, ...deduped].slice(0, MAX_MEMORY_ENTRIES);
  await setCachedJson(key, next, MEMORY_TTL_SECONDS);
  return entry;
}

export async function recallSituationMemories(input: {
  namespace: string;
  market: string;
  query: string;
  timeframe?: string;
  limit?: number;
}): Promise<SituationMemoryMatch[]> {
  const market = String(input.market || 'XAUUSD').toUpperCase();
  const timeframe = String(input.timeframe || '').toLowerCase();
  const namespace = String(input.namespace || 'trader-report').trim() || 'trader-report';
  const query = String(input.query || '').trim();
  if (!query) return [];

  const entries = (await getCachedJson<SituationMemoryEntry[]>(memoryKey(namespace, market))) ?? [];
  const matches = entries
    .map((entry) => {
      const base = overlapScore(query, `${entry.situation}\n${entry.recommendation}`);
      const tagScore = entry.tags.length ? overlapScore(query, entry.tags.join(' ')) * 0.35 : 0;
      const timeframeScore = timeframe && entry.timeframe === timeframe ? 0.06 : 0;
      const similarityScore = Math.min(1, base + tagScore + timeframeScore + recencyBoost(entry.createdAt) + outcomeBoost(entry.outcome));
      return {
        ...entry,
        similarityScore: Number(similarityScore.toFixed(3)),
      } satisfies SituationMemoryMatch;
    })
    .filter((entry) => entry.similarityScore >= 0.12)
    .sort((left, right) => right.similarityScore - left.similarityScore || right.createdAt.localeCompare(left.createdAt));

  return matches.slice(0, Math.max(1, input.limit ?? 2));
}
