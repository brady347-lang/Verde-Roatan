export type SavedPlot = {
  id: string;
  name: string;
  points: { lat: number; lon: number; accuracy: number }[];
  areaM2: number;
  perimeterM: number;
  createdAt: string;
  updatedAt: string;
};

const DB_NAME = 'rootwise-measured-plots';
const STORE_NAME = 'plots';

function openPlotsDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open plot storage'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openPlotsDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = action(transaction.objectStore(STORE_NAME));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error || new Error('Plot storage request failed'));
      transaction.oncomplete = () => resolve(result!);
      transaction.onerror = () => reject(transaction.error || new Error('Plot storage transaction failed'));
      transaction.onabort = () => reject(transaction.error || new Error('Plot storage transaction aborted'));
    });
  } finally {
    db.close();
  }
}

/** Plot coordinates stay on this device; they are never uploaded or synced. */
export async function listSavedPlots(): Promise<SavedPlot[]> {
  const plots = await withStore<SavedPlot[]>('readonly', (store) => store.getAll());
  return (plots || []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveMeasuredPlot(plot: SavedPlot): Promise<void> {
  await withStore<IDBValidKey>('readwrite', (store) => store.put(plot));
}

export async function deleteMeasuredPlot(id: string): Promise<void> {
  await withStore<undefined>('readwrite', (store) => store.delete(id));
}
