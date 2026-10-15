/**
 * Accounts and sessions (spec section 6 registration, section 25 security).
 * Passwords: scrypt with a per-user salt. Sessions: 256-bit random token in an
 * HttpOnly, SameSite=Lax cookie; only its SHA-256 is stored server-side.
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DomainError } from '@rta/core';

export const SESSION_COOKIE = 'rta_session';
export const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 64 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, SCRYPT.keyLen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** Constant-time check. A malformed or missing hash never matches. */
export function verifyPassword(password: string, stored: string | undefined): boolean {
  const parts = (stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    // Spend comparable time so unknown accounts are not distinguishable by timing.
    scryptSync(password, 'timing-equalizer', SCRYPT.keyLen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
    return false;
  }
  const [, n, r, p, salt, key] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(key, 'base64');
  const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export function validateCredentials(email: string, password: string): void {
  const problems: Record<string, string> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) problems.email = 'Enter a valid email address';
  if (password.length < 10) problems.password = 'Use at least 10 characters';
  else if (password.length > 200) problems.password = 'Use at most 200 characters';
  else if (normalizeEmail(password) === normalizeEmail(email)) problems.password = 'Password cannot be your email address';
  if (Object.keys(problems).length) throw new DomainError('validation', 'Please fix the highlighted fields', { fields: problems });
}

export const newSessionToken = (): string => randomBytes(32).toString('hex');
export const tokenKey = (token: string): string => createHash('sha256').update(token).digest('hex');

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function sessionCookie(token: string, opts: { secure: boolean; maxAgeSeconds: number }): string {
  return [
    `${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${opts.maxAgeSeconds}`, opts.secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

/**
 * Failed-login limiter: after `max` failures for an email within the window,
 * further attempts are refused until the window passes.
 */
export class LoginLimiter {
  private failures = new Map<string, { count: number; first: number }>();
  constructor(private readonly max = 8, private readonly windowMs = 15 * 60_000) {}

  check(key: string, now: number): void {
    const f = this.failures.get(key);
    if (f && now - f.first < this.windowMs && f.count >= this.max) {
      throw new DomainError('rate_limited', 'Too many sign-in attempts. Try again in 15 minutes.');
    }
  }

  fail(key: string, now: number): void {
    const f = this.failures.get(key);
    if (!f || now - f.first >= this.windowMs) this.failures.set(key, { count: 1, first: now });
    else f.count += 1;
  }

  reset(key: string): void {
    this.failures.delete(key);
  }
}
