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
};

const DB_NAME = 'vaultum-local-store';
const DB_VERSION = 1;
const REPORT_STORE = 'reportArchive';
const JOURNAL_STORE = 'tradeJournal';

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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open Vaultum local store'));
  });
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
    const items = await requestToPromise(store.getAll()) as StoredTradeJournalEntry[];
    return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  });
}

export async function saveTradeJournalEntry(entry: StoredTradeJournalEntry): Promise<void> {
  await withStore(JOURNAL_STORE, 'readwrite', async (store) => {
    store.put(entry);
    return undefined;
  });
}

export async function deleteTradeJournalEntry(id: string): Promise<void> {
  await withStore(JOURNAL_STORE, 'readwrite', async (store) => {
    store.delete(id);
    return undefined;
  });
}
