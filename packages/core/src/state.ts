/**
 * Orthogonal state machines (spec section 24). Order commercial status, payment,
 * design approval, manufacturing and shipment are independent; e.g.
 * Paid + FactoryReviewRequired is valid and is not Released.
 */
import { DomainError } from './errors';

export interface Machine<S extends string> {
  name: string;
  initial: S;
  transitions: Record<S, readonly S[]>;
  terminal: readonly S[];
}

function machine<S extends string>(name: string, initial: S, transitions: Record<S, readonly S[]>): Machine<S> {
  const terminal = (Object.keys(transitions) as S[]).filter((s) => transitions[s].length === 0);
  return { name, initial, transitions, terminal };
}

export function canTransition<S extends string>(m: Machine<S>, from: S, to: S): boolean {
  return m.transitions[from]?.includes(to) ?? false;
}

export interface TransitionRecord<S extends string> {
  from: S;
  to: S;
  actorId: string;
  at: string;
  reason?: string;
}

export function transition<S extends string>(m: Machine<S>, from: S, to: S, actorId: string, at: Date, reason?: string): TransitionRecord<S> {
  if (!canTransition(m, from, to)) {
    throw new DomainError('invalid_transition', `${m.name}: ${from} -> ${to} is not allowed`, { machine: m.name, from, to });
  }
  return { from, to, actorId, at: at.toISOString(), reason };
}

/** Design request workflow (spec section 11). */
export const designRequestMachine = machine('design_request', 'draft', {
  draft: ['submitted', 'withdrawn'],
  submitted: ['assigned', 'withdrawn', 'rejected'],
  assigned: ['needs_information', 'in_design', 'withdrawn', 'rejected'],
  needs_information: ['in_design', 'assigned', 'withdrawn'],
  in_design: ['customer_review', 'needs_information', 'withdrawn'],
  customer_review: ['approved', 'in_design', 'withdrawn', 'superseded'],
  approved: ['converted', 'in_design', 'superseded'],
  converted: [],
  rejected: [],
  withdrawn: [],
  superseded: [],
} as const);

export const paymentMachine = machine('payment', 'unpaid', {
  unpaid: ['pending', 'authorized', 'paid', 'failed'],
  pending: ['authorized', 'paid', 'failed', 'reconciliation'],
  authorized: ['paid', 'failed', 'voided'],
  paid: ['partially_refunded', 'refunded', 'reconciliation'],
  partially_refunded: ['partially_refunded', 'refunded'],
  failed: ['pending', 'paid'],
  reconciliation: ['paid', 'refunded', 'failed'],
  refunded: [],
  voided: [],
} as const);

export const manufacturingMachine = machine('manufacturing', 'not_released', {
  not_released: ['factory_review_required', 'released'],
  factory_review_required: ['released', 'not_released'],
  released: ['scheduled', 'on_hold'],
  scheduled: ['in_production', 'on_hold'],
  in_production: ['quality_check', 'on_hold'],
  quality_check: ['ready_to_ship', 'rework'],
  rework: ['in_production'],
  on_hold: ['released', 'scheduled', 'in_production', 'cancelled'],
  ready_to_ship: [],
  cancelled: [],
} as const);

export const shipmentMachine = machine('shipment', 'pending', {
  pending: ['allocated', 'cancelled'],
  allocated: ['picked', 'cancelled'],
  picked: ['packed'],
  packed: ['label_created'],
  label_created: ['dispatched'],
  dispatched: ['in_transit', 'delivered', 'exception'],
  in_transit: ['delivered', 'exception'],
  exception: ['in_transit', 'delivered', 'returned'],
  delivered: [],
  returned: [],
  cancelled: [],
} as const);

/** Financing (spec section 14). Provider raw state is kept separately. */
export const financingMachine = machine('financing', 'not_started', {
  not_started: ['submitted', 'withdrawn'],
  submitted: ['pending', 'declined', 'withdrawn', 'expired'],
  pending: ['more_information_required', 'prequalified', 'approved', 'declined', 'withdrawn', 'expired'],
  more_information_required: ['pending', 'withdrawn', 'expired', 'declined'],
  prequalified: ['approved', 'declined', 'withdrawn', 'expired'],
  approved: ['accepted', 'withdrawn', 'expired'],
  accepted: ['funded', 'withdrawn'],
  funded: [],
  declined: [],
  withdrawn: [],
  expired: [],
} as const);

export const subscriptionMachine = machine('subscription', 'incomplete', {
  incomplete: ['trialing', 'active', 'expired'],
  trialing: ['active', 'expired', 'canceled'],
  active: ['past_due', 'canceled', 'expired', 'active'],
  past_due: ['active', 'grace_period', 'suspended'],
  grace_period: ['active', 'suspended'],
  suspended: ['active', 'expired'],
  canceled: ['active', 'expired'],
  expired: ['active'],
} as const);

export const claimMachine = machine('claim', 'submitted', {
  submitted: ['in_review'],
  in_review: ['information_needed', 'approved', 'rejected'],
  information_needed: ['in_review'],
  approved: ['resolved'],
  rejected: ['resolved'],
  resolved: [],
} as const);

export const sellerMachine = machine('seller', 'applied', {
  applied: ['under_review', 'closed'],
  under_review: ['approved', 'closed'],
  approved: ['suspended', 'closed'],
  suspended: ['approved', 'closed'],
  closed: [],
} as const);

export type PaymentState = keyof typeof paymentMachine.transitions;
export type ManufacturingState = keyof typeof manufacturingMachine.transitions;
export type ShipmentState = keyof typeof shipmentMachine.transitions;
export type FinancingState = keyof typeof financingMachine.transitions;
export type DesignRequestState = keyof typeof designRequestMachine.transitions;

/**
 * Carrier events arrive duplicated and out of order. Apply only forward progress;
 * never regress Delivered to Shipped (AC15.5).
 */
const SHIPMENT_RANK: Record<ShipmentState, number> = {
  pending: 0, allocated: 1, picked: 2, packed: 3, label_created: 4, dispatched: 5,
  in_transit: 6, exception: 6, delivered: 9, returned: 9, cancelled: 9,
};
export function applyCarrierStatus(current: ShipmentState, incoming: ShipmentState): ShipmentState {
  if (current === incoming) return current;
  if (SHIPMENT_RANK[incoming] < SHIPMENT_RANK[current]) return current;
  if (shipmentMachine.terminal.includes(current)) return current;
  return incoming;
}
