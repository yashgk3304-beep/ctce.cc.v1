import { HOST_CONFIG } from '../shared/hostConfig';

export interface HelperHealth {
  ok: boolean;
  gccVersion?: string;
  gcc?: string;
  platform?: string;
  detail?: string;
}

export interface HelperTestCase {
  id: string;
  input: string;
  expected: string;
}

export interface HelperVerifyRequest {
  code: string;
  tests: HelperTestCase[];
  std: string;
  timeoutMs: number;
  o2Check?: boolean;
  allowFileIo?: boolean;
}

export interface MatchModes {
  strict: boolean;
  trimmed: boolean;
  whitespaceInsensitive: boolean;
  echoAware: boolean;
}

export interface HelperTestResult {
  id: string;
  status: 'pass' | 'fail' | 'timeout' | 'runtime_error' | 'output_limit';
  exitCode: number;
  ms: number;
  actual: string;
  matches: MatchModes;
  diff: string;
}

export interface HelperVerifyResult {
  compile: { ok: boolean; warnings: string[]; errors: string[] };
  results: HelperTestResult[];
  blocked?: string;
  needsRunAnyway?: boolean;
  o2Differ?: boolean;
}

export class HelperClient {
  constructor(
    private port: number = HOST_CONFIG.helperPort,
    private token: string = '',
  ) {}

  private baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (this.token) h['X-Helper-Token'] = this.token;
    return h;
  }

  async health(signal?: AbortSignal): Promise<HelperHealth> {
    const res = await fetch(`${this.baseUrl()}/health`, {
      headers: this.headers(),
      signal,
    });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    return (await res.json()) as HelperHealth;
  }

  async verify(body: HelperVerifyRequest, signal?: AbortSignal): Promise<HelperVerifyResult> {
    const res = await fetch(`${this.baseUrl()}/verify`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Helper verify failed: HTTP ${res.status} ${text}`);
    }
    return (await res.json()) as HelperVerifyResult;
  }
}

export function createHelperClient(port?: number, token?: string): HelperClient {
  return new HelperClient(port ?? HOST_CONFIG.helperPort, token ?? '');
}

export async function helperHealth(port: number, token: string): Promise<HelperHealth> {
  return createHelperClient(port, token).health();
}

export async function helperVerify(
  port: number,
  token: string,
  body: HelperVerifyRequest,
): Promise<HelperVerifyResult> {
  return createHelperClient(port, token).verify(body);
}
