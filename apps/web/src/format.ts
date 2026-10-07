import { type DisplayUnit, type Money, type Severity, formatLength, formatMoney, roundTo, mmToInches } from '@rta/core';

export const money = (m: Money | undefined | null): string => (m ? formatMoney(m) : '—');
export const cents = (amount: number): string => formatMoney({ amount, currency: 'USD' });

/** Show a length in both systems, primary unit first. */
export function bothUnits(mm: number, primary: DisplayUnit = 'in'): string {
  const inch = `${formatLength(mm, 'in')}`;
  const metric = `${roundTo(mm, 1)} mm`;
  return primary === 'in' ? `${inch} (${metric})` : `${metric} (${inch})`;
}

export const len = (mm: number, unit: DisplayUnit): string => formatLength(mm, unit);

/** Plain value for an editable field (no unit suffix), e.g. 35 1/2 or 901.7. */
export function lengthFieldValue(mm: number, unit: DisplayUnit): string {
  if (unit === 'mm') return String(roundTo(mm, 1));
  const inch = mmToInches(mm);
  const whole = Math.floor(inch + 1e-9);
  const sixteenths = Math.round((inch - whole) * 16);
  if (sixteenths === 0) return String(whole);
  if (sixteenths === 16) return String(whole + 1);
  const g = gcd(sixteenths, 16);
  return `${whole > 0 ? `${whole} ` : ''}${sixteenths / g}/${16 / g}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  blocker: 'Blocker',
  review_required: 'Review required',
  advisory: 'Advisory',
};

/** Icons are always paired with text; color is never the only signal. */
export const SEVERITY_ICON: Record<Severity, string> = {
  blocker: '⛔',
  review_required: '⚠',
  advisory: 'ℹ',
};

export const STAGE_LABEL: Record<string, string> = {
  A: 'Stage A: cabinet bodies and hardware',
  B: 'Stage B: fronts, fillers and finish parts',
  samples: 'Samples',
  third_party: 'Third-party products',
};

export const stageLabel = (s: string | undefined): string => (s ? STAGE_LABEL[s] ?? `Stage ${s}` : 'Unassigned');

export const PAYMENT_LABEL: Record<string, string> = {
  unpaid: 'Awaiting payment',
  pending: 'Pending payment confirmation',
  authorized: 'Payment authorized, not yet captured',
  paid: 'Paid (confirmed by payment provider)',
  failed: 'Payment failed',
  reconciliation: 'Payment under review',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded',
  voided: 'Payment voided',
};

export const GROUP_STATUS_LABEL: Record<string, string> = {
  pending: 'Not yet dispatched',
  partially_shipped: 'Partially dispatched',
  shipped: 'Dispatched',
  partially_delivered: 'Partially delivered',
  delivered: 'Delivered',
};

export const FIT_LABEL: Record<string, { icon: string; text: string }> = {
  verified: { icon: '✓', text: 'Fit verified against entered measurements' },
  incomplete: { icon: '⚠', text: 'Fit not verified: review required' },
  failed: { icon: '⛔', text: 'Fit failed: blockers must be resolved' },
};

export function newId(prefix: string): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rnd}`;
}

export const DESIGN_REQUEST_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Received, waiting for a designer',
  assigned: 'Assigned to a designer',
  needs_information: 'Designer needs more information',
  in_design: 'Being designed',
  customer_review: 'Ready for your review',
  approved: 'Approved',
  converted: 'Converted to an order',
  rejected: 'Declined',
  withdrawn: 'Withdrawn',
  superseded: 'Replaced by a newer request',
};
