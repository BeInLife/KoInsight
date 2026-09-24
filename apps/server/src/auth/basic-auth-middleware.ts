import { timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

type BasicAuthOptions = {
  username?: string;
  password?: string;
};

// KoSync endpoints called by KOReader's built-in progress sync. They use their own
// x-auth-user / x-auth-key authentication, and KOReader can't send basic auth credentials.
// Note: GET /syncs/progress (all progresses, used by the web UI) is intentionally NOT listed.
const KOSYNC_ROUTES: { method: string; path: RegExp }[] = [
  { method: 'POST', path: /^\/users\/create\/?$/ },
  { method: 'GET', path: /^\/users\/auth\/?$/ },
  { method: 'PUT', path: /^\/syncs\/progress\/?$/ },
  { method: 'GET', path: /^\/syncs\/progress\/[^/]+\/?$/ },
];

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function parseBasicAuth(header: string | undefined) {
  const match = header?.match(/^Basic\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator === -1) {
    return null;
  }

  return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}

export function isKosyncRoute(method: string, path: string) {
  return KOSYNC_ROUTES.some((route) => route.method === method && route.path.test(path));
}

/**
 * Protects the whole app with HTTP basic auth when both username and password are configured.
 * KoSync endpoints are exempt, since they have their own authentication.
 */
export function basicAuth({ username, password }: BasicAuthOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!username || !password || isKosyncRoute(req.method, req.path)) {
      next();
      return;
    }

    const credentials = parseBasicAuth(req.header('authorization'));
    if (
      credentials &&
      safeEqual(credentials.username, username) &&
      safeEqual(credentials.password, password)
    ) {
      next();
      return;
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="KoInsight", charset="UTF-8"');
    res.status(401).json({ error: 'Unauthorized' });
  };
}
