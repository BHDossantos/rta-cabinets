import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, signWebhook } from '../src/app';
import { exampleA, room } from '../../../packages/core/test/helpers';

let server: Server;
let base: string;
let clock = new Date('2026-09-30T12:00:00Z');
const app = createApp({ now: () => clock, webhookSecret: 'test-secret', reservationTtlMs: 60_000 });

beforeAll(async () => {
  server = app.server();
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const as = (userId: string) => ({ 'x-user-id': userId });

async function pay(orderId: string, amountCents: number, eventId: string) {
  const raw = JSON.stringify({ id: eventId, type: 'payment.succeeded', orderId, amountCents });
  return call('POST', '/api/webhooks/mockpay', raw, { 'x-mockpay-signature': signWebhook('test-secret', raw) });
}

describe('catalog', () => {
  it('hides pro-only SKUs and factory specs from retail', async () => {
    const retail = await call('GET', '/api/catalog/skus');
    const codes = retail.body.items.map((s: any) => s.code);
    expect(codes).toContain('B36');
    expect(codes).not.toContain('B36-PRO');
    expect(codes).not.toContain('B36-RETIRED');
    expect(retail.body.items[0]).not.toHaveProperty('factory');
    const pro = await call('GET', '/api/catalog/skus', undefined, as('u_pro'));
    expect(pro.body.items.map((s: any) => s.code)).toContain('B36-PRO');
  });
});

describe('guest design -> registration -> resume (AC06.1, QA01)', () => {
  it('keeps identical geometry and transfers ownership', async () => {
    const doc = exampleA(120);
    const created = await call('POST', '/api/projects', { name: 'Guest kitchen', document: doc });
    expect(created.status).toBe(201);
    const { id, guestToken } = created.body;
    expect(guestToken).toMatch(/^gst_/);
    expect((await call('GET', `/api/projects/${id}`)).status).toBe(404);
    const claimed = await call('POST', `/api/projects/${id}/claim`, {}, { ...as('u_home'), 'x-guest-token': guestToken });
    expect(claimed.body.ownerType).toBe('user');
    const loaded = await call('GET', `/api/projects/${id}`, undefined, as('u_home'));
    expect(loaded.body.document).toEqual(doc);
    // Token no longer grants access after claim.
    expect((await call('GET', `/api/projects/${id}`, undefined, { 'x-guest-token': guestToken })).status).toBe(404);
  });
});

describe('access control (AC03.1, QA12)', () => {
  it('another account cannot read, save, cart or approve a project', async () => {
    const { body } = await call('POST', '/api/projects', { name: 'Mine', document: exampleA() }, as('u_home'));
    for (const [m, p, b] of [
      ['GET', `/api/projects/${body.id}`, undefined],
      ['POST', `/api/projects/${body.id}/revisions`, { baseRevision: 1, document: exampleA() }],
      ['POST', '/api/carts/from-design', { projectId: body.id, revision: 1 }],
      ['POST', `/api/projects/${body.id}/approvals`, { revision: 1 }],
    ] as const) {
      expect((await call(m, p, b, as('u_home2'))).status).toBe(404);
    }
  });
});

describe('project saves (AC06.3)', () => {
  it('rejects a stale base revision with 409', async () => {
    const { body } = await call('POST', '/api/projects', { name: 'Tabs', document: exampleA() }, as('u_home'));
    expect((await call('POST', `/api/projects/${body.id}/revisions`, { baseRevision: 1, document: exampleA() }, as('u_home'))).status).toBe(201);
    const stale = await call('POST', `/api/projects/${body.id}/revisions`, { baseRevision: 1, document: exampleA() }, as('u_home'));
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ code: 'conflict', details: { latestRevision: 2 } });
  });

  it('rejects malformed documents with field-level errors', async () => {
    const res = await call('POST', '/api/projects', { name: 'x', document: { schemaVersion: 99 } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('validation');
  });
});

describe('server-side pricing (AC12.2, AC16.1)', () => {
  it('ignores client-supplied prices and applies trade pricing only when entitled', async () => {
    const lines = [{ skuCode: 'B36', quantity: 2, unitPrice: 1 }];
    const retail = await call('POST', '/api/quotes', { lines, tradePricing: true });
    expect(retail.body.quote.merchandiseTotal.amount).toBe(40000);
    expect(retail.body.quote.tradePricingApplied).toBe(false);
    const pro = await call('POST', '/api/quotes', { lines }, as('u_pro'));
    expect(pro.body.quote.merchandiseTotal.amount).toBe(36000);
  });

  it('quotes a whole design with validation and flagged selections', async () => {
    const doc = exampleA();
    doc.surfaces = [{ id: 'ctr', kind: 'countertop', skuCode: 'CTR-QUARTZ', label: 'Quartz', purchasability: 'quote_required' }];
    const res = await call('POST', '/api/quotes', { document: doc });
    expect(res.body.validation.fitStatus).toBe('verified');
    expect(res.body.expansion.flagged).toHaveLength(1);
    expect(res.body.quote.isEstimate).toBe(true);
  });
});

describe('design -> cart -> checkout -> payment -> release -> staged shipment', () => {
  it('runs end to end with every gate enforced', async () => {
    const H = as('u_home');
    const project = (await call('POST', '/api/projects', { name: 'E2E', document: exampleA() }, H)).body;
    const cart = (await call('POST', '/api/carts/from-design', { projectId: project.id, revision: 1 }, H)).body;
    expect(cart.comparison.matchesDesign).toBe(true);

    // Removing a required front surfaces an incomplete system and blocks checkout without acknowledgement (QA05).
    const edited = await call('PATCH', `/api/carts/${cart.id}`, { lines: cart.lines.filter((l: any) => l.skuCode !== 'F36-WHT') }, H);
    expect(edited.body.comparison.incompleteSystems[0]).toMatchObject({ skuCode: 'F36-WHT', missingQuantity: 1 });
    expect((await call('POST', '/api/checkout-sessions', { cartId: cart.id, acceptedTotalCents: 1 }, { ...H, 'idempotency-key': 'key-incomplete-1' })).status).toBe(409);
    await call('PATCH', `/api/carts/${cart.id}`, { lines: cart.lines }, H);

    // Total must be accepted explicitly; the server tells the client the real total.
    const needAccept = await call('POST', '/api/checkout-sessions', { cartId: cart.id, acceptedTotalCents: 1 }, { ...H, 'idempotency-key': 'key-accept-1' });
    expect(needAccept.status).toBe(409);
    expect(needAccept.body.error.details.requiresAcceptance).toBe(true);
    const total = needAccept.body.error.details.totalCents;

    // Double-click: same key returns the same order (QA07).
    const hdr = { ...H, 'idempotency-key': 'key-checkout-e2e' };
    const first = await call('POST', '/api/checkout-sessions', { cartId: cart.id, acceptedTotalCents: total }, hdr);
    const second = await call('POST', '/api/checkout-sessions', { cartId: cart.id, acceptedTotalCents: total }, hdr);
    expect(first.status).toBe(201);
    expect(second.body.orderId).toBe(first.body.orderId);
    expect(second.body.replayed).toBe(true);
    const orderId = first.body.orderId;

    // Release before payment is refused.
    const F = as('u_factory');
    expect((await call('POST', `/api/orders/${orderId}/release`, {}, F)).body.error.details.failures).toContain('payment_not_settled');

    // Unsigned webhook rejected; duplicate signed webhook is a no-op.
    expect((await call('POST', '/api/webhooks/mockpay', JSON.stringify({ id: 'e0', type: 'payment.succeeded', orderId, amountCents: total }), { 'x-mockpay-signature': 'bad' })).status).toBe(401);
    expect((await pay(orderId, total, 'evt-pay-1')).body).toEqual({ received: true });
    expect((await pay(orderId, total, 'evt-pay-1')).body.duplicate).toBe(true);
    const paid = (await call('GET', `/api/orders/${orderId}`, undefined, H)).body;
    expect(paid.paymentState).toBe('paid');
    expect(paid.fulfillment.overall).toBe('unfulfilled');

    // Paid but no approval / factory review -> still not released.
    const gate = (await call('POST', `/api/orders/${orderId}/release`, {}, F)).body.error.details.failures;
    expect(gate).toEqual(expect.arrayContaining(['design_not_approved', 'factory_review_pending']));
    await call('POST', `/api/projects/${project.id}/approvals`, { revision: 1, quoteTotalCents: total }, H);
    await call('POST', `/api/orders/${orderId}/factory-review`, { cleared: true }, F);
    expect((await call('POST', `/api/orders/${orderId}/release`, {}, H)).status).toBe(403);
    expect((await call('POST', `/api/orders/${orderId}/release`, {}, F)).body).toMatchObject({ manufacturingState: 'released', replayed: false });
    expect((await call('POST', `/api/orders/${orderId}/release`, {}, F)).body.replayed).toBe(true); // AC19.3

    // Stage A ships and is delivered; order is partially delivered (AC15.2).
    const order = (await call('GET', `/api/orders/${orderId}`, undefined, H)).body;
    const stageA = order.lines.filter((l: any) => l.stage === 'A').map((l: any) => ({ orderLineId: l.id, quantity: l.quantity }));
    const shp = (await call('POST', `/api/orders/${orderId}/shipments`, { stage: 'A', lines: stageA, trackingNumbers: ['T-1'] }, F)).body;
    await call('POST', `/api/orders/${orderId}/shipments/${shp.id}/status`, { state: 'delivered' }, F);
    expect((await call('POST', `/api/orders/${orderId}/shipments/${shp.id}/status`, { state: 'in_transit' }, F)).body.state).toBe('delivered');
    expect((await call('POST', `/api/orders/${orderId}/shipments`, { stage: 'A', lines: stageA }, F)).status).toBe(422);
    const after = (await call('GET', `/api/orders/${orderId}`, undefined, H)).body;
    expect(after.fulfillment.overall).toBe('partially_delivered');
    expect(after.fulfillment.groups.find((g: any) => g.stage === 'B').status).toBe('pending');

    // Other customers cannot see the order.
    expect((await call('GET', `/api/orders/${orderId}`, undefined, as('u_home2'))).status).toBe(404);
  });

  it('routes payment after reservation expiry to reconciliation (QA08)', async () => {
    const H = as('u_home2');
    const cart = (await call('POST', '/api/carts', {}, H)).body;
    await call('PATCH', `/api/carts/${cart.id}`, { lines: [{ skuCode: 'SMP-WHT', quantity: 1 }] }, H);
    const accept = await call('POST', '/api/checkout-sessions', { cartId: cart.id }, { ...H, 'idempotency-key': 'key-expiry-0' });
    const total = accept.body.error.details.totalCents;
    const { body } = await call('POST', '/api/checkout-sessions', { cartId: cart.id, acceptedTotalCents: total }, { ...H, 'idempotency-key': 'key-expiry-1' });
    clock = new Date(clock.getTime() + 2 * 60_000);
    await pay(body.orderId, total, 'evt-late');
    expect((await call('GET', `/api/orders/${body.orderId}`, undefined, H)).body.paymentState).toBe('reconciliation');
  });

  it('blocks checkout of designs with blocking validation results', async () => {
    const H = as('u_home');
    const project = (await call('POST', '/api/projects', { name: 'Bad', document: exampleA(119) }, H)).body;
    const cart = (await call('POST', '/api/carts/from-design', { projectId: project.id, revision: 1 }, H)).body;
    const res = await call('POST', '/api/checkout-sessions', { cartId: cart.id, acceptedTotalCents: 1 }, { ...H, 'idempotency-key': 'key-blocked-1' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('gate_failed');
  });
});

describe('directory, leads and financing', () => {
  it('lists only verified installers and delivers requests only to chosen recipients (AC18.2)', async () => {
    const dir = await call('GET', '/api/directory?zip=33101');
    expect(dir.body.results.map((r: any) => r.orgId)).toEqual(['org_pro']);
    expect((await call('GET', '/api/directory?zip=99999')).body.message).toMatch(/No verified installers/);
    const lead = await call('POST', '/api/leads', { service: 'cabinet_install', zip: '33101', recipients: ['org_pro'], summary: 'Kitchen' }, as('u_home'));
    expect(lead.body.recipients).toEqual(['org_pro']);
    expect((await call('POST', '/api/leads', { service: 'cabinet_install', zip: '33101', recipients: ['org_pro2'], summary: 'x' }, as('u_home'))).status).toBe(422);
    const proView = await call('GET', '/api/pro/leads', undefined, as('u_pro'));
    expect(proView.body.leads[0]).toMatchObject({ contactRevealed: true });
  });

  it('requires consent and refuses sensitive applicant fields', async () => {
    const H = as('u_home');
    expect((await call('POST', '/api/financing/referrals', { requestedAmountCents: 100000 }, H)).status).toBe(422);
    expect((await call('POST', '/api/financing/referrals', { requestedAmountCents: 100000, consent: { accepted: true, disclosureVersion: 'v1' }, ssn: '123' }, H)).status).toBe(422);
    const ok = await call('POST', '/api/financing/referrals', { requestedAmountCents: 100000, consent: { accepted: true, disclosureVersion: 'v1' } }, H);
    expect(ok.body.message).toMatch(/not a credit approval/);
  });
});

describe('catalog import staging', () => {
  it('reports duplicates, invalid dimensions and missing prices; admin only', async () => {
    const header = 'code,family_id,name,kind,status,mounting,width_mm,depth_mm,height_mm,material,finish,purchasability,fulfillment_stage,retail_price_cents,images,tax_category,bom_revision,panel_thickness_mm,edge_treatment,compatible_with,pro_only';
    const csv = [header,
      'B99,FAM,"New, wide body",body,active,base,1000,600,876,plywood,,purchasable,A,30000,a.jpg,cabinetry,R1,18,PVC,,false',
      'B99,FAM,Dup,body,active,base,1000,600,876,plywood,,purchasable,A,30000,a.jpg,cabinetry,R1,18,PVC,,false',
      'B98,FAM,Bad,body,active,base,-5,600,876,plywood,,purchasable,A,,a.jpg,cabinetry,R1,18,PVC,,false',
    ].join('\n');
    expect((await call('POST', '/api/imports/stage', csv, { ...as('u_home'), 'content-type': 'text/csv' })).status).toBe(403);
    const res = await call('POST', '/api/imports/stage', csv, { ...as('u_admin'), 'content-type': 'text/csv' });
    expect(res.body.accepted.map((s: any) => s.name)).toEqual(['New, wide body']);
    const msgs = res.body.issues.map((i: any) => `${i.code}:${i.field}`);
    expect(msgs).toEqual(expect.arrayContaining(['B99:code', 'B98:width_mm', 'B98:retail_price_cents']));
    expect(res.body.requiresApproval).toBe(true);
  });
});

void room;
