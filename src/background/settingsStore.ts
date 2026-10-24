import { DEFAULT_SETTINGS, type Settings } from '../shared/types';

const KEY = 'ctc_settings_v1';

export async function loadSettings(): Promise<Settings> {
  const raw = await chrome.storage.local.get(KEY);
  const stored = raw[KEY] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next = { ...current, ...patch };
  // Never leak key into content-facing responses by accident — storage is fine.
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

/** Settings safe to send to content scripts (no API key). */
export function publicSettings(s: Settings): Omit<Settings, 'geminiApiKey'> & {
  geminiApiKey: '';
  hasApiKey: boolean;
} {
  return {
    ...s,
    geminiApiKey: '',
    hasApiKey: Boolean(s.geminiApiKey),
  };
}

export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export async function bumpDailyRequestCount(): Promise<number> {
  const s = await loadSettings();
  const today = new Date().toISOString().slice(0, 10);
  let count = s.dailyRequestCount;
  let date = s.dailyRequestDate;
  if (date !== today) {
    count = 0;
    date = today;
  }
  count += 1;
  await saveSettings({ dailyRequestCount: count, dailyRequestDate: date });
  return count;
}
