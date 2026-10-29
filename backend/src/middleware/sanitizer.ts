import type { Request, Response, NextFunction } from 'express';

/**
 * Sanitizes single string values against cross-site scripting (XSS) vectors,
 * script injections, and pseudo-protocols while preserving valid Stellar identifiers
 * and alphanumeric characters.
 */
export function sanitizeString(val: string): string {
  if (!val || typeof val !== 'string') return val;
  let sanitized = val.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '');
  sanitized = sanitized.replace(/<\s*script[^>]*>/gi, '');
  sanitized = sanitized.replace(/<\s*\/\s*script\s*>/gi, '');
  sanitized = sanitized.replace(/(javascript|vbscript):/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/<\/?(iframe|object|embed|applet|meta|link)[^>]*>/gi, '');
  return sanitized.trim();
}

/**
 * Recursively traverses payload structures (objects, arrays, strings) to sanitize content.
 */
export function sanitizePayload<T>(payload: T): T {
  if (payload === null || payload === undefined) {
    return payload;
  }
  if (typeof payload === 'string') {
    return sanitizeString(payload) as unknown as T;
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizePayload(item)) as unknown as T;
  }
  if (typeof payload === 'object') {
    const sanitizedObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      sanitizedObj[key] = sanitizePayload(value);
    }
    return sanitizedObj as T;
  }
  return payload;
}

/**
 * Express middleware to sanitize incoming request body and query parameters.
 */
export function sanitizerMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizePayload(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizePayload(req.query);
  }
  next();
}
