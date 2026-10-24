import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hooks = resolve(root, '.git', 'hooks');
mkdirSync(hooks, { recursive: true });
const hook = resolve(hooks, 'pre-commit');
writeFileSync(
  hook,
  '#!/bin/sh\nnode "$(git rev-parse --show-toplevel)/tools/pre-commit.mjs"\n',
  'utf8',
);
console.log(`Installed secret scan hook at ${hook}`);
