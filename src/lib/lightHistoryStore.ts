export type LightReadingMethod = 'sensor_measured' | 'camera_estimated';

export type LightReadingSample = {
  id: string;
  sessionId: string;
  timestamp: number;
  lux: number;
  /** Unfiltered device/camera value retained for diagnostics; chart uses lux. */
  rawLux?: number;
  method: LightReadingMethod;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
};

const DB_NAME = 'rootwise-light-history';
const STORE_NAME = 'readings';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open light history'));
  });
}

export async function saveLightReading(sample: LightReadingSample): Promise<void> {
  if (!Number.isFinite(sample.lux) || sample.lux < 0 || !sample.sessionId) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(sample);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not save light reading'));
      transaction.onabort = () => reject(transaction.error || new Error('Light history save aborted'));
    });
  } finally {
    db.close();
  }
}

export async function listLightReadings(limit = 1200): Promise<LightReadingSample[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => {
        const rows = Array.isArray(request.result) ? request.result as LightReadingSample[] : [];
        resolve(rows.sort((a, b) => a.timestamp - b.timestamp).slice(-Math.max(1, limit)));
      };
      request.onerror = () => reject(request.error || new Error('Could not load light history'));
    });
  } finally {
    db.close();
  }
}

export async function listLightSessionIds(): Promise<string[]> {
  const rows = await listLightReadings(5000);
  return [...new Set(rows.map(row => row.sessionId))];
}

export async function deleteLightSession(sessionId: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.index('sessionId').openCursor(IDBKeyRange.only(sessionId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not delete light session'));
      transaction.onabort = () => reject(transaction.error || new Error('Light session deletion aborted'));
    });
  } finally {
    db.close();
  }
}
