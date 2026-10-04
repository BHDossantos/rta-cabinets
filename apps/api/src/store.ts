/**
 * In-memory repositories for local development and tests. The production system
 * of record is a transactional relational database (spec section 22); see
 * db/schema.sql. Every repository method here maps to a transaction there.
 */
import {
  type Catalog, type CartLine, type DesignExpansion, type Lead, type PlanConfig, type ProProfile, type Project,
  type Quote, type Subscription, FIXTURE_PLANS, FIXTURE_POLICY, FIXTURE_PRICE_BOOK, IdempotencyStore, InventoryLedger,
  type PriceBook, type PricingPolicy, WebhookReceiptLog, fixtureCatalog, type CartComparison, type Shipment,
  type PaymentState, type ManufacturingState, type Reservation, type StockPosition,
} from '@rta/core';

export interface User {
  id: string;
  name: string;
  email: string;
  orgIds: string[];
  roles: ('homeowner' | 'pro_owner' | 'pro_staff' | 'internal_designer' | 'factory_planner' | 'admin')[];
}

export interface Cart {
  id: string;
  ownerId: string;
  projectId?: string;
  revisionNumber?: number;
  contentHash?: string;
  lines: CartLine[];
  expansion?: DesignExpansion;
  comparison?: CartComparison;
  updatedAt: string;
}

export interface OrderLine {
  id: string;
  skuCode: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  taxCents: number;
  stage: string;
  instanceIds: string[];
}

export interface Order {
  id: string;
  ownerId: string;
  projectId?: string;
  revisionNumber?: number;
  contentHash?: string;
  quote: Quote;
  lines: OrderLine[];
  totalCents: number;
  paymentState: PaymentState;
  manufacturingState: ManufacturingState;
  factoryReviewCleared: boolean;
  reservationIds: string[];
  shipments: Shipment[];
  events: { type: string; at: string; detail?: Record<string, unknown> }[];
  createdAt: string;
}

export interface FinancingReferral {
  id: string;
  projectId?: string;
  ownerId: string;
  partnerId: string;
  status: 'submitted';
  consent: { disclosureVersion: string; purpose: string; at: string; channel: 'web' };
  requestedAmountCents: number;
  createdAt: string;
}

export class Store {
  catalog: Catalog = fixtureCatalog();
  priceBook: PriceBook = FIXTURE_PRICE_BOOK;
  policy: PricingPolicy = FIXTURE_POLICY;
  plans: PlanConfig[] = FIXTURE_PLANS;
  users = new Map<string, User>();
  guestTokens = new Map<string, string>(); // token -> projectId
  projects = new Map<string, Project>();
  carts = new Map<string, Cart>();
  orders = new Map<string, Order>();
  subscriptions = new Map<string, Subscription>(); // orgId -> subscription
  pros: ProProfile[] = [];
  leads = new Map<string, Lead>();
  referrals = new Map<string, FinancingReferral>();
  /** Homeowner editing-window start per account ('user:<id>' or 'guest:<projectId>'), D02. */
  accessWindows = new Map<string, string>();
  inventory = new InventoryLedger();
  idempotency = new IdempotencyStore<unknown>();
  webhooks = new WebhookReceiptLog();
  audit: { actorId: string; action: string; objectId: string; at: string; summary?: string }[] = [];
  seq = 0;

