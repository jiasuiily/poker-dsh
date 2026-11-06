/**
 * 最小 JWT（HS256）：无外部依赖，用于登录会话。
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

export function signToken(payload: Record<string, unknown>, secret: string, ttlSec = 60 * 60 * 24 * 7): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec }));
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, b, sig] = parts;
  const expected = createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url');
  const a = Buffer.from(sig);
  const e = Buffer.from(expected);
  if (a.length !== e.length || !timingSafeEqual(a, e)) return null;
  try {
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString()) as Record<string, unknown>;
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
