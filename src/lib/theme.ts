export type ThemeMode = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'rootwise_theme';

interface StorageLike {
  getItem(key: string): string | null;
}
interface RootLike {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

/** Read the saved theme. Storage can be missing or throw (private windows, blocked site data); that means "system". */
export function readStoredTheme(storage?: StorageLike | null): ThemeMode {
  try {
    const saved = storage?.getItem(THEME_STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

/** "system" removes the override so the prefers-color-scheme rules in index.css follow the device. */
export function applyTheme(root: RootLike, theme: ThemeMode): void {
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}
