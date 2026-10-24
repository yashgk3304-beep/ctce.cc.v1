import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function documentFromHtml(html: string): Document {
  const dom = new JSDOM(html);
  return dom.window.document;
}

export function loadFixture(name: string): Document {
  const path = resolve(import.meta.dirname, '../fixtures', name);
  const html = readFileSync(path, 'utf8');
  return documentFromHtml(html);
}
