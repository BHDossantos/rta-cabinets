/**
 * Catalog and factory master data (spec section 7). Dimensions are canonical mm.
 * The factory's approved size matrix is loaded as data; nothing here assumes
 * industry-standard sizes as production truth.
 */
import { DomainError } from './errors';

export type MaterialFamily = 'plywood' | 'wood' | 'pvc' | 'aluminum' | 'mdf' | 'other';
export type SkuKind =
  | 'body'
  | 'front'
  | 'hardware'
  | 'filler'
  | 'panel'
  | 'accessory'
  | 'sample'
  | 'surface'
  | 'appliance_placeholder';
export type Mounting = 'base' | 'wall' | 'tall' | 'none';
export type FulfillmentStage = 'A' | 'B' | 'samples' | 'third_party';
export type Purchasability = 'purchasable' | 'quote_required' | 'visualization_only';
export type SkuStatus = 'draft' | 'active' | 'discontinued' | 'archived';

export interface Dimensions {
  widthMm: number;
  depthMm: number;
  heightMm: number;
}

export interface Dependency {
  /** Component requirement expressed as a role (e.g. 'front', 'hinge') filled by a compatible SKU. */
  role: 'front' | 'hinge' | 'handle' | 'toe_kick' | 'end_panel' | 'mounting_rail';
  quantity: number;
  /** When the dependency ships as part of a kit already, do not add a separate line. */
  includedInKit?: boolean;
}

export interface Sku {
  code: string;
  familyId: string;
  name: string;
  kind: SkuKind;
  status: SkuStatus;
  mounting: Mounting;
  dimensions: Dimensions;
  material: MaterialFamily;
  finish?: string;
  style?: string;
  hand?: 'left' | 'right' | 'none' | 'reversible';
  proOnly?: boolean;
  purchasability: Purchasability;
  fulfillmentStage: FulfillmentStage;
  /** Retail price in minor units; trade prices come from price books. */
  retailPrice: number | null;
  images: string[];
  taxCategory: string;
  packed?: { weightKg: number; packages: number; freightOnly: boolean };
  dependencies?: Dependency[];
  /** Codes of body families this front/hinge is compatible with. */
  compatibleWith?: string[];
  /** Mandatory factory fields; missing ones block production eligibility (not viewing). */
  factory?: { bomRevision?: string; panelThicknessMm?: number; edgeTreatment?: string };
  exteriorRated?: boolean;
  /** Coverage per unit of sale for surface products, square feet. */
  coverageSqFt?: number;
  replacementCodes?: string[];
}

export interface Catalog {
  version: string;
  skus: Map<string, Sku>;
}

export function createCatalog(version: string, skus: Sku[]): Catalog {
  const map = new Map<string, Sku>();
  for (const s of skus) {
    if (map.has(s.code)) throw new DomainError('validation', `Duplicate SKU ${s.code}`);
    map.set(s.code, s);
  }
  return { version, skus: map };
}

export function getSku(catalog: Catalog, code: string): Sku {
  const sku = catalog.skus.get(code);
  if (!sku) throw new DomainError('not_found', `Unknown SKU ${code}`, { code });
  return sku;
}

/** A missing mandatory factory field blocks production eligibility even if viewable. */
export function productionEligibility(sku: Sku): { eligible: boolean; missing: string[] } {
  const missing: string[] = [];
  if (sku.kind === 'body' || sku.kind === 'front' || sku.kind === 'panel' || sku.kind === 'filler') {
    if (!sku.factory?.bomRevision) missing.push('factory.bomRevision');
    if (!sku.factory?.panelThicknessMm) missing.push('factory.panelThicknessMm');
    if (!sku.factory?.edgeTreatment) missing.push('factory.edgeTreatment');
  }
  if (sku.retailPrice === null && sku.purchasability === 'purchasable') missing.push('retailPrice');
  if (sku.status !== 'active') missing.push('status:active');
  return { eligible: missing.length === 0, missing };
}

/** Front/hinge compatibility with a body (spec section 10, material compatibility). */
export function isCompatible(body: Sku, part: Sku): boolean {
  if (!part.compatibleWith || part.compatibleWith.length === 0) return false;
  return part.compatibleWith.includes(body.familyId) || part.compatibleWith.includes(body.code);
}

// ---------------------------------------------------------------------------
// Staged CSV import (spec section 7, "Catalog import and publication")
// ---------------------------------------------------------------------------

export const CSV_COLUMNS = [
  'code', 'family_id', 'name', 'kind', 'status', 'mounting', 'width_mm', 'depth_mm', 'height_mm',
  'material', 'finish', 'purchasability', 'fulfillment_stage', 'retail_price_cents', 'images',
  'tax_category', 'bom_revision', 'panel_thickness_mm', 'edge_treatment', 'compatible_with', 'pro_only',
] as const;

