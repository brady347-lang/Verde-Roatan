export type GpsCalibrationSample = {
  id: string;
  sessionId: string;
  kind: 'gps';
  timestamp: number;
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  speed: number | null;
  deviceHeading: number | null;
  accepted: boolean;
  rejectionReason?: string;
};

export type CompassCalibrationSample = {
  id: string;
  sessionId: string;
  kind: 'compass';
  timestamp: number;
  heading: number;
  pitch: number;
  roll: number;
  sensorAccuracy: number;
};

export type GpsDiagnosticsSample = GpsCalibrationSample | CompassCalibrationSample;

const DB_NAME = 'rootwise-gps-diagnostics';
const STORE_NAME = 'samples';
const DB_VERSION = 1;
const MAX_SAMPLES = 20000;

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
    request.onerror = () => reject(request.error || new Error('Could not open GPS diagnostics'));
  });
}

export async function saveGpsDiagnosticsSample(sample: GpsDiagnosticsSample): Promise<void> {
  if (!sample.id || !sample.sessionId || !Number.isFinite(sample.timestamp)) return;
  if (sample.kind === 'gps' && (!Number.isFinite(sample.latitude) || !Number.isFinite(sample.longitude) || !Number.isFinite(sample.accuracy) || sample.accuracy < 0)) return;
  if (sample.kind === 'compass' && (![sample.heading, sample.pitch, sample.roll, sample.sensorAccuracy].every(Number.isFinite))) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(sample);
      // Bound local storage use: remove the oldest records after the cap is exceeded.
      const count = store.count();
      count.onsuccess = () => {
        const excess = count.result - MAX_SAMPLES;
        if (excess <= 0) return;
        let removed = 0;
        const cursorRequest = store.index('timestamp').openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor || removed >= excess) return;
          cursor.delete();
          removed += 1;
          cursor.continue();
        };
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not save GPS diagnostics'));
      transaction.onabort = () => reject(transaction.error || new Error('GPS diagnostics save aborted'));
    });
  } finally {
    db.close();
  }
}

export async function listGpsDiagnosticsSamples(limit = MAX_SAMPLES): Promise<GpsDiagnosticsSample[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => {
        const rows = Array.isArray(request.result) ? request.result as GpsDiagnosticsSample[] : [];
        resolve(rows.sort((a, b) => a.timestamp - b.timestamp).slice(-Math.max(1, limit)));
      };
      request.onerror = () => reject(request.error || new Error('Could not read GPS diagnostics'));
    });
  } finally {
    db.close();
  }
}

export async function deleteGpsDiagnosticsSamples(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not clear GPS diagnostics'));
      transaction.onabort = () => reject(transaction.error || new Error('GPS diagnostics clear aborted'));
    });
  } finally {
    db.close();
  }
}
