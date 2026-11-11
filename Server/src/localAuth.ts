import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const sessions = new Map<string, number>();
const lifetime = 8 * 60 * 60 * 1000;

export function isLocalDemoEnabled(): boolean {
  return process.env.NODE_ENV === 'development'
    && process.env.FRIDAY_ENV === 'DEV'
    && !process.env.VERCEL
    && !process.env.DATABASE_URL
    && !process.env.SUPABASE_URL
    && !process.env.SUPABASE_ANON_KEY
    && !process.env.SUPABASE_SECRET_KEY
    && Boolean(process.env.LOCAL_DEMO_EMAIL)
    && Boolean(process.env.LOCAL_DEMO_PASSWORD);
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function matches(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

export function isLoopbackRequest(req: Request): boolean {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1']
    .includes(req.socket.remoteAddress || '');
}

export function createLocalDemoSession(
  req: Request, email: string, password: string
) {
  if (!isLocalDemoEnabled() || !isLoopbackRequest(req)) return null;

  if (!matches(email.trim().toLowerCase(),
      (process.env.LOCAL_DEMO_EMAIL || '').trim().toLowerCase())
      || !matches(password, process.env.LOCAL_DEMO_PASSWORD || '')) {
    return null;
  }

  const token = `friday_local_${randomBytes(32).toString('base64url')}`;
  sessions.set(digest(token).toString('hex'), Date.now() + lifetime);

  return {
    access_token: token,
    token_type: 'bearer',
    expires_in: lifetime / 1000,
    must_change_password: false,
    user: { id: 'demo-user', email }
  };
}

export function isValidLocalDemoSession(
  req: Request, token: string
): boolean {
  if (!isLocalDemoEnabled() || !isLoopbackRequest(req)) return false;
  if (!/^friday_local_[A-Za-z0-9_-]{43}$/.test(token)) return false;

  const id = digest(token).toString('hex');
  const expiry = sessions.get(id);

  if (!expiry || expiry <= Date.now()) {
    sessions.delete(id);
    return false;
  }

  return true;
}

export function revokeLocalDemoSession(req: Request, token: string) {
  if (isLocalDemoEnabled() && isLoopbackRequest(req)) {
    sessions.delete(digest(token).toString('hex'));
  }
}