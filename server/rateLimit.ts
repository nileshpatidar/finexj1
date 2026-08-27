import { Request, Response, NextFunction } from 'express';
import { Errors } from './errors';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const ipBuckets = new Map<string, RateLimitRecord>();

/**
 * Creates an in-memory sliding window rate limiter
 */
export function createRateLimiter(options: {
  windowMs: number; // e.g. 60,000 ms (1 minute)
  maxRequests: number; // e.g. 10 requests per minute
  keyPrefix?: string;
}) {
  const { windowMs, maxRequests, keyPrefix = 'rl' } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Get client identifier (IP or forwarded IP)
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown-ip';

    const key = `${keyPrefix}:${clientIp}`;
    const now = Date.now();
    const record = ipBuckets.get(key);

    if (!record || now > record.resetAt) {
      ipBuckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      next();
      return;
    }

    record.count++;
    if (record.count > maxRequests) {
      const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      next(Errors.rateLimited(`Too many requests. Please wait ${retryAfterSec} seconds before retrying.`));
      return;
    }

    next();
  };
}
