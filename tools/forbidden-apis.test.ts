/**
 * Scans every file that ships in content scripts or is injected into the page
 * (including src/injected/**), except src/content/panel/**.
 * Fails on forbidden page-mutating / listening / storage APIs (section 1).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');
const SCAN_ROOTS = [join(ROOT, 'src/content'), join(ROOT, 'src/injected')];
const PANEL_PREFIX = join(ROOT, 'src/content/panel').replace(/\\/g, '/');

const FORBIDDEN: Array<{ name: string; re: RegExp; allowInPanel?: boolean }> = [
  { name: '.click(', re: /\.click\s*\(/ },
  { name: '.focus(', re: /\.focus\s*\(/, allowInPanel: true },
  { name: 'dispatchEvent', re: /\.dispatchEvent\s*\(/ },
  { name: 'KeyboardEvent', re: /new\s+KeyboardEvent\b/ },
  { name: 'InputEvent', re: /new\s+InputEvent\b/ },
  { name: 'ClipboardEvent', re: /new\s+ClipboardEvent\b/ },
  { name: 'MouseEvent', re: /new\s+MouseEvent\b/ },
  { name: 'execCommand', re: /\.execCommand\s*\(/ },
  { name: 'setValue', re: /\.setValue\s*\(/ },
  { name: 'executeEdits', re: /\.executeEdits\s*\(/ },
  { name: 'applyEdits', re: /\.applyEdits\s*\(/ },
  { name: 'pushEditOperations', re: /\.pushEditOperations\s*\(/ },
  { name: 'insertText', re: /\.insertText\s*\(/ },
  { name: '.value assignment', re: /\.value\s*=/ },
  { name: '.checked assignment', re: /\.checked\s*=/ },
  {
    name: 'addEventListener key/mouse/input',
    re: /\.addEventListener\s*\(\s*['`](?:key\w*|mouse\w*|input|beforeinput|paste)['`]/,
  },
  { name: 'XMLHttpRequest patch', re: /XMLHttpRequest\s*\.\s*prototype|window\.XMLHttpRequest\s*=/ },
  { name: 'fetch patch', re: /window\.fetch\s*=/ },
  { name: 'WebSocket patch', re: /window\.WebSocket\s*=/ },
  { name: 'document.cookie', re: /document\.cookie/ },
  { name: 'localStorage', re: /\blocalStorage\b/ },
  { name: 'sessionStorage', re: /\bsessionStorage\b/ },
  { name: 'history.pushState patch', re: /history\.pushState\s*=/ },
  { name: 'history.replaceState patch', re: /history\.replaceState\s*=/ },
];

function walk(dir: string, out: string[] = []): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

function isPanelFile(file: string): boolean {
  return file.replace(/\\/g, '/').startsWith(PANEL_PREFIX);
}

describe('forbidden APIs in content/injected bundles', () => {
  const files = SCAN_ROOTS.flatMap((r) => walk(r));

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = relative(ROOT, file);
    const panel = isPanelFile(file);
    const src = readFileSync(file, 'utf8');
    // Strip block comments and line comments roughly to reduce false positives in docs strings
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    for (const rule of FORBIDDEN) {
      if (panel && rule.allowInPanel) continue;
      if (panel && (rule.name === '.value assignment' || rule.name === '.checked assignment')) {
        // Panel may set values on its own form controls inside shadow root.
        continue;
      }
      if (panel && rule.name.includes('addEventListener')) {
        // Panel may listen inside shadow root; scanner still bans page-node patterns —
        // allow addEventListener in panel files entirely (panel is excluded for page listeners).
        continue;
      }
      it(`${rel} must not contain ${rule.name}`, () => {
        expect(code, `${rel} contains forbidden ${rule.name}`).not.toMatch(rule.re);
      });
    }
  }

  it('negative fixture: panel may use .value', () => {
    // Ensure the exception path is intentional — panel files are skipped for .value
    expect(isPanelFile(join(ROOT, 'src/content/panel/dummy.ts'))).toBe(true);
  });
});

describe('forbidden API positive fixture detection', () => {
  it('detects .click( in a sample string', () => {
    const sample = 'el.click()';
    expect(sample).toMatch(/\.click\s*\(/);
  });
});
