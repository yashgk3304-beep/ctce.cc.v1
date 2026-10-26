import type { ApiKeySlotId } from '../../shared/types';

export interface LlmGenerateOptions {
  model: string;
  systemInstruction: string;
  userText: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Gemini responseSchema / JSON mode */
  responseSchema?: Record<string, unknown>;
  apiKey: string;
  signal?: AbortSignal;
  debugTimings?: boolean;
}

export interface LlmGenerateResult {
  text: string;
  model: string;
  finishReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  requestAttempts?: number;
  apiKeySlot?: ApiKeySlotId;
  modelPath?: string[];
  totalRequestAttempts?: number;
}

export interface LlmProvider {
  readonly id: string;
  listModels(apiKey: string, signal?: AbortSignal): Promise<string[]>;
  generate(options: LlmGenerateOptions): Promise<LlmGenerateResult>;
  generateStream?(
    options: LlmGenerateOptions,
  ): AsyncGenerator<string, LlmGenerateResult, undefined>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'auth'
      | 'not_found'
      | 'rate_limit'
      | 'server'
      | 'timeout'
      | 'blocked'
      | 'unknown',
    readonly status?: number,
    readonly requestAttempts?: number,
    readonly retryDelayMs?: number,
    readonly quotaId?: string,
    readonly apiKeySlot?: ApiKeySlotId,
    readonly attemptedSlots: ApiKeySlotId[] = [],
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
