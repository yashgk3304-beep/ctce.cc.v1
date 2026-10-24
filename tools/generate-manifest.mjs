/**
 * Generates manifest.json from src/shared/hostConfig.json, the one host config.
 *
 * --test-host adds http://127.0.0.1:4173/* for Playwright fixture serving.
 * That match MUST never appear in release builds.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const testHost = process.argv.includes('--test-host');

const HOST = JSON.parse(readFileSync(resolve(root, 'src/shared/hostConfig.json'), 'utf8'));
const helperMatch = `http://127.0.0.1:${HOST.helperPort}/*`;

const matches = [HOST.codeTantraMatch];
const hostPermissions = [
  HOST.codeTantraMatch,
  HOST.geminiMatch,
  helperMatch,
];

if (testHost) {
  // Test-only fixture host; never in release.
  const fixture = 'http://127.0.0.1:4173/*';
  matches.push(fixture);
  hostPermissions.push(fixture);
  console.log('[manifest] TEST HOST enabled:', fixture);
}

const manifest = {
  manifest_version: 3,
  name: HOST.extensionName,
  version: HOST.extensionVersion,
  description:
    'Read-only helper for CodeTantra C practice: propose answers, verify locally, never write to the page.',
  minimum_chrome_version: HOST.minimumChromeVersion,
  permissions: ['storage'],
  optional_permissions: ['scripting'],
  host_permissions: hostPermissions,
  background: {
    service_worker: 'background.js',
    type: 'module',
  },
  content_scripts: [
    {
      matches,
      js: ['content.js'],
      run_at: 'document_idle',
      all_frames: true,
    },
  ],
  options_ui: {
    page: 'options.html',
    open_in_tab: true,
  },
  action: {
    default_title: 'CT-C Assistant',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  commands: {
    'toggle-panel': {
      suggested_key: {
        default: 'Alt+Shift+C',
        windows: 'Alt+Shift+C',
      },
      description: 'Show or hide the panel',
    },
  },
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'",
  },
};

const out = resolve(root, 'manifest.generated.json');
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log('[manifest] Wrote', out, testHost ? '(test)' : '(release)');
