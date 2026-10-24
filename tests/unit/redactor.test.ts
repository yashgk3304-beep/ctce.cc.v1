import { describe, expect, it } from 'vitest';
import { redactText } from '../../src/shared/redact';

describe('redactText', () => {
  it('redacts college email from header text', () => {
    const { text, redactedCount } = redactText('Contact student@college.edu.in for help');
    expect(text).not.toContain('college.edu.in');
    expect(text).toContain('[REDACTED]');
    expect(redactedCount).toBeGreaterThan(0);
  });

  it('preserves short sample numbers', () => {
    const { text, redactedCount } = redactText('Input: 10 5');
    expect(text).toBe('Input: 10 5');
    expect(redactedCount).toBe(0);
  });
});
