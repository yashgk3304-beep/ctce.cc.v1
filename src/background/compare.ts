import type { CompareMode } from '../shared/types';
import { normalizeText, toLf } from '../shared/normalize';

export interface MatchModes {
  strict: boolean;
  trimmed: boolean;
  whitespaceInsensitive: boolean;
  echoAware: boolean;
}

function collapseWs(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function echoAwareExpected(expected: string, sampleInput: string): string {
  let out = toLf(expected);
  if (!sampleInput.trim()) return out;
  const tokens = toLf(sampleInput)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  for (const token of tokens) {
    const idx = out.indexOf(token);
    if (idx === -1) continue;
    let end = idx + token.length;
    if (out[end] === '\n' || out[end] === '\r') end += 1;
    out = out.slice(0, idx) + out.slice(end);
  }
  return out;
}

export function compareOutputs(
  expected: string,
  actual: string,
  mode: CompareMode,
  sampleInput?: string,
): boolean {
  const exp = toLf(expected);
  const act = toLf(actual);
  switch (mode) {
    case 'strict':
      return exp === act;
    case 'trimmed':
      return exp.trim() === act.trim();
    case 'whitespaceInsensitive':
      return collapseWs(normalizeText(exp)) === collapseWs(normalizeText(act));
    case 'echoAware':
      return (
        collapseWs(normalizeText(echoAwareExpected(exp, sampleInput ?? ''))) ===
        collapseWs(normalizeText(act))
      );
    default:
      return exp === act;
  }
}

export function allMatchModes(expected: string, actual: string, sampleInput = ''): MatchModes {
  return {
    strict: compareOutputs(expected, actual, 'strict', sampleInput),
    trimmed: compareOutputs(expected, actual, 'trimmed', sampleInput),
    whitespaceInsensitive: compareOutputs(expected, actual, 'whitespaceInsensitive', sampleInput),
    echoAware: compareOutputs(expected, actual, 'echoAware', sampleInput),
  };
}

export function bestCompareMode(matches: MatchModes): CompareMode | null {
  if (matches.strict) return 'strict';
  if (matches.trimmed) return 'trimmed';
  if (matches.whitespaceInsensitive) return 'whitespaceInsensitive';
  if (matches.echoAware) return 'echoAware';
  return null;
}

export function unifiedLineDiff(expected: string, actual: string): string {
  const e = toLf(expected).split('\n');
  const a = toLf(actual).split('\n');
  const lines: string[] = [];
  const n = Math.max(e.length, a.length);
  for (let i = 0; i < n; i++) {
    if (e[i] === a[i]) continue;
    if (e[i] !== undefined) lines.push(`- ${e[i]}`);
    if (a[i] !== undefined) lines.push(`+ ${a[i]}`);
  }
  return lines.join('\n');
}

export function firstMismatch(
  expectedLines: string[],
  actualLines: string[],
  whitespaceTolerant: boolean,
): { line: number; column: number; expected: string; actual: string } | null {
  const n = Math.max(expectedLines.length, actualLines.length);
  for (let i = 0; i < n; i++) {
    const e = expectedLines[i] ?? '';
    const a = actualLines[i] ?? '';
    const ee = whitespaceTolerant ? e.replace(/\s+/g, ' ').trim() : e;
    const aa = whitespaceTolerant ? a.replace(/\s+/g, ' ').trim() : a;
    if (ee === aa) continue;
    let col = 0;
    const max = Math.max(e.length, a.length);
    for (; col < max; col++) {
      if (e[col] !== a[col]) break;
    }
    return { line: i + 1, column: col + 1, expected: e, actual: a };
  }
  return null;
}

export function likelyTypos(actual: string): string[] {
  const hints: string[] = [];
  const opens = (actual.match(/\{/g) ?? []).length;
  const closes = (actual.match(/\}/g) ?? []).length;
  if (opens !== closes) hints.push('unbalanced { }');
  const parensOpen = (actual.match(/\(/g) ?? []).length;
  const parensClose = (actual.match(/\)/g) ?? []).length;
  if (parensOpen !== parensClose) hints.push('unbalanced ( )');
  if (/return\s*$/m.test(actual) || /return\s*;/m.test(actual) && /return\s*;\s*$/m.test(actual)) {
    /* empty */
  }
  if (/int\s+main\s*\([^)]*\)\s*\{[^}]*$/.test(actual) && !/;/.test(actual.split('\n').slice(-3).join(''))) {
    hints.push('missing ;');
  }
  return hints;
}

export function pickCompareMode(hasEcho: boolean): CompareMode {
  return hasEcho ? 'echoAware' : 'trimmed';
}
