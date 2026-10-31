export interface RetryOptions {
  timeoutMs?: number;
  maxRetries?: number;
  initialDelayMs?: number;
}

/**
 * Resilient fetch wrapper with configurable timeout cancellation and exponential backoff.
 */
export async function resilientFetch(
  url: string,
  options: RequestInit = {},
  retryConfig: RetryOptions = {}
): Promise<Response> {
  const { timeoutMs = 8000, maxRetries = 3, initialDelayMs = 500 } = retryConfig;
  let attempt = 0;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timer);

      // Return immediately on successful responses or non-retryable 4xx client errors (except 429)
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
        return response;
      }

      throw new Error(`Upstream service returned HTTP ${response.status}`);
    } catch (err: unknown) {
      clearTimeout(timer);
      attempt++;

      if (attempt > maxRetries) {
        throw new Error(`resilientFetch failed after ${maxRetries} retries: ${(err as Error).message}`, { cause: err });
      }

      // Exponential backoff with random jitter (delay = base * 2^(attempt-1) + jitter)
      const delay = initialDelayMs * Math.pow(2, attempt - 1) + Math.random() * 100;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unexpected resilientFetch termination.');
}
