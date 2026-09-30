/**
 * Subscriptions, entitlements and homeowner access windows (spec sections 6, 16).
 * Authentication, organization membership, subscription, entitlement and
 * verification are independent concepts.
 */
import type { Entitlement } from './pricing';

export interface PlanConfig {
  id: string;
  name: string;
  interval: 'year' | 'month';
  /** Price is configuration approved by the business (D04); null until approved. */
  priceCents: number | null;
  limits: { activeProjects: number; seats: number; rendersPerMonth: number };
  tradePricing: boolean;
  proOnlySkus: boolean;
  leadAccess: boolean;
}

export interface Subscription {
  id: string;
  orgId: string;
  planId: string;
  status: 'incomplete' | 'trialing' | 'active' | 'past_due' | 'grace_period' | 'suspended' | 'canceled' | 'expired';
  paidThrough: string | null;
  cancelAtPeriodEnd: boolean;
  providerSubscriptionId?: string;
  appliedEventIds: string[];
}

export function isSubscriptionEntitled(sub: Subscription | undefined, now: Date): boolean {
  if (!sub || !sub.paidThrough) return false;
  const within = now.getTime() < Date.parse(sub.paidThrough);
  if (!within) return false;
  // Canceled at period end retains access until paid-through (AC16.3).
  return ['trialing', 'active', 'past_due', 'grace_period', 'canceled'].includes(sub.status);
}

export function entitlementFor(sub: Subscription | undefined, plan: PlanConfig | undefined, now: Date): Entitlement & { leadAccess: boolean } {
  const ok = isSubscriptionEntitled(sub, now) && !!plan;
  return { tradePricing: ok && !!plan?.tradePricing, proOnlySkus: ok && !!plan?.proOnlySkus, leadAccess: ok && !!plan?.leadAccess };
}

/**
 * Apply a verified provider renewal event. Duplicate notifications do not extend
 * the term twice (AC16.4); the new term is taken from the provider, not added.
 */
export function applyRenewal(sub: Subscription, event: { id: string; periodEnd: string }): Subscription {
  if (sub.appliedEventIds.includes(event.id)) return sub;
  const newEnd = sub.paidThrough && Date.parse(sub.paidThrough) > Date.parse(event.periodEnd) ? sub.paidThrough : event.periodEnd;
  return { ...sub, status: 'active', paidThrough: newEnd, appliedEventIds: [...sub.appliedEventIds, event.id] };
}

/**
 * Homeowner access window (D01/D02 OPEN). Proposed default: the clock starts at the
 * first saved project; after it ends, access is read-only + export. Purchases,
 * warranties and support are always retained.
 */
export interface AccessWindow {
  startedAt: string | null;
  days: number;
  extensionDays: number;
}

export type ProjectAccess = 'edit' | 'read_only';

export function projectAccess(window: AccessWindow, now: Date, hasPaidEntitlement: boolean): { access: ProjectAccess; endsAt: string | null } {
  if (hasPaidEntitlement) return { access: 'edit', endsAt: null };
  if (!window.startedAt) return { access: 'edit', endsAt: null };
  const endsAt = new Date(Date.parse(window.startedAt) + (window.days + window.extensionDays) * 86_400_000);
  return { access: now < endsAt ? 'edit' : 'read_only', endsAt: endsAt.toISOString() };
}
