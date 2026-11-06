const DB_NAME = 'verde-botanical-source-files';
const STORE_NAME = 'documents';
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open document storage'));
  });
}

export async function saveBotanicalSourceFile(documentId: string, file: File): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(file, documentId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not save source file'));
    tx.onabort = () => reject(tx.error || new Error('Source file save was aborted'));
  });
  db.close();
}

export async function getBotanicalSourceFile(documentId: string): Promise<Blob | null> {
  const db = await openDatabase();
  const result = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(documentId);
    request.onsuccess = () => resolve((request.result as Blob) || null);
    request.onerror = () => reject(request.error || new Error('Could not load source file'));
  });
  db.close();
  return result;
}
