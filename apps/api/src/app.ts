import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import {
  type DesignDocument, type Entitlement, type Lead, type Project, type Quote, type ShipmentState,
  DomainError, applyCarrierStatus, assert, claimLead, compareCartToDesign, entitlementFor, expandDesign, fulfillmentStatus,
  getRevision, groupLines, leadViewFor, materialChanges, priceQuote, projectAccess, productionEligibility, recordApproval, releaseGate,
  revalidateQuote, saveRevision, searchDirectory, stableStringify, stageImport, validateDesign, validateShipment, visibleTo,
  DESIGN_SCHEMA_VERSION, dollars,
} from '@rta/core';
import { type Ctx, Router, readBody, send, sendError } from './http';
import { type Cart, type Order, Store, type User, seedStore } from './store';

export interface AppOptions {
  store?: Store;
  now?: () => Date;
  /** Shared secret for the mock payment provider's signed webhooks. */
  webhookSecret?: string;
  reservationTtlMs?: number;
  /** Enables POST /api/dev/payments/:orderId. Defaults to on unless NODE_ENV=production. */
  mockPayments?: boolean;
  /** Homeowner editing window in days (D02 proposed default: 30). */
  accessDays?: number;
}

interface Principal {
  user?: User;
  guestToken?: string;
}

const NON_RETAIL_SHIPPING = { status: 'pending_quote' as const, description: 'Freight is quoted at checkout for your address' };

export function contentHash(doc: DesignDocument): string {
  return createHash('sha256').update(stableStringify(doc)).digest('hex');
}

