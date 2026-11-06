/**
 * Remembers a customer's contact details on THIS phone so forms can be pre-filled.
 * Everything stays editable, is kept per signed-in account (or "guest"), and can be cleared.
 * Never stores payment data. Safe when storage is blocked (private mode, cleared data).
 */
export interface SavedContact {
  name: string;
  phone: string;
  address: string;
  area: string;
}

const EMPTY: SavedContact = { name: '', phone: '', address: '', area: '' };
const keyFor = (userId?: string | null) => `verde_contact_${userId || 'guest'}`;

export function loadSavedContact(userId?: string | null): SavedContact {
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(userId)) || 'null');
    if (!raw || typeof raw !== 'object') return { ...EMPTY };
    return {
      name: String(raw.name || '').slice(0, 120),
      phone: String(raw.phone || '').slice(0, 40),
      address: String(raw.address || '').slice(0, 300),
      area: String(raw.area || '').slice(0, 120)
    };
  } catch {
    return { ...EMPTY };
  }
}

/** Merges the non-empty values into what is already saved. */
export function saveContact(userId: string | null | undefined, partial: Partial<SavedContact>): void {
  try {
    const next = { ...loadSavedContact(userId) };
    for (const field of Object.keys(EMPTY) as (keyof SavedContact)[]) {
      const value = String(partial[field] ?? '').trim();
      // A bare country code such as "+504" is not a phone number worth remembering.
      if (value && !(field === 'phone' && value.replace(/\D/g, '').length < 8)) next[field] = value;
    }
    localStorage.setItem(keyFor(userId), JSON.stringify(next));
  } catch {
    /* storage unavailable: forms simply start empty next time */
  }
}

export function clearSavedContact(userId?: string | null): void {
  try { localStorage.removeItem(keyFor(userId)); } catch { /* ignore */ }
}

export const hasSavedContact = (c: SavedContact) => Boolean(c.name || c.phone || c.address);
