import { Request, Response, NextFunction } from 'express';
import { redactSecrets } from '../utils/secretRedaction.js';

type BodyParserError = Error & { type?: string; status?: number };

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // body-parser errors carry the raw request body (which may contain an API key);
  // they are answered without logging the error object.
  const parserError = err as BodyParserError;
  if (parserError.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, error: { type: 'INVALID_JSON', message: 'Malformed JSON request body.' } });
    return;
  }
  if (parserError.type === 'entity.too.large') {
    res.status(413).json({ success: false, error: { type: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } });
    return;
  }

  console.error('Unhandled error:', redactSecrets(err?.stack ?? String(err)));

  res.status(500).json({
    success: false,
    error: {
      type: 'UNKNOWN_ERROR',
      message: 'Internal server error',
    },
  });
}
