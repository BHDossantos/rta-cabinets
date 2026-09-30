import { describe, expect, it } from 'vitest';
import {
  DomainError, IdempotencyStore, InventoryLedger, type Lead, type ProProfile, type Project, type Shipment, WebhookReceiptLog,
  applyCarrierStatus, applyRenewal, claimLead, designRequestMachine, entitlementFor, FIXTURE_PLANS, fulfillmentStatus,
  leadViewFor, manufacturingMachine, materialChanges, paymentMachine, projectAccess, recordApproval, releaseGate,
  saveRevision, searchDirectory, transition, validateShipment, type Subscription,
} from '../src';
import { exampleA } from './helpers';

const now = new Date('2026-09-30T12:00:00Z');

describe('inventory reservations (spec 15)', () => {
  const ledger = () => {
    const l = new InventoryLedger();
    l.setPosition({ skuCode: 'B36', warehouseId: 'wh', onHand: 5, quarantined: 1, safetyStock: 1, incomingConfirmed: 10, lastSyncedAt: now.toISOString() });
    return l;
  };

  it('excludes quarantined, safety and inbound stock from ATP', () => {
    expect(ledger().availableToPromise('B36', 'wh', now)).toBe(3);
  });

  it('two buyers competing for the last unit: one allocation (AC15.1, QA06)', () => {
    const l = ledger();
    l.reserveAll([{ skuCode: 'B36', warehouseId: 'wh', quantity: 2 }], 'cart-0', now, 60_000);
    const a = () => l.reserveAll([{ skuCode: 'B36', warehouseId: 'wh', quantity: 1 }], 'cart-a', now, 60_000);
    const b = () => l.reserveAll([{ skuCode: 'B36', warehouseId: 'wh', quantity: 1 }], 'cart-b', now, 60_000);
    expect(a()).toHaveLength(1);
    expect(b).toThrow(DomainError);
    try { b(); } catch (e) { expect((e as DomainError).details.shortfalls).toEqual([{ skuCode: 'B36', warehouseId: 'wh', requested: 1, available: 0 }]); }
  });

  it('reserves all lines or none', () => {
    const l = ledger();
    expect(() => l.reserveAll([{ skuCode: 'B36', warehouseId: 'wh', quantity: 1 }, { skuCode: 'NOPE', warehouseId: 'wh', quantity: 1 }], 'c', now, 1000)).toThrow();
    expect(l.availableToPromise('B36', 'wh', now)).toBe(3);
  });

  it('expired reservations release stock and cannot be committed (QA08)', () => {
    const l = ledger();
    const [r] = l.reserveAll([{ skuCode: 'B36', warehouseId: 'wh', quantity: 3 }], 'c', now, 1000);
    const later = new Date(now.getTime() + 2000);
    expect(l.availableToPromise('B36', 'wh', later)).toBe(3);
    expect(() => l.commit(r!.id, later)).toThrow(/expired/);
  });

  it('flags stale stock data before promising', () => {
    expect(ledger().isStale('B36', 'wh', new Date(now.getTime() + 60 * 60_000))).toBe(true);
  });
});

describe('Example D — split delivery (spec 32)', () => {
  const lines = [
    { id: 'l1', skuCode: 'B36', quantity: 2, stage: 'A' },
    { id: 'l2', skuCode: 'F36-WHT', quantity: 2, stage: 'B' },
  ];
  it('Stage A delivered leaves order partially delivered (AC15.2, QA13)', () => {
    const shipments: Shipment[] = [{ id: 's1', groupStage: 'A', state: 'delivered', lines: [{ orderLineId: 'l1', quantity: 2 }], trackingNumbers: ['T1'] }];
    const status = fulfillmentStatus(lines, shipments);
    expect(status.overall).toBe('partially_delivered');
    expect(status.groups).toEqual([
      expect.objectContaining({ stage: 'A', status: 'delivered', outstanding: 0 }),
      expect.objectContaining({ stage: 'B', status: 'pending', outstanding: 2 }),
    ]);
    shipments.push({ id: 's2', groupStage: 'B', state: 'delivered', lines: [{ orderLineId: 'l2', quantity: 2 }], trackingNumbers: [] });
    expect(fulfillmentStatus(lines, shipments).overall).toBe('delivered');
  });

  it('cannot ship more than ordered unless a replacement is authorized (AC15.4)', () => {
    const existing: Shipment[] = [{ id: 's2', groupStage: 'B', state: 'delivered', lines: [{ orderLineId: 'l2', quantity: 2 }], trackingNumbers: [] }];
    const replacement: Shipment = { id: 's3', groupStage: 'B', state: 'pending', lines: [{ orderLineId: 'l2', quantity: 1 }], trackingNumbers: [], isReplacement: true };
    expect(() => validateShipment(lines, existing, replacement)).toThrow(/exceeds/);
    expect(() => validateShipment(lines, existing, replacement, { l2: 1 })).not.toThrow();
    expect(() => validateShipment(lines, [], { ...replacement, groupStage: 'A' })).toThrow(/stage/);
  });

  it('replayed carrier events never regress Delivered to Shipped (AC15.5)', () => {
    expect(applyCarrierStatus('delivered', 'in_transit')).toBe('delivered');
    expect(applyCarrierStatus('dispatched', 'delivered')).toBe('delivered');
    expect(applyCarrierStatus('in_transit', 'in_transit')).toBe('in_transit');
  });
});

