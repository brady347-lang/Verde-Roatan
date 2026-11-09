import { toMemoryRow, type GardenMemoryRow } from '../lib/gardenMemory.ts';

/**
 * Private garden sync to public.rootwise_user_memory (owner-only RLS).
 * Photos never leave the device here (only text analysis is synced). Failures never break the app:
 * every function returns a result object instead of throwing.
 */
export interface SyncConfig { baseUrl: string; apiKey: string; accessToken: string; userId: string; fetchImpl?: typeof fetch; }
export interface GardenLike { id: string; date: string; mode: 'plant' | 'pest'; name: string; photo?: string | null; photoId?: string | null; data: unknown; }

export function gardenStorageKey(userId?: string | null): string {
  return userId ? 'verde_garden_user_' + userId : 'verde_garden_guest';
}

/** Garden records are private: a signed-in account reads only its own device cache. */
export function readLocalGarden<T extends GardenLike = GardenLike>(
  userId?: string | null,
  storage: Pick<Storage, 'getItem'> = localStorage
): T[] {
  try {
    const raw = storage.getItem(gardenStorageKey(userId))
      // The legacy unscoped key is guest-only; never attach it to an authenticated account.
      ?? (!userId ? storage.getItem('verde_garden') : null);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.id === 'string') as T[] : [];
  } catch {
    return [];
  }
}

export function writeLocalGarden(
  userId: string | null | undefined,
  items: GardenLike[],
  storage: Pick<Storage, 'setItem'> = localStorage
): void {
  try {
    storage.setItem(gardenStorageKey(userId), JSON.stringify(items));
  } catch {
    // Device storage is best-effort; private server sync remains separately guarded.
  }
}

export function gardenItemToRow(userId: string, item: GardenLike): GardenMemoryRow {
  return toMemoryRow({
    userId, type: item.mode === 'plant' ? 'garden_plant' : 'garden_observation', localId: item.id,
    data: { name: item.name, date: item.date, mode: item.mode, analysis: item.data }, measuredBy: 'user_observation'
  });
}

const headers = (c: SyncConfig, extra: Record<string, string> = {}) => ({
  apikey: c.apiKey, Authorization: 'Bearer ' + c.accessToken, 'Content-Type': 'application/json', ...extra
});

export async function pullGarden(c: SyncConfig): Promise<{ ok: boolean; items: GardenLike[]; error?: string }> {
  const f = c.fetchImpl ?? fetch;
  try {
    const url = `${c.baseUrl}/rest/v1/rootwise_user_memory?select=memory_type,payload,deleted_at&user_id=eq.${encodeURIComponent(c.userId)}&memory_type=in.(garden_plant,garden_observation)&deleted_at=is.null&limit=500`;
    const response = await f(url, { headers: headers(c), cache: 'no-store' });
    if (!response.ok) return { ok: false, items: [], error: 'HTTP ' + response.status };
    const rows = await response.json();
    if (!Array.isArray(rows)) return { ok: false, items: [], error: 'Unexpected response' };
    const items: GardenLike[] = rows.flatMap((row: any) => {
      const p = row?.payload;
      if (!p || typeof p.local_id !== 'string' || typeof p.name !== 'string') return [];
      return [{ id: p.local_id, date: String(p.date ?? ''), mode: p.mode === 'pest' ? 'pest' : 'plant', name: p.name, photo: null, photoId: null, data: p.analysis ?? {} } as GardenLike];
    });
    return { ok: true, items };
  } catch (error) { return { ok: false, items: [], error: error instanceof Error ? error.message : 'Network error' }; }
}

/** Inserts only records the server does not have yet (garden entries are write-once), so no migration is required. */
export async function pushGarden(c: SyncConfig, items: GardenLike[]): Promise<{ ok: boolean; sent: number; skipped: number; error?: string }> {
  const f = c.fetchImpl ?? fetch;
  const existing = await pullGarden(c);
  if (!existing.ok) return { ok: false, sent: 0, skipped: 0, error: existing.error };
  const known = new Set(existing.items.map(item => item.id));
  const rows: GardenMemoryRow[] = [];
  let skipped = 0;
  for (const item of items) {
    if (known.has(item.id)) continue;
    try { rows.push(gardenItemToRow(c.userId, item)); } catch { skipped++; }
  }
  if (!rows.length) return { ok: true, sent: 0, skipped };
  try {
    const response = await f(`${c.baseUrl}/rest/v1/rootwise_user_memory`, {
      method: 'POST', headers: headers(c, { Prefer: 'return=minimal' }), body: JSON.stringify(rows)
    });
    if (!response.ok) return { ok: false, sent: 0, skipped, error: 'HTTP ' + response.status };
    return { ok: true, sent: rows.length, skipped };
  } catch (error) { return { ok: false, sent: 0, skipped, error: error instanceof Error ? error.message : 'Network error' }; }
}

/** Remote-only items are added; local items (with their photos) are never overwritten. */
export function mergeGardenItems<T extends GardenLike>(local: T[], remote: GardenLike[]): Array<T | GardenLike> {
  const ids = new Set(local.map(item => item.id));
  return [...local, ...remote.filter(item => !ids.has(item.id))];
}
