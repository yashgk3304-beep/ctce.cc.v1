/** SHA-256 helpers (Web Crypto in extension; Node crypto in tests). */

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Node fallback for unit tests without subtle
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export async function signatureFromParts(
  statement: string,
  samples: string,
  editor: string,
): Promise<string> {
  const payload = `${statement}\n---\n${samples}\n---\n${editor}`;
  return sha256Hex(payload);
}

export async function cacheKey(
  signature: string,
  model: string,
  promptVersion: string,
): Promise<string> {
  return sha256Hex(`${signature}|${model}|${promptVersion}`);
}
