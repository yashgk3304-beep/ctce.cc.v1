import type { EditorEngine } from '../shared/types';
import { detectEditorEngine } from './extractors/editor';
import { IFRAME_EDITOR_SELECTORS } from './selectors.config';

const MAX_NODES = 400;
const MAX_DEPTH = 12;

export interface StructureNodeReport {
  tag: string;
  id?: string;
  classes: string[];
  role?: string;
  ariaNames: string[];
  dataAttrNames: string[];
  childCount: number;
  children?: StructureNodeReport[];
}

export interface PageStructureReport {
  hostname: string;
  editorEngine: EditorEngine;
  iframeCount: number;
  editorIframeCount: number;
  tagCounts: Record<string, number>;
  root: StructureNodeReport | null;
}

function hostnameOnly(doc: Document): string {
  try {
    return doc.defaultView?.location?.hostname ?? '';
  } catch {
    return '';
  }
}

function collectAttrNames(el: Element, prefix: string): string[] {
  const names: string[] = [];
  for (const attr of el.attributes) {
    if (attr.name.startsWith(prefix)) names.push(attr.name);
  }
  return names.sort();
}

function walk(el: Element, depth: number, tagCounts: Record<string, number>): StructureNodeReport | null {
  if (depth > MAX_DEPTH) return null;
  const tag = el.tagName.toLowerCase();
  tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;

  const report: StructureNodeReport = {
    tag,
    classes: [...el.classList].slice(0, 20),
    ariaNames: collectAttrNames(el, 'aria-'),
    dataAttrNames: collectAttrNames(el, 'data-'),
    childCount: el.childElementCount,
  };

  const id = el.id?.trim();
  if (id) report.id = id.slice(0, 80);
  const role = el.getAttribute('role');
  if (role) report.role = role;

  if (depth < MAX_DEPTH && el.childElementCount > 0) {
    const children: StructureNodeReport[] = [];
    for (const child of el.children) {
      if (children.length >= 40) break;
      const sub = walk(child, depth + 1, tagCounts);
      if (sub) children.push(sub);
    }
    if (children.length) report.children = children;
  }

  return report;
}

export function buildPageStructureReport(doc: Document): PageStructureReport {
  const tagCounts: Record<string, number> = {};
  const { engine } = detectEditorEngine(doc);
  const iframes = doc.querySelectorAll('iframe');
  let editorIframeCount = 0;
  for (const frame of iframes) {
    if (IFRAME_EDITOR_SELECTORS.some((sel) => frame.matches(sel))) editorIframeCount += 1;
  }

  const rootEl = doc.body ?? doc.documentElement;
  let root: StructureNodeReport | null = null;
  if (rootEl) {
    root = walk(rootEl, 0, tagCounts);
    const total = Object.values(tagCounts).reduce((a, b) => a + b, 0);
    if (total > MAX_NODES) tagCounts['_truncated'] = total;
  }

  return {
    hostname: hostnameOnly(doc),
    editorEngine: engine,
    iframeCount: iframes.length,
    editorIframeCount,
    tagCounts,
    root,
  };
}
