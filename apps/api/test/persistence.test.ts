import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp, signWebhook } from '../src/app';
import { type Persistence, PgPersistence } from '../src/persistence';
import { type EntityKind, type EntityRow, openStore } from '../src/store';
import { exampleA } from '../../../packages/core/test/helpers';

const H = { 'x-user-id': 'u_home' };

async function boot(app: ReturnType<typeof createApp>) {
  const srv = app.server();
  await new Promise<void>((r) => srv.listen(0, r));
  const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const req = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(url + path, {
      method, headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as any, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '' };
  };
  return { req, close: () => new Promise<void>((r) => srv.close(() => r())) };
}

/** In-memory Persistence whose writes can be made to fail, to test rollback without a database. */
class FlakyPersistence implements Persistence {
  rows = new Map<string, EntityRow>();
  failNext = false;
  async load() { return [...this.rows.values()].map((r) => structuredClone(r)); }
  async apply(upserts: EntityRow[], deletes: { kind: EntityKind; id: string }[]) {
    if (this.failNext) { this.failNext = false; throw new Error('simulated database outage'); }
    for (const r of upserts) this.rows.set(`${r.kind}:${r.id}`, structuredClone(r));
    for (const d of deletes) this.rows.delete(`${d.kind}:${d.id}`);
  }
  async close() {}
}

describe('write-through persistence (no database needed)', () => {
  it('a failed save returns 503, leaves no trace, and the next request works', async () => {
    const persistence = new FlakyPersistence();
    const { store } = await openStore(persistence);
    const s = await boot(createApp({ store, persistence }));
    persistence.failNext = true;
    const failed = await s.req('POST', '/api/projects', { name: 'Lost', document: exampleA() }, H);
    expect(failed.status).toBe(503);
    expect(failed.body.error.code).toBe('provider_unavailable');
    expect(store.projects.size).toBe(0); // memory rolled back to what is stored
    const ok = await s.req('POST', '/api/projects', { name: 'Kept', document: exampleA() }, H);
    expect(ok.status).toBe(201);
    expect([...persistence.rows.keys()].filter((k) => k.startsWith('project:'))).toEqual([`project:${ok.body.id}`]);
    await s.close();
  });

  it('only changed rows are written after the first save', async () => {
    const persistence = new FlakyPersistence();
    const { store } = await openStore(persistence);
    let writes = 0;
    const counting: Persistence = { load: () => persistence.load(), close: async () => {}, apply: async (u, d) => { writes += u.length + d.length; await persistence.apply(u, d); } };
    const s = await boot(createApp({ store, persistence: counting }));
    await s.req('POST', '/api/projects', { name: 'K', document: exampleA() }, H);
    expect(writes).toBe(3); // project, seq counter, access window
    await s.close();
  });
});

