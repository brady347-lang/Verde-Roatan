import { Capacitor } from '@capacitor/core';
import { AI_WORKER_URL } from '../data/initialData';

/** Set by the build (GitHub run number). 0 means a dev/web build, where update checks are skipped. */
export const BUILD_NUMBER: number = Number((import.meta as any).env?.VITE_BUILD_NUMBER || 0) || 0;

export interface AppUpdateInfo {
  buildNumber: number;
  versionName: string;
  notes: string;
  downloadUrl: string;
}

/**
 * Asks the Verde Roatan API whether a newer APK exists. Returns null when the app is current,
 * when this is not the Android app, or when the update service is unavailable (never throws).
 */
export async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  if (!BUILD_NUMBER || !Capacitor.isNativePlatform()) return null;
  try {
    const response = await fetch(`${AI_WORKER_URL}/app/update`, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    const latest = Number(data?.build_number || 0);
    if (!Number.isFinite(latest) || latest <= BUILD_NUMBER) return null;
    return {
      buildNumber: latest,
      versionName: String(data.version_name || latest),
      notes: String(data.notes || '').slice(0, 400),
      downloadUrl: `${AI_WORKER_URL}/app/download`
    };
  } catch {
    return null;
  }
}
