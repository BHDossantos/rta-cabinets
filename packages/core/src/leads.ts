/**
 * Contractor directory and lead assignment (spec section 18).
 */
import { DomainError } from './errors';

export interface ProProfile {
  orgId: string;
  displayName: string;
  services: string[];
  serviceZips: string[];
  verified: boolean;
  verificationExpiresAt?: string;
  activeEntitlement: boolean;
  capacity: number;
  openLeads: number;
}

export type LeadMode = 'customer_selected' | 'claimable' | 'auto_assigned' | 'private';

export interface Lead {
  id: string;
  mode: LeadMode;
  service: string;
  zip: string;
  exclusive: boolean;
  maxRecipients: number;
  /** Explicit recipients for customer-selected leads. */
  recipients: string[];
  claimedBy: string[];
  originOrgId?: string;
  customer: { name: string; email: string; phone?: string };
  summary: string;
  history: { orgId: string; action: 'delivered' | 'claimed' | 'declined' | 'reassigned'; at: string }[];
}

export function isEligible(pro: ProProfile, lead: Pick<Lead, 'service' | 'zip'>, now: Date): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!pro.activeEntitlement) reasons.push('no_active_entitlement');
  if (!pro.verified) reasons.push('not_verified');
  if (pro.verificationExpiresAt && Date.parse(pro.verificationExpiresAt) <= now.getTime()) reasons.push('verification_expired');
  if (!pro.services.includes(lead.service)) reasons.push('service_not_offered');
  if (!pro.serviceZips.includes(lead.zip)) reasons.push('outside_service_area');
  if (pro.openLeads >= pro.capacity) reasons.push('at_capacity');
  return { eligible: reasons.length === 0, reasons };
}

/** Directory search: only eligible, verified pros are listed. A paid badge alone is not verification (AC16.2). */
export function searchDirectory(pros: ProProfile[], service: string, zip: string, now: Date): ProProfile[] {
  return pros
    .filter((p) => p.verified && !(p.verificationExpiresAt && Date.parse(p.verificationExpiresAt) <= now.getTime()))
    .filter((p) => p.activeEntitlement && p.services.includes(service) && p.serviceZips.includes(zip))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Claim is a single synchronous check-and-set (transactional in the DB adapter);
 * competing exclusive claims produce exactly one winner (AC18.3).
 */
export function claimLead(lead: Lead, pro: ProProfile, now: Date): Lead {
  if (lead.mode !== 'claimable') throw new DomainError('forbidden', 'Lead is not claimable');
  const { eligible, reasons } = isEligible(pro, lead, now);
  if (!eligible) throw new DomainError('forbidden', 'Not eligible to claim this lead', { reasons });
  if (lead.claimedBy.includes(pro.orgId)) return lead;
  const limit = lead.exclusive ? 1 : lead.maxRecipients;
  if (lead.claimedBy.length >= limit) throw new DomainError('conflict', 'Lead has already been claimed', { claimedCount: lead.claimedBy.length });
  lead.claimedBy.push(pro.orgId);
  lead.history.push({ orgId: pro.orgId, action: 'claimed', at: now.toISOString() });
  return lead;
}

/** What a professional may see. Contact details only after a valid claim or explicit selection. */
export function leadViewFor(lead: Lead, orgId: string) {
  const entitled = lead.claimedBy.includes(orgId) || (lead.mode === 'customer_selected' && lead.recipients.includes(orgId)) || lead.originOrgId === orgId;
  const base = { id: lead.id, mode: lead.mode, service: lead.service, zip: lead.zip, summary: lead.summary };
  return entitled ? { ...base, customer: lead.customer, contactRevealed: true as const } : { ...base, contactRevealed: false as const };
}

export function visibleTo(lead: Lead, orgId: string): boolean {
  switch (lead.mode) {
    case 'private': return lead.originOrgId === orgId;
    case 'customer_selected': return lead.recipients.includes(orgId);
    case 'auto_assigned': return lead.recipients.includes(orgId) || lead.claimedBy.includes(orgId);
    case 'claimable': return true;
  }
}

/** Auto-assignment: deterministic round-robin across eligible pros ranked by load. */
export function autoAssign(lead: Lead, pros: ProProfile[], now: Date): string[] {
  const eligible = pros.filter((p) => isEligible(p, lead, now).eligible)
    .sort((a, b) => a.openLeads / a.capacity - b.openLeads / b.capacity || a.orgId.localeCompare(b.orgId));
  const chosen = eligible.slice(0, lead.exclusive ? 1 : lead.maxRecipients).map((p) => p.orgId);
  lead.recipients = chosen;
  for (const id of chosen) lead.history.push({ orgId: id, action: 'delivered', at: now.toISOString() });
  return chosen;
}
