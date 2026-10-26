import type {
  ApiKeySlot,
  ApiKeySlotId,
  ApiKeySlotStatus,
  Settings,
} from '../../shared/types';
import type { LlmGenerateResult } from './types';
import { LlmError } from './types';

const SLOT_ORDER: ApiKeySlotId[] = ['primary', 'backup1', 'backup2'];
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export interface ConfiguredApiKeySlot {
  id: ApiKeySlotId;
  apiKey: string;
  model: string;
}

export function getConfiguredApiKeySlots(settings: Settings): ConfiguredApiKeySlot[] {
  const slots = settings.apiKeySlots ?? {
    primary: { apiKey: settings.geminiApiKey, model: settings.fastModel },
    backup1: { apiKey: '', model: '' },
    backup2: { apiKey: '', model: '' },
  };
  return SLOT_ORDER.flatMap((id) => {
    const slot = slots[id] as ApiKeySlot | undefined;
    const apiKey = slot?.apiKey || (id === 'primary' ? settings.geminiApiKey : '');
    if (!apiKey) return [];
    return [{ id, apiKey, model: slot?.model ?? '' }];
  });
}

export function nextPacificMidnight(from = Date.now()): number {
  const zone = 'America/Los_Angeles';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const localParts = (value: number) => {
    const parts = formatter.formatToParts(new Date(value));
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);
    return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') };
  };
  const nowParts = localParts(from);
  const targetDateUtc = Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day + 1);
  let candidate = targetDateUtc + 8 * 60 * 60 * 1000;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const p = localParts(candidate);
    const representedAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour);
    const offset = representedAsUtc - candidate;
    const next = targetDateUtc - offset;
    if (next === candidate) break;
    candidate = next;
  }
  return candidate;
}

function statusUntil(status: ApiKeySlotStatus | undefined, now: number): number {
  if (!status) return 0;
  if (status.invalid) return Number.POSITIVE_INFINITY;
  return Math.max(status.cooldownUntil ?? 0, status.exhaustedUntil ?? 0, now);
}

function errorStatus(error: unknown): number | undefined {
  if (error instanceof LlmError) return error.status;
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const value = (error as { status?: unknown }).status;
    return typeof value === 'number' ? value : undefined;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shouldTryNext(error: unknown, status?: number): boolean {
  if (status !== undefined) return RETRYABLE_STATUSES.has(status) || [400, 401, 403].includes(status);
  return /network|failed to fetch|connection|fetch failed/i.test(errorMessage(error));
}

export interface FallbackCallResult extends LlmGenerateResult {
  apiKeySlot: ApiKeySlotId;
  modelPath: string[];
  totalRequestAttempts: number;
}

export async function generateWithApiKeyFallback(
  settings: Settings,
  preferredModel: string,
  call: (slot: ConfiguredApiKeySlot, model: string) => Promise<LlmGenerateResult>,
  persistStatus: (id: ApiKeySlotId, status: ApiKeySlotStatus | undefined) => Promise<void>,
  now = Date.now(),
): Promise<FallbackCallResult> {
  const slots = getConfiguredApiKeySlots(settings);
  if (slots.length === 0) throw new LlmError('Add a Gemini API key in Options.', 'auth');
  const attempted: ApiKeySlotId[] = [];
  const modelPath: string[] = [];
  let attempts = 0;
  let sawRateLimit = false;
  const unavailable: string[] = [];
  const statuses = settings.apiKeySlotStatus ?? {};

  for (const slot of slots) {
    const slotStatus = statuses[slot.id];
    if (statusUntil(slotStatus, now) > now) {
      const reason = slotStatus?.invalid
        ? 'invalid key'
        : slotStatus?.exhaustedUntil && slotStatus.exhaustedUntil > now
          ? 'daily quota exhausted'
          : 'cooling down';
      unavailable.push(`${slot.id}: ${reason}`);
      continue;
    }
    if (slotStatus) await persistStatus(slot.id, undefined);

    const model = slot.model || preferredModel || settings.fastModel;
    if (!model) {
      unavailable.push(`${slot.id}: no model selected`);
      continue;
    }
    attempted.push(slot.id);
    modelPath.push(`${slot.id}:${model}`);
    try {
      const result = await call(slot, model);
      await persistStatus(slot.id, undefined);
      attempts += Math.max(1, result.requestAttempts ?? 1);
      return {
        ...result,
        model,
        apiKeySlot: slot.id,
        modelPath,
        totalRequestAttempts: attempts,
      };
    } catch (error) {
      const status = errorStatus(error);
      const message = errorMessage(error);
      attempts += error instanceof LlmError ? Math.max(1, error.requestAttempts ?? 1) : 1;
      if (status === 400 || status === 401 || status === 403) {
        await persistStatus(slot.id, { invalid: true, lastError: 'invalid_key' });
      } else if (status === 429) {
        sawRateLimit = true;
        const quotaId = error instanceof LlmError ? error.quotaId : undefined;
        if (/perday/i.test(quotaId ?? message)) {
          await persistStatus(slot.id, {
            exhaustedUntil: nextPacificMidnight(now),
            lastError: 'daily_quota',
          });
        } else {
          const requestedDelay = error instanceof LlmError ? error.retryDelayMs : undefined;
          const delay = Math.max(1_000, Math.min(requestedDelay ?? 60_000, 24 * 60 * 60 * 1000));
          await persistStatus(slot.id, { cooldownUntil: now + delay, lastError: 'rate_limit' });
        }
      }
      if (!shouldTryNext(error, status)) {
        if (error instanceof LlmError) {
          throw new LlmError(
            `${slot.id} key failed: ${message}`,
            error.code,
            error.status,
            attempts,
            error.retryDelayMs,
            error.quotaId,
            slot.id,
            attempted,
          );
        }
        throw error;
      }
    }
  }

  const suffix = unavailable.length ? ` (${unavailable.join('; ')})` : '';
  const attemptedNames = attempted.length ? attempted.join(' → ') : 'none';
  const finalMessage = attempted.length === 0
    ? `No Gemini request was sent. All configured key slots are unavailable (${unavailable.join('; ')}). Check Options for another usable key/model, or reset status if this is stale.`
    : `No configured API key could answer the request. Tried: ${attemptedNames}.${suffix}`;
  throw new LlmError(
    finalMessage,
    sawRateLimit ? 'rate_limit' : 'auth',
    undefined,
    attempts,
    undefined,
    undefined,
    undefined,
    attempted,
  );
}

export function statusLabel(status: ApiKeySlotStatus | undefined, now = Date.now()): string {
  if (!status) return '';
  if (status.invalid) return 'Invalid key — reset status after correcting it';
  if ((status.exhaustedUntil ?? 0) > now) return 'Daily quota exhausted until Pacific midnight';
  if ((status.cooldownUntil ?? 0) > now) {
    const seconds = Math.ceil((status.cooldownUntil! - now) / 1000);
    return `Cooling down for ${seconds}s`;
  }
  return '';
}
