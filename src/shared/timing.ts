export type TimingFields = Record<string, string | number | boolean | null | undefined>;

export function logStageTiming(
  enabled: boolean,
  stage: string,
  startedAt: number,
  fields: TimingFields = {},
): void {
  if (!enabled) return;
  const elapsedMs = Math.round((performance.now() - startedAt) * 10) / 10;
  console.info('[ctc-timing]', { stage, elapsedMs, ...fields });
}

export function logTimingEvent(enabled: boolean, stage: string, fields: TimingFields = {}): void {
  if (!enabled) return;
  console.info('[ctc-timing]', { stage, ...fields });
}

export function safeErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  if (error instanceof Error) return error.name;
  return 'unknown';
}
