/**
 * Single place to change CodeTantra host / helper bind address.
 * Manifest is generated from these values (see tools/generate-manifest.mjs).
 */
import hostConfig from './hostConfig.json';

export const HOST_CONFIG = {
  ...hostConfig,
  get helperMatch(): string {
    return `http://127.0.0.1:${this.helperPort}/*`;
  },
  helperHost: '127.0.0.1',
  /**
   * Chrome 116+: WebSocket keepalive / longer SW lifetime patterns we rely on.
   * scripting MAIN world: 102+. storage.session: 102+.
   */
} as const;

export type HostConfig = typeof HOST_CONFIG;
