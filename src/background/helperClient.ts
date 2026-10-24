import { HOST_CONFIG } from '../shared/hostConfig';

export interface HelperHealth {
  ok: boolean;
  gcc?: string;
  detail?: string;
}

export interface HelperVerifyRequest {
  source: string;
  stdin: string;
  timeoutMs: number;
  cStandard: string;
}

export interface HelperVerifyResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  compileError?: string;
}

export class HelperClient {
  constructor(
    private port: number = HOST_CONFIG.helperPort,
    private token: string = '',
  ) {}

  private baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  private headers(): HeadersInit {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (this.token) h['X-Helper-Token'] = this.token;
    return h;
  }

  async health(signal?: AbortSignal): Promise<HelperHealth> {
    const res = await fetch(`${this.baseUrl()}/health`, {
      headers: this.headers(),
      signal,
    });
    if (!res.ok) {
      return { ok: false, detail: `HTTP ${res.status}` };
    }
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
      throw new Error(`Helper verify failed: HTTP ${res.status}`);
    }
    return (await res.json()) as HelperVerifyResult;
  }
}

export function createHelperClient(port?: number, token?: string): HelperClient {
  return new HelperClient(port ?? HOST_CONFIG.helperPort, token ?? '');
}
