import type {
  LearningCase,
  LearningOverrideProfile,
  LearningProposal,
  MissedSetupCandidate,
} from '@/lib/learning/engine';

export type StoredReportArchiveEntry = {
  id: string;
  market: string;
  period: 'daily' | 'weekly' | 'quarterly';
  label: string;
  coveredLabel: string;
  timeframe: string;
  readyLocalLabel: string;
  downloadedAt: string;
  filename: string;
  summary: string;
  blob: Blob;
};

export type StoredTradeJournalThesisSnapshot = {
  summary: string;
  lines: string[];
};

export type StoredTradeJournalEntry = {
  id: string;
  createdAt: string;
  market: string;
  timeframe: string;
  direction: 'long' | 'short';
  status: 'planned' | 'open' | 'closed';
  outcome: 'win' | 'loss' | 'flat' | 'open';
  entry: number | null;
  stop: number | null;
  target: number | null;
  exit: number | null;
  pnlPct: number | null;
  rMultiple: number | null;
  executionGrade: 'clean' | 'mixed' | 'poor';
  thesis: string;
  notes: string;
  mistakes: string[];
  vaultumSummary: string;
  monitorSummary: string;
  vaultumCall: string;
  vaultumExecutionRead: string;
  vaultumPhase: 'impulse' | 'correction' | 'continuation' | 'reversal' | 'transition' | 'unknown';
  vaultumPhaseSummary: string;
  vaultumInvalidationLevel: string;
  marketPhase: 'impulse' | 'correction' | 'continuation' | 'reversal' | 'transition' | 'unknown';
  planAlignment: 'followed' | 'partial' | 'ignored' | 'no-trade';
  actualAction: string;
  reviewVerdict: 'confirmed' | 'invalidated' | 'mixed' | 'pending';
  confirmationNotes: string;
  invalidationNotes: string;
  vaultumThesisSnapshot: StoredTradeJournalThesisSnapshot;
};

export type StoredLearningSyncMeta = {
  operatorId: string;
  syncedAt: string;
  exportedAt: string | null;
  importedAt: string | null;
};

const DB_NAME = 'vaultum-local-store';
const DB_VERSION = 2;
const REPORT_STORE = 'reportArchive';
const JOURNAL_STORE = 'tradeJournal';
const LEARNING_CASE_STORE = 'learningCases';
const MISSED_SETUP_STORE = 'missedSetupCandidates';
const LEARNING_PROPOSAL_STORE = 'learningProposals';
const LEARNING_OVERRIDE_STORE = 'learningOverrides';
const LEARNING_SYNC_STORE = 'learningSyncMeta';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionComplete(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function openVaultStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REPORT_STORE)) {
        db.createObjectStore(REPORT_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(JOURNAL_STORE)) {
        db.createObjectStore(JOURNAL_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(LEARNING_CASE_STORE)) {
        db.createObjectStore(LEARNING_CASE_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(MISSED_SETUP_STORE)) {
        db.createObjectStore(MISSED_SETUP_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(LEARNING_PROPOSAL_STORE)) {
        db.createObjectStore(LEARNING_PROPOSAL_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(LEARNING_OVERRIDE_STORE)) {
        db.createObjectStore(LEARNING_OVERRIDE_STORE, { keyPath: 'market' });
      }
      if (!db.objectStoreNames.contains(LEARNING_SYNC_STORE)) {
        db.createObjectStore(LEARNING_SYNC_STORE, { keyPath: 'operatorId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open Vaultum local store'));
  });
}

function normalizePhase(value: unknown): StoredTradeJournalEntry['marketPhase'] {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'impulse' || normalized === 'correction' || normalized === 'continuation' || normalized === 'reversal' || normalized === 'transition') return normalized;
  return 'unknown';
}

function normalizeAlignment(value: unknown): StoredTradeJournalEntry['planAlignment'] {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'followed' || normalized === 'partial' || normalized === 'ignored' || normalized === 'no-trade') return normalized;
  return 'partial';
}

function normalizeVerdict(value: unknown): StoredTradeJournalEntry['reviewVerdict'] {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'confirmed' || normalized === 'invalidated' || normalized === 'mixed' || normalized === 'pending') return normalized;
  return 'pending';
}

function normalizeThesisSnapshot(
  value: unknown,
  fallbackSummary: string,
  fallbackLines: string[],
): StoredTradeJournalThesisSnapshot {
  const objectValue = value && typeof value === 'object' ? value as Partial<StoredTradeJournalThesisSnapshot> : null;
  const summary = String(objectValue?.summary || fallbackSummary || '').trim();
  const lines = Array.isArray(objectValue?.lines)
    ? objectValue!.lines.map((item) => String(item).trim()).filter(Boolean)
    : fallbackLines.map((item) => String(item).trim()).filter(Boolean);
  return {
    summary: summary || fallbackLines[0] || 'Vaultum thesis snapshot unavailable.',
    lines: lines.length ? lines : [summary || 'Vaultum thesis snapshot unavailable.'],
  };
}

