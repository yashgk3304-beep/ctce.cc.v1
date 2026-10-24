import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
  encoding: 'utf8',
}).trim().split(/\r?\n/).filter(Boolean);
const secretPatterns = [
  { name: 'Gemini API key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'helper token file', pattern: /(?:^|\/)helper\/.token$/i },
  { name: 'helper token assignment', pattern: /CTC_HELPER_TOKEN\s*[:=]\s*["']?[0-9a-f]{64}/i },
];
const findings = [];
for (const file of files) {
  if (file.endsWith('/.token') || file === 'helper/.token') {
    findings.push(`${file}: helper token file must not be committed`);
    continue;
  }
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const { name, pattern } of secretPatterns.slice(0, 1)) {
    if (pattern.test(text)) findings.push(`${file}: possible ${name}`);
  }
  if (/CTC_HELPER_TOKEN\s*[:=]\s*["']?[0-9a-f]{64}/i.test(text)) {
    findings.push(`${file}: possible helper token`);
  }
}
if (findings.length) {
  process.stderr.write(`Commit blocked: possible secrets found\n${findings.join('\n')}\n`);
  process.exitCode = 1;
}
