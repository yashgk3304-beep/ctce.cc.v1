import type { LlmGenerateOptions, LlmGenerateResult, LlmProvider } from './types';

export interface MockProviderHandlers {
  listModels?: () => string[] | Promise<string[]>;
  generate?: (options: LlmGenerateOptions) => string | Promise<string>;
}

export class MockLlmProvider implements LlmProvider {
  readonly id = 'mock';
  calls: LlmGenerateOptions[] = [];

  constructor(private handlers: MockProviderHandlers = {}) {}

  async listModels(_apiKey: string): Promise<string[]> {
    const v = this.handlers.listModels?.();
    return v ? await Promise.resolve(v) : ['mock-fast', 'mock-strong'];
  }

  async generate(options: LlmGenerateOptions): Promise<LlmGenerateResult> {
    this.calls.push(options);
    const raw = this.handlers.generate?.(options);
    const text = raw ? await Promise.resolve(raw) : '{"type":"unknown","confidence":0.1,"evidence":["mock"]}';
    return { text, model: options.model };
  }
}