describe('Example E — revision integrity (spec 32)', () => {
  const setup = () => {
    const project: Project = { id: 'p', ownerType: 'user', ownerId: 'u', name: 'K', revisions: [], approvedRevision: null, approvals: [] };
    const d = exampleA(120);
    for (let i = 1; i <= 7; i++) saveRevision(project, i - 1, d, `hash-${i}`, 'u', now);
    recordApproval(project, { id: 'a7', revisionNumber: 7, quoteId: 'Q7', quoteTotalCents: 100, approvedBy: 'u', approvedAt: now.toISOString() });
    const d8 = structuredClone(d);
    d8.instances[1]!.hingeSkuCode = undefined; // door orientation / hardware change
    saveRevision(project, 7, d8, 'hash-8', 'designer', now);
    return { project, d, d8 };
  };

  it('approval stays bound to revision 7 when revision 8 is drafted (AC11.1)', () => {
    const { project, d, d8 } = setup();
    expect(project.approvedRevision).toBe(7);
    expect(project.approvals[0]).toMatchObject({ revisionNumber: 7, contentHash: 'hash-7', quoteId: 'Q7' });
    expect(materialChanges(d, d8)).toEqual(['fronts_or_hardware']);
  });

  it('release gate refuses revision 8 and unpaid orders; accepts approved, paid, reviewed revision 7 (AC11.4)', () => {
    const { project } = setup();
    const base = { project, paymentState: 'paid', factoryReviewCleared: true, blockersOutstanding: 0, productionIneligibleSkus: [] };
    expect(releaseGate({ ...base, orderRevisionNumber: 8, orderContentHash: 'hash-8' }).failures).toContain('order_revision_differs_from_approved');
    expect(releaseGate({ ...base, orderRevisionNumber: 7, orderContentHash: 'hash-7', paymentState: 'unpaid' }).failures).toEqual(['payment_not_settled']);
    expect(releaseGate({ ...base, orderRevisionNumber: 7, orderContentHash: 'hash-7', factoryReviewCleared: false }).failures).toEqual(['factory_review_pending']);
    expect(releaseGate({ ...base, orderRevisionNumber: 7, orderContentHash: 'tampered' }).failures).toEqual(['approved_content_changed']);
    expect(releaseGate({ ...base, orderRevisionNumber: 7, orderContentHash: 'hash-7' })).toEqual({ ok: true, failures: [] });
  });

  it('rejects concurrent saves from a stale tab (AC06.3)', () => {
    const { project, d } = setup();
    expect(() => saveRevision(project, 7, d, 'x', 'tab-2', now)).toThrow(/changed elsewhere/);
  });
});

describe('state machines (spec 24)', () => {
  it('rejects invalid transitions such as unpaid -> released', () => {
    expect(() => transition(paymentMachine, 'unpaid', 'refunded', 'u', now)).toThrow(/not allowed/);
    expect(() => transition(manufacturingMachine, 'not_released', 'in_production', 'u', now)).toThrow();
    expect(transition(designRequestMachine, 'customer_review', 'in_design', 'u', now, 'returned')).toMatchObject({ from: 'customer_review', to: 'in_design' });
  });
});

