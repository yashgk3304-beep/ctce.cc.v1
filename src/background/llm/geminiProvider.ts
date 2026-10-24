import { GoogleGenAI } from '@google/genai';
import { LlmError, type LlmGenerateOptions, type LlmGenerateResult, type LlmProvider } from './types';

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TEMPERATURE = 0.2;
const LIST_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function clampTemperature(t?: number): number {
  const v = t ?? MAX_TEMPERATURE;
  return Math.min(MAX_TEMPERATURE, Math.max(0, v));
}

function mapError(err: unknown, status?: number): LlmError {
  if (err instanceof LlmError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  if (status === 401 || status === 403) return new LlmError(msg, 'auth', status);
  if (status === 400 || /not found|NOT_FOUND/i.test(msg)) return new LlmError(msg, 'not_found', status);
  if (status === 429) return new LlmError(msg, 'rate_limit', status);
  if (status !== undefined && status >= 500) return new LlmError(msg, 'server', status);
  if (/abort|timeout/i.test(msg)) return new LlmError(msg, 'timeout');
  if (/blocked|safety|empty/i.test(msg)) return new LlmError(msg, 'blocked');
  return new LlmError(msg, 'unknown', status);
}

export class GeminiProvider implements LlmProvider {
  readonly id = 'gemini';

  constructor(private readonly apiKey = '') {}

  async listModels(apiKey?: string, signal?: AbortSignal): Promise<string[]> {
    const key = apiKey || this.apiKey;
    try {
      const ai = new GoogleGenAI({ apiKey: key });
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
      if (names.length) return names;
    } catch {
      /* REST fallback */
    }
    return listModelsRest(key, signal);
  }

  async generate(options: LlmGenerateOptions): Promise<LlmGenerateResult> {
    const temperature = clampTemperature(options.temperature);
    const key = options.apiKey || this.apiKey;
    const ctrl = options.signal ?? new AbortController().signal;
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: options.model,
        contents: options.userText,
        config: {
          temperature,
          maxOutputTokens: options.maxOutputTokens ?? 8192,
          responseMimeType: 'application/json',
          ...(options.responseSchema ? { responseSchema: options.responseSchema } : {}),
          systemInstruction: options.systemInstruction,
          abortSignal: ctrl instanceof AbortSignal ? ctrl : undefined,
        },
      });
      const text = (response as { text?: string }).text ?? '';
      const finish = (response as { candidates?: Array<{ finishReason?: string }> }).candidates?.[0]
        ?.finishReason;
      if (!text.trim()) throw new LlmError('Empty candidate', 'blocked');
      return { text, model: options.model, finishReason: finish };
    } catch (err) {
      if (err instanceof LlmError) throw err;
      return generateRest({ ...options, apiKey: key, temperature }, ctrl);
    }
  }

  async *generateStream(options: LlmGenerateOptions): AsyncGenerator<string, LlmGenerateResult> {
    const full = await this.generate(options);
    yield full.text;
    return full;
  }
}

async function listModelsRest(apiKey: string, signal?: AbortSignal): Promise<string[]> {
  const names: string[] = [];
  let pageToken = '';
  do {
    const url = new URL(LIST_URL);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url.toString(), {
      headers: { 'x-goog-api-key': apiKey },
      signal,
    });
    if (!res.ok) throw mapError(await res.text(), res.status);
    const body = (await res.json()) as {
      models?: Array<{
        name?: string;
        supportedGenerationMethods?: string[];
      }>;
      nextPageToken?: string;
    };
    for (const m of body.models ?? []) {
      const name = m.name?.replace(/^models\//, '') ?? '';
      const methods = m.supportedGenerationMethods ?? [];
      if (!name) continue;
      if (methods.length && !methods.includes('generateContent')) continue;
      names.push(name);
    }
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  return names;
}

async function generateRest(
  options: LlmGenerateOptions,
  signal?: AbortSignal,
): Promise<LlmGenerateResult> {
  const model = options.model.replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const generationConfig: Record<string, unknown> = {
    temperature: clampTemperature(options.temperature),
    maxOutputTokens: options.maxOutputTokens ?? 8192,
    responseMimeType: 'application/json',
  };
  if (options.responseSchema) generationConfig.responseSchema = options.responseSchema;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), DEFAULT_TIMEOUT_MS);
  const onAbort = () => ac.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': options.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: options.systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: options.userText }] }],
        generationConfig,
      }),
      signal: ac.signal,
    });
    if (!res.ok) throw mapError(await res.text(), res.status);
    const data = (await res.json()) as {
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const cand = data.candidates?.[0];
    const text = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text.trim()) throw new LlmError('Empty candidate', 'blocked');
    if (cand?.finishReason && cand.finishReason !== 'STOP' && cand.finishReason !== 'MAX_TOKENS') {
      throw new LlmError(`finishReason=${cand.finishReason}`, 'blocked');
    }
    return { text, model: options.model, finishReason: cand?.finishReason };
  } catch (err) {
    if (err instanceof LlmError) throw err;
    throw mapError(err);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export const geminiProvider = new GeminiProvider();
