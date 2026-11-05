import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, signWebhook } from '../src/app';
import { Store } from '../src/store';
import { exampleA } from '../../../packages/core/test/helpers';

afterEach(() => vi.unstubAllEnvs());

async function boot(opts: Parameters<typeof createApp>[0] = {}) {
  const app = createApp(opts);
  const server = app.server();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(base + path, {
      method, headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as any,
      cookie: (response.headers.get('set-cookie') ?? '').split(';')[0]! };
  };
  return { app, request, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

function production() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('ENABLE_TEST_PAYMENTS', 'true');
  vi.stubEnv('ALLOW_DEMO_ACCOUNTS', 'true');
}

describe('production cannot transact with demo commerce', () => {
  it('ignores demo flag/options and disables forged development identities', async () => {
    production();
    const s = await boot({ mockPayments: true, demoAuth: true });
    try {
      expect((await s.request('GET', '/api/health')).body).toMatchObject({
        ok: true, mockPayments: false, checkoutEnabled: false, demoAuth: false,
      });
      expect((await s.request('GET', '/api/me', undefined, { 'x-user-id': 'u_admin' })).status).toBe(401);
    } finally { await s.close(); }
  });

  it('keeps accounts, saved designs and carts working but refuses checkout before mutation', async () => {
    production();
    const s = await boot();
    try {
      const account = await s.request('POST', '/api/auth/register', {
        name: 'Customer', email: 'customer@example.test', password: 'a long test-only password',
        accountType: 'homeowner', acceptTerms: true,
      });
      expect(account.status).toBe(201);
      const headers = { cookie: account.cookie };
      const design = await s.request('POST', '/api/projects', { name: 'Saved design', document: exampleA() }, headers);
      expect(design.status).toBe(201);
      expect((await s.request('GET', `/api/projects/${design.body.id}`, undefined, headers)).status).toBe(200);
      const cart = await s.request('POST', '/api/carts', {}, headers);
      expect(cart.status).toBe(201);
      expect((await s.request('PATCH', `/api/carts/${cart.body.id}`, { lines: [{ skuCode: 'SMP-WHT', quantity: 1 }] }, headers)).status).toBe(200);
      const before = structuredClone(s.app.store.rows());
      const result = await s.request('POST', '/api/checkout-sessions', {
        cartId: cart.body.id, acceptedTotalCents: 10000,
      }, { ...headers, 'idempotency-key': 'production-attempt' });
      expect(result.status).toBe(503);
      expect(result.body.error.code).toBe('provider_unavailable');
      expect(s.app.store.rows()).toEqual(before);
    } finally { await s.close(); }
  });

  it('cannot settle or release restored demo orders, even with a valid mock signature', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const demo = await boot({ webhookSecret: 'test-secret' });
    let orderId: string;
    let total: number;
    try {
      const headers = { 'x-user-id': 'u_home' };
      const cart = (await demo.request('POST', '/api/carts', {}, headers)).body;
      await demo.request('PATCH', `/api/carts/${cart.id}`, { lines: [{ skuCode: 'SMP-WHT', quantity: 1 }] }, headers);
      total = (await demo.request('POST', '/api/checkout-sessions', { cartId: cart.id }, {
        ...headers, 'idempotency-key': 'preview-price',
      })).body.error.details.totalCents;
      const order = await demo.request('POST', '/api/checkout-sessions', { cartId: cart.id, acceptedTotalCents: total }, {
        ...headers, 'idempotency-key': 'preview-order',
      });
      expect(order.status).toBe(201); // Development checkout still works.
      orderId = order.body.orderId;
    } finally { await demo.close(); }

    // Restore through the persistence representation, not just the original object.
    const restored = Store.fromRows(structuredClone(demo.app.store.rows()));
    production();
    const s = await boot({ store: restored, webhookSecret: 'test-secret', mockPayments: true });
    try {
      const before = structuredClone(restored.rows());
      const event = JSON.stringify({ id: 'signed-event', type: 'payment.succeeded', orderId, amountCents: total! });
      expect((await s.request('POST', '/api/webhooks/mockpay', event, {
        'x-mockpay-signature': signWebhook('test-secret', event),
      })).status).toBe(404);
      expect((await s.request('POST', `/api/dev/payments/${orderId!}`, { outcome: 'succeeded' })).status).toBe(404);
      expect(restored.rows()).toEqual(before);
      // A historical paid marker is also not proof of real settlement.
      restored.orders.get(orderId!)!.paymentState = 'paid';
      const paid = structuredClone(restored.rows());
      expect((await s.request('POST', `/api/orders/${orderId!}/release`, {})).status).toBe(503);
      expect(restored.rows()).toEqual(paid);
    } finally { await s.close(); }
  });

  it('disabling demo commerce outside production also closes the signed webhook bypass', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const s = await boot({ mockPayments: false, webhookSecret: 'test-secret' });
    try {
      const before = structuredClone(s.app.store.rows());
      const event = JSON.stringify({ id: 'attempt', type: 'payment.succeeded', orderId: 'unknown', amountCents: 1 });
      expect((await s.request('POST', '/api/webhooks/mockpay', event, { 'x-mockpay-signature': signWebhook('test-secret', event) })).status).toBe(404);
      expect((await s.request('POST', '/api/checkout-sessions', {})).status).toBe(503);
      expect(s.app.store.rows()).toEqual(before);
    } finally { await s.close(); }
  });
});