export function signWebhook(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function createApp(opts: AppOptions = {}) {
  const store = opts.store ?? seedStore(new Store());
  const now = opts.now ?? (() => new Date());
  const secret = opts.webhookSecret ?? process.env.MOCKPAY_WEBHOOK_SECRET ?? 'dev-only-secret';
  const reservationTtlMs = opts.reservationTtlMs ?? 30 * 60_000;
  const mockPayments = opts.mockPayments ?? process.env.NODE_ENV !== 'production';
  const accessDays = opts.accessDays ?? 30;
  const router = new Router();

  // --- identity (development stub; replace with the selected identity provider, D24) ---
  const principal = (ctx: Ctx): Principal => {
    const uid = ctx.headers['x-user-id'];
    const guest = ctx.headers['x-guest-token'];
    const user = typeof uid === 'string' ? store.users.get(uid) : undefined;
    if (typeof uid === 'string' && !user) throw new DomainError('unauthorized', 'Unknown user');
    return { user, guestToken: typeof guest === 'string' ? guest : undefined };
  };
  const requireUser = (ctx: Ctx): User => {
    const p = principal(ctx);
    if (!p.user) throw new DomainError('unauthorized', 'Sign in required');
    return p.user;
  };
  const requireRole = (ctx: Ctx, ...roles: User['roles']): User => {
    const u = requireUser(ctx);
    if (!u.roles.some((r) => roles.includes(r))) throw new DomainError('forbidden', 'Insufficient role');
    return u;
  };
  const entitlementOf = (user?: User): Entitlement & { leadAccess: boolean } => {
    const orgId = user?.orgIds[0];
    const sub = orgId ? store.subscriptions.get(orgId) : undefined;
    return entitlementFor(sub, store.plans.find((p) => p.id === sub?.planId), now());
  };
  const audit = (actorId: string, action: string, objectId: string, summary?: string) =>
    store.audit.push({ actorId, action, objectId, at: now().toISOString(), summary });

  /** Not-found for inaccessible objects so IDs cannot be probed (AC03.1). */
  const loadProject = (ctx: Ctx, id: string): Project => {
    const p = principal(ctx);
    const project = store.projects.get(id);
    const allowed = project && (
      (project.ownerType === 'user' && project.ownerId === p.user?.id) ||
      (project.ownerType === 'organization' && p.user?.orgIds.includes(project.ownerId)) ||
      (project.ownerType === 'guest' && p.guestToken && store.guestTokens.get(p.guestToken) === project.id)
    );
    if (!project || !allowed) throw new DomainError('not_found', 'Project not found');
    return project;
  };
  const loadCart = (ctx: Ctx, id: string): Cart => {
    const p = principal(ctx);
    const cart = store.carts.get(id);
    if (!cart || cart.ownerId !== (p.user?.id ?? `guest:${p.guestToken}`)) throw new DomainError('not_found', 'Cart not found');
    return cart;
  };
  const loadOrder = (ctx: Ctx, id: string, staff = false): Order => {
    const p = principal(ctx);
    const order = store.orders.get(id);
    const isStaff = p.user?.roles.some((r) => r === 'factory_planner' || r === 'admin');
    if (!order || !((staff && isStaff) || order.ownerId === (p.user?.id ?? `guest:${p.guestToken}`) || isStaff)) {
      throw new DomainError('not_found', 'Order not found');
    }
    return order;
  };
  const ownerKey = (ctx: Ctx): string => {
    const p = principal(ctx);
    if (p.user) return p.user.id;
    if (p.guestToken && store.guestTokens.has(p.guestToken)) return `guest:${p.guestToken}`;
    throw new DomainError('unauthorized', 'Sign in or start a guest design first');
  };

  const parseDocument = (value: unknown): DesignDocument => {
    const d = value as DesignDocument;
    assert(d && typeof d === 'object', 'validation', 'document is required');
    assert(d.schemaVersion === DESIGN_SCHEMA_VERSION, 'validation', `Unsupported design schemaVersion ${String(d.schemaVersion)}`);
    assert(d.room && Array.isArray(d.room.outline), 'validation', 'room.outline is required');
    for (const key of ['openings', 'appliances', 'instances', 'surfaces'] as const) assert(Array.isArray(d[key]), 'validation', `${key} must be an array`);
    return d;
  };

  const quoteForLines = (lines: { skuCode: string; quantity: number; instanceIds?: string[]; stage?: string }[], ent: Entitlement, designRevisionId?: string): Quote =>
    priceQuote(store.catalog, store.priceBook, store.policy, {
      lines, entitlement: ent, shipping: NON_RETAIL_SHIPPING, designRevisionId, now: now(), calculationId: store.id('calc'),
    });

  const cartView = (cart: Cart) => ({ ...cart, quote: quoteForLines(cart.lines, entitlementOf(store.users.get(cart.ownerId))) });

  /**
   * Homeowner editing window (D02 proposed default, configurable): the clock starts at
   * the account's first saved project; afterwards projects are read-only with export.
   * Paid trade entitlement keeps editing open. Orders and support access are unaffected.
   */
  const windowKey = (project: Pick<Project, 'ownerType' | 'ownerId' | 'id'>): string | null =>
    project.ownerType === 'user' ? `user:${project.ownerId}` : project.ownerType === 'guest' ? `guest:${project.id}` : null;
  const accessFor = (key: string | null, user?: User) => {
    const startedAt = key ? store.accessWindows.get(key) ?? null : null;
    return projectAccess({ startedAt, days: accessDays, extensionDays: 0 }, now(), entitlementOf(user).tradePricing);
  };
  const requireEditable = (key: string | null, user?: User) => {
    const access = accessFor(key, user);
    if (access.access !== 'edit') {
      throw new DomainError('forbidden', 'The editing period for this account has ended. Your projects stay available to view and download, and orders and support are unaffected.', { reason: 'access_expired', endsAt: access.endsAt });
    }
  };

  type PaymentEvent = { id: string; type: 'payment.succeeded' | 'payment.failed'; orderId: string; amountCents: number };

  /** Shared by the signed webhook and the dev test-payment route. Duplicates are no-ops. */
  const processPaymentEvent = (evt: PaymentEvent) => {
    if (!store.webhooks.record('mockpay', evt.id, evt.type, now())) return { received: true, duplicate: true };
    const order = store.orders.get(evt.orderId);
    if (!order) return { received: true, ignored: 'unknown_order' };
    if (evt.type === 'payment.failed') {
      // A late or out-of-order failure never overrides a settled or reconciling payment.
      if (order.paymentState !== 'pending') return { received: true, ignored: `payment_${order.paymentState}` };
      order.paymentState = 'failed';
      order.reservationIds.forEach((id) => store.inventory.release(id));
      order.events.push({ type: 'payment.failed', at: now().toISOString() });
    } else if (evt.type === 'payment.succeeded') {
      if (order.paymentState === 'paid') return { received: true, duplicate: true };
      if (evt.amountCents !== order.totalCents) {
        order.paymentState = 'reconciliation';
        order.events.push({ type: 'payment.amount_mismatch', at: now().toISOString(), detail: { expected: order.totalCents, received: evt.amountCents } });
        return { received: true, reconciliation: true };
      }
      try {
        order.reservationIds.forEach((id) => store.inventory.commit(id, now()));
        order.paymentState = 'paid';
        order.events.push({ type: 'order.paid', at: now().toISOString() });
      } catch (e) {
        order.paymentState = 'reconciliation';
        order.events.push({ type: 'payment.after_reservation_expiry', at: now().toISOString(), detail: { error: (e as Error).message } });
      }
    }
    return { received: true };
  };

  // --- routes ---
  router.on('GET', '/api/health', () => ({ ok: true, catalogVersion: store.catalog.version, mockPayments, time: now().toISOString() }));

  router.on('GET', '/api/catalog/skus', (ctx) => {
    const ent = entitlementOf(principal(ctx).user);
    const q = ctx.query.get('q')?.toLowerCase();
    const kind = ctx.query.get('kind');
    const mounting = ctx.query.get('mounting');
    const items = [...store.catalog.skus.values()]
      .filter((s) => s.status === 'active')
      .filter((s) => !s.proOnly || ent.proOnlySkus)
      .filter((s) => !kind || s.kind === kind)
      .filter((s) => !mounting || s.mounting === mounting)
      .filter((s) => !q || s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || (s.finish ?? '').toLowerCase().includes(q))
      .map(({ factory: _factory, ...publicFields }) => publicFields); // Factory specs are not public.
    return { catalogVersion: store.catalog.version, items };
  });

  router.on('POST', '/api/imports/stage', (ctx) => {
    requireRole(ctx, 'admin');
    return stageImport(ctx.rawBody, store.catalog);
  });

  router.on('POST', '/api/projects', (ctx) => {
    const p = principal(ctx);
    const body = ctx.body as { name?: string; document?: unknown };
    const document = parseDocument(body.document);
    const id = store.id('prj');
    let guestToken: string | undefined;
    const project: Project = p.user
      ? { id, ownerType: 'user', ownerId: p.user.id, name: body.name ?? 'Untitled project', revisions: [], approvedRevision: null, approvals: [] }
      : { id, ownerType: 'guest', ownerId: id, name: body.name ?? 'Untitled project', revisions: [], approvedRevision: null, approvals: [] };
    if (!p.user) {
      guestToken = `gst_${createHash('sha256').update(`${id}:${Math.random()}:${now().getTime()}`).digest('hex').slice(0, 32)}`;
      store.guestTokens.set(guestToken, id);
    }
    const key = windowKey(project);
    requireEditable(key, p.user);
    const rev = saveRevision(project, 0, document, contentHash(document), p.user?.id ?? 'guest', now());
    store.projects.set(id, project);
    if (key && !store.accessWindows.has(key)) store.accessWindows.set(key, now().toISOString());
    ctx.res.statusCode = 201;
    return { id, name: project.name, ownerType: project.ownerType, latestRevision: rev.number, contentHash: rev.contentHash, guestToken };
  });

  router.on('GET', '/api/projects/:id', (ctx) => {
    const project = loadProject(ctx, ctx.params.id!);
    const latest = project.revisions.at(-1)!;
    return {
      id: project.id, name: project.name, ownerType: project.ownerType, latestRevision: latest.number,
      approvedRevision: project.approvedRevision, document: latest.document, contentHash: latest.contentHash,
      access: accessFor(windowKey(project), principal(ctx).user),
      revisions: project.revisions.map((r) => ({ number: r.number, createdAt: r.createdAt, contentHash: r.contentHash })),
    };
  });

  router.on('POST', '/api/projects/:id/revisions', (ctx) => {
    const project = loadProject(ctx, ctx.params.id!);
    const body = ctx.body as { baseRevision?: number; document?: unknown };
    assert(Number.isInteger(body.baseRevision), 'validation', 'baseRevision is required');
    const document = parseDocument(body.document);
    requireEditable(windowKey(project), principal(ctx).user);
    const rev = saveRevision(project, body.baseRevision!, document, contentHash(document), principal(ctx).user?.id ?? 'guest', now());
    ctx.res.statusCode = 201;
    return { revision: rev.number, contentHash: rev.contentHash, savedAt: rev.createdAt };
  });

  /** Attach a guest draft to the signed-in user atomically (spec section 6, step 3; AC06.1). */
  router.on('POST', '/api/projects/:id/claim', (ctx) => {
    const p = principal(ctx);
    const user = requireUser(ctx);
    const project = store.projects.get(ctx.params.id!);
    if (!project || project.ownerType !== 'guest' || !p.guestToken || store.guestTokens.get(p.guestToken) !== project.id) {
      throw new DomainError('not_found', 'Project not found');
    }
    // Claiming never restarts the clock: the account keeps the earlier of the two starts.
    const guestStart = store.accessWindows.get(`guest:${project.id}`);
    const userStart = store.accessWindows.get(`user:${user.id}`);
    const start = [guestStart, userStart].filter((x): x is string => !!x).sort()[0];
    if (start) store.accessWindows.set(`user:${user.id}`, start);
    store.accessWindows.delete(`guest:${project.id}`);
    project.ownerType = 'user';
    project.ownerId = user.id;
    store.guestTokens.delete(p.guestToken);
    audit(user.id, 'project.claim', project.id);
    return { id: project.id, ownerType: project.ownerType, latestRevision: project.revisions.at(-1)!.number };
  });

  router.on('GET', '/api/projects/:id/revisions/:n/validate', (ctx) => {
    const project = loadProject(ctx, ctx.params.id!);
    const rev = getRevision(project, Number(ctx.params.n));
    return validateDesign(rev.document, store.catalog, { tradeEntitled: entitlementOf(principal(ctx).user).proOnlySkus });
  });

  router.on('POST', '/api/designs/validate', (ctx) => {
    const document = parseDocument((ctx.body as { document?: unknown }).document);
    return validateDesign(document, store.catalog, { tradeEntitled: entitlementOf(principal(ctx).user).proOnlySkus });
  });

  /** Itemized design estimate. Totals are always computed here, never by the client (AC12.2). */
  router.on('POST', '/api/quotes', (ctx) => {
    const body = ctx.body as { document?: unknown; lines?: { skuCode: string; quantity: number }[] };
    const ent = entitlementOf(principal(ctx).user);
    if (body.document) {
      const document = parseDocument(body.document);
      const expansion = expandDesign(document, store.catalog);
      const validation = validateDesign(document, store.catalog, { tradeEntitled: ent.proOnlySkus });
      const quote = quoteForLines(expansion.lines, ent);
      return { quote, expansion, validation };
    }
    assert(Array.isArray(body.lines) && body.lines.length > 0, 'validation', 'document or lines required');
    return { quote: quoteForLines(body.lines!.map((l) => ({ skuCode: String(l.skuCode), quantity: Number(l.quantity) })), ent) };
  });

  router.on('POST', '/api/carts/from-design', (ctx) => {
    const body = ctx.body as { projectId?: string; revision?: number };
    const project = loadProject(ctx, String(body.projectId));
    const rev = getRevision(project, Number(body.revision ?? project.revisions.at(-1)!.number));
    const expansion = expandDesign(rev.document, store.catalog);
    const cart: Cart = {
      id: store.id('cart'), ownerId: ownerKey(ctx), projectId: project.id, revisionNumber: rev.number, contentHash: rev.contentHash,
      lines: expansion.lines, expansion, comparison: compareCartToDesign(expansion.lines, expansion), updatedAt: now().toISOString(),
    };
    store.carts.set(cart.id, cart);
    ctx.res.statusCode = 201;
    return cartView(cart);
  });

  router.on('POST', '/api/carts', (ctx) => {
    const cart: Cart = { id: store.id('cart'), ownerId: ownerKey(ctx), lines: [], updatedAt: now().toISOString() };
    store.carts.set(cart.id, cart);
    ctx.res.statusCode = 201;
    return cartView(cart);
  });

  router.on('GET', '/api/carts/:id', (ctx) => cartView(loadCart(ctx, ctx.params.id!)));

  /** Replace cart quantities. Divergence from the linked design is always recomputed (spec 12 step 6). */
  router.on('PATCH', '/api/carts/:id', (ctx) => {
    const cart = loadCart(ctx, ctx.params.id!);
    const body = ctx.body as { lines?: { skuCode: string; quantity: number }[] };
    assert(Array.isArray(body.lines), 'validation', 'lines required');
    const next = body.lines!.filter((l) => l.quantity > 0).map((l) => {
      const sku = store.catalog.skus.get(l.skuCode);
      assert(sku && sku.status === 'active', 'validation', `Unknown or inactive SKU ${l.skuCode}`);
      assert(Number.isInteger(l.quantity), 'validation', 'Quantity must be an integer');
      const prior = cart.lines.find((x) => x.skuCode === l.skuCode);
      return { skuCode: sku.code, quantity: l.quantity, stage: sku.fulfillmentStage, instanceIds: prior?.instanceIds ?? [], source: prior?.source ?? 'manual' as const, role: prior?.role };
    });
    cart.lines = groupLines(next);
    if (cart.expansion) cart.comparison = compareCartToDesign(cart.lines, cart.expansion);
    cart.updatedAt = now().toISOString();
    return cartView(cart);
  });

  /**
   * Checkout: server reprices, compares with the total the customer accepted,
   * reserves stock atomically and creates one order per idempotency key (QA07).
   */
  router.on('POST', '/api/checkout-sessions', (ctx) => {
    const key = ctx.headers['idempotency-key'];
    assert(typeof key === 'string' && key.length >= 8, 'validation', 'Idempotency-Key header (min 8 chars) is required');
    const body = ctx.body as { cartId?: string; acceptedTotalCents?: number; shippingZip?: string; acknowledgeDivergence?: boolean; acknowledgeIncomplete?: boolean };
    const owner = ownerKey(ctx);
    const { result, replayed } = store.idempotency.run('checkout', `${owner}:${key}`, body, () => {
      const cart = loadCart(ctx, String(body.cartId));
      assert(cart.lines.length > 0, 'validation', 'Cart is empty');
      if (cart.projectId && cart.revisionNumber) {
        const project = store.projects.get(cart.projectId)!;
        const rev = getRevision(project, cart.revisionNumber);
        if (rev.contentHash !== cart.contentHash) throw new DomainError('conflict', 'Design changed since cart was created');
        const latest = project.revisions.at(-1)!;
        if (latest.number !== rev.number && materialChanges(rev.document, latest.document).length > 0 && !body.acknowledgeDivergence) {
          throw new DomainError('conflict', 'Cart references a superseded design revision', { cartRevision: rev.number, latestRevision: latest.number });
        }
        const validation = validateDesign(rev.document, store.catalog, { tradeEntitled: entitlementOf(principal(ctx).user).proOnlySkus });
        if (validation.counts.blocker > 0) throw new DomainError('gate_failed', 'Design has blocking validation results', { results: validation.results.filter((r) => r.severity === 'blocker') });
      }
      if (cart.comparison?.incompleteSystems.length && !body.acknowledgeIncomplete) {
        throw new DomainError('conflict', 'Cart is missing required components', { incompleteSystems: cart.comparison.incompleteSystems });
      }
      const ent = entitlementOf(principal(ctx).user);
      const shipping = { status: 'quoted' as const, amount: dollars(100), description: 'Synthetic flat freight (fixture)' };
      const quote = priceQuote(store.catalog, store.priceBook, store.policy, {
        lines: cart.lines, entitlement: ent, shipping, now: now(), calculationId: store.id('calc'),
        designRevisionId: cart.projectId ? `${cart.projectId}@${cart.revisionNumber}` : undefined,
      });
      if (quote.excluded.length) throw new DomainError('conflict', 'Some items need a quote or are unavailable', { excluded: quote.excluded });
      if (body.acceptedTotalCents !== quote.total.amount) {
        throw new DomainError('conflict', 'Total changed; review and accept the new total', { requiresAcceptance: true, totalCents: quote.total.amount, quote });
      }
      const reservations = store.inventory.reserveAll(cart.lines.map((l) => ({ skuCode: l.skuCode, warehouseId: 'wh-main', quantity: l.quantity })), cart.id, now(), reservationTtlMs);
      const order: Order = {
        id: store.id('ord'), ownerId: cart.ownerId, projectId: cart.projectId, revisionNumber: cart.revisionNumber, contentHash: cart.contentHash,
        quote, totalCents: quote.total.amount, paymentState: 'pending', manufacturingState: 'not_released', factoryReviewCleared: false,
        reservationIds: reservations.map((r) => r.id), shipments: [],
        lines: quote.lines.map((l, i) => ({
          id: `ol_${i + 1}`, skuCode: l.skuCode, description: l.description, quantity: l.quantity, unitPriceCents: l.unitPrice.amount,
          lineTotalCents: l.lineTotal.amount, taxCents: l.tax.amount, stage: l.stage ?? store.catalog.skus.get(l.skuCode)!.fulfillmentStage, instanceIds: l.instanceIds,
        })),
        events: [{ type: 'order.created', at: now().toISOString() }], createdAt: now().toISOString(),
      };
      store.orders.set(order.id, order);
      return { orderId: order.id, totalCents: order.totalCents, paymentState: order.paymentState, paymentUrl: `/pay/mock?order=${order.id}` };
    });
    ctx.res.statusCode = replayed ? 200 : 201;
    return { ...(result as object), replayed };
  });

  /**
   * Signed payment webhook. A browser redirect is never proof of payment. Duplicate
   * events are no-ops; success after reservation expiry goes to reconciliation (QA08).
   */
  router.on('POST', '/api/webhooks/mockpay', (ctx) => {
    const sig = String(ctx.headers['x-mockpay-signature'] ?? '');
    const expected = signWebhook(secret, ctx.rawBody);
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      throw new DomainError('unauthorized', 'Invalid signature');
    }
    return processPaymentEvent(ctx.body as PaymentEvent);
  });

  /**
   * Development-only test payment (no real provider yet, D24). The server builds the
   * event itself and runs it through the same processing as a signed webhook, so the
   * browser can never mark an order paid with an amount of its choosing.
   */
  router.on('POST', '/api/dev/payments/:orderId', (ctx) => {
    if (!mockPayments) throw new DomainError('not_found', 'Route not found');
    const order = loadOrder(ctx, ctx.params.orderId!);
    const outcome = (ctx.body as { outcome?: string }).outcome;
    assert(outcome === 'succeeded' || outcome === 'failed', 'validation', 'outcome must be "succeeded" or "failed"');
    const result = processPaymentEvent({ id: store.id('devevt'), type: `payment.${outcome}`, orderId: order.id, amountCents: order.totalCents });
    return { ...result, paymentState: order.paymentState };
  });

  router.on('GET', '/api/orders/:id', (ctx) => {
    const order = loadOrder(ctx, ctx.params.id!);
    const fulfillment = fulfillmentStatus(order.lines.map((l) => ({ id: l.id, skuCode: l.skuCode, quantity: l.quantity, stage: l.stage })), order.shipments);
    return { ...order, fulfillment };
  });

  router.on('POST', '/api/projects/:id/approvals', (ctx) => {
    const user = requireUser(ctx);
    const project = loadProject(ctx, ctx.params.id!);
    const body = ctx.body as { revision?: number; quoteTotalCents?: number; quoteId?: string };
    const approval = recordApproval(project, {
      id: store.id('apr'), revisionNumber: Number(body.revision), quoteId: String(body.quoteId ?? ''),
      quoteTotalCents: Number(body.quoteTotalCents ?? 0), approvedBy: user.id, approvedAt: now().toISOString(),
    });
    audit(user.id, 'approval.record', project.id, `revision ${approval.revisionNumber}`);
    ctx.res.statusCode = 201;
    return approval;
  });

  router.on('POST', '/api/orders/:id/factory-review', (ctx) => {
    const user = requireRole(ctx, 'factory_planner');
    const order = loadOrder(ctx, ctx.params.id!, true);
    order.factoryReviewCleared = Boolean((ctx.body as { cleared?: boolean }).cleared);
    audit(user.id, 'order.factory_review', order.id, String(order.factoryReviewCleared));
    return { id: order.id, factoryReviewCleared: order.factoryReviewCleared };
  });

  /** Manufacturing release enforces commercial, design and factory gates; idempotent per order. */
  router.on('POST', '/api/orders/:id/release', (ctx) => {
    const user = requireRole(ctx, 'factory_planner');
    const order = loadOrder(ctx, ctx.params.id!, true);
    if (order.manufacturingState === 'released') return { id: order.id, manufacturingState: order.manufacturingState, replayed: true };
    const project = order.projectId ? store.projects.get(order.projectId) : undefined;
    let failures: string[] = [];
    if (project && order.revisionNumber) {
      const rev = getRevision(project, order.revisionNumber);
      const validation = validateDesign(rev.document, store.catalog, { tradeEntitled: true });
      const gate = releaseGate({
        project, orderRevisionNumber: order.revisionNumber, orderContentHash: order.contentHash!, paymentState: order.paymentState,
        factoryReviewCleared: order.factoryReviewCleared, blockersOutstanding: validation.counts.blocker,
        productionIneligibleSkus: order.lines.map((l) => store.catalog.skus.get(l.skuCode)!).filter((s) => ['body', 'front', 'filler', 'panel'].includes(s.kind) && !productionEligibility(s).eligible).map((s) => s.code),
      });
      failures = gate.failures;
    } else if (order.paymentState !== 'paid') failures = ['payment_not_settled'];
    if (failures.length) throw new DomainError('gate_failed', 'Order cannot be released', { failures });
    order.manufacturingState = 'released';
    order.events.push({ type: 'order.released', at: now().toISOString(), detail: { by: user.id } });
    audit(user.id, 'order.release', order.id);
    return { id: order.id, manufacturingState: order.manufacturingState, replayed: false };
  });

  router.on('POST', '/api/orders/:id/shipments', (ctx) => {
    requireRole(ctx, 'factory_planner', 'admin');
    const order = loadOrder(ctx, ctx.params.id!, true);
    const body = ctx.body as { stage: string; lines: { orderLineId: string; quantity: number }[]; trackingNumbers?: string[] };
    const shipment = { id: store.id('shp'), groupStage: body.stage, state: 'dispatched' as ShipmentState, lines: body.lines, trackingNumbers: body.trackingNumbers ?? [] };
    validateShipment(order.lines.map((l) => ({ id: l.id, skuCode: l.skuCode, quantity: l.quantity, stage: l.stage })), order.shipments, shipment);
    order.shipments.push(shipment);
    ctx.res.statusCode = 201;
    return shipment;
  });

  router.on('POST', '/api/orders/:id/shipments/:sid/status', (ctx) => {
    requireRole(ctx, 'factory_planner', 'admin');
    const order = loadOrder(ctx, ctx.params.id!, true);
    const shipment = order.shipments.find((s) => s.id === ctx.params.sid);
    if (!shipment) throw new DomainError('not_found', 'Shipment not found');
    shipment.state = applyCarrierStatus(shipment.state, (ctx.body as { state: ShipmentState }).state);
    return shipment;
  });

  router.on('GET', '/api/directory', (ctx) => {
    const service = ctx.query.get('service') ?? 'cabinet_install';
    const zip = ctx.query.get('zip') ?? '';
    assert(/^\d{5}$/.test(zip), 'validation', 'A 5-digit ZIP is required');
    const results = searchDirectory(store.pros, service, zip, now()).map((p) => ({ orgId: p.orgId, displayName: p.displayName, services: p.services, verified: p.verified }));
    return { results, message: results.length ? undefined : 'No verified installers serve this area yet. Save an inquiry and we will follow up.' };
  });

  /** Customer-selected request: delivered only to the named professionals (AC18.2). */
  router.on('POST', '/api/leads', (ctx) => {
    const user = requireUser(ctx);
    const body = ctx.body as { service: string; zip: string; recipients: string[]; summary: string; phone?: string };
    assert(Array.isArray(body.recipients) && body.recipients.length > 0, 'validation', 'Choose at least one professional');
    const listed = new Set(searchDirectory(store.pros, body.service, body.zip, now()).map((p) => p.orgId));
    for (const r of body.recipients) assert(listed.has(r), 'validation', `Professional ${r} does not serve this request`);
    const lead: Lead = {
      id: store.id('lead'), mode: 'customer_selected', service: body.service, zip: body.zip, exclusive: false, maxRecipients: body.recipients.length,
      recipients: [...body.recipients], claimedBy: [], customer: { name: user.name, email: user.email, phone: body.phone }, summary: String(body.summary ?? ''),
      history: body.recipients.map((orgId) => ({ orgId, action: 'delivered' as const, at: now().toISOString() })),
    };
    store.leads.set(lead.id, lead);
    ctx.res.statusCode = 201;
    return { id: lead.id, recipients: lead.recipients, history: lead.history };
  });

  router.on('GET', '/api/pro/leads', (ctx) => {
    const user = requireRole(ctx, 'pro_owner', 'pro_staff');
    const orgId = user.orgIds[0]!;
    return { leads: [...store.leads.values()].filter((l) => visibleTo(l, orgId)).map((l) => leadViewFor(l, orgId)) };
  });

  router.on('POST', '/api/leads/:id/claim', (ctx) => {
    const user = requireRole(ctx, 'pro_owner', 'pro_staff');
    const lead = store.leads.get(ctx.params.id!);
    if (!lead) throw new DomainError('not_found', 'Lead not found');
    const pro = store.pros.find((p) => p.orgId === user.orgIds[0]);
    if (!pro) throw new DomainError('forbidden', 'No professional profile');
    claimLead(lead, { ...pro, activeEntitlement: entitlementOf(user).leadAccess }, now());
    return leadViewFor(lead, pro.orgId);
  });

  /**
   * Lead-referral financing mode (spec section 14). Stores consent evidence and the
   * minimum fields; a receipt is not approval. Sensitive data is collected by the
   * lender's hosted flow, never here.
   */
  router.on('POST', '/api/financing/referrals', (ctx) => {
    const user = requireUser(ctx);
    const body = ctx.body as { projectId?: string; requestedAmountCents: number; consent?: { accepted: boolean; disclosureVersion: string }; ssn?: unknown; income?: unknown };
    assert(body.consent?.accepted === true && !!body.consent.disclosureVersion, 'validation', 'Consent to share with the financing partner is required');
    assert(body.ssn === undefined && body.income === undefined, 'validation', 'Sensitive applicant data must be entered in the lender’s secure application');
    assert(Number.isInteger(body.requestedAmountCents) && body.requestedAmountCents > 0, 'validation', 'requestedAmountCents must be a positive integer');
    if (body.projectId) loadProject(ctx, body.projectId);
    const referral = {
      id: store.id('fin'), projectId: body.projectId, ownerId: user.id, partnerId: 'partner-tbd', status: 'submitted' as const,
      consent: { disclosureVersion: body.consent!.disclosureVersion, purpose: 'financing_referral', at: now().toISOString(), channel: 'web' as const },
      requestedAmountCents: body.requestedAmountCents, createdAt: now().toISOString(),
    };
    store.referrals.set(referral.id, referral);
    ctx.res.statusCode = 201;
    return { id: referral.id, status: referral.status, message: 'Submitted for contact. This is not a credit approval.' };
  });

  router.on('GET', '/api/me', (ctx) => {
    const user = principal(ctx).user;
    return { user: user ? { id: user.id, name: user.name, roles: user.roles, orgIds: user.orgIds } : null, entitlement: entitlementOf(user) };
  });

  router.on('GET', '/api/config/quote-honor', () => ({ policy: 'reprice_with_acceptance', description: 'Unlocked quotes are repriced at checkout and any change needs customer acceptance.' }));
  void revalidateQuote; // Exposed via core for the quote-lock policy once D08 is decided.

  async function handle(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const matched = router.match(req.method ?? 'GET', url.pathname);
      if (matched === undefined) return send(res, 404, { error: { code: 'not_found', message: 'Route not found' } });
      if (matched === 'method_not_allowed') return send(res, 405, { error: { code: 'method_not_allowed', message: 'Method not allowed' } });
      const rawBody = req.method === 'GET' ? '' : await readBody(req);
      const isJson = (req.headers['content-type'] ?? '').includes('application/json');
      const body = rawBody && isJson ? JSON.parse(rawBody) : {};
      const ctx: Ctx = { req, res, params: matched.params, query: url.searchParams, body, rawBody, headers: req.headers };
      const result = await matched.handler(ctx);
      send(res, res.statusCode && res.statusCode !== 200 ? res.statusCode : 200, result);
    } catch (err) {
      sendError(res, err);
    }
  }

  return { store, handle, server: (): Server => createServer(handle) };
}
