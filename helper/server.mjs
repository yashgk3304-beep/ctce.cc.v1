/**
 * Local compile-and-run helper. Binds 127.0.0.1 only. Zero npm dependencies.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir, platform } from 'node:os';
import { anyPass, matchModes, toLf, unifiedDiff } from './compare.mjs';
import { informationalWarning, staticScreen } from './static.mjs';

const PORT = Number(process.env.CTC_HELPER_PORT || 47831);
const TOKEN_PATH = join(process.env.CTC_HELPER_HOME || process.cwd(), 'helper', '.token');
const MAX_BODY = 256 * 1024;
const OUT_CAP = 256 * 1024;
const COMPILE_TIMEOUT_MS = 15_000;
const MEM_KB = 256 * 1024; // ~256 MB working set (best-effort)

function loadToken() {
  if (process.env.CTC_HELPER_TOKEN) return process.env.CTC_HELPER_TOKEN.trim();
  if (existsSync(TOKEN_PATH)) return readFileSync(TOKEN_PATH, 'utf8').trim();
  return '';
}

const TOKEN = loadToken();

function runsRoot() {
  const base = process.env.LOCALAPPDATA || process.env.HOME || tmpdir();
  return join(base, 'ct-c-helper', 'runs');
}

function gccBin() {
  return process.env.CTC_GCC || 'gcc';
}

function reject(res, status, msg) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: false, error: msg }));
}

function readBody(req) {
  return new Promise((resolve, rejectBody) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > MAX_BODY) {
        req.destroy();
        rejectBody(new Error('body too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', rejectBody);
  });
}

function spawnWait(cmd, args, opts) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...opts, windowsHide: true });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let killed = false;
    const cap = (buf, chunk) => {
      const next = Buffer.concat([buf, chunk]);
      return next.length > OUT_CAP ? next.subarray(0, OUT_CAP) : next;
    };
    child.stdout?.on('data', (d) => {
      stdout = cap(stdout, d);
    });
    child.stderr?.on('data', (d) => {
      stderr = cap(stderr, d);
    });
    const timer = setTimeout(() => {
      killed = true;
      killTree(child.pid);
    }, opts.timeoutMs ?? 2000);
    const memTimer = setInterval(() => {
      if (child.pid) void checkMemory(child.pid).then((kb) => {
        if (kb > MEM_KB) {
          killed = true;
          killTree(child.pid);
        }
      });
    }, 250);
    child.on('close', (code) => {
      clearTimeout(timer);
      clearInterval(memTimer);
      resolve({
        code: code ?? -1,
        stdout: stdout.toString('utf8'),
        stderr: stderr.toString('utf8'),
        timedOut: killed,
        outputLimit: stdout.length >= OUT_CAP,
      });
    });
    if (opts.input != null) {
      child.stdin.write(opts.input);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}

function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true, stdio: 'ignore' });
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* ignore */
      }
    }
  }
}

async function checkMemory(pid) {
  if (process.platform !== 'win32') return 0;
  return new Promise((resolve) => {
    const p = spawn('powershell.exe', [
      '-NoProfile',
      '-Command',
      `try { (Get-Process -Id ${pid} -ErrorAction Stop).WorkingSet64 / 1KB } catch { 0 }`,
    ], { windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => {
      out += d;
    });
    p.on('close', () => resolve(Number(out.trim()) || 0));
    setTimeout(() => {
      p.kill();
      resolve(0);
    }, 400);
  });
}

async function gccVersion() {
  const r = await spawnWait(gccBin(), ['--version'], { timeoutMs: 5000, input: null });
  const first = r.stdout.split('\n')[0] || r.stderr.split('\n')[0] || 'gcc unknown';
  return first.trim();
}

async function handleHealth(_req, res) {
  const ver = await gccVersion();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, gccVersion: ver, platform: platform() }));
}