export interface ImportIssue {
  row: number;
  code?: string;
  field?: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface ImportReport {
  accepted: Sku[];
  issues: ImportIssue[];
  added: string[];
  changed: string[];
  priceChanges: { code: string; from: number | null; to: number | null }[];
  requiresApproval: boolean;
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

const KINDS: SkuKind[] = ['body', 'front', 'hardware', 'filler', 'panel', 'accessory', 'sample', 'surface', 'appliance_placeholder'];
const MOUNTINGS: Mounting[] = ['base', 'wall', 'tall', 'none'];
const MATERIALS: MaterialFamily[] = ['plywood', 'wood', 'pvc', 'aluminum', 'mdf', 'other'];
const STAGES: FulfillmentStage[] = ['A', 'B', 'samples', 'third_party'];
const PURCH: Purchasability[] = ['purchasable', 'quote_required', 'visualization_only'];
const STATUSES: SkuStatus[] = ['draft', 'active', 'discontinued', 'archived'];

/**
 * Stage an import against the currently published catalog. Nothing is published
 * here: the report lists errors, diffs and whether price approval is required.
 */
export function stageImport(csv: string, current?: Catalog): ImportReport {
  const rows = parseCsv(csv);
  const issues: ImportIssue[] = [];
  const accepted: Sku[] = [];
  const report: ImportReport = { accepted, issues, added: [], changed: [], priceChanges: [], requiresApproval: false };
  if (rows.length === 0) {
    issues.push({ row: 0, severity: 'error', message: 'File is empty' });
    return report;
  }
  const header = rows[0]!.map((h) => h.trim());
  for (const col of CSV_COLUMNS) {
    if (!header.includes(col)) issues.push({ row: 1, field: col, severity: 'error', message: `Missing column ${col}` });
  }
  if (issues.length) return report;

  const seen = new Set<string>();
  rows.slice(1).forEach((cells, idx) => {
    const rowNo = idx + 2;
    const get = (c: (typeof CSV_COLUMNS)[number]) => (cells[header.indexOf(c)] ?? '').trim();
    const code = get('code');
    const err = (field: string, message: string) => issues.push({ row: rowNo, code, field, severity: 'error', message });
    const before = issues.length;

    if (!code) err('code', 'SKU code is required');
    else if (seen.has(code)) err('code', `Duplicate SKU ${code} in file`);
    seen.add(code);

    const enumOf = <T extends string>(field: (typeof CSV_COLUMNS)[number], allowed: T[]): T => {
      const v = get(field) as T;
      if (!allowed.includes(v)) err(field, `Invalid ${field} "${v}"; expected one of ${allowed.join(', ')}`);
      return v;
    };
    const kind = enumOf('kind', KINDS);
    const status = enumOf('status', STATUSES);
    const mounting = enumOf('mounting', MOUNTINGS);
    const material = enumOf('material', MATERIALS);
    const purchasability = enumOf('purchasability', PURCH);
    const stage = enumOf('fulfillment_stage', STAGES);

    const dim = (field: 'width_mm' | 'depth_mm' | 'height_mm'): number => {
      const n = Number(get(field));
      if (!get(field) || !Number.isFinite(n) || n <= 0) err(field, `${field} must be a positive number`);
      return n;
    };
    const widthMm = dim('width_mm');
    const depthMm = dim('depth_mm');
    const heightMm = dim('height_mm');

    const priceRaw = get('retail_price_cents');
    let retailPrice: number | null = null;
    if (priceRaw) {
      const n = Number(priceRaw);
      if (!Number.isInteger(n) || n < 0) err('retail_price_cents', 'Price must be a non-negative integer in cents');
      else retailPrice = n;
    } else if (purchasability === 'purchasable') {
      err('retail_price_cents', 'Purchasable SKU is missing a price');
    }

    const images = get('images') ? get('images').split('|').map((s) => s.trim()).filter(Boolean) : [];
    if (images.length === 0 && status === 'active') {
      issues.push({ row: rowNo, code, field: 'images', severity: 'warning', message: 'Active SKU has no images' });
    }
    const compatibleWith = get('compatible_with') ? get('compatible_with').split('|').map((s) => s.trim()) : [];
    if ((kind === 'front' || kind === 'hardware') && compatibleWith.length === 0) {
      issues.push({ row: rowNo, code, field: 'compatible_with', severity: 'warning', message: 'No compatibility declared; part cannot be paired with any body' });
    }

    if (issues.slice(before).some((i) => i.severity === 'error')) return;
    const sku: Sku = {
      code, familyId: get('family_id'), name: get('name'), kind, status, mounting,
      dimensions: { widthMm, depthMm, heightMm }, material, finish: get('finish') || undefined,
      purchasability, fulfillmentStage: stage, retailPrice, images, taxCategory: get('tax_category') || 'general',
      factory: {
        bomRevision: get('bom_revision') || undefined,
        panelThicknessMm: get('panel_thickness_mm') ? Number(get('panel_thickness_mm')) : undefined,
        edgeTreatment: get('edge_treatment') || undefined,
      },
      compatibleWith, proOnly: get('pro_only') === 'true',
    };
    accepted.push(sku);
    const prev = current?.skus.get(code);
    if (!prev) report.added.push(code);
    else if (JSON.stringify(prev) !== JSON.stringify(sku)) {
      report.changed.push(code);
      if (prev.retailPrice !== sku.retailPrice) report.priceChanges.push({ code, from: prev.retailPrice, to: sku.retailPrice });
    }
  });
  report.requiresApproval = report.priceChanges.length > 0 || report.added.length > 0;
  return report;
}
