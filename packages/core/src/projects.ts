/**
 * Projects, immutable revisions, approvals and manufacturing release gates
 * (spec sections 6, 11, 19, 23, Example E).
 */
import type { DesignDocument } from './design';
import { DomainError } from './errors';

export interface Revision {
  projectId: string;
  number: number;
  document: DesignDocument;
  contentHash: string;
  createdBy: string;
  createdAt: string;
}

export interface Approval {
  id: string;
  projectId: string;
  revisionNumber: number;
  contentHash: string;
  quoteId: string;
  quoteTotalCents: number;
  approvedBy: string;
  approvedAt: string;
}

export interface Project {
  id: string;
  ownerType: 'user' | 'organization' | 'guest';
  ownerId: string;
  name: string;
  revisions: Revision[];
  approvedRevision: number | null;
  approvals: Approval[];
}

/**
 * Save a new immutable revision with optimistic concurrency. The caller supplies
 * the revision it edited; a stale base is rejected so two tabs cannot silently
 * overwrite each other (AC06.3).
 */
export function saveRevision(
  project: Project, baseRevision: number, document: DesignDocument, contentHash: string, actorId: string, now: Date,
): Revision {
  const latest = project.revisions.at(-1)?.number ?? 0;
  if (baseRevision !== latest) {
    throw new DomainError('conflict', 'Project was changed elsewhere', { baseRevision, latestRevision: latest });
  }
  const rev: Revision = { projectId: project.id, number: latest + 1, document: structuredClone(document), contentHash, createdBy: actorId, createdAt: now.toISOString() };
  project.revisions.push(rev);
  return rev;
}

export function getRevision(project: Project, n: number): Revision {
  const r = project.revisions.find((x) => x.number === n);
  if (!r) throw new DomainError('not_found', `Revision ${n} not found`);
  return r;
}

/** Record approval of an exact revision + quote (spec 11 step 6). */
export function recordApproval(project: Project, approval: Omit<Approval, 'contentHash' | 'projectId'>): Approval {
  const rev = getRevision(project, approval.revisionNumber);
  const full: Approval = { ...approval, projectId: project.id, contentHash: rev.contentHash };
  project.approvals.push(full);
  project.approvedRevision = rev.number;
  return full;
}

export interface ReleaseGateInput {
  project: Project;
  orderRevisionNumber: number;
  orderContentHash: string;
  paymentState: string;
  approvedCreditPolicy?: boolean;
  factoryReviewCleared: boolean;
  blockersOutstanding: number;
  productionIneligibleSkus: string[];
}

export interface GateResult {
  ok: boolean;
  failures: string[];
}

/**
 * Manufacturing release requires commercial, design and factory gates (AC11.4,
 * Example E). The latest draft is never released in place of the approved revision.
 */
export function releaseGate(input: ReleaseGateInput): GateResult {
  const failures: string[] = [];
  const { project } = input;
  if (project.approvedRevision === null) failures.push('design_not_approved');
  else if (project.approvedRevision !== input.orderRevisionNumber) failures.push('order_revision_differs_from_approved');
  const approval = project.approvals.findLast((a) => a.revisionNumber === input.orderRevisionNumber);
  if (!approval) failures.push('no_customer_approval_for_revision');
  else if (approval.contentHash !== input.orderContentHash) failures.push('approved_content_changed');
  if (!(input.paymentState === 'paid' || input.paymentState === 'partially_refunded' || input.approvedCreditPolicy)) failures.push('payment_not_settled');
  if (!input.factoryReviewCleared) failures.push('factory_review_pending');
  if (input.blockersOutstanding > 0) failures.push('validation_blockers');
  if (input.productionIneligibleSkus.length) failures.push(`production_ineligible:${input.productionIneligibleSkus.join(',')}`);
  return { ok: failures.length === 0, failures };
}

/** Which approval-relevant fields changed between revisions (spec 11 step 6 reopen rule). */
export function materialChanges(a: DesignDocument, b: DesignDocument): string[] {
  const changes: string[] = [];
  if (JSON.stringify(a.room.outline) !== JSON.stringify(b.room.outline) || a.room.ceilingHeightMm !== b.room.ceilingHeightMm) changes.push('dimensions');
  const sig = (d: DesignDocument) => d.instances.map((i) => `${i.id}:${i.skuCode}:${i.wallId}:${i.offsetMm}:${i.elevationMm}`).sort().join('|');
  if (sig(a) !== sig(b)) changes.push('cabinets');
  const fronts = (d: DesignDocument) => d.instances.map((i) => `${i.id}:${i.frontSkuCode ?? ''}:${i.hingeSkuCode ?? ''}:${i.handleSkuCode ?? ''}`).sort().join('|');
  if (fronts(a) !== fronts(b)) changes.push('fronts_or_hardware');
  if (JSON.stringify(a.appliances) !== JSON.stringify(b.appliances)) changes.push('appliances');
  if (JSON.stringify(a.surfaces) !== JSON.stringify(b.surfaces)) changes.push('materials');
  return changes;
}
