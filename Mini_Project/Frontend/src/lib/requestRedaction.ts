const secretKey = /(?:api[_-]?key|authorization|cookie|password|secret|token)/i;

/** Returns a display-safe path only; hosts, credentials, headers, and bodies are never retained. */
export function redactEndpoint(value: string): string {
  try {
    const url = new URL(value);
    for (const [key] of url.searchParams) if (secretKey.test(key)) url.searchParams.set(key, '[REDACTED]');
    return decodeURIComponent(`${url.pathname}${url.search}`) || '/';
  } catch {
    return value.replace(/([?&](?:api[_-]?key|authorization|cookie|password|secret|token)[^=]*=)[^&]*/gi, '$1[REDACTED]');
  }
}
