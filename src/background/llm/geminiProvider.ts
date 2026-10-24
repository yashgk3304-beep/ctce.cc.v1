import { GoogleGenAI } from '@google/genai';
import { LlmError, type LlmGenerateOptions, type LlmGenerateResult, type LlmProvider } from './types';

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TEMPERATURE = 0.2;

function clampTemperature(t?: number): number {
  const v = t ?? MAX_TEMPERATURE;
  return Math.min(MAX_TEMPERATURE, Math.max(0, v));
}

function mapError(err: unknown, status?: number): LlmError {
  if (err instanceof LlmError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  if (status === 401 || status === 403) return new LlmError(msg, 'auth', status);
  if (status === 400) return new LlmError(msg, 'not_found', status);
  if (status === 429) return new LlmError(msg, 'rate_limit', status);
  if (status !== undefined && status >= 500) return new LlmError(msg, 'server', status);
  if (/abort|timeout/i.test(msg)) return new LlmError(msg, 'timeout');
  if (/blocked|safety|empty/i.test(msg)) return new LlmError(msg, 'blocked');
  return new LlmError(msg, 'unknown', status);
}

async function withTimeout<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new LlmError('Aborted', 'timeout');
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new LlmError('Request timed out', 'timeout')), DEFAULT_TIMEOUT_MS);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new LlmError('Aborted', 'timeout'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    promise
      .then((v) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(e);
      });
  });
}

async function listModelsRest(apiKey: string, signal?: AbortSignal): Promise<string[]> {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models';
  const res = await fetch(url, {
    headers: { 'x-goog-api-key': apiKey },
    signal,
  });
  if (!res.ok) throw mapError(await res.text(), res.status);
  const body = (await res.json()) as { models?: Array<{ name?: string }> };
  return (body.models ?? [])
    .map((m) => m.name?.replace(/^models\//, '') ?? '')
    .filter(Boolean);
}

async function generateRest(options: LlmGenerateOptions): Promise<LlmGenerateResult> {
  const model = options.model.replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const generationConfig: Record<string, unknown> = {
    temperature: clampTemperature(options.temperature),
    maxOutputTokens: options.maxOutputTokens ?? 8192,
    responseMimeType: 'application/json',
  };
  if (options.responseSchema) {
    generationConfig.responseSchema = options.responseSchema;
  }
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
    signal: options.signal,
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
  return { text, model: options.model, finishReason: cand?.finishReason };
}

export class GeminiProvider implements LlmProvider {
  readonly id = 'gemini';

  async listModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const pager = await withTimeout(
        ai.models.list() as Promise<AsyncIterable<{ name?: string }>>,
        signal,
      );
      const names: string[] = [];
      for await (const m of pager) {
        const name = m.name?.replace(/^models\//, '');
        if (name) names.push(name);
      }
      if (names.length) return names;
    } catch {
      // fall through to REST
    }
    return listModelsRest(apiKey, signal);
  }

  async generate(options: LlmGenerateOptions): Promise<LlmGenerateResult> {
    const temperature = clampTemperature(options.temperature);
    try {
      const ai = new GoogleGenAI({ apiKey: options.apiKey });
      const response = await withTimeout(
        ai.models.generateContent({
          model: options.model,
          contents: options.userText,
          config: {
            temperature,
            maxOutputTokens: options.maxOutputTokens ?? 8192,
            responseMimeType: 'application/json',
            ...(options.responseSchema ? { responseSchema: options.responseSchema } : {}),
            systemInstruction: options.systemInstruction,
          },
        }),
        options.signal,
      );

      const text = response.text ?? '';
      if (!text.trim()) throw new LlmError('Empty candidate', 'blocked');
      return {
        text,
        model: options.model,
        finishReason: response.candidates?.[0]?.finishReason,
      };
    } catch (err) {
      if (err instanceof LlmError) throw err;
      return withTimeout(generateRest({ ...options, temperature }), options.signal);
    }
  }

  async *generateStream(options: LlmGenerateOptions): AsyncGenerator<string, LlmGenerateResult> {
    const full = await this.generate(options);
    yield full.text;
    return full;
  }
}

export const geminiProvider = new GeminiProvider();
