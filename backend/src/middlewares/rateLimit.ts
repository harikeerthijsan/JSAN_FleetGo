import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { ApiResponse } from '../utils/ApiResponse';
import { logger } from '../utils/logger';

/**
 * Rate limiter for authentication endpoints (login, forgot/reset password) to
 * mitigate brute-force and credential-stuffing attacks. Keyed by client IP
 * plus the submitted email (when present) so one attacker cannot exhaust the
 * limit for every account from a shared proxy, and so a single account is
 * protected across IPs.
 */
export const authRateLimiter = rateLimit({
  windowMs: config.auth.rateLimit.windowMs,
  max: config.auth.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const email =
      typeof req.body?.email === 'string'
        ? req.body.email.toLowerCase().trim()
        : 'unknown';
    // Normalize the client IP (strip IPv6 zone/prefix noise) for a stable key.
    const ip = (req.ip ?? 'unknown').replace(/^::ffff:/, '');
    return `${ip}:${email}`;
  },
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', { ip: req.ip, path: req.path });
    ApiResponse.error(
      res,
      429,
      'Too many attempts. Please wait a while and try again.',
    );
  },
});