describe('idempotency and webhooks (QA07)', () => {
  it('same key + payload replays; different payload conflicts', () => {
    const store = new IdempotencyStore<{ orderId: string }>();
    let n = 0;
    const exec = () => ({ orderId: `o${++n}` });
    expect(store.run('checkout', 'k1', { cart: 'c' }, exec)).toEqual({ result: { orderId: 'o1' }, replayed: false });
    expect(store.run('checkout', 'k1', { cart: 'c' }, exec)).toEqual({ result: { orderId: 'o1' }, replayed: true });
    expect(() => store.run('checkout', 'k1', { cart: 'other' }, exec)).toThrow(/different payload/);
    expect(n).toBe(1);
  });
  it('deduplicates provider events', () => {
    const log = new WebhookReceiptLog();
    expect(log.record('pay', 'evt1', 'payment.succeeded', now)).toBe(true);
    expect(log.record('pay', 'evt1', 'payment.succeeded', now)).toBe(false);
  });
});

describe('memberships (spec 16)', () => {
  const sub: Subscription = { id: 's', orgId: 'o', planId: 'pro-annual', status: 'active', paidThrough: '2026-12-31T00:00:00Z', cancelAtPeriodEnd: false, appliedEventIds: [] };
  const plan = FIXTURE_PLANS[0];

  it('canceled subscription keeps access until paid-through (AC16.3), then loses trade pricing (AC03.2)', () => {
    const canceled = { ...sub, status: 'canceled' as const };
    expect(entitlementFor(canceled, plan, now).tradePricing).toBe(true);
    expect(entitlementFor(canceled, plan, new Date('2027-01-01T00:00:00Z')).tradePricing).toBe(false);
  });

  it('duplicate renewal notifications do not extend the term twice (AC16.4)', () => {
    const once = applyRenewal(sub, { id: 'evt-r1', periodEnd: '2027-12-31T00:00:00Z' });
    const twice = applyRenewal(once, { id: 'evt-r1', periodEnd: '2027-12-31T00:00:00Z' });
    expect(twice.paidThrough).toBe('2027-12-31T00:00:00Z');
    expect(twice).toBe(once);
  });

  it('homeowner 30-day window turns read-only, not deleted (AC06.4, D02 proposed default)', () => {
    const w = { startedAt: '2026-09-01T00:00:00Z', days: 30, extensionDays: 0 };
    expect(projectAccess(w, new Date('2026-09-20T00:00:00Z'), false).access).toBe('edit');
    expect(projectAccess(w, new Date('2026-10-02T00:00:00Z'), false)).toEqual({ access: 'read_only', endsAt: '2026-10-01T00:00:00.000Z' });
    expect(projectAccess(w, new Date('2026-10-02T00:00:00Z'), true).access).toBe('edit');
  });
});

describe('directory and leads (spec 18)', () => {
  const pro = (orgId: string, extra: Partial<ProProfile> = {}): ProProfile => ({
    orgId, displayName: orgId, services: ['install'], serviceZips: ['33101'], verified: true, activeEntitlement: true, capacity: 5, openLeads: 0, ...extra,
  });
  const lead = (): Lead => ({
    id: 'L1', mode: 'claimable', service: 'install', zip: '33101', exclusive: true, maxRecipients: 1, recipients: [], claimedBy: [],
    customer: { name: 'H', email: 'h@example.test' }, summary: 'Kitchen install', history: [],
  });

  it('paid but unverified members are not listed (AC16.2)', () => {
    expect(searchDirectory([pro('a'), pro('b', { verified: false })], 'install', '33101', now).map((p) => p.orgId)).toEqual(['a']);
  });

  it('simultaneous exclusive claims yield exactly one winner (AC18.3)', () => {
    const l = lead();
    claimLead(l, pro('a'), now);
    expect(() => claimLead(l, pro('b'), now)).toThrow(/already been claimed/);
    expect(l.claimedBy).toEqual(['a']);
  });

  it('out-of-area contractors cannot claim (AC18.1) and see no contact details', () => {
    const l = lead();
    expect(() => claimLead(l, pro('far', { serviceZips: ['90210'] }), now)).toThrow(/Not eligible/);
    expect(leadViewFor(l, 'far')).not.toHaveProperty('customer');
    claimLead(l, pro('a'), now);
    expect(leadViewFor(l, 'a')).toHaveProperty('customer.email', 'h@example.test');
  });
});
