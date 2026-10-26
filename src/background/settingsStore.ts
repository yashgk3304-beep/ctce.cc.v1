import {
  DEFAULT_SETTINGS,
  type ApiKeySlotId,
  type Settings,
} from '../shared/types';

const KEY = 'ctc_settings_v1';

export async function loadSettings(): Promise<Settings> {
  const raw = await chrome.storage.local.get(KEY);
  const stored = raw[KEY] as Partial<Settings> | undefined;
  const slots = {
    ...DEFAULT_SETTINGS.apiKeySlots,
    ...(stored?.apiKeySlots ?? {}),
  };
  slots.primary = {
    ...slots.primary,
    apiKey: slots.primary.apiKey || stored?.geminiApiKey || '',
    model: slots.primary.model || stored?.fastModel || '',
  };
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    apiKeySlots: slots,
    apiKeySlotStatus: stored?.apiKeySlotStatus ?? {},
    editorSelectorsByHost: stored?.editorSelectorsByHost ?? {},
  };
}

/** Clear statuses whose key/model scope changed, while retaining real key errors on model edits. */
export function clearStaleApiKeyStatuses(
  current: Settings,
  next: Settings,
  statuses: Settings['apiKeySlotStatus'],
): Settings['apiKeySlotStatus'] {
  const result = { ...statuses };
  const fallbackModelChanged = current.fastModel !== next.fastModel || current.strongModel !== next.strongModel;
  for (const id of ['primary', 'backup1', 'backup2'] as const) {
    const keyChanged = current.apiKeySlots[id].apiKey !== next.apiKeySlots[id].apiKey;
    const slotModelChanged = current.apiKeySlots[id].model !== next.apiKeySlots[id].model;
    const inheritedModelChanged = fallbackModelChanged &&
      (!current.apiKeySlots[id].model || !next.apiKeySlots[id].model);
    if (keyChanged) {
      delete result[id];
    } else if ((slotModelChanged || inheritedModelChanged) && result[id] && !result[id]?.invalid) {
      delete result[id];
    }
  }
  return result;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next: Settings = {
    ...current,
    ...patch,
    apiKeySlots: patch.apiKeySlots
      ? {
          primary: { ...current.apiKeySlots.primary, ...patch.apiKeySlots.primary },
          backup1: { ...current.apiKeySlots.backup1, ...patch.apiKeySlots.backup1 },
          backup2: { ...current.apiKeySlots.backup2, ...patch.apiKeySlots.backup2 },
        }
      : current.apiKeySlots,
  };
  if (patch.apiKeySlots || patch.geminiApiKey !== undefined) {
    next.geminiApiKey = patch.apiKeySlots?.primary?.apiKey ?? patch.geminiApiKey ?? current.geminiApiKey;
    next.apiKeySlots.primary = {
      ...next.apiKeySlots.primary,
      apiKey: next.geminiApiKey,
    };
  }
  next.apiKeySlotStatus = clearStaleApiKeyStatuses(
    current,
    next,
    patch.apiKeySlotStatus ?? current.apiKeySlotStatus,
  );
  // Never leak key into content-facing responses by accident — storage is fine.
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

/** Settings safe to send to content scripts (no API key). */
export function publicSettings(s: Settings): Omit<Settings, 'geminiApiKey' | 'helperToken'> & {
  geminiApiKey: '';
  helperToken: '';
  hasApiKey: boolean;
} {
  return {
    ...s,
    geminiApiKey: '',
    helperToken: '',
    apiKeySlots: {
      primary: { apiKey: '', model: s.apiKeySlots.primary.model },
      backup1: { apiKey: '', model: s.apiKeySlots.backup1.model },
      backup2: { apiKey: '', model: s.apiKeySlots.backup2.model },
    },
    apiKeySlotStatus: {},
    hasApiKey: Boolean(s.geminiApiKey || Object.values(s.apiKeySlots).some((slot) => slot.apiKey)),
  };
}

export interface SafeApiKeySlot {
  configured: boolean;
  last4: string;
  model: string;
  status: string;
}

export type OptionsSettings = Omit<Settings, 'geminiApiKey' | 'apiKeySlots'> & {
  geminiApiKey: '';
  apiKeySlots: Record<ApiKeySlotId, SafeApiKeySlot>;
  hasApiKey: boolean;
};

export function optionsSettings(s: Settings): OptionsSettings {
  const slotIds: ApiKeySlotId[] = ['primary', 'backup1', 'backup2'];
  const slots = Object.fromEntries(slotIds.map((id) => {
    const key = s.apiKeySlots[id]?.apiKey ?? '';
    const last4 = key.slice(-4);
    const status = s.apiKeySlotStatus[id];
    const now = Date.now();
    const message = status?.invalid
      ? 'Invalid key'
      : (status?.exhaustedUntil ?? 0) > now
        ? 'Daily quota exhausted until Pacific midnight'
        : (status?.cooldownUntil ?? 0) > now
          ? `Cooling down for ${Math.ceil(((status?.cooldownUntil ?? now) - now) / 1000)}s`
          : '';
    return [id, { configured: Boolean(key), last4, model: s.apiKeySlots[id]?.model ?? '', status: message }];
  })) as Record<ApiKeySlotId, SafeApiKeySlot>;
  return {
    ...s,
    geminiApiKey: '',
    apiKeySlots: slots,
    hasApiKey: Boolean(s.geminiApiKey || Object.values(s.apiKeySlots).some((slot) => slot.apiKey)),
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
