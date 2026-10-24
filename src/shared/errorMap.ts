/**
 * Error handling table (section 12). One unit test per row.
 */

export type ErrorAction =
  | 'no_request'
  | 'no_retry'
  | 'retry_backoff'
  | 'retry_once_simplified'
  | 'retry_once_higher_cap'
  | 'repair_once'
  | 'manual'
  | 'wait_online'
  | 'abort_manual'
  | 'show_diagnostics'
  | 'ask_expand_samples'
  | 'scroll_banner'
  | 'stale'
  | 'evict_lru'
  | 'normalize'
  | 'helper_fix'
  | 'repair_compile'
  | 'continue_tests'
  | 'reload_page'
  | 'resume_or_cache';

export interface ErrorRow {
  id: string;
  condition: string;
  userMessage: string;
  action: ErrorAction;
  maxAutoRetries: number;
}

export const ERROR_MAP: ErrorRow[] = [
  {
    id: 'no_api_key',
    condition: 'no API key',
    userMessage: 'Add your Gemini key in Options',
    action: 'no_request',
    maxAutoRetries: 0,
  },
  {
    id: 'auth_invalid',
    condition: '401/403 invalid or restricted key',
    userMessage: 'API key is invalid or restricted. Check Options and Google AI Studio quotas.',
    action: 'no_retry',
    maxAutoRetries: 0,
  },
  {
    id: 'model_not_found',
    condition: '400 or model not found',
    userMessage: 'Reload the model list',
    action: 'no_retry',
    maxAutoRetries: 0,
  },
  {
    id: 'rate_limit',
    condition: '429 rate or quota',
    userMessage: 'Rate limit, retry in N s',
    action: 'retry_backoff',
    maxAutoRetries: 2,
  },
  {
    id: 'server_error',
    condition: '5xx or network error',
    userMessage: 'Server or network error. Retrying…',
    action: 'retry_backoff',
    maxAutoRetries: 2,
  },
  {
    id: 'offline',
    condition: 'offline',
    userMessage: 'You appear offline. Waiting for connection…',
    action: 'wait_online',
    maxAutoRetries: 0,
  },
  {
    id: 'timeout',
    condition: 'timeout',
    userMessage: 'Request timed out. Tap Retry.',
    action: 'abort_manual',
    maxAutoRetries: 0,
  },
  {
    id: 'blocked_or_empty',
    condition: 'blocked, empty candidate or finish reason other than STOP',
    userMessage: 'Model returned no usable answer. Trying a simpler prompt…',
    action: 'retry_once_simplified',
    maxAutoRetries: 1,
  },
  {
    id: 'truncated',
    condition: 'truncated output (MAX_TOKENS)',
    userMessage: 'Answer was truncated. Retrying with a higher token cap…',
    action: 'retry_once_higher_cap',
    maxAutoRetries: 1,
  },
  {
    id: 'invalid_json',
    condition: 'invalid JSON or schema mismatch',
    userMessage: 'Could not parse model output. Attempting one repair…',
    action: 'repair_once',
    maxAutoRetries: 1,
  },
  {
    id: 'worker_restarted',
    condition: 'worker restarted mid-request',
    userMessage: 'Extension worker restarted. Resuming…',
    action: 'resume_or_cache',
    maxAutoRetries: 1,
  },
  {
    id: 'context_invalidated',
    condition: 'extension reloaded while page open',
    userMessage: 'Reload this page',
    action: 'reload_page',
    maxAutoRetries: 0,
  },
  {
    id: 'probe_low',
    condition: 'probe confidence low or selectors fail',
    userMessage: "Couldn't read this page reliably",
    action: 'show_diagnostics',
    maxAutoRetries: 0,
  },
  {
    id: 'samples_collapsed',
    condition: 'samples collapsed or unparsed',
    userMessage: 'Expand Sample Test Cases on the page (we will not click it).',
    action: 'ask_expand_samples',
    maxAutoRetries: 0,
  },
  {
    id: 'partial_editor',
    condition: 'partial editor capture',
    userMessage: 'Scroll the editor to the top so line 1 is visible.',
    action: 'scroll_banner',
    maxAutoRetries: 0,
  },
  {
    id: 'helper_off',
    condition: 'helper off, wrong token, port busy, gcc missing',
    userMessage: 'See docs/TROUBLESHOOTING.md for the exact fix.',
    action: 'helper_fix',
    maxAutoRetries: 0,
  },
  {
    id: 'compile_error',
    condition: 'compile error',
    userMessage: 'Compile error — running repair loop (at most 2 rounds).',
    action: 'repair_compile',
    maxAutoRetries: 2,
  },
  {
    id: 'run_bad',
    condition: 'infinite loop, crash, huge output',
    userMessage: 'A sample run failed (timeout/crash/output limit). Continuing other tests.',
    action: 'continue_tests',
    maxAutoRetries: 0,
  },
  {
    id: 'page_changed',
    condition: 'page changed during a request',
    userMessage: 'Page changed — previous suggestion is STALE.',
    action: 'stale',
    maxAutoRetries: 0,
  },
  {
    id: 'storage_full',
    condition: 'storage full',
    userMessage: 'Local cache was full; evicted old entries.',
    action: 'evict_lru',
    maxAutoRetries: 0,
  },
  {
    id: 'unicode',
    condition: 'Unicode oddities',
    userMessage: 'Normalized NBSP / zero-width / smart quotes before compare.',
    action: 'normalize',
    maxAutoRetries: 0,
  },
];

export function getErrorRow(id: string): ErrorRow | undefined {
  return ERROR_MAP.find((r) => r.id === id);
}

export function formatRateLimitMessage(seconds: number): string {
  return `Rate limit, retry in ${seconds} s`;
}

export function mapHttpStatusToErrorId(status: number): string {
  if (status === 401 || status === 403) return 'auth_invalid';
  if (status === 400) return 'model_not_found';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server_error';
  return 'server_error';
}
