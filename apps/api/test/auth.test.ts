import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { hashPassword, verifyPassword } from '../src/auth';
import { exampleA } from '../../../packages/core/test/helpers';

async function boot(opts: Parameters<typeof createApp>[0] = {}) {
  const app = createApp({ now: () => new Date('2026-10-15T12:00:00Z'), ...opts });
  const srv = app.server();
  await new Promise<void>((r) => srv.listen(0, r));
  const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const req = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(url + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = res.headers.get('set-cookie') ?? '';
    return { status: res.status, body: (await res.json()) as any, setCookie, cookie: setCookie.split(';')[0] ?? '' };
  };
  return { app, req, close: () => new Promise<void>((r) => srv.close(() => r())) };
}

const good = { name: 'Ana', email: 'Ana@Example.test', password: 'correct horse battery', accountType: 'homeowner', acceptTerms: true };

describe('password hashing', () => {
  it('verifies the right password only, and never matches a missing hash', () => {
    const h = hashPassword('a long secret phrase');
    expect(h).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(hashPassword('a long secret phrase')).not.toBe(h); // per-user salt
    expect(verifyPassword('a long secret phrase', h)).toBe(true);
    expect(verifyPassword('a long secret phrasE', h)).toBe(false);
    expect(verifyPassword('anything', undefined)).toBe(false);
  });
});

describe('accounts and sessions', () => {
  it('registers, signs in with an HttpOnly cookie, and signs out', async () => {
    const s = await boot();
    const bad = await s.req('POST', '/api/auth/register', { ...good, password: 'short', acceptTerms: false, name: '' });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.details.fields).sort()).toEqual(['acceptTerms', 'name', 'password']);

    const reg = await s.req('POST', '/api/auth/register', good);
    expect(reg.status).toBe(201);
    expect(reg.setCookie).toMatch(/rta_session=[0-9a-f]{64}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000/);
    expect(reg.body.user).toEqual({ id: expect.any(String), name: 'Ana', email: 'ana@example.test', roles: ['homeowner'], orgIds: [] });
    expect(JSON.stringify(reg.body)).not.toContain('scrypt');

    expect((await s.req('POST', '/api/auth/register', { ...good, email: 'ANA@example.test ' })).status).toBe(409);

    const me = await s.req('GET', '/api/me', undefined, { cookie: reg.cookie });
    expect(me.body).toMatchObject({ via: 'session', user: { email: 'ana@example.test' } });

    const wrong = await s.req('POST', '/api/auth/login', { email: 'ana@example.test', password: 'nope nope nope' });
    expect(wrong.status).toBe(401);
    const unknown = await s.req('POST', '/api/auth/login', { email: 'nobody@example.test', password: 'whatever123' });
    expect(unknown.body.error.message).toBe(wrong.body.error.message); // no account enumeration

    const login = await s.req('POST', '/api/auth/login', { email: 'ANA@example.test', password: good.password });
    expect(login.status).toBe(200);
    await s.req('POST', '/api/auth/logout', {}, { cookie: login.cookie });
    expect((await s.req('GET', '/api/me', undefined, { cookie: login.cookie })).body.user).toBeNull();
    // The other session (from registration) is still valid.
    expect((await s.req('GET', '/api/me', undefined, { cookie: reg.cookie })).body.user.email).toBe('ana@example.test');
    await s.close();
  });

  it('locks out repeated wrong passwords', async () => {
    const s = await boot();
    await s.req('POST', '/api/auth/register', good);
    for (let i = 0; i < 8; i++) expect((await s.req('POST', '/api/auth/login', { email: good.email, password: 'wrong password!' })).status).toBe(401);
    const locked = await s.req('POST', '/api/auth/login', { email: good.email, password: good.password });
    expect(locked.status).toBe(429);
    await s.close();
  });

  it('moves a guest design and cart into the new account (AC06.1)', async () => {
    const s = await boot();
    const cart = (await s.req('POST', '/api/carts', {})).body;
    const G = { 'x-guest-token': cart.guestToken };
    await s.req('PATCH', `/api/carts/${cart.id}`, { lines: [{ skuCode: 'SMP-WHT', quantity: 1 }] }, G);
    const project = (await s.req('POST', '/api/projects', { name: 'Guest kitchen', document: exampleA() }, G)).body;
    const reg = await s.req('POST', '/api/auth/register', good, G);
    expect(reg.body.attached).toEqual({ projectId: project.id, carts: [cart.id] });
    const C = { cookie: reg.cookie };
    expect((await s.req('GET', `/api/projects/${project.id}`, undefined, C)).body.document).toEqual(exampleA());
    expect((await s.req('GET', `/api/carts/${cart.id}`, undefined, C)).body.lines).toHaveLength(1);
    expect((await s.req('GET', `/api/projects/${project.id}`, undefined, G)).status).toBe(404);
    await s.close();
  });

  it('creates Pro accounts with their own organization but no trade pricing until membership', async () => {
    const s = await boot();
    const reg = await s.req('POST', '/api/auth/register', { ...good, email: 'builder@example.test', accountType: 'pro', businessName: 'Ana Builds' });
    expect(reg.body.user.roles).toEqual(['pro_owner']);
    expect(reg.body.user.orgIds).toHaveLength(1);
    expect((await s.req('GET', '/api/me', undefined, { cookie: reg.cookie })).body.entitlement.tradePricing).toBe(false);
    expect((await s.req('GET', '/api/directory?zip=33101')).body.results.map((r: any) => r.displayName)).not.toContain('Ana Builds');
    await s.close();
  });

  it('refuses demo identities when demo accounts are off', async () => {
    const s = await boot({ demoAuth: false });
    const r = await s.req('GET', '/api/me/projects', undefined, { 'x-user-id': 'u_admin' });
    expect(r.status).toBe(401);
    expect((await s.req('GET', '/api/health')).body.demoAuth).toBe(false);
    await s.close();
  });

  it('refuses cross-site writes when origin checks are on', async () => {
    const s = await boot({ enforceOrigin: true });
    const evil = await s.req('POST', '/api/auth/register', good, { origin: 'https://evil.example' });
    expect(evil.status).toBe(403);
    expect((await s.req('POST', '/api/auth/register', good)).status).toBe(201);
    await s.close();
  });

  it('lets an admin grant and revoke staff roles; revoking ends sessions', async () => {
    const s = await boot();
    const staff = await s.req('POST', '/api/auth/register', { ...good, email: 'staff@example.test' });
    const A = { 'x-user-id': 'u_admin' };
    expect((await s.req('POST', '/api/admin/users/roles', { email: 'staff@example.test', grant: ['admin'] }, { cookie: staff.cookie })).status).toBe(403);
    const granted = await s.req('POST', '/api/admin/users/roles', { email: 'staff@example.test', grant: ['internal_designer', 'pro_owner'] }, A);
    expect(granted.body.user.roles).toEqual(['homeowner', 'internal_designer']); // only staff roles can be granted
    expect((await s.req('GET', '/api/design-requests', undefined, { cookie: staff.cookie })).status).toBe(200);
    await s.req('POST', '/api/admin/users/roles', { email: 'staff@example.test', revoke: ['internal_designer'] }, A);
    expect((await s.req('GET', '/api/me', undefined, { cookie: staff.cookie })).body.user).toBeNull();
    const list = await s.req('GET', '/api/admin/users', undefined, A);
    expect(list.body.users.map((u: any) => u.email)).toEqual(['staff@example.test']);
    expect(JSON.stringify(list.body)).not.toContain('scrypt');
    await s.close();
  });
});
