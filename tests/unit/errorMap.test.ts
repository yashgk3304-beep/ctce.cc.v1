import { describe, expect, it } from 'vitest';
import {
  ERROR_MAP,
  formatRateLimitMessage,
  getErrorRow,
  mapHttpStatusToErrorId,
} from '../../src/shared/errorMap';

describe('ERROR_MAP', () => {
  it.each(ERROR_MAP.map((row) => [row.id, row.action] as const))('%s action is %s', (id, action) => {
    const row = getErrorRow(id);
    expect(row).toBeDefined();
    expect(row?.action).toBe(action);
    expect(row?.userMessage.length).toBeGreaterThan(0);
  });

  it('formatRateLimitMessage', () => {
    expect(formatRateLimitMessage(30)).toBe('Rate limit, retry in 30 s');
  });

  it('mapHttpStatusToErrorId', () => {
    expect(mapHttpStatusToErrorId(401)).toBe('auth_invalid');
    expect(mapHttpStatusToErrorId(429)).toBe('rate_limit');
    expect(mapHttpStatusToErrorId(503)).toBe('server_error');
  });
});
