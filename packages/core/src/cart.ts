/**
 * Design-to-cart (spec section 12, steps 1-6). Each cabinet instance expands into
 * its commercial components; lines are grouped by SKU and fulfillment stage while
 * retaining links to every design instance.
 */
import { type Catalog, type Dependency, getSku } from './catalog';
import type { DesignDocument } from './design';
import { surfaceQuantity, type PackCalculation } from './surfaces';

export interface CartLine {
  skuCode: string;
  quantity: number;
  stage: string;
  instanceIds: string[];
  source: 'design' | 'manual';
  role?: Dependency['role'] | 'body' | 'surface' | 'filler' | 'other';
}

export interface FlaggedSelection {
  refId: string;
  label: string;
  status: 'quote_required' | 'visualization_only';
}

export interface IncompleteSystem {
  instanceId: string;
  role: string;
  message: string;
}

export interface DesignExpansion {
  lines: CartLine[];
  flagged: FlaggedSelection[];
  incomplete: IncompleteSystem[];
  surfaceCalculations: PackCalculation[];
}

export function expandDesign(design: DesignDocument, catalog: Catalog): DesignExpansion {
  const raw: CartLine[] = [];
  const flagged: FlaggedSelection[] = [];
  const incomplete: IncompleteSystem[] = [];
  const surfaceCalculations: PackCalculation[] = [];

  for (const inst of design.instances) {
    const body = getSku(catalog, inst.skuCode);
    const role = body.kind === 'body' ? 'body' : body.kind === 'filler' ? 'filler' : 'other';
    if (body.purchasability !== 'purchasable') {
      flagged.push({ refId: inst.id, label: body.name, status: body.purchasability });
      continue;
    }
    raw.push({ skuCode: body.code, quantity: 1, stage: body.fulfillmentStage, instanceIds: [inst.id], source: 'design', role });
    for (const dep of body.dependencies ?? []) {
      if (dep.includedInKit) continue; // Kit contents are never duplicated.
      const chosen = dep.role === 'front' ? inst.frontSkuCode : dep.role === 'hinge' ? inst.hingeSkuCode : dep.role === 'handle' ? inst.handleSkuCode : undefined;
      if (!chosen) {
        incomplete.push({ instanceId: inst.id, role: dep.role, message: `${body.code} requires ${dep.quantity} × ${dep.role}` });
        continue;
      }
      const part = getSku(catalog, chosen);
      if (part.purchasability !== 'purchasable') {
        flagged.push({ refId: inst.id, label: part.name, status: part.purchasability });
        continue;
      }
      raw.push({ skuCode: part.code, quantity: dep.quantity, stage: part.fulfillmentStage, instanceIds: [inst.id], source: 'design', role: dep.role });
    }
  }

  for (const s of design.surfaces) {
    if (s.purchasability !== 'purchasable' || !s.skuCode) {
      flagged.push({ refId: s.id, label: s.label, status: s.purchasability === 'purchasable' ? 'quote_required' : s.purchasability });
      continue;
    }
    const sku = getSku(catalog, s.skuCode);
    if (!sku.coverageSqFt) {
      flagged.push({ refId: s.id, label: s.label, status: 'quote_required' });
      continue;
    }
    const calc = surfaceQuantity(design, s, sku.coverageSqFt);
    surfaceCalculations.push(calc);
    raw.push({ skuCode: sku.code, quantity: calc.units, stage: sku.fulfillmentStage, instanceIds: [s.id], source: 'design', role: 'surface' });
  }

  return { lines: groupLines(raw), flagged, incomplete, surfaceCalculations };
}

export function groupLines(lines: CartLine[]): CartLine[] {
  const map = new Map<string, CartLine>();
  for (const l of lines) {
    const key = `${l.skuCode}|${l.stage}|${l.source}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += l.quantity;
      existing.instanceIds = [...new Set([...existing.instanceIds, ...l.instanceIds])].sort();
    } else map.set(key, { ...l, instanceIds: [...l.instanceIds].sort() });
  }
  return [...map.values()].sort((a, b) => a.stage.localeCompare(b.stage) || a.skuCode.localeCompare(b.skuCode));
}

export interface Divergence {
  skuCode: string;
  designQuantity: number;
  cartQuantity: number;
}

export interface CartComparison {
  matchesDesign: boolean;
  divergences: Divergence[];
  /** Required components removed from the cart (AC12.4, QA05). */
  incompleteSystems: { skuCode: string; role: string; missingQuantity: number; instanceIds: string[] }[];
}

/**
 * Compare an edited cart against the design expansion. Never imply modified cart
 * contents still match the drawing (spec section 12, step 6).
 */
export function compareCartToDesign(cart: CartLine[], expansion: DesignExpansion): CartComparison {
  const qty = (lines: CartLine[]) => {
    const m = new Map<string, number>();
    for (const l of lines) m.set(l.skuCode, (m.get(l.skuCode) ?? 0) + l.quantity);
    return m;
  };
  const d = qty(expansion.lines);
  const c = qty(cart);
  const divergences: Divergence[] = [];
  for (const code of [...new Set([...d.keys(), ...c.keys()])].sort()) {
    const dq = d.get(code) ?? 0, cq = c.get(code) ?? 0;
    if (dq !== cq) divergences.push({ skuCode: code, designQuantity: dq, cartQuantity: cq });
  }
  const incompleteSystems = expansion.lines
    .filter((l) => l.role && l.role !== 'body' && l.role !== 'surface' && l.role !== 'other' && l.role !== 'filler')
    .flatMap((l) => {
      const missing = l.quantity - (c.get(l.skuCode) ?? 0);
      return missing > 0 ? [{ skuCode: l.skuCode, role: l.role!, missingQuantity: missing, instanceIds: l.instanceIds }] : [];
    });
  return { matchesDesign: divergences.length === 0, divergences, incompleteSystems };
}
