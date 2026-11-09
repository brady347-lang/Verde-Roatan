/**
 * Garden Intelligence storage mapping for the existing owner-only table
 * public.rootwise_user_memory (user_id, memory_type, payload jsonb, device_id, revision, deleted_at).
 * Rows here are PRIVATE to the user. Nothing in this module feeds shared learning;
 * only canEnterBotanicalMemory() in intelligenceCore may release an anonymized signal.
 */
export type GardenMemoryType = 'garden_plant' | 'garden_observation' | 'light_reading';
export const GARDEN_MEMORY_TYPES: GardenMemoryType[] = ['garden_plant', 'garden_observation', 'light_reading'];

export interface GardenMemoryRow {
  user_id: string; memory_type: GardenMemoryType; payload: Record<string, unknown>;
  device_id?: string | null; revision: number; updated_at?: string; deleted_at?: string | null;
}

const MAX_PAYLOAD_BYTES = 16_000;

/** Reject inline image data and oversize payloads: photos stay in private storage, referenced by path only. */
export function validateGardenPayload(payload: Record<string, unknown>): { ok: boolean; reason?: string } {
  const json = JSON.stringify(payload ?? {});
  if (json.length > MAX_PAYLOAD_BYTES) return { ok: false, reason: 'Payload too large.' };
  if (/data:image\//i.test(json)) return { ok: false, reason: 'Inline image data is not allowed; store a private storage path instead.' };
  return { ok: true };
}

export function toMemoryRow(input: {
  userId: string; type: GardenMemoryType; localId: string; data: Record<string, unknown>;
  deviceId?: string; revision?: number; measuredBy?: 'sensor_measured' | 'camera_estimated' | 'user_observation';
}): GardenMemoryRow {
  if (!input.userId) throw new Error('A signed-in user is required.');
  if (!GARDEN_MEMORY_TYPES.includes(input.type)) throw new Error('Unknown memory type.');
  const payload = { local_id: input.localId, ...input.data, ...(input.measuredBy ? { provenance: input.measuredBy } : {}) };
  const check = validateGardenPayload(payload);
  if (!check.ok) throw new Error(check.reason);
  return { user_id: input.userId, memory_type: input.type, payload, device_id: input.deviceId ?? null, revision: Math.max(1, input.revision ?? 1), deleted_at: null };
}

/** Newest revision wins; ties break on updated_at; tombstones (deleted_at) win over older live rows. Never invents rows. */
export function mergeMemory(local: GardenMemoryRow[], remote: GardenMemoryRow[]): GardenMemoryRow[] {
  const key = (r: GardenMemoryRow) => `${r.memory_type}:${String(r.payload?.local_id ?? '')}`;
  const out = new Map<string, GardenMemoryRow>();
  for (const row of [...local, ...remote]) {
    if (!row.payload?.local_id) continue;
    const current = out.get(key(row));
    const newer = !current || row.revision > current.revision ||
      (row.revision === current.revision && String(row.updated_at ?? '') > String(current.updated_at ?? ''));
    if (newer) out.set(key(row), row);
  }
  return [...out.values()];
}

/** My RootWise summary input: counts only real, non-deleted activity. */
export function summarizeGarden(rows: GardenMemoryRow[]) {
  const live = rows.filter(r => !r.deleted_at);
  const count = (t: GardenMemoryType) => live.filter(r => r.memory_type === t).length;
  const lightRows = live.filter(r => r.memory_type === 'light_reading');
  return {
    plants: count('garden_plant'), observations: count('garden_observation'), lightReadings: lightRows.length,
    measuredLightReadings: lightRows.filter(r => r.payload.provenance === 'sensor_measured').length,
    hasActivity: live.length > 0
  };
}
