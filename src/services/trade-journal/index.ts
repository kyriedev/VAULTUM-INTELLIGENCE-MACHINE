import { invokeVaultumRpc } from '@/services/rpc';
import type { EntryMapResponse } from '@/services/entry-map';
import type { InstitutionalMonitorResponse } from '@/services/institutional-monitor';
import type { MarketBriefResponse } from '@/services/market-brief';
import {
  deleteTradeJournalEntry,
  listTradeJournalEntries,
  saveTradeJournalEntry,
  type StoredTradeJournalEntry,
  type StoredTradeJournalThesisSnapshot,
} from '@/services/vault-store';

export type ManualTradeDraft = Omit<StoredTradeJournalEntry, 'id' | 'createdAt'>;

export type TradeJournalStats = {
  total: number;
  closed: number;
  wins: number;
  losses: number;
  flats: number;
  winRate: number;
  averageR: number | null;
  averagePnlPct: number | null;
  reviewed: number;
  reviewCoverage: number;
  topWeaknesses: Array<{ tag: string; count: number }>;
  topPhases: Array<{ phase: string; count: number }>;
  topAlignments: Array<{ alignment: string; count: number }>;
  topVerdicts: Array<{ verdict: string; count: number }>;
};

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildVaultumThesisSnapshot(input: {
  market: string;
  timeframe: string;
  entryMap: EntryMapResponse | null;
  brief: MarketBriefResponse | null;
  monitor: InstitutionalMonitorResponse | null;
}): StoredTradeJournalThesisSnapshot {
  const { market, timeframe, entryMap, brief, monitor } = input;
  const summary = entryMap?.executionRead
    ?? brief?.deskRecommendation?.institutionalSummary
    ?? brief?.summary
    ?? `Vaultum thesis snapshot unavailable for ${market} ${timeframe}.`;
  const lines = [
    `${market} ${timeframe.toUpperCase()} | ${entryMap?.biasLabel ?? brief?.stance ?? 'Bias pending'} | phase ${entryMap?.phase ?? 'unknown'} | readiness ${entryMap?.readiness ?? 'unknown'}`,
    entryMap
      ? `Confluence ${entryMap.modelTwoConfluenceLabel} ${entryMap.modelTwoConfluenceScore} | phase math ${entryMap.scores.major}/${entryMap.scores.minor}/${entryMap.scores.trigger}/${entryMap.scores.flow}/${entryMap.scores.composite} | trigger ${entryMap.triggerPattern}`
      : 'Confluence stack unavailable.',
    entryMap
      ? `Reference ${entryMap.institutionalReference} ${entryMap.institutionalReferenceZone} | execute ${entryMap.preferredEntryLevel} | invalidation ${entryMap.invalidationLevel} | trim ${entryMap.trimZone}`
      : `Invalidation ${brief?.riskEnvelope?.body ?? 'pending'} | trim unavailable.`,
    entryMap?.macroContext
      ? `Macro ${entryMap.macroContext} | reflexivity ${entryMap.macroReflexivity}`
      : `Macro ${brief?.metrics?.macro ?? 'unknown'} | monitor ${monitor?.items?.[0]?.state ?? 'pending'}`,
    entryMap?.volumeContext
      ? `Volume ${entryMap.volumeContext} | dealer ${entryMap.dealerContext}`
      : `Monitor ${monitor?.summary ?? 'Institutional monitor summary unavailable.'}`,
    entryMap?.precisionEntryPlan ?? 'Precision ladder unavailable.',
    entryMap?.stopLogic ?? 'Stop logic unavailable.',
    entryMap?.pyramidingPlan ?? 'Pyramiding plan unavailable.',
  ].filter((value): value is string => Boolean(value && value.trim()));

  return {
    summary,
    lines,
  };
}

export async function loadTradeJournal(): Promise<StoredTradeJournalEntry[]> {
  return listTradeJournalEntries();
}

