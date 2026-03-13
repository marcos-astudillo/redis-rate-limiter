import { Request } from 'express';

/**
 * KeyExtractor — pluggable identity strategies.
 *
 * Priority for the default extractor (highest → lowest):
 *   1. x-api-key header
 *   2. user ID from req.user (set by upstream auth middleware)
 *   3. Client IP
 *
 * Pass a custom extractor to rateLimiter() to override this behaviour,
 * e.g. to combine IP + route for per-endpoint limiting.
 */

export type KeyExtractor = (req: Request) => string;

/** Prefer API key → user ID → IP */
export const byApiKeyOrUser: KeyExtractor = (req) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey) return `apikey:${Array.isArray(apiKey) ? apiKey[0] : apiKey}`;

  const user = (req as Request & { user?: { id: string } }).user;
  if (user?.id) return `user:${user.id}`;

  return `ip:${getClientIp(req)}`;
};

/** Scope limit to a specific route — combine IP + path */
export const byIpAndRoute: KeyExtractor = (req) =>
  `ip:${getClientIp(req)}|route:${req.path}`;

/** Scope limit to IP only */
export const byIp: KeyExtractor = (req) => `ip:${getClientIp(req)}`;

/** Scope limit to API key only — falls back to IP if header absent */
export const byApiKey: KeyExtractor = (req) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey) return `apikey:${Array.isArray(apiKey) ? apiKey[0] : apiKey}`;
  return `ip:${getClientIp(req)}`;
};

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return first.trim();
  }
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
