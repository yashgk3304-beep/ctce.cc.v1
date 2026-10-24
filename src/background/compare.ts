import type { CompareMode } from '../shared/types';
import { normalizeText } from '../shared/normalize';

export function compareOutputs(
  expected: string,
  actual: string,
  mode: CompareMode,
  sampleInput?: string,
): boolean {
  switch (mode) {
    case 'strict':
      return expected === actual;
    case 'trimmed':
      return expected.trim() === actual.trim();
    case 'whitespaceInsensitive':
      return collapseWs(normalizeText(expected)) === collapseWs(normalizeText(actual));
    case 'echoAware':
      return (
        collapseWs(normalizeText(echoAwareExpected(expected, sampleInput ?? ''))) ===
        collapseWs(normalizeText(actual))
      );
    default:
      return expected === actual;
  }
}

function collapseWs(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Remove sample input tokens from expected output in order (common judge echo).
 */
export function echoAwareExpected(expected: string, sampleInput: string): string {
  if (!sampleInput.trim()) return expected;
  const tokens = tokenize(sampleInput);
  let out = expected;
  for (const token of tokens) {
    const idx = out.indexOf(token);
    if (idx !== -1) {
      out = out.slice(0, idx) + out.slice(idx + token.length);
    }
  }
  return out;
}

function tokenize(input: string): string[] {
  return input
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function pickCompareMode(hasEcho: boolean): CompareMode {
  return hasEcho ? 'echoAware' : 'trimmed';
}
