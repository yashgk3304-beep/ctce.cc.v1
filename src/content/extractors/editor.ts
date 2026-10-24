import type { EditorData, EditorEngine, ExtractResult } from '../../shared/types';
import { mapWhitespaceGlyphs, toLf } from '../../shared/normalize';
import {
  ACE_SELECTORS,
  CODEMIRROR5_SELECTORS,
  CODEMIRROR6_SELECTORS,
  EDITOR_ROOT_SELECTORS,
  MONACO_SELECTORS,
} from '../selectors.config';

export function detectEditorEngine(doc: Document): { engine: EditorEngine; root: Element | null } {
  if (doc.querySelector(MONACO_SELECTORS.root)) {
    return { engine: 'monaco', root: doc.querySelector(MONACO_SELECTORS.root) };
  }
  if (doc.querySelector(ACE_SELECTORS.root)) {
    return { engine: 'ace', root: doc.querySelector(ACE_SELECTORS.root) };
  }
  if (doc.querySelector(CODEMIRROR6_SELECTORS.root)) {
    return { engine: 'codemirror6', root: doc.querySelector(CODEMIRROR6_SELECTORS.root) };
  }
  if (doc.querySelector(CODEMIRROR5_SELECTORS.root)) {
    return { engine: 'codemirror5', root: doc.querySelector(CODEMIRROR5_SELECTORS.root) };
  }
  for (const sel of EDITOR_ROOT_SELECTORS) {
    const root = doc.querySelector(sel);
    if (root) return { engine: 'unknown', root };
  }
  return { engine: 'unknown', root: null };
}

function parseLineNumber(text: string): number | null {
  const n = parseInt(text.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function visibleRangeMonaco(root: Element): { start: number; end: number } {
  const nums = [...root.querySelectorAll(MONACO_SELECTORS.lineNumberCell)]
    .map((el) => parseLineNumber(el.textContent ?? ''))
    .filter((n): n is number => n !== null);
  if (nums.length === 0) return { start: 1, end: 1 };
  return { start: Math.min(...nums), end: Math.max(...nums) };
}

function visibleRangeAce(root: Element): { start: number; end: number } {
  const nums = [...root.querySelectorAll(ACE_SELECTORS.gutter)]
    .map((el) => parseLineNumber(el.textContent ?? ''))
    .filter((n): n is number => n !== null);
  if (nums.length === 0) return { start: 1, end: 1 };
  return { start: Math.min(...nums), end: Math.max(...nums) };
}

function visibleRangeCm5(root: Element): { start: number; end: number } {
  const nums = [...root.querySelectorAll(CODEMIRROR5_SELECTORS.gutter)]
    .map((el) => parseLineNumber(el.textContent ?? ''))
    .filter((n): n is number => n !== null);
  if (nums.length === 0) return { start: 1, end: 1 };
  return { start: Math.min(...nums), end: Math.max(...nums) };
}

function visibleRangeCm6(root: Element): { start: number; end: number } {
  const nums = [...root.querySelectorAll(CODEMIRROR6_SELECTORS.gutter)]
    .map((el) => parseLineNumber(el.textContent ?? ''))
    .filter((n): n is number => n !== null);
  if (nums.length === 0) return { start: 1, end: 1 };
  return { start: Math.min(...nums), end: Math.max(...nums) };
}

function extractMonacoLines(root: Element): string {
  const lines = [...root.querySelectorAll(MONACO_SELECTORS.viewLine)];
  return lines.map((l) => mapWhitespaceGlyphs(l.textContent ?? '')).join('\n');
}

function extractAceLines(root: Element): string {
  const lines = [...root.querySelectorAll(ACE_SELECTORS.line)];
  return lines.map((l) => mapWhitespaceGlyphs(l.textContent ?? '')).join('\n');
}

function extractCm5Lines(root: Element): string {
  const lines = [...root.querySelectorAll(CODEMIRROR5_SELECTORS.line)];
  return lines.map((l) => mapWhitespaceGlyphs(l.textContent ?? '')).join('\n');
}

function extractCm6Lines(root: Element): string {
  const lines = [...root.querySelectorAll(CODEMIRROR6_SELECTORS.line)];
  return lines.map((l) => mapWhitespaceGlyphs(l.textContent ?? '')).join('\n');
}

function guessFileName(root: Element, doc: Document): string {
  const tab =
    doc.querySelector('.editor-tab.active, .file-tab.active, [data-testid="active-file"]') ??
    root.closest('[data-filename]');
  const fromAttr = tab?.getAttribute('data-filename') ?? root.getAttribute('data-filename');
  if (fromAttr) return fromAttr;
  const label = tab?.textContent?.trim();
  if (label && /\.c\b/i.test(label)) return label;
  return 'main.c';
}

export function extractEditor(doc: Document): ExtractResult<EditorData> {
  const evidence: string[] = [];
  const warnings: string[] = [];
  try {
    const { engine, root } = detectEditorEngine(doc);
    if (!root) {
      return {
        ok: false,
        value: null,
        confidence: 0,
        evidence: ['no-editor'],
        warnings,
      };
    }
    evidence.push(`engine:${engine}`);

    let text = '';
    let range = { start: 1, end: 1 };
    switch (engine) {
      case 'monaco':
        text = extractMonacoLines(root);
        range = visibleRangeMonaco(root);
        break;
      case 'ace':
        text = extractAceLines(root);
        range = visibleRangeAce(root);
        break;
      case 'codemirror5':
        text = extractCm5Lines(root);
        range = visibleRangeCm5(root);
        break;
      case 'codemirror6':
        text = extractCm6Lines(root);
        range = visibleRangeCm6(root);
        break;
      default:
        text = mapWhitespaceGlyphs(root.textContent ?? '');
        range = { start: 1, end: Math.max(1, text.split('\n').length) };
        warnings.push('unknown-engine-fallback');
    }

    text = toLf(text);
    const partial = range.start !== 1;
    if (partial) {
      warnings.push('partial-editor');
      evidence.push(`visible-lines:${range.start}-${range.end}`);
    }

    const fileName = guessFileName(root, doc);
    const confidence = partial ? 0.55 : text.length > 0 ? 0.88 : 0.3;

    return {
      ok: text.length > 0,
      value: {
        engine,
        fileName,
        text,
        visibleLineStart: range.start,
        visibleLineEnd: range.end,
        partial,
        source: 'dom',
      },
      confidence,
      evidence,
      warnings,
    };
  } catch (err) {
    return {
      ok: false,
      value: null,
      confidence: 0,
      evidence: [`extract-editor-error:${err instanceof Error ? err.message : String(err)}`],
      warnings,
    };
  }
}