const ADMIN_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!ADMIN_URL)('PostgreSQL persistence (TEST_DATABASE_URL)', () => {
  const dbName = `rta_test_${process.pid}_${Date.now()}`;
  let url = '';

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    try { await admin.query(`CREATE DATABASE ${dbName}`); }
    finally { await admin.end(); }
    const u = new URL(ADMIN_URL!);
    u.pathname = `/${dbName}`;
    url = u.toString();
  });

  afterAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    try { await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`); }
    finally { await admin.end(); }
  });


  // Release servers and PostgreSQL advisory locks even if setup or an assertion fails.
  type Resource = { close(): Promise<void> };
  const resources = new Set<Resource>();
  const connect = async () => {
    const p = await PgPersistence.connect(url);
    resources.add(p);
    return p;
  };
  const start = async (app: ReturnType<typeof createApp>) => {
    const s = await boot(app);
    resources.add(s);
    return s;
  };
  const close = async (resource: Resource) => {
    try { await resource.close(); } finally { resources.delete(resource); }
  };
  afterEach(async () => {
    const errors: unknown[] = [];
    for (const resource of [...resources].reverse()) {
      try { await close(resource); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Failed to close PostgreSQL test resources');
  });

  it('keeps projects, carts, orders, payments and idempotency across a restart', async () => {
    // --- first run: seed, design, order, pay
    const p1 = await connect();
    const first = await openStore(p1);
    expect(first.seeded).toBe(true);
    const app1 = createApp({ store: first.store, persistence: p1, webhookSecret: 's' });
    const a = await start(app1);
    const signup = await a.req('POST', '/api/auth/register', { name: 'Durable', email: 'durable@example.test', password: 'long enough password', accountType: 'homeowner', acceptTerms: true });
    expect(signup.status).toBe(201);
    const customer = { cookie: signup.cookie };
    const designer = { 'x-user-id': 'u_designer' }; // Seeded staff identity in this mock-only test app.
    const created = await a.req('POST', '/api/projects', { name: 'Durable', document: exampleA() }, customer);
    expect(created.status).toBe(201);
    const project = created.body;
    const staged = await a.req('POST', '/api/carts/from-design', { projectId: project.id, revision: 1 }, customer);
    expect(staged.status).toBe(201);
    const cart = staged.body;
    expect(cart.salesReviewReady).toBe(false);
    const held = await a.req('POST', '/api/checkout-sessions', { cartId: cart.id }, { ...customer, 'idempotency-key': 'restart-held' });
    expect(held.status).toBe(409);
    expect(held.body.error.code).toBe('gate_failed');
    expect(first.store.orders.size).toBe(0);
    const dr = await a.req('POST', '/api/design-requests', {
      projectId: project.id, roomType: 'kitchen', zip: '33101', timeline: 'soon', budgetRange: 'x',
      services: ['review_my_design'], contactPreference: 'email',
    }, customer);
    expect(dr.status).toBe(201);
    const transitionPath = `/api/design-requests/${dr.body.id}/transition`;
    expect((await a.req('POST', transitionPath, { to: 'assigned' }, designer)).status).toBe(200);
    expect((await a.req('POST', transitionPath, { to: 'in_design' }, designer)).status).toBe(200);
    const review = await a.req('POST', transitionPath, {
      to: 'customer_review', fitChecks: { wallClearance: true, doorSwing: true, windowInterference: true },
    }, designer);
    expect(review.status).toBe(200);
    expect(review.body).toMatchObject({ state: 'customer_review', revisionNumber: 1 });

    const accept = await a.req('POST', '/api/checkout-sessions', { cartId: cart.id }, { ...customer, 'idempotency-key': 'restart-accept' });
    expect(accept.status).toBe(409);
    expect(accept.body.error.details).toMatchObject({ requiresAcceptance: true, totalCents: expect.any(Number) });
    const total = accept.body.error.details.totalCents;
    const checkout = await a.req('POST', '/api/checkout-sessions', { cartId: cart.id, acceptedTotalCents: total }, { ...customer, 'idempotency-key': 'restart-order' });
    expect(checkout.status).toBe(201);
    expect(checkout.body.orderId).toEqual(expect.any(String));
    const order = checkout.body;
    const evt = JSON.stringify({ id: 'evt-restart', type: 'payment.succeeded', orderId: order.orderId, amountCents: total });
    expect((await a.req('POST', '/api/webhooks/mockpay', evt, { 'x-mockpay-signature': signWebhook('s', evt) })).body).toEqual({ received: true });
    await close(a);
    await close(p1);

    // --- second run: everything is still there
    const p2 = await connect();
    const second = await openStore(p2);
    expect(second.seeded).toBe(false);
    const b = await start(createApp({ store: second.store, persistence: p2, webhookSecret: 's' }));
    const loaded = await b.req('GET', `/api/projects/${project.id}`, undefined, customer);
    expect(loaded.body.document).toEqual(exampleA());
    expect((await b.req('GET', '/api/me/design-requests', undefined, customer)).body.requests.map((r: any) => r.id)).toEqual([dr.body.id]);
    expect((await b.req('GET', `/api/carts/${cart.id}`, undefined, customer)).body.salesReviewReady).toBe(true);
    // Sessions and password logins survive a restart.
    expect((await b.req('GET', '/api/me', undefined, { cookie: signup.cookie })).body.user.email).toBe('durable@example.test');
    expect((await b.req('POST', '/api/auth/login', { email: 'durable@example.test', password: 'long enough password' })).status).toBe(200);
    const paid = await b.req('GET', `/api/orders/${order.orderId}`, undefined, customer);
    expect(paid.body.paymentState).toBe('paid');
    expect(paid.body.totalCents).toBe(total);
    // Idempotency keys and webhook receipts survive: no duplicate order or payment effect.
    const replay = await b.req('POST', '/api/checkout-sessions', { cartId: cart.id, acceptedTotalCents: total }, { ...customer, 'idempotency-key': 'restart-order' });
    expect(replay.body).toMatchObject({ orderId: order.orderId, replayed: true });
    expect((await b.req('POST', '/api/webhooks/mockpay', evt, { 'x-mockpay-signature': signWebhook('s', evt) })).body.duplicate).toBe(true);
    // Stock committed before the restart stays committed.
    expect(second.store.inventory.position('B36', 'wh-main')!.onHand).toBe(39);
    // New IDs continue the sequence instead of colliding.
    const next = (await b.req('POST', '/api/projects', { name: 'After restart', document: exampleA() }, customer)).body;
    expect(next.id).not.toBe(project.id);
    expect(next.id > project.id).toBe(true);
    await close(b);
    await close(p2);
  });

  it('refuses a second API instance on the same database', async () => {
    const p1 = await connect();
    await expect(PgPersistence.connect(url)).rejects.toThrow(/Another API instance/);
    await close(p1);
    const p3 = await connect(); // lock released on close
    await close(p3);
  });

  it('applies each migration once', async () => {
    const p = await connect();
    expect(await p.migrate()).toEqual([]); // 001 and 002 already applied on first connect
    await close(p);
  });
});
