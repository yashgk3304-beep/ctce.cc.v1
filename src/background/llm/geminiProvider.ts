import { GoogleGenAI } from '@google/genai';
import { LlmError, type LlmGenerateOptions, type LlmGenerateResult, type LlmProvider } from './types';
import { logStageTiming } from '../../shared/timing';

const DEFAULT_TIMEOUT_MS = 30_000;
const RETRY_OPTIONS = {
  // Retry once in generate() so attempt counts and abort handling stay scoped
  // to the request, even when the singleton client serves overlapping calls.
  attempts: 1,
};
const RETRYABLE_STATUSES = new Set([408, 500, 502, 503, 504]);
const MAX_REQUEST_ATTEMPTS = 2;
const RETRY_DELAY_MS = 200;
const MAX_TEMPERATURE = 0.2;

function clampTemperature(t?: number): number {
  const v = t ?? MAX_TEMPERATURE;
  return Math.min(MAX_TEMPERATURE, Math.max(0, v));
}

function mapError(err: unknown, status?: number, requestAttempts = 1): LlmError {
  if (err instanceof LlmError) {
    return new LlmError(
      err.message,
      err.code,
      err.status,
      requestAttempts,
      err.retryDelayMs,
      err.quotaId,
      err.apiKeySlot,
      err.attemptedSlots,
    );
  }
  const msg = err instanceof Error ? err.message : String(err);
  let details = '';
  try {
    details = JSON.stringify(err) ?? '';
  } catch {
    // SDK error objects may contain circular request/response references.
  }
  const serialized = `${msg} ${details}`;
  const retrySeconds = /"retryDelay"\s*:\s*"([\d.]+)s"|retry in ([\d.]+)s/i.exec(serialized);
  const retryDelayMs = Number(retrySeconds?.[1] ?? retrySeconds?.[2]) * 1000 || undefined;
  const quotaId = /"quotaId"\s*:\s*"([^"]+)"/i.exec(serialized)?.[1];
  const code = status === 401 || status === 403
    ? 'auth'
    : status === 400 || /not found|NOT_FOUND/i.test(msg)
      ? 'not_found'
      : status === 429
        ? 'rate_limit'
        : status !== undefined && status >= 500
          ? 'server'
          : /abort|timeout/i.test(msg)
            ? 'timeout'
            : /blocked|safety|empty/i.test(msg)
              ? 'blocked'
              : 'unknown';
  return new LlmError(msg, code, status, requestAttempts, retryDelayMs, quotaId);
}

function errorStatus(err: unknown): number | undefined {
  return typeof err === 'object' && err !== null && 'status' in err &&
      typeof (err as { status?: unknown }).status === 'number'
    ? (err as { status: number }).status
    : undefined;
}

function isRetryable(err: unknown, status?: number): boolean {
  if (status !== undefined) return RETRYABLE_STATUSES.has(status);
  return err instanceof TypeError && /fetch|network|connection/i.test(err.message);
}

