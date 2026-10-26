/** SHA-256 helpers (Web Crypto is available in Chrome extensions and Node 20+). */

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('Web Crypto SHA-256 is unavailable');
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
  typeHint = '',
): Promise<string> {
  return sha256Hex(`${signature}|${model}|${promptVersion}|${typeHint}`);
}
