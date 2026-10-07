/**
 * Typed client for the RTA API (apps/api/src/app.ts). The server is the pricing
 * authority: this client never computes or submits trusted prices, it only
 * echoes back a server total the customer explicitly accepted.
 */
import type {
  CartComparison, CartLine, DesignDocument, DesignExpansion, GroupStatus, OrderFulfillmentStatus, Quote,
  Sku, ValidationReport,
} from '@rta/core';
import { getDemoAccount, getGuestToken } from './storage';

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: Record<string, unknown>) {
    super(message);
  }
}

/** Public SKU fields (factory specs are stripped by the API). */
export type PublicSku = Omit<Sku, 'factory'>;

export interface CartView {
  id: string;
  ownerId: string;
  projectId?: string;
  revisionNumber?: number;
  contentHash?: string;
  lines: CartLine[];
  expansion?: DesignExpansion;
  comparison?: CartComparison;
  updatedAt: string;
  quote: Quote;
}

export interface ProjectView {
  id: string;
  name: string;
  ownerType: 'user' | 'organization' | 'guest';
  latestRevision: number;
  approvedRevision: number | null;
  document: DesignDocument;
  contentHash: string;
  revisions: { number: number; createdAt: string; contentHash: string }[];
  access?: { access: 'edit' | 'read_only'; endsAt: string | null };
}

export interface OrderView {
  id: string;
  projectId?: string;
  revisionNumber?: number;
  totalCents: number;
  paymentState: string;
  manufacturingState: string;
  quote: Quote;
  lines: { id: string; skuCode: string; description: string; quantity: number; unitPriceCents: number; lineTotalCents: number; taxCents: number; stage: string; instanceIds: string[] }[];
  createdAt: string;
  fulfillment: { overall: OrderFulfillmentStatus; groups: GroupStatus[] };
}

export interface DesignRequestView {
  id: string;
  projectId?: string;
  revisionNumber?: number;
  state: string;
  roomType: string;
  zip: string;
  timeline: string;
  budgetRange: string;
  services: string[];
  appliances: string;
  preferredMaterials: string;
  contactPreference: 'email' | 'phone' | 'either';
  phone?: string;
  notes: string;
  assignedTo?: string;
  history: { from: string; to: string; actorId: string; at: string; reason?: string }[];
  messages: { from: 'customer' | 'designer'; authorId: string; text: string; at: string }[];
  createdAt: string;
}

export interface DesignRequestInput {
  projectId?: string;
  roomType: string;
  zip: string;
  timeline: string;
  budgetRange: string;
  services: string[];
  appliances: string;
  preferredMaterials: string;
  contactPreference: 'email' | 'phone' | 'either';
  phone?: string;
  notes: string;
}

export interface MyProject {
  id: string; name: string; latestRevision: number; approvedRevision: number | null; updatedAt: string; roomType: string; cabinets: number;
  access: { access: 'edit' | 'read_only'; endsAt: string | null };
}
export interface MyOrder {
  id: string; createdAt: string; totalCents: number; paymentState: string; manufacturingState: string; fulfillment: string;
  projectId?: string; revisionNumber?: number; items: number;
}

export interface CollectionView {
  id: string;
  name: string;
  doorStyle: string;
  finish: string;
  material: string;
  swatchHex: string;
  description: string;
  frontLeadTimeDays: { min: number; max: number } | null;
  exteriorRated?: boolean;
  fronts: string[];
  sample: { code: string; priceCents: number | null } | null;
  bodiesInStock: boolean;
  tenByTen: {
    available: boolean; retailCents: number | null; tradeCents: number | null; priceBookVersion: string;
    missing: { bodyCode: string; reason: string }[]; lines: { skuCode: string; quantity: number }[];
  };
}

export interface MeView {
  user: { id: string; name: string; roles: string[]; orgIds: string[] } | null;
  entitlement: { tradePricing: boolean; proOnlySkus: boolean; leadAccess: boolean };
}

