/** Normalize page text for hashing, sending, and comparing. */

const NBSP = /\u00A0/g;
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;
const SMART_QUOTES = /[\u2018\u2019]/g;
const SMART_DOUBLE = /[\u201C\u201D]/g;

export function normalizeText(input: string): string {
  return input
    .replace(NBSP, ' ')
    .replace(ZERO_WIDTH, '')
    .replace(SMART_QUOTES, "'")
    .replace(SMART_DOUBLE, '"')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Map editor whitespace glyphs back to real spaces/tabs. */
export function mapWhitespaceGlyphs(text: string): string {
  return text
    .replace(/\u00B7/g, ' ') // middle dot
    .replace(/\u00B7/g, ' ')
    .replace(/\u2022/g, ' ')
    .replace(/\u2192/g, '\t') // right arrow (tab glyph)
    .replace(/\u21E5/g, '\t')
    .replace(/\u00A0/g, ' ')
    .replace(ZERO_WIDTH, '');
}

/** Timer chips like 07:54 or 1:02:03 — excluded from signatures. */
export const TIMER_CHIP_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;

export function stripTimerNoise(text: string): string {
  return text.replace(TIMER_CHIP_RE, '');
}

export function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

export function toLf(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
