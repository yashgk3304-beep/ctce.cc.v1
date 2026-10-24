import { formatRateLimitMessage, getErrorRow, mapHttpStatusToErrorId, type ErrorRow } from '../shared/errorMap';
import { LlmError } from './llm/types';

export function jitterBackoffMs(attempt: number, base = 800): number {
  const exp = Math.min(base * 2 ** attempt, 8_000);
  return Math.round(exp * (0.5 + Math.random() * 0.5));
}

export function classifyLlmFailure(err: unknown): ErrorRow {
  if (err instanceof LlmError) {
    const id =
      err.code === 'auth'
        ? 'auth_invalid'
        : err.code === 'not_found'
          ? 'model_not_found'
          : err.code === 'rate_limit'
            ? 'rate_limit'
            : err.code === 'timeout'
              ? 'timeout'
              : err.code === 'blocked'
                ? 'blocked_or_empty'
                : 'server_error';
    return getErrorRow(id)!;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/offline|Failed to fetch|NetworkError/i.test(msg)) return getErrorRow('offline')!;
  if (/timeout|abort/i.test(msg)) return getErrorRow('timeout')!;
  return getErrorRow('server_error')!;
}

export function rowFromHttpStatus(status: number): ErrorRow {
  return getErrorRow(mapHttpStatusToErrorId(status))!;
}

export function rateLimitUserMessage(retryAfterSeconds: number): string {
  return formatRateLimitMessage(retryAfterSeconds);
}

export function parseRetryAfter(header: string | null, body: string): number {
  if (header) {
    const n = Number(header);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const m = /retry in (\d+)/i.exec(body);
  if (m?.[1]) return Number(m[1]);
  return 15;
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}
