// src/lib/photoStore.ts
// Drop-in fix for Verde Roatán photo storage.
//
// Problem: photos were saved as base64 strings inside localStorage (~5 MB cap, shared with
// the catalog, cart, orders, etc.), and the writes were not wrapped in try/catch, so once the
// cap was hit React threw inside useEffect and the app went blank / stopped saving.
//
// Fix: photos live in IndexedDB as binary Blobs (hundreds of MB available, no base64 overhead);
// localStorage only keeps a small photo id. All remaining localStorage writes go through safeSetItem.

import { useEffect, useState } from 'react';

const DB_NAME = 'verde-photos';
const STORE = 'photos';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(r.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

/** Accepts a data: URL (what the app produces today) or a Blob. Returns the id to keep in app state. */
export async function putPhoto(id: string, photo: string | Blob): Promise<string> {
  const blob = typeof photo === 'string' ? await (await fetch(photo)).blob() : photo;
  await tx('readwrite', (s) => s.put(blob, id));
  return id;
}

export async function getPhotoBlob(id: string): Promise<Blob | null> {
  return (await tx<Blob | undefined>('readonly', (s) => s.get(id))) ?? null;
}

export async function deletePhoto(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}

/** Renders a stored photo. Use instead of <img src={item.photo}>. */
export function usePhotoUrl(id?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) { setUrl(null); return; }
    let objectUrl: string | null = null;
    let cancelled = false;
    getPhotoBlob(id)
      .then((b) => {
        if (cancelled || !b) return;
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      })
      .catch((e) => console.warn('Photo read failed', e));
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  return url;
}

/** localStorage write that never throws. Returns false if the write failed (quota, private mode, ...). */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn(`localStorage write failed for "${key}"`, e);
    return false;
  }
}

/** One-time migration: move legacy base64 photos out of the garden array into IndexedDB. */
export async function migrateGardenPhotos<T extends { id: string; photo?: string | null; photoId?: string }>(
  items: T[],
): Promise<T[]> {
  const out: T[] = [];
  for (const it of items) {
    if (typeof it.photo === 'string' && it.photo.startsWith('data:image/')) {
      try {
        await putPhoto(it.id, it.photo);
        out.push({ ...it, photo: null, photoId: it.id });
        continue;
      } catch (e) {
        console.warn('Photo migration failed for', it.id, e);
      }
    }
    out.push(it);
  }
  return out;
}

/** Ask Android not to evict our storage under pressure (best effort, harmless if unsupported). */
export function requestPersistentStorage(): void {
  try { navigator.storage?.persist?.(); } catch { /* ignore */ }
}