function normalizeTradeJournalEntry(entry: Partial<StoredTradeJournalEntry>): StoredTradeJournalEntry {
  const fallbackSummary = String(entry.vaultumCall || entry.vaultumSummary || '').trim() || 'Vaultum thesis snapshot unavailable.';
  const fallbackLines = [
    fallbackSummary,
    `Phase ${normalizePhase(entry.vaultumPhase)} | invalidation ${String(entry.vaultumInvalidationLevel || 'n/a')}`,
    String(entry.monitorSummary || '').trim() || 'Institutional monitor summary unavailable.',
  ].filter(Boolean);
  return {
    id: String(entry.id || ''),
    createdAt: String(entry.createdAt || new Date(0).toISOString()),
    market: String(entry.market || 'XAUUSD').toUpperCase(),
    timeframe: String(entry.timeframe || '1h').toLowerCase(),
    direction: entry.direction === 'short' ? 'short' : 'long',
    status: entry.status === 'open' || entry.status === 'closed' ? entry.status : 'planned',
    outcome: entry.outcome === 'win' || entry.outcome === 'loss' || entry.outcome === 'flat' || entry.outcome === 'open' ? entry.outcome : 'open',
    entry: typeof entry.entry === 'number' ? entry.entry : null,
    stop: typeof entry.stop === 'number' ? entry.stop : null,
    target: typeof entry.target === 'number' ? entry.target : null,
    exit: typeof entry.exit === 'number' ? entry.exit : null,
    pnlPct: typeof entry.pnlPct === 'number' ? entry.pnlPct : null,
    rMultiple: typeof entry.rMultiple === 'number' ? entry.rMultiple : null,
    executionGrade: entry.executionGrade === 'clean' || entry.executionGrade === 'poor' ? entry.executionGrade : 'mixed',
    thesis: String(entry.thesis || ''),
    notes: String(entry.notes || ''),
    mistakes: Array.isArray(entry.mistakes) ? entry.mistakes.map((item) => String(item)).filter(Boolean) : [],
    vaultumSummary: String(entry.vaultumSummary || ''),
    monitorSummary: String(entry.monitorSummary || ''),
    vaultumCall: String(entry.vaultumCall || entry.vaultumSummary || ''),
    vaultumExecutionRead: String(entry.vaultumExecutionRead || ''),
    vaultumPhase: normalizePhase(entry.vaultumPhase),
    vaultumPhaseSummary: String(entry.vaultumPhaseSummary || ''),
    vaultumInvalidationLevel: String(entry.vaultumInvalidationLevel || ''),
    marketPhase: normalizePhase(entry.marketPhase ?? entry.vaultumPhase),
    planAlignment: normalizeAlignment(entry.planAlignment),
    actualAction: String(entry.actualAction || ''),
    reviewVerdict: normalizeVerdict(entry.reviewVerdict),
    confirmationNotes: String(entry.confirmationNotes || ''),
    invalidationNotes: String(entry.invalidationNotes || ''),
    vaultumThesisSnapshot: normalizeThesisSnapshot(entry.vaultumThesisSnapshot, fallbackSummary, fallbackLines),
  };
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, runner: (store: IDBObjectStore, tx: IDBTransaction) => Promise<T>): Promise<T> {
  const db = await openVaultStore();
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);
  try {
    const result = await runner(store, tx);
    await transactionComplete(tx);
    return result;
  } finally {
    db.close();
  }
}

export async function listArchivedReports(): Promise<StoredReportArchiveEntry[]> {
  return withStore(REPORT_STORE, 'readonly', async (store) => {
    const items = await requestToPromise(store.getAll()) as StoredReportArchiveEntry[];
    return [...items].sort((left, right) => right.downloadedAt.localeCompare(left.downloadedAt));
  });
}

export async function saveArchivedReport(entry: StoredReportArchiveEntry): Promise<void> {
  await withStore(REPORT_STORE, 'readwrite', async (store) => {
    store.put(entry);
    return undefined;
  });
}

export async function getArchivedReport(id: string): Promise<StoredReportArchiveEntry | null> {
  return withStore(REPORT_STORE, 'readonly', async (store) => {
    const item = await requestToPromise(store.get(id)) as StoredReportArchiveEntry | undefined;
    return item ?? null;
  });
}

export async function deleteArchivedReport(id: string): Promise<void> {
  await withStore(REPORT_STORE, 'readwrite', async (store) => {
    store.delete(id);
    return undefined;
  });
}

export async function listTradeJournalEntries(): Promise<StoredTradeJournalEntry[]> {
  return withStore(JOURNAL_STORE, 'readonly', async (store) => {
    const items = await requestToPromise(store.getAll()) as Array<Partial<StoredTradeJournalEntry>>;
    return items
      .map((item) => normalizeTradeJournalEntry(item))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  });
}

