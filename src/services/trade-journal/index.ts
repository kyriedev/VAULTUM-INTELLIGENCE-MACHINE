import { invokeVaultumRpc } from '@/services/rpc';
import {
  deleteTradeJournalEntry,
  listTradeJournalEntries,
  saveTradeJournalEntry,
  type StoredTradeJournalEntry,
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
  topWeaknesses: Array<{ tag: string; count: number }>;
};

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
    void invokeVaultumRpc('analytics', 'reflect-trade-outcome', {
      market: saved.market,
      timeframe: saved.timeframe,
      outcome: saved.outcome,
      returnPct: saved.pnlPct ?? undefined,
      notes: `${saved.notes}\nMistakes: ${saved.mistakes.join(', ')}`.trim(),
      decisionSummary: saved.vaultumSummary,
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

  closed.forEach((entry) => {
    entry.mistakes.forEach((tag) => {
      const normalized = tag.trim().toLowerCase();
      if (!normalized) return;
      weaknessCounts.set(normalized, (weaknessCounts.get(normalized) ?? 0) + 1);
    });
  });

  return {
    total: entries.length,
    closed: closed.length,
    wins: wins.length,
    losses: losses.length,
    flats: flats.length,
    winRate: closed.length ? Number(((wins.length / closed.length) * 100).toFixed(1)) : 0,
    averageR: average(closed.map((entry) => entry.rMultiple).filter((value): value is number => value != null)),
    averagePnlPct: average(closed.map((entry) => entry.pnlPct).filter((value): value is number => value != null)),
    topWeaknesses: [...weaknessCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([tag, count]) => ({ tag, count })),
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
    return `${entry.market} ${entry.direction} ${entry.outcome} ${performance} ${mistakes}`;
  });

  return [
    `Manual journal scope: ${market ? market.toUpperCase() : 'all markets'}.`,
    `Trades ${stats.total}, closed ${stats.closed}, win rate ${stats.winRate.toFixed(1)}%, average R ${stats.averageR != null ? stats.averageR.toFixed(2) : 'n/a'}, average pnl ${stats.averagePnlPct != null ? `${stats.averagePnlPct.toFixed(2)}%` : 'n/a'}.`,
    `Top weaknesses: ${stats.topWeaknesses.length ? stats.topWeaknesses.map((item) => `${item.tag} ${item.count}`).join(' | ') : 'none tagged yet'}.`,
    `Recent entries: ${recentLines.join(' | ')}.`,
  ].join(' ');
}
