/**
 * Redact emails, phones, and ID-like strings before sending to Gemini.
 * Never send college email from page header.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}\b/g;
const ID_LIKE_RE = /\b(?:USN|REG|ID|ROLL)[:\s#-]*[A-Z0-9]{5,}\b/gi;
const LONG_DIGIT_RE = /\b\d{10,}\b/g;

export interface RedactionResult {
  text: string;
  redactedCount: number;
}

export function redactText(input: string): RedactionResult {
  let count = 0;
  const bump = () => {
    count += 1;
    return '[REDACTED]';
  };
  let text = input.replace(EMAIL_RE, bump);
  text = text.replace(ID_LIKE_RE, bump);
  text = text.replace(PHONE_RE, (m) => {
    // Avoid eating sample numbers like "10 5" — require length ≥ 10 digits total
    const digits = m.replace(/\D/g, '');
    if (digits.length < 10) return m;
    count += 1;
    return '[REDACTED]';
  });
  text = text.replace(LONG_DIGIT_RE, bump);
  return { text, redactedCount: count };
}

export function redactObjectDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return redactText(value).text as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactObjectDeep(v)) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactObjectDeep(v);
    }
    return out as T;
  }
  return value;
}