async function handleVerify(body) {
  const code = String(body.code ?? '');
  const tests = Array.isArray(body.tests) ? body.tests : [];
  const std = String(body.std || 'gnu11');
  const timeoutMs = Number(body.timeoutMs || 2000);
  const o2Check = Boolean(body.o2Check);
  const allowFileIo = Boolean(body.allowFileIo);

  const screen = staticScreen(code);
  if (screen.blocked) {
    return { compile: { ok: false, warnings: [], errors: ['static screen: blocked APIs'] }, results: [], blocked: screen.reasons.join(',') };
  }
  if (screen.needsRunAnyway && !allowFileIo) {
    return {
      compile: { ok: false, warnings: [], errors: ['file I/O requires Run anyway'] },
      results: [],
      needsRunAnyway: true,
    };
  }

  const dir = join(runsRoot(), randomUUID());
  mkdirSync(dir, { recursive: true });
  const src = join(dir, 'prog.c');
  const exe = join(dir, process.platform === 'win32' ? 'prog.exe' : 'prog');
  writeFileSync(src, code, 'utf8');

  const compileArgs = [
    `-std=${std}`,
    '-Wall',
    '-Wextra',
    '-O0',
    '-D__USE_MINGW_ANSI_STDIO=1',
    '-o',
    exe,
    src,
    '-lm',
  ];
  const compile = await spawnWait(gccBin(), compileArgs, { timeoutMs: COMPILE_TIMEOUT_MS, cwd: dir });
  const warnings = [];
  const errors = [];
  const diag = `${compile.stderr}\n${compile.stdout}`;
  for (const line of diag.split('\n')) {
    if (!line.trim()) continue;
    if (/error:/i.test(line)) errors.push(line);
    else if (/warning:/i.test(line)) warnings.push(line);
  }
  if (compile.timedOut) errors.push('compile timeout');
  if (compile.code !== 0 && errors.length === 0) errors.push(diag.slice(0, 2000) || `gcc exit ${compile.code}`);

  const compileOk = compile.code === 0 && !compile.timedOut;
  const results = [];
  let o2Differ = false;

  if (compileOk) {
    for (const t of tests) {
      const input = toLf(t.input ?? '');
      const expected = toLf(t.expected ?? '');
      const started = Date.now();
      const run = await spawnWait(exe, [], { timeoutMs, input, cwd: dir });
      const actual = toLf(run.stdout + (run.stderr && !run.stdout ? run.stderr : ''));
      const matches = matchModes(expected, actual, input);
      let status = 'fail';
      if (run.timedOut) status = 'timeout';
      else if (run.outputLimit) status = 'output_limit';
      else if (run.code !== 0) status = 'runtime_error';
      else if (anyPass(matches)) status = 'pass';
      results.push({
        id: t.id || 't',
        status,
        exitCode: run.code,
        ms: Date.now() - started,
        actual: actual.slice(0, OUT_CAP),
        matches,
        diff: unifiedDiff(expected, actual),
      });
    }
    if (o2Check) {
      const exe2 = join(dir, process.platform === 'win32' ? 'progO2.exe' : 'progO2');
      const c2 = await spawnWait(
        gccBin(),
        [`-std=${std}`, '-O2', '-D__USE_MINGW_ANSI_STDIO=1', '-o', exe2, src, '-lm'],
        { timeoutMs: COMPILE_TIMEOUT_MS, cwd: dir },
      );
      if (c2.code === 0) {
        for (let i = 0; i < tests.length; i++) {
          const t = tests[i];
          const run = await spawnWait(exe2, [], { timeoutMs, input: toLf(t.input ?? ''), cwd: dir });
          if (toLf(run.stdout) !== results[i]?.actual) o2Differ = true;
        }
      }
    }
  }

  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }

  return {
    compile: {
      ok: compileOk,
      warnings: warnings.filter((w) => !informationalWarning(w)),
      errors,
      informational: warnings.filter(informationalWarning),
    },
    results,
    o2Differ,
  };
}

function guard(req, res) {
  const host = String(req.headers.host || '');
  if (host !== `127.0.0.1:${PORT}`) {
    reject(res, 403, 'invalid host');
    return false;
  }
  if (req.headers.origin) {
    reject(res, 403, 'web origin not allowed');
    return false;
  }
  const tok = req.headers['x-helper-token'];
  if (!TOKEN || tok !== TOKEN) {
    reject(res, 401, 'bad token');
    return false;
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  // No CORS headers for web origins.
  if (!guard(req, res)) return;
  try {
    if (req.method === 'GET' && req.url === '/health') {
      await handleHealth(req, res);
      return;
    }
    if (req.method === 'POST' && req.url === '/verify') {
      const ct = String(req.headers['content-type'] || '');
      if (!ct.includes('application/json')) {
        reject(res, 415, 'content-type');
        return;
      }
      let raw;
      try {
        raw = await readBody(req);
      } catch {
        reject(res, 413, 'body too large');
        return;
      }
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const result = await handleVerify(body);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      return;
    }
    reject(res, 404, 'not found');
  } catch (e) {
    reject(res, 500, String(e));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`ct-c-helper listening on 127.0.0.1:${PORT}`);
  if (!TOKEN) console.warn('No helper token. Run npm run helper:init');
});
