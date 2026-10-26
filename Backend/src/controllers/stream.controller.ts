import type { Request, Response } from 'express';

export class StreamController {
  public async streamChat(req: Request, res: Response): Promise<void> {
    const { prompt, context } = req.body || {};

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: { message: 'A valid prompt string is required.' } });
      return;
    }

    // 1. Establish SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering for reverse proxies
    });
    res.flushHeaders();

    // Helper to send typed SSE events
    const sendSSE = (event: string, data: Record<string, unknown> | string) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
    };

    // Client disconnection detection
    let isClientConnected = true;
    req.on('close', () => {
      isClientConnected = false;
      res.end();
    });

    try {
      sendSSE('step', { phase: 'INITIALIZING', message: 'Analyzing prompt and context...' });

      // Simulated or live streaming chunks
      const sampleTokens = [
        'APIForge',
        ' contract',
        ' validation',
        ' completed.',
        ' All',
        ' assertions',
        ' verified',
        ' successfully.',
      ];

      for (const token of sampleTokens) {
        if (!isClientConnected) break;
        await new Promise((resolve) => setTimeout(resolve, 80));
        sendSSE('token', { chunk: token });
      }

      if (isClientConnected) {
        sendSSE('done', {
          totalTokens: sampleTokens.length,
          contextIncluded: Boolean(context),
          finishReason: 'STOP',
        });
        res.end();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Streaming execution failed';
      sendSSE('error', { error: message });
      res.end();
    }
  }
}