export async function saveManualTradeJournalEntry(entry: ManualTradeDraft): Promise<StoredTradeJournalEntry> {
  const saved: StoredTradeJournalEntry = {
    ...entry,
    id: `journal:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  await saveTradeJournalEntry(saved);

  if (saved.status === 'closed' && saved.outcome !== 'open') {
    const reviewNotes = [
      saved.notes,
      saved.actualAction ? `Actual action: ${saved.actualAction}` : null,
      saved.planAlignment ? `Plan alignment: ${saved.planAlignment}` : null,
      saved.marketPhase ? `Market phase: ${saved.marketPhase}` : null,
      saved.reviewVerdict ? `Review verdict: ${saved.reviewVerdict}` : null,
      saved.confirmationNotes ? `Confirmed by: ${saved.confirmationNotes}` : null,
      saved.invalidationNotes ? `Invalidated by: ${saved.invalidationNotes}` : null,
      saved.vaultumThesisSnapshot?.summary ? `Vaultum thesis: ${saved.vaultumThesisSnapshot.summary}` : null,
      saved.vaultumThesisSnapshot?.lines?.length ? `Confluence stack: ${saved.vaultumThesisSnapshot.lines.slice(0, 4).join(' | ')}` : null,
      saved.mistakes.length ? `Mistakes: ${saved.mistakes.join(', ')}` : null,
    ].filter(Boolean).join('\n');

    void invokeVaultumRpc('analytics', 'reflect-trade-outcome', {
      market: saved.market,
      timeframe: saved.timeframe,
      outcome: saved.outcome,
      returnPct: saved.pnlPct ?? undefined,
      notes: reviewNotes,
      decisionSummary: saved.vaultumCall || saved.vaultumSummary,
    });
  }

  return saved;
}

export async function removeTradeJournalEntry(id: string): Promise<void> {
  await deleteTradeJournalEntry(id);
}

export function summarizeTradeJournal(entries: StoredTradeJournalEntry[]): TradeJournalStats {
  const closed = entries.filter((entry) => entry.status === 'closed');
  const wins = closed.filter((entry) => entry.outcome === 'win');
  const losses = closed.filter((entry) => entry.outcome === 'loss');
  const flats = closed.filter((entry) => entry.outcome === 'flat');
  const weaknessCounts = new Map<string, number>();
  const phaseCounts = new Map<string, number>();
  const alignmentCounts = new Map<string, number>();
  const verdictCounts = new Map<string, number>();

  closed.forEach((entry) => {
    entry.mistakes.forEach((tag) => {
      const normalized = tag.trim().toLowerCase();
      if (!normalized) return;
      weaknessCounts.set(normalized, (weaknessCounts.get(normalized) ?? 0) + 1);
    });

    const phase = entry.marketPhase || 'unknown';
    phaseCounts.set(phase, (phaseCounts.get(phase) ?? 0) + 1);

    const alignment = entry.planAlignment || 'partial';
    alignmentCounts.set(alignment, (alignmentCounts.get(alignment) ?? 0) + 1);

    const verdict = entry.reviewVerdict || 'pending';
    verdictCounts.set(verdict, (verdictCounts.get(verdict) ?? 0) + 1);
  });

  const reviewed = entries.filter((entry) =>
    entry.reviewVerdict !== 'pending'
    || Boolean(entry.actualAction.trim())
    || Boolean(entry.confirmationNotes.trim())
    || Boolean(entry.invalidationNotes.trim()),
  ).length;

  return {
    total: entries.length,
    closed: closed.length,
    wins: wins.length,
    losses: losses.length,
    flats: flats.length,
    winRate: closed.length ? Number(((wins.length / closed.length) * 100).toFixed(1)) : 0,
    averageR: average(closed.map((entry) => entry.rMultiple).filter((value): value is number => value != null)),
    averagePnlPct: average(closed.map((entry) => entry.pnlPct).filter((value): value is number => value != null)),
    reviewed,
    reviewCoverage: entries.length ? Number(((reviewed / entries.length) * 100).toFixed(1)) : 0,
    topWeaknesses: [...weaknessCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([tag, count]) => ({ tag, count })),
    topPhases: [...phaseCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([phase, count]) => ({ phase, count })),
    topAlignments: [...alignmentCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([alignment, count]) => ({ alignment, count })),
    topVerdicts: [...verdictCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([verdict, count]) => ({ verdict, count })),
  };
}

export function buildTradeJournalContext(entries: StoredTradeJournalEntry[], market?: string): string {
  const scopedEntries = market
    ? entries.filter((entry) => entry.market.toUpperCase() === market.toUpperCase())
    : entries;
  const stats = summarizeTradeJournal(scopedEntries);
  const recent = scopedEntries.slice(0, 3);

  if (!scopedEntries.length) {
    return market
      ? `No manual trade journal entries saved yet for ${market.toUpperCase()}.`
      : 'No manual trade journal entries saved yet.';
  }

  const recentLines = recent.map((entry) => {
    const performance = entry.rMultiple != null
      ? `${entry.rMultiple.toFixed(2)}R`
      : entry.pnlPct != null
        ? `${entry.pnlPct.toFixed(2)}%`
        : 'performance n/a';
    const mistakes = entry.mistakes.length ? `mistakes ${entry.mistakes.join('/')}` : 'no tagged mistakes';
    const confirmation = entry.confirmationNotes ? `confirmed ${entry.confirmationNotes}` : 'confirmation n/a';
    const invalidation = entry.invalidationNotes ? `invalidated ${entry.invalidationNotes}` : 'invalidation n/a';
    const action = entry.actualAction ? `did ${entry.actualAction}` : `alignment ${entry.planAlignment}`;
    const snapshot = entry.vaultumThesisSnapshot?.summary ? `snapshot ${entry.vaultumThesisSnapshot.summary}` : 'snapshot n/a';
    return `${entry.market} ${entry.direction} ${entry.outcome} ${performance} phase ${entry.marketPhase} ${action} verdict ${entry.reviewVerdict} ${snapshot} ${confirmation} ${invalidation} ${mistakes}`;
  });

  return [
    `Manual journal scope: ${market ? market.toUpperCase() : 'all markets'}.`,
    `Trades ${stats.total}, closed ${stats.closed}, win rate ${stats.winRate.toFixed(1)}%, average R ${stats.averageR != null ? stats.averageR.toFixed(2) : 'n/a'}, average pnl ${stats.averagePnlPct != null ? `${stats.averagePnlPct.toFixed(2)}%` : 'n/a'}.`,
    `Review coverage ${stats.reviewed}/${stats.total} (${stats.reviewCoverage.toFixed(1)}%). Phase mix: ${stats.topPhases.length ? stats.topPhases.map((item) => `${item.phase} ${item.count}`).join(' | ') : 'none yet'}. Alignment: ${stats.topAlignments.length ? stats.topAlignments.map((item) => `${item.alignment} ${item.count}`).join(' | ') : 'none yet'}. Verdicts: ${stats.topVerdicts.length ? stats.topVerdicts.map((item) => `${item.verdict} ${item.count}`).join(' | ') : 'none yet'}.`,
    `Top weaknesses: ${stats.topWeaknesses.length ? stats.topWeaknesses.map((item) => `${item.tag} ${item.count}`).join(' | ') : 'none tagged yet'}.`,
    `Recent entries: ${recentLines.join(' | ')}.`,
  ].join(' ');
}
