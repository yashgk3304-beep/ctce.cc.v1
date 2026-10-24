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
}

export interface LlmGenerateResult {
  text: string;
  model: string;
  finishReason?: string;
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
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