async function request<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json', ...extraHeaders };
  const account = getDemoAccount();
  if (account !== 'guest') headers['x-user-id'] = account;
  const token = getGuestToken();
  if (token) headers['x-guest-token'] = token;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'network', 'Could not reach the server. Check your connection and try again.');
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) {
    const err = (data as { error?: ApiErrorBody } | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return data as T;
}

export const api = {
  me: () => request<MeView>('GET', '/api/me'),

  skus: (params: { kind?: string; mounting?: string; q?: string } = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    const s = qs.toString();
    return request<{ catalogVersion: string; items: PublicSku[] }>('GET', `/api/catalog/skus${s ? `?${s}` : ''}`);
  },

  createProject: (name: string, document: DesignDocument) =>
    request<{ id: string; name: string; ownerType: string; latestRevision: number; contentHash: string; guestToken?: string }>('POST', '/api/projects', { name, document }),
  getProject: (id: string) => request<ProjectView>('GET', `/api/projects/${encodeURIComponent(id)}`),
  saveRevision: (id: string, baseRevision: number, document: DesignDocument) =>
    request<{ revision: number; contentHash: string; savedAt: string }>('POST', `/api/projects/${encodeURIComponent(id)}/revisions`, { baseRevision, document }),

  quoteLines: (lines: { skuCode: string; quantity: number }[]) => request<{ quote: Quote }>('POST', '/api/quotes', { lines }),
  quoteDesign: (document: DesignDocument) =>
    request<{ quote: Quote; expansion: DesignExpansion; validation: ValidationReport }>('POST', '/api/quotes', { document }),

  cartFromDesign: (projectId: string, revision?: number) => request<CartView>('POST', '/api/carts/from-design', { projectId, revision }),
  createCart: () => request<CartView & { guestToken?: string }>('POST', '/api/carts', {}),
  getCart: (id: string) => request<CartView>('GET', `/api/carts/${encodeURIComponent(id)}`),
  patchCart: (id: string, lines: { skuCode: string; quantity: number }[]) =>
    request<CartView>('PATCH', `/api/carts/${encodeURIComponent(id)}`, { lines }),

  checkout: (idempotencyKey: string, body: { cartId: string; acceptedTotalCents: number; acknowledgeIncomplete?: boolean; acknowledgeDivergence?: boolean }) =>
    request<{ orderId: string; totalCents: number; paymentState: string; paymentUrl: string; replayed: boolean }>(
      'POST', '/api/checkout-sessions', body, { 'Idempotency-Key': idempotencyKey }),

  health: () => request<{ ok: boolean; mockPayments: boolean }>('GET', '/api/health'),
  /** Development-only test payment; the server sets the amount. */
  testPayment: (orderId: string, outcome: 'succeeded' | 'failed') =>
    request<{ paymentState: string }>('POST', `/api/dev/payments/${encodeURIComponent(orderId)}`, { outcome }),

  collections: () => request<{ collections: CollectionView[]; tenByTenDefinition: { items: { bodyCode: string; quantity: number; label: string }[]; excludes: string[] } }>('GET', '/api/collections'),
  myProjects: () => request<{ projects: MyProject[] }>('GET', '/api/me/projects'),
  myOrders: () => request<{ orders: MyOrder[] }>('GET', '/api/me/orders'),
  myDesignRequests: () => request<{ requests: DesignRequestView[] }>('GET', '/api/me/design-requests'),
  createDesignRequest: (body: DesignRequestInput) => request<DesignRequestView>('POST', '/api/design-requests', body),
  designQueue: () => request<{ requests: DesignRequestView[] }>('GET', '/api/design-requests'),
  designRequestMessage: (id: string, text: string) =>
    request<DesignRequestView>('POST', `/api/design-requests/${encodeURIComponent(id)}/messages`, { text }),
  designRequestTransition: (id: string, to: string, reason?: string) =>
    request<DesignRequestView>('POST', `/api/design-requests/${encodeURIComponent(id)}/transition`, { to, reason }),

  getOrder: (id: string) => request<OrderView>('GET', `/api/orders/${encodeURIComponent(id)}`),

  directory: (zip: string) =>
    request<{ results: { orgId: string; displayName: string; services: string[]; verified: boolean }[]; message?: string }>('GET', `/api/directory?zip=${encodeURIComponent(zip)}`),
  createLead: (body: { service: string; zip: string; recipients: string[]; summary: string; phone?: string }) =>
    request<{ id: string; recipients: string[]; history: { orgId: string; action: string; at: string }[] }>('POST', '/api/leads', body),

  financingReferral: (body: { projectId?: string; requestedAmountCents: number; consent: { accepted: boolean; disclosureVersion: string } }) =>
    request<{ id: string; status: string; message: string }>('POST', '/api/financing/referrals', body),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}
