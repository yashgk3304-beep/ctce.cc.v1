import { describe, expect, it } from 'vitest';
import { compareOutputs, echoAwareExpected } from '../../src/background/compare';

describe('compareOutputs', () => {
  it('strict equality', () => {
    expect(compareOutputs('a\n', 'a\n', 'strict')).toBe(true);
    expect(compareOutputs('a', 'a ', 'strict')).toBe(false);
  });

  it('trimmed', () => {
    expect(compareOutputs(' 15 \n', '15', 'trimmed')).toBe(true);
  });

  it('whitespaceInsensitive', () => {
    expect(compareOutputs('15\n', '  15  ', 'whitespaceInsensitive')).toBe(true);
  });

  it('echoAware removes input tokens in order', () => {
    const expected = '10 5 15';
    expect(echoAwareExpected(expected, '10 5')).toBe('  15');
    expect(compareOutputs('10 5 15', '15', 'echoAware', '10 5')).toBe(true);
  });
});
