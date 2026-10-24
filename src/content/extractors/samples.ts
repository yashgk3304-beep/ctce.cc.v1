import type { ExtractResult, SampleTest, SamplesData, SamplesStatus } from '../../shared/types';
import { normalizeText, toLf } from '../../shared/normalize';
import {
  SAMPLE_ACCORDION_SELECTORS,
  SAMPLE_INPUT_LABELS,
  SAMPLE_OUTPUT_LABELS,
  SAMPLE_TEST_CASES_LABELS,
  TEST_CASES_TAB_LABELS,
} from '../selectors.config';

function findAccordion(doc: Document): Element | null {
  for (const sel of SAMPLE_ACCORDION_SELECTORS) {
    const el = doc.querySelector(sel);
    if (el) return el;
  }
  for (const label of SAMPLE_TEST_CASES_LABELS) {
    const headers = doc.querySelectorAll('button, summary, .accordion-header, [role="button"]');
    for (const h of headers) {
      if ((h.textContent ?? '').includes(label)) {
        return h.closest('details, .accordion-item, section, div') ?? h.parentElement;
      }
    }
  }
  return null;
}

function isCollapsed(accordion: Element | null, doc: Document): boolean {
  if (!accordion) return false;
  if (accordion instanceof HTMLDetailsElement && !accordion.open) return true;
  const aria = accordion.getAttribute('aria-expanded');
  if (aria === 'false') return true;
  const panel = accordion.querySelector('.accordion-collapse, .collapse, [data-testid="sample-panel"]');
  if (panel instanceof HTMLElement) {
    const hidden =
      panel.hidden ||
      panel.classList.contains('collapse') ||
      panel.getAttribute('aria-hidden') === 'true';
    if (hidden && !(panel.textContent ?? '').trim()) return true;
  }
  const bodyText = accordion.textContent ?? '';
  const hasIo = SAMPLE_INPUT_LABELS.some((l) => bodyText.includes(l));
  if (!hasIo && SAMPLE_TEST_CASES_LABELS.some((l) => bodyText.includes(l))) return true;
  return false;
}

function findTestCasesTabPanel(doc: Document): Element | null {
  for (const label of TEST_CASES_TAB_LABELS) {
    const tabs = doc.querySelectorAll('[role="tab"], .nav-link, button');
    for (const tab of tabs) {
      if ((tab.textContent ?? '').trim() === label) {
        const panelId = tab.getAttribute('aria-controls');
        if (panelId) {
          const panel = doc.getElementById(panelId);
          if (panel) return panel;
        }
        return tab.closest('.tab-pane')?.parentElement ?? tab.parentElement;
      }
    }
  }
  return null;
}

function labelBlock(root: Element, labels: readonly string[]): string | null {
  for (const label of labels) {
    const nodes = root.querySelectorAll('label, strong, span, th, dt, h4, h5, p');
    for (const node of nodes) {
      const t = (node.textContent ?? '').trim();
      if (t === label || t.startsWith(`${label}:`)) {
        const next = node.nextElementSibling;
        if (next) {
          const fromPre = next.querySelector('pre');
          if (fromPre) return preserveWhitespace(fromPre.textContent ?? '');
          if (next.tagName === 'PRE') return preserveWhitespace(next.textContent ?? '');
          return preserveWhitespace(next.textContent ?? '');
        }
        const parent = node.parentElement;
        if (parent) {
          const pre = parent.querySelector('pre');
          if (pre) return preserveWhitespace(pre.textContent ?? '');
        }
      }
    }
  }
  return null;
}

function preserveWhitespace(text: string): string {
  return toLf(text).replace(/\u00A0/g, ' ');
}

function parseTableCase(table: HTMLTableElement): { input: string; expected: string } | null {
  const rows = [...table.querySelectorAll('tr')];
  let input = '';
  let expected = '';
  for (const row of rows) {
    const cells = [...row.querySelectorAll('td, th')].map((c) => preserveWhitespace(c.textContent ?? ''));
    if (cells.length >= 2) {
      const head = cells[0]?.toLowerCase() ?? '';
      if (head.includes('input')) input = cells[1] ?? '';
      if (head.includes('output') || head.includes('expected')) expected = cells[1] ?? '';
    }
  }
  if (input || expected) return { input, expected };
  return null;
}

function parseBlocks(root: Element): SampleTest[] {
  const tests: SampleTest[] = [];
  const tables = root.querySelectorAll('table');
  tables.forEach((table, i) => {
    const parsed = parseTableCase(table);
    if (parsed) {
      tests.push({
        id: `table-${i + 1}`,
        input: parsed.input,
        expected: parsed.expected,
      });
    }
  });

  if (tests.length === 0) {
    const input = labelBlock(root, SAMPLE_INPUT_LABELS);
    const output = labelBlock(root, SAMPLE_OUTPUT_LABELS);
    if (input !== null || output !== null) {
      tests.push({
        id: 'block-1',
        input: input ?? '',
        expected: output ?? '',
      });
    }
  }

  const pres = root.querySelectorAll('pre');
  if (tests.length === 0 && pres.length >= 2) {
    tests.push({
      id: 'pre-pair-1',
      input: preserveWhitespace(pres[0]?.textContent ?? ''),
      expected: preserveWhitespace(pres[1]?.textContent ?? ''),
    });
  }

  return tests;
}

function resolveStatus(
  collapsed: boolean,
  tests: SampleTest[],
  parsedAny: boolean,
): SamplesStatus {
  if (collapsed) return 'collapsed';
  if (tests.length === 0) return parsedAny ? 'unparsed' : 'missing';
  const complete = tests.every((t) => t.input.length > 0 || t.expected.length > 0);
  if (!complete) return 'unparsed';
  return 'ok';
}

export function extractSamples(doc: Document): ExtractResult<SamplesData> {
  const evidence: string[] = [];
  const warnings: string[] = [];
  try {
    const accordion = findAccordion(doc);
    const tabPanel = findTestCasesTabPanel(doc);
    const roots: Element[] = [];
    if (accordion) {
      evidence.push('sample-accordion');
      roots.push(accordion);
    }
    if (tabPanel) {
      evidence.push('test-cases-tab');
      roots.push(tabPanel);
    }
    if (roots.length === 0 && doc.body) {
      evidence.push('body-fallback');
      roots.push(doc.body);
    }

    const collapsed = isCollapsed(accordion, doc);
    if (collapsed) warnings.push('samples-collapsed');

    const tests: SampleTest[] = [];
    let parsedAny = false;
    for (const root of roots) {
      const chunk = parseBlocks(root);
      if (chunk.length) parsedAny = true;
      tests.push(...chunk);
    }

    const deduped: SampleTest[] = [];
    const seen = new Set<string>();
    for (const t of tests) {
      const key = `${t.input}>>>${t.expected}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(t);
    }

    const status = resolveStatus(collapsed, deduped, parsedAny);
    const confidence =
      status === 'ok' ? 0.85 : status === 'collapsed' ? 0.5 : status === 'unparsed' ? 0.35 : 0.2;

    return {
      ok: status === 'ok',
      value: { status, tests: deduped },
      confidence,
      evidence,
      warnings,
    };
  } catch (err) {
    return {
      ok: false,
      value: { status: 'missing', tests: [] },
      confidence: 0,
      evidence: [`extract-samples-error:${err instanceof Error ? err.message : String(err)}`],
      warnings,
    };
  }
}
