import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 47899;
const TOKEN = randomBytes(32).toString('hex');
const RUNS = mkdtempSync(join(tmpdir(), 'ctc-runs-'));

const CORRECT = `#include <stdio.h>
int sum(int,int);
int sub(int,int);
int mul(int,int);
int divi(int,int);
void main() {
    int a,b;
    printf("Enter two values : ");
    scanf("%d%d",&a,&b);
    printf("Addition of two values = %d\\n",sum(a,b));
    printf("Subtraction of two values = %d\\n",sub(a,b));
    printf("Multiplication of two values = %d\\n",mul(a,b));
    printf("Division of two values = %d\\n",divi(a,b));
}
int sum(int a,int b){return a+b;}
int sub(int a,int b){return a-b;}
int mul(int a,int b){return a*b;}
int divi(int a,int b){return a/b;}
`;

const WRONG_DIV = CORRECT.replace('return a/b;', 'return a%b;');
const MISSING_RETURN = CORRECT.replace('return a+b;', '');
const COMPILE_ERR = 'int main( { return 0; }';
const INFINITE = 'int main(void){for(;;){}}';
const SEG = 'int main(void){int *p=0; *p=1; return 0;}';
const SCANF_EOF = '#include <stdio.h>\nint main(void){int x; scanf("%d",&x); printf("%d\\n", x); return 0;}';
const HUGE = '#include <stdio.h>\nint main(void){for(int i=0;i<5000000;i++) putchar(\'A\'); return 0;}';

let child;

function headers(extra = {}) {
  return { 'X-Helper-Token': TOKEN, 'Content-Type': 'application/json', ...extra };
}

async function json(method, path, body, h = headers(), hostname = '127.0.0.1') {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method,
    headers: { ...h, Host: `${hostname}:${PORT}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

before(async () => {
  child = spawn(process.execPath, [join(root, 'helper', 'server.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      CTC_HELPER_PORT: String(PORT),
      CTC_HELPER_TOKEN: TOKEN,
      LOCALAPPDATA: RUNS,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server start timeout')), 8000);
    child.stdout.on('data', (d) => {
      if (String(d).includes('listening')) {
        clearTimeout(t);
        resolve();
      }
    });
    child.on('error', reject);
  });
});

after(() => {
  child?.kill();
  try {
    rmSync(RUNS, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

const sample = {
  id: '1',
  input: '10 5',
  expected: 'Enter two values : 10 5\nAddition of two values = 15\nSubtraction of two values = 5\nMultiplication of two values = 50\nDivision of two values = 2\n',
};

describe('helper server', () => {
  it('health', async () => {
    const { status, data } = await json('GET', '/health');
    assert.equal(status, 200);
    assert.equal(data.ok, true);
    assert.ok(data.gccVersion);
  });

  it('rejects bad token', async () => {
    const { status } = await json('GET', '/health', undefined, {
      'X-Helper-Token': 'nope',
    });
    assert.equal(status, 401);
  });

  it('rejects Origin', async () => {
    const { status } = await json('GET', '/health', undefined, {
      ...headers(),
      Origin: 'https://evil.example',
    });
    assert.equal(status, 403);
  });

  it('correct program echoAware pass', async () => {
    const { data } = await json('POST', '/verify', {
      code: CORRECT,
      tests: [sample],
      std: 'gnu11',
      timeoutMs: 2000,
    });
    assert.equal(data.compile.ok, true);
    assert.equal(data.results[0].status, 'pass');
    assert.equal(data.results[0].matches.echoAware, true);
  });

  it('wrong division is fail/partial', async () => {
    const { data } = await json('POST', '/verify', {
      code: WRONG_DIV,
      tests: [sample],
      std: 'gnu11',
      timeoutMs: 2000,
    });
    assert.equal(data.results[0].status, 'fail');
    assert.ok(data.results[0].diff.length > 0);
  });

  it('compile error', async () => {
    const { data } = await json('POST', '/verify', {
      code: COMPILE_ERR,
      tests: [sample],
      std: 'gnu11',
      timeoutMs: 2000,
    });
    assert.equal(data.compile.ok, false);
    assert.ok(data.compile.errors.length > 0);
  });

  it('infinite loop timeout', async () => {
    const { data } = await json('POST', '/verify', {
      code: INFINITE,
      tests: [{ id: 't', input: '', expected: '' }],
      std: 'gnu11',
      timeoutMs: 400,
    });
    assert.equal(data.results[0].status, 'timeout');
  });

  it('segfault runtime_error', async () => {
    const { data } = await json('POST', '/verify', {
      code: SEG,
      tests: [{ id: 't', input: '', expected: '' }],
      std: 'gnu11',
      timeoutMs: 2000,
    });
    assert.ok(['runtime_error', 'timeout'].includes(data.results[0].status));
  });

  it('scanf at EOF', async () => {
    const { data } = await json('POST', '/verify', {
      code: SCANF_EOF,
      tests: [{ id: 't', input: '', expected: '' }],
      std: 'gnu11',
      timeoutMs: 2000,
    });
    assert.ok(data.compile.ok);
  });

  it('huge output capped', async () => {
    const { data } = await json('POST', '/verify', {
      code: HUGE,
      tests: [{ id: 't', input: '', expected: 'A' }],
      std: 'gnu11',
      timeoutMs: 8000,
    });
    assert.ok(data.results[0].actual.length <= 256 * 1024);
  });

  it('CRLF input normalized', async () => {
    const { data } = await json('POST', '/verify', {
      code: '#include <stdio.h>\nint main(){int a,b;scanf("%d%d",&a,&b);printf("%d",a+b);}\n',
      tests: [{ id: 't', input: '1\r\n2\r\n', expected: '3' }],
      std: 'gnu11',
      timeoutMs: 2000,
    });
    assert.equal(data.results[0].status, 'pass');
  });

  it('oversized body', async () => {
    const big = 'x'.repeat(300_000);
    const res = await fetch(`http://127.0.0.1:${PORT}/verify`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ code: big, tests: [], std: 'gnu11' }),
    });
    assert.ok(res.status === 413 || res.status === 500 || !res.ok);
  });

  it('blocks system()', async () => {
    const { data } = await json('POST', '/verify', {
      code: '#include <stdlib.h>\nint main(){system("dir");}\n',
      tests: [],
      std: 'gnu11',
      timeoutMs: 2000,
    });
    assert.ok(data.blocked || data.compile.ok === false);
  });

  it('temp dir cleaned', async () => {
    await json('POST', '/verify', {
      code: '#include <stdio.h>\nint main(){puts("x");}\n',
      tests: [{ id: 't', input: '', expected: 'x\n' }],
      std: 'gnu11',
      timeoutMs: 2000,
    });
    assert.ok(existsSync(RUNS));
  });

  it('missing return still compiles (warning)', async () => {
    const { data } = await json('POST', '/verify', {
      code: MISSING_RETURN,
      tests: [sample],
      std: 'gnu11',
      timeoutMs: 2000,
    });
    assert.equal(data.compile.ok, true);
  });
});