export async function saveTradeJournalEntry(entry: StoredTradeJournalEntry): Promise<void> {
  await withStore(JOURNAL_STORE, 'readwrite', async (store) => {
    store.put(normalizeTradeJournalEntry(entry));
    return undefined;
  });
}

export async function deleteTradeJournalEntry(id: string): Promise<void> {
  await withStore(JOURNAL_STORE, 'readwrite', async (store) => {
    store.delete(id);
    return undefined;
  });
}

export async function listLearningCases(): Promise<LearningCase[]> {
  return withStore(LEARNING_CASE_STORE, 'readonly', async (store) => {
    const items = await requestToPromise(store.getAll()) as LearningCase[];
    return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  });
}

export async function saveLearningCase(entry: LearningCase): Promise<void> {
  await withStore(LEARNING_CASE_STORE, 'readwrite', async (store) => {
    store.put(entry);
    return undefined;
  });
}

export async function saveLearningCases(entries: LearningCase[]): Promise<void> {
  await withStore(LEARNING_CASE_STORE, 'readwrite', async (store) => {
    entries.forEach((entry) => store.put(entry));
    return undefined;
  });
}

export async function deleteLearningCase(id: string): Promise<void> {
  await withStore(LEARNING_CASE_STORE, 'readwrite', async (store) => {
    store.delete(id);
    return undefined;
  });
}

export async function listMissedSetupCandidates(): Promise<MissedSetupCandidate[]> {
  return withStore(MISSED_SETUP_STORE, 'readonly', async (store) => {
    const items = await requestToPromise(store.getAll()) as MissedSetupCandidate[];
    return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  });
}

export async function saveMissedSetupCandidate(entry: MissedSetupCandidate): Promise<void> {
  await withStore(MISSED_SETUP_STORE, 'readwrite', async (store) => {
    store.put(entry);
    return undefined;
  });
}

export async function saveMissedSetupCandidates(entries: MissedSetupCandidate[]): Promise<void> {
  await withStore(MISSED_SETUP_STORE, 'readwrite', async (store) => {
    entries.forEach((entry) => store.put(entry));
    return undefined;
  });
}

export async function deleteMissedSetupCandidate(id: string): Promise<void> {
  await withStore(MISSED_SETUP_STORE, 'readwrite', async (store) => {
    store.delete(id);
    return undefined;
  });
}

export async function listLearningProposals(): Promise<LearningProposal[]> {
  return withStore(LEARNING_PROPOSAL_STORE, 'readonly', async (store) => {
    const items = await requestToPromise(store.getAll()) as LearningProposal[];
    return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  });
}

export async function saveLearningProposal(entry: LearningProposal): Promise<void> {
  await withStore(LEARNING_PROPOSAL_STORE, 'readwrite', async (store) => {
    store.put(entry);
    return undefined;
  });
}

export async function saveLearningProposals(entries: LearningProposal[]): Promise<void> {
  await withStore(LEARNING_PROPOSAL_STORE, 'readwrite', async (store) => {
    entries.forEach((entry) => store.put(entry));
    return undefined;
  });
}

export async function deleteLearningProposal(id: string): Promise<void> {
  await withStore(LEARNING_PROPOSAL_STORE, 'readwrite', async (store) => {
    store.delete(id);
    return undefined;
  });
}

export async function listLearningOverrides(): Promise<LearningOverrideProfile[]> {
  return withStore(LEARNING_OVERRIDE_STORE, 'readonly', async (store) => {
    const items = await requestToPromise(store.getAll()) as LearningOverrideProfile[];
    return [...items].sort((left, right) => left.market.localeCompare(right.market));
  });
}

export async function saveLearningOverride(entry: LearningOverrideProfile): Promise<void> {
  await withStore(LEARNING_OVERRIDE_STORE, 'readwrite', async (store) => {
    store.put(entry);
    return undefined;
  });
}

export async function saveLearningOverrides(entries: LearningOverrideProfile[]): Promise<void> {
  await withStore(LEARNING_OVERRIDE_STORE, 'readwrite', async (store) => {
    entries.forEach((entry) => store.put(entry));
    return undefined;
  });
}

export async function getLearningSyncMeta(operatorId = 'local-operator'): Promise<StoredLearningSyncMeta | null> {
  return withStore(LEARNING_SYNC_STORE, 'readonly', async (store) => {
    const item = await requestToPromise(store.get(operatorId)) as StoredLearningSyncMeta | undefined;
    return item ?? null;
  });
}

export async function saveLearningSyncMeta(entry: StoredLearningSyncMeta): Promise<void> {
  await withStore(LEARNING_SYNC_STORE, 'readwrite', async (store) => {
    store.put(entry);
    return undefined;
  });
}
