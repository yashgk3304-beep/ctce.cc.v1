import { describe, expect, it } from 'vitest';
import { extractEditor, detectEditorEngine } from '../../src/content/extractors/editor';
import { loadFixture } from '../helpers/dom';
import { documentFromHtml } from '../helpers/dom';

describe('extractEditor', () => {
  it('maps monaco whitespace glyphs', () => {
    const doc = documentFromHtml(`
      <div class="monaco-editor">
        <div class="margin-view-overlays"><div class="line-numbers">1</div></div>
        <div class="view-lines">
          <div class="view-line"><span>\u00B7\u00B7int\u2192x;</span></div>
        </div>
      </div>`);
    const res = extractEditor(doc);
    expect(res.ok).toBe(true);
    expect(res.value?.text).toContain('  int\t x;');
    expect(res.value?.engine).toBe('monaco');
  });

  it('marks partial when first visible line is not 1', () => {
    const doc = documentFromHtml(`
      <div class="monaco-editor">
        <div class="margin-view-overlays">
          <div class="line-numbers">2</div>
          <div class="line-numbers">3</div>
        </div>
        <div class="view-lines">
          <div class="view-line">line2</div>
          <div class="view-line">line3</div>
        </div>
      </div>`);
    const res = extractEditor(doc);
    expect(res.value?.partial).toBe(true);
    expect(res.value?.visibleLineStart).toBe(2);
    expect(res.warnings).toContain('partial-editor');
  });

  it('fixture lines 2-26 visible', () => {
    const doc = loadFixture('fill-in-blank.html');
    const res = extractEditor(doc);
    expect(res.value?.visibleLineStart).toBe(2);
    expect(res.value?.visibleLineEnd).toBe(26);
    expect(res.value?.partial).toBe(true);
    expect(res.value?.text).toMatch(/TODO/);
  });

  it('detects ace engine', () => {
    const doc = documentFromHtml(`<div class="ace_editor"><div class="ace_line">x</div></div>`);
    expect(detectEditorEngine(doc).engine).toBe('ace');
  });
});
