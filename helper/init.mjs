import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
mkdirSync(dir, { recursive: true });
const token = randomBytes(32).toString('hex');
const path = join(dir, '.token');
writeFileSync(path, token, 'utf8');
console.log('Helper token (shown once). Paste it into Options. Keep helper/.token out of git.');
console.log(token);
console.log(`Saved to ${path}`);