  id(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq.toString(36).padStart(6, '0')}`;
  }

  /**
   * Flatten all mutable state into keyed rows for persistence. Catalog, price book,
   * policy and plans are versioned configuration, not runtime state, so they are
   * not included.
   */
  rows(): EntityRow[] {
    const out: EntityRow[] = [{ kind: 'meta', id: 'seq', data: this.seq }];
    const add = <T>(kind: EntityKind, entries: Iterable<[string, T]>) => {
      for (const [id, data] of entries) out.push({ kind, id, data });
    };
    add('user', this.users);
    add('project', this.projects);
    add('cart', this.carts);
    add('order', this.orders);
    add('subscription', this.subscriptions);
    add('lead', this.leads);
    add('referral', this.referrals);
    add('guest_token', this.guestTokens);
    add('access_window', this.accessWindows);
    add('pro', this.pros.map((p) => [p.orgId, p] as [string, ProProfile]));
    const inv = this.inventory.snapshot();
    out.push({ kind: 'meta', id: 'inventory_seq', data: inv.seq });
    add('stock_position', inv.positions.map((p) => [`${p.skuCode}@${p.warehouseId}`, p] as [string, unknown]));
    add('reservation', inv.reservations.map((r) => [r.id, r] as [string, unknown]));
    add('idempotency', this.idempotency.snapshot().map((e) => [e.id, e] as [string, unknown]));
    add('webhook', this.webhooks.snapshot().map((w) => [w.key, w] as [string, unknown]));
    add('audit', this.audit.map((a, i) => [String(i).padStart(10, '0'), a] as [string, unknown]));
    return out;
  }

  static fromRows(rows: EntityRow[]): Store {
    const s = new Store();
    const of = <T>(kind: EntityKind) => rows.filter((r) => r.kind === kind).sort((a, b) => a.id.localeCompare(b.id)) as { id: string; data: T }[];
    s.seq = Number(rows.find((r) => r.kind === 'meta' && r.id === 'seq')?.data ?? 0);
    s.users = new Map(of<User>('user').map((r) => [r.id, r.data]));
    s.projects = new Map(of<Project>('project').map((r) => [r.id, r.data]));
    s.carts = new Map(of<Cart>('cart').map((r) => [r.id, r.data]));
    s.orders = new Map(of<Order>('order').map((r) => [r.id, r.data]));
    s.subscriptions = new Map(of<Subscription>('subscription').map((r) => [r.id, r.data]));
    s.leads = new Map(of<Lead>('lead').map((r) => [r.id, r.data]));
    s.referrals = new Map(of<FinancingReferral>('referral').map((r) => [r.id, r.data]));
    s.guestTokens = new Map(of<string>('guest_token').map((r) => [r.id, r.data]));
    s.accessWindows = new Map(of<string>('access_window').map((r) => [r.id, r.data]));
    s.pros = of<ProProfile>('pro').map((r) => r.data);
    s.inventory = InventoryLedger.restore({
      positions: of<StockPosition>('stock_position').map((r) => r.data),
      reservations: of<Reservation>('reservation').map((r) => r.data),
      seq: Number(rows.find((r) => r.kind === 'meta' && r.id === 'inventory_seq')?.data ?? 0),
    });
    s.idempotency = IdempotencyStore.restore(of<{ id: string; fingerprint: string; result: unknown }>('idempotency').map((r) => r.data));
    s.webhooks = WebhookReceiptLog.restore(of<{ key: string; receivedAt: string; type: string }>('webhook').map((r) => r.data));
    s.audit = of<Store['audit'][number]>('audit').map((r) => r.data);
    return s;
  }
}

export type EntityKind =
  | 'meta' | 'user' | 'project' | 'cart' | 'order' | 'subscription' | 'lead' | 'referral' | 'guest_token' | 'access_window'
  | 'pro' | 'stock_position' | 'reservation' | 'idempotency' | 'webhook' | 'audit';

export interface EntityRow {
  kind: EntityKind;
  id: string;
  data: unknown;
}

/** Seed deterministic demo data (synthetic). */
export function seedStore(store: Store, now = new Date()): Store {
  store.users.set('u_home', { id: 'u_home', name: 'Demo Homeowner', email: 'home@example.test', orgIds: [], roles: ['homeowner'] });
  store.users.set('u_home2', { id: 'u_home2', name: 'Other Homeowner', email: 'other@example.test', orgIds: [], roles: ['homeowner'] });
  store.users.set('u_pro', { id: 'u_pro', name: 'Demo Pro Owner', email: 'pro@example.test', orgIds: ['org_pro'], roles: ['pro_owner'] });
  store.users.set('u_factory', { id: 'u_factory', name: 'Factory Planner', email: 'factory@example.test', orgIds: ['org_factory'], roles: ['factory_planner'] });
  store.users.set('u_admin', { id: 'u_admin', name: 'Admin', email: 'admin@example.test', orgIds: ['org_factory'], roles: ['admin'] });
  const yearAhead = new Date(now.getTime() + 365 * 86_400_000).toISOString();
  store.subscriptions.set('org_pro', { id: 'sub_demo', orgId: 'org_pro', planId: 'pro-annual', status: 'active', paidThrough: yearAhead, cancelAtPeriodEnd: false, appliedEventIds: [] });
  store.pros = [
    { orgId: 'org_pro', displayName: 'Demo Cabinet Installers', services: ['cabinet_install'], serviceZips: ['33101', '33130'], verified: true, activeEntitlement: true, capacity: 10, openLeads: 0 },
    { orgId: 'org_pro2', displayName: 'Unverified Paid Member', services: ['cabinet_install'], serviceZips: ['33101'], verified: false, activeEntitlement: true, capacity: 10, openLeads: 0 },
  ];
  for (const sku of store.catalog.skus.values()) {
    if (sku.kind === 'surface' && sku.purchasability !== 'purchasable') continue;
    store.inventory.setPosition({ skuCode: sku.code, warehouseId: 'wh-main', onHand: sku.kind === 'surface' ? 500 : 40, quarantined: 0, safetyStock: 2, incomingConfirmed: 0, lastSyncedAt: now.toISOString() });
  }
  return store;
}

/**
 * Load persisted state, or seed demo data into an empty database. Returns a store
 * whose contents match what is stored, ready for `createApp({ store, persistence })`.
 */
export async function openStore(persistence: { load(): Promise<EntityRow[]>; apply(u: EntityRow[], d: { kind: EntityKind; id: string }[]): Promise<void> }, now = new Date()): Promise<{ store: Store; seeded: boolean }> {
  const rows = await persistence.load();
  if (rows.length > 0) return { store: Store.fromRows(rows), seeded: false };
  const store = seedStore(new Store(), now);
  await persistence.apply(store.rows(), []);
  return { store, seeded: true };
}
