import { useState, useCallback, useRef } from 'react';

export interface SSEStreamOptions {
  onToken?: (token: string) => void;
  onStep?: (step: { phase: string; message: string }) => void;
  onComplete?: () => void;
  onError?: (err: string) => void;
}

export function useSSEChat() {
  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startStream = useCallback(
    async (url: string, payload: unknown, options?: SSEStreamOptions) => {
      setIsStreaming(true);
      setContent('');
      setStatusMessage(null);

      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`SSE connection failed with HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || ''; // Preserve incomplete chunk in buffer

          for (const rawEvent of events) {
            if (!rawEvent.trim()) continue;
            const lines = rawEvent.split('\n');
            let eventType = 'message';
            let eventData = '';

            for (const line of lines) {
              if (line.startsWith('event: ')) eventType = line.slice(7).trim();
              if (line.startsWith('data: ')) eventData = line.slice(6).trim();
            }

            if (eventType === 'token') {
              const parsed = JSON.parse(eventData);
              setContent((prev) => prev + parsed.chunk);
              options?.onToken?.(parsed.chunk);
            } else if (eventType === 'step') {
              const parsed = JSON.parse(eventData);
              setStatusMessage(parsed.message);
              options?.onStep?.(parsed);
            } else if (eventType === 'done') {
              options?.onComplete?.();
            } else if (eventType === 'error') {
              const parsed = JSON.parse(eventData);
              options?.onError?.(parsed.error);
            }
          }
        }
      } catch (err: unknown) {
        if ((err as Error).name !== 'AbortError') {
          const msg = err instanceof Error ? err.message : 'Stream connection error';
          options?.onError?.(msg);
        }
      } finally {
        setIsStreaming(false);
      }
    },
    []
  );

  const cancelStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return { content, isStreaming, statusMessage, startStream, cancelStream };
}
