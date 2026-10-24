/**
 * Single place to change CodeTantra host / helper bind address.
 * Manifest is generated from these values (see tools/generate-manifest.mjs).
 */
export const HOST_CONFIG = {
  /** Match pattern for CodeTantra pages (content scripts + host_permissions). */
  codeTantraMatch: 'https://*.codetantra.com/*',
  /** Gemini Generative Language API. */
  geminiMatch: 'https://generativelanguage.googleapis.com/*',
  /**
   * Narrowest valid localhost pattern for the helper.
   * Docs: match patterns match all ports unless an explicit port is specified.
   * Changing helperPort requires rebuild so the manifest stays in sync.
   */
  helperPort: 47831,
  get helperMatch(): string {
    return `http://127.0.0.1:${this.helperPort}/*`;
  },
  helperHost: '127.0.0.1',
  extensionName: 'CT-C Assistant',
  extensionVersion: '0.1.0',
  /**
   * Chrome 116+: WebSocket keepalive / longer SW lifetime patterns we rely on.
   * scripting MAIN world: 102+. storage.session: 102+.
   */
  minimumChromeVersion: '116',
} as const;

export type HostConfig = typeof HOST_CONFIG;