function waitBeforeRetry(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new LlmError('Request aborted', 'timeout'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, RETRY_DELAY_MS);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new LlmError('Request aborted', 'timeout'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export class GeminiProvider implements LlmProvider {
  readonly id = 'gemini';
  private client: GoogleGenAI | null = null;
  private clientApiKey = '';

  constructor(private readonly apiKey = '') {}

  private getClient(apiKey: string): GoogleGenAI {
    if (!apiKey) throw new LlmError('Gemini API key is missing', 'auth');
    if (!this.client || this.clientApiKey !== apiKey) {
      this.client = new GoogleGenAI({
        apiKey,
        httpOptions: {
          timeout: DEFAULT_TIMEOUT_MS,
          retryOptions: RETRY_OPTIONS,
        },
      });
      this.clientApiKey = apiKey;
    }
    return this.client;
  }

  async listModels(apiKey?: string, signal?: AbortSignal): Promise<string[]> {
    const key = apiKey || this.apiKey;
    if (signal?.aborted) throw new LlmError('Request aborted', 'timeout');
    const ai = this.getClient(key);
    const pager = await ai.models.list();
    const names: string[] = [];
    for await (const m of pager as AsyncIterable<{
      name?: string;
      supportedActions?: string[];
      supportedGenerationMethods?: string[];
    }>) {
      const name = m.name?.replace(/^models\//, '');
      const actions = [...(m.supportedActions ?? []), ...(m.supportedGenerationMethods ?? [])];
      if (!name) continue;
      if (actions.length && !actions.includes('generateContent')) continue;
      names.push(name);
    }
    return names;
  }

  async generate(options: LlmGenerateOptions): Promise<LlmGenerateResult> {
    const temperature = clampTemperature(options.temperature);
    const key = options.apiKey || this.apiKey;
    const startedAt = performance.now();
    let requestAttempts = 0;
    try {
      const ai = this.getClient(key);
      for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
        if (options.signal?.aborted) throw new LlmError('Request aborted', 'timeout');
        requestAttempts = attempt;
        try {
          const response = await ai.models.generateContent({
            model: options.model,
            contents: options.userText,
            config: {
              temperature,
              maxOutputTokens: options.maxOutputTokens ?? 8192,
              responseMimeType: 'application/json',
              ...(options.responseSchema ? { responseSchema: options.responseSchema } : {}),
              systemInstruction: options.systemInstruction,
              ...(options.signal ? { abortSignal: options.signal } : {}),
            },
          });
          const text = (response as { text?: string }).text ?? '';
          const finish = (response as { candidates?: Array<{ finishReason?: string }> }).candidates?.[0]
            ?.finishReason;
          if (!text.trim()) throw new LlmError('Empty candidate', 'blocked');
          const usageMetadata = (response as {
            usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
          }).usageMetadata;
          const result: LlmGenerateResult = {
            text,
            model: options.model,
            finishReason: finish,
            usage: {
              inputTokens: usageMetadata?.promptTokenCount,
              outputTokens: usageMetadata?.candidatesTokenCount,
            },
            requestAttempts,
          };
          logStageTiming(options.debugTimings === true, 'gemini_api_request', startedAt, {
            modelId: options.model,
            inputTokens: result.usage?.inputTokens ?? null,
            outputTokens: result.usage?.outputTokens ?? null,
            requestAttempts,
            retryAttempts: Math.max(0, requestAttempts - 1),
            finishReason: finish ?? null,
          });
          return result;
        } catch (err) {
          const status = errorStatus(err);
          if (
            attempt < MAX_REQUEST_ATTEMPTS &&
            !options.signal?.aborted &&
            isRetryable(err, status)
          ) {
            await waitBeforeRetry(options.signal);
            continue;
          }
          throw mapError(err, status, requestAttempts);
        }
      }
      throw new LlmError('Gemini request failed', 'unknown', undefined, requestAttempts);
    } catch (err) {
      const status = errorStatus(err);
      const mapped = mapError(err, status, requestAttempts);
      logStageTiming(options.debugTimings === true, 'gemini_api_request', startedAt, {
        modelId: options.model,
        requestAttempts,
        retryAttempts: Math.max(0, requestAttempts - 1),
        errorCode: mapped.code,
        httpStatus: mapped.status ?? null,
      });
      // The request already used its bounded attempts; a REST fallback here
      // would repeat the same failed generateContent operation.
      throw mapped;
    }
  }

  async *generateStream(options: LlmGenerateOptions): AsyncGenerator<string, LlmGenerateResult> {
    const full = await this.generate(options);
    yield full.text;
    return full;
  }
}

const providersByKey = new Map<string, GeminiProvider>();

/** Reuse one service-worker-scoped Gemini client per configured key slot. */
export function getGeminiProvider(apiKey: string): GeminiProvider {
  let provider = providersByKey.get(apiKey);
  if (!provider) {
    provider = new GeminiProvider(apiKey);
    providersByKey.set(apiKey, provider);
  }
  return provider;
}
