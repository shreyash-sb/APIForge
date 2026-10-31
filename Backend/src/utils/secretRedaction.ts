/**
 * Shared secret redaction for anything that may reach an AI provider, a log line,
 * or an API response. Redaction is intentionally over-eager: false positives only
 * hide harmless text, false negatives leak credentials.
 */

export const REDACTED = '[REDACTED]';

const SENSITIVE_KEY = /^(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-goog-api-key|x-auth-token|api[-_]?key|apikey|access[-_]?token|refresh[-_]?token|id[-_]?token|client[-_]?secret|secret|password|passwd|pwd|token|session(?:id)?|private[-_]?key)$/i;

const STRING_PATTERNS: Array<[RegExp, string]> = [
  // Google API keys (Gemini keys use this format).
  [/AIza[0-9A-Za-z_-]{30,}/g, REDACTED],
  // Bearer / Basic credentials.
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`],
  // key=value or "key": "value" pairs with sensitive names.
  [
    /(["']?(?:access[_-]?token|refresh[_-]?token|auth(?:orization)?|api[-_]?key|x-goog-api-key|client[_-]?secret|password|secret|token|cookie)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;&}\]]+)/gi,
    `$1${REDACTED}`,
  ],
  // URL user-info credentials: scheme://user:pass@host
  [/(:\/\/)[^\s/@:]+:[^\s/@]+@/g, `$1${REDACTED}@`],
];

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key.trim());
}

/** Redacts credential-shaped substrings and any explicitly supplied secret values. */
export function redactSecrets(value: string, extraSecrets: Array<string | undefined> = []): string {
  let out = value;
  for (const secret of extraSecrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join(REDACTED);
  }
  for (const [pattern, replacement] of STRING_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/** Deep-redacts an unknown JSON-like value: sensitive keys lose their values, strings are pattern-redacted. */
export function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[TRUNCATED]';
  if (typeof value === 'string') return redactSecrets(value);
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redactDeep(item, depth + 1);
    }
    return out;
  }
  return value;
}
