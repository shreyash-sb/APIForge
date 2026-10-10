import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Unhandled error:', err);

  res.status(500).json({
    success: false,
    error: {
      type: 'UNKNOWN_ERROR',
      message: 'Internal server error',
    },
  });
}
