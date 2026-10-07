/**
 * Door-style collections and the 10x10 price benchmark (competitive research:
 * most cabinet sites group fronts into collections; the best show a "10x10
 * kitchen" price per collection so shoppers can compare value). The 10x10 is
 * priced by the same server pricing engine as every cart, from a published,
 * fixed list of cabinets, so it can never drift from real prices.
 */
import { type Catalog, type Sku, isCompatible } from './catalog';

export interface Collection {
  id: string;
  name: string;
  doorStyle: 'shaker' | 'slab' | 'raised_panel';
  /** Matches `Sku.finish` on the collection's fronts. */
  finish: string;
  material: Sku['material'];
  swatchHex: string;
  description: string;
  sampleSkuCode?: string;
  /** Made-to-order front lead time in business days; null until the factory confirms (D18). */
  frontLeadTimeDays: { min: number; max: number } | null;
  exteriorRated?: boolean;
}

/**
 * The published 10x10 composition: an L-shaped kitchen with two 10-foot walls.
 * Cabinets only: no fillers, moldings, countertops, appliances, freight or tax.
 * SYNTHETIC until the factory approves its own list (D16).
 */
export const TEN_BY_TEN: { bodyCode: string; quantity: number; label: string }[] = [
  { bodyCode: 'B36', quantity: 2, label: '36" base cabinet' },
  { bodyCode: 'B30', quantity: 2, label: '30" base cabinet' },
  { bodyCode: 'B48', quantity: 1, label: '48" base / sink base cabinet' },
  { bodyCode: 'W36', quantity: 3, label: '36" wall cabinet' },
  { bodyCode: 'W30', quantity: 2, label: '30" wall cabinet' },
];

export interface TenByTenResult {
  lines: { skuCode: string; quantity: number }[];
  /** Cabinets in the composition this collection cannot supply (no matching front). */
  missing: { bodyCode: string; reason: string }[];
}

/** Find the active front of this collection that fits a body exactly. */
export function frontFor(collection: Collection, body: Sku, catalog: Catalog): Sku | undefined {
  return [...catalog.skus.values()].find((s) =>
    s.kind === 'front' && s.status === 'active' && s.finish === collection.finish &&
    Math.abs(s.dimensions.widthMm - body.dimensions.widthMm) < 1 && isCompatible(body, s));
}

export function tenByTenLines(collection: Collection, catalog: Catalog, hingeCode = 'HK-STD'): TenByTenResult {
  const counts = new Map<string, number>();
  const missing: TenByTenResult['missing'] = [];
  const add = (code: string, q: number) => counts.set(code, (counts.get(code) ?? 0) + q);
  for (const item of TEN_BY_TEN) {
    const body = catalog.skus.get(item.bodyCode);
    if (!body || body.status !== 'active') {
      missing.push({ bodyCode: item.bodyCode, reason: 'Cabinet not available' });
      continue;
    }
    const front = frontFor(collection, body, catalog);
    if (!front) {
      missing.push({ bodyCode: item.bodyCode, reason: `No ${collection.name} front for this cabinet` });
      continue;
    }
    add(body.code, item.quantity);
    add(front.code, item.quantity);
    if (body.dependencies?.some((d) => d.role === 'hinge' && !d.includedInKit)) add(hingeCode, item.quantity);
  }
  return { lines: [...counts].map(([skuCode, quantity]) => ({ skuCode, quantity })).sort((a, b) => a.skuCode.localeCompare(b.skuCode)), missing };
}
