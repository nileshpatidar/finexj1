import { Request, Response, NextFunction } from 'express';
import { Errors } from './errors';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitBuckets = new Map<string, RateLimitRecord>();

// Cleanup stale buckets periodically
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitBuckets.entries()) {
    if (now > v.resetAt) {
      rateLimitBuckets.delete(k);
    }
  }
}, 60 * 1000).unref?.();

/**
 * Creates an in-memory sliding window rate limiter
 * Enforces limits by client IP and by authenticated user ID (when logged in).
 */
export function createRateLimiter(options: {
  windowMs: number; // e.g. 60,000 ms (1 minute)
  maxRequests: number; // e.g. 10 requests per minute
  keyPrefix?: string;
  perUser?: boolean;
}) {
  const { windowMs, maxRequests, keyPrefix = 'rl', perUser = true } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Get client IP identifier
    const rawForwarded = req.headers['x-forwarded-for'];
    const clientIp =
      (typeof rawForwarded === 'string' ? rawForwarded.split(',')[0].trim() : undefined) ||
      req.socket.remoteAddress ||
      'unknown-ip';

    // Key by IP, and if authenticated, also track by userId to prevent IP-rotation bypass
    const userId = (req as any).user?.id;
    const identifier = perUser && userId ? `user:${userId}` : `ip:${clientIp}`;
    const key = `${keyPrefix}:${identifier}`;

    const now = Date.now();
    const record = rateLimitBuckets.get(key);

    if (!record || now > record.resetAt) {
      rateLimitBuckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });

      res.setHeader('RateLimit-Limit', maxRequests);
      res.setHeader('RateLimit-Remaining', maxRequests - 1);
      res.setHeader('RateLimit-Reset', Math.ceil((now + windowMs) / 1000));
      next();
      return;
    }

    record.count++;
    const remaining = Math.max(0, maxRequests - record.count);
    const resetSeconds = Math.ceil((record.resetAt - now) / 1000);

    res.setHeader('RateLimit-Limit', maxRequests);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', resetSeconds);

    if (record.count > maxRequests) {
      const retryAfterSec = Math.max(1, resetSeconds);
      res.setHeader('Retry-After', retryAfterSec);
      next(Errors.rateLimited(`Too many requests. Please wait ${retryAfterSec} seconds before retrying.`));
      return;
    }

    next();
  };
}
