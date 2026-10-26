import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, ...opts });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.stdout?.on('data', (d) => {
      stdout += d;
    });
    child.stderr?.on('data', (d) => {
      stderr += d;
    });
    timer = setTimeout(() => {
      child.kill();
      finish({ code: -1, stdout, stderr, timedOut: true });
    }, opts.timeoutMs ?? 8000);
    child.on('close', (code) => {
      finish({ code, stdout, stderr, timedOut: false });
    });
    child.on('error', (error) => {
      finish({ code: -1, stdout, stderr: `${stderr}${error.message}`, timedOut: false });
    });
  });
}

const ver = await run('gcc', ['--version']);
if (ver.code !== 0) {
  console.error('gcc not found on PATH. See docs/TROUBLESHOOTING.md');
  process.exit(1);
}
console.log(ver.stdout.split('\n')[0]);

const dir = mkdtempSync(join(tmpdir(), 'ctc-check-'));
const src = join(dir, 'hello.c');
const exe = join(dir, process.platform === 'win32' ? 'hello.exe' : 'hello');
writeFileSync(src, '#include <stdio.h>\nint main(void){printf("hello\\n");return 0;}\n');
const c = await run('gcc', ['-std=gnu11', '-o', exe, src]);
if (c.code !== 0) {
  console.error(c.stderr);
  process.exit(1);
}
const r = await run(exe, []);
if (!r.stdout.includes('hello')) {
  console.error('hello world failed');
  process.exit(1);
}
console.log('hello world ok');

const loop = join(dir, 'loop.c');
const loopExe = join(dir, process.platform === 'win32' ? 'loop.exe' : 'loop');
writeFileSync(loop, 'int main(void){for(;;){}}\n');
await run('gcc', ['-o', loopExe, loop]);
const t0 = Date.now();
const timed = await run(loopExe, [], { timeoutMs: 800 });
if (!timed.timedOut && Date.now() - t0 > 4000) {
  console.error('timeout self-test did not return promptly');
  process.exit(1);
}
console.log('timeout self-test ok');
rmSync(dir, { recursive: true, force: true });
console.log('helper:check passed');
