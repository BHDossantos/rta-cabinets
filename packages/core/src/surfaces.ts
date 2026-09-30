/**
 * Renovation surface quantities (spec section 10). Formulas and assumptions are
 * returned alongside the result so the estimate can show them.
 */
import type { DesignDocument, SurfaceSelection } from './design';
import { polygonArea, wallsOf } from './geometry';
import { DomainError } from './errors';
import { ceilSafe, roundTo, sqMmToSqFt } from './units';

export interface PackCalculation {
  surfaceId: string;
  areaSqFt: number;
  wasteBp: number;
  requiredSqFt: number;
  coveragePerUnitSqFt: number;
  units: number;
  purchasedCoverageSqFt: number;
  formula: string;
}

/** ceil(area × (1 + waste) × coats / coverage) with explicit rounding (Example B). */
export function packsFor(areaSqFt: number, coveragePerUnitSqFt: number, wasteBp = 0, coats = 1): Omit<PackCalculation, 'surfaceId'> {
  if (coveragePerUnitSqFt <= 0) throw new DomainError('validation', 'Coverage per unit must be positive');
  if (areaSqFt < 0 || wasteBp < 0 || coats < 1) throw new DomainError('validation', 'Invalid area, waste or coats');
  const requiredSqFt = roundTo(areaSqFt * coats * (1 + wasteBp / 10_000), 4);
  const units = ceilSafe(requiredSqFt / coveragePerUnitSqFt);
  const purchasedCoverageSqFt = roundTo(units * coveragePerUnitSqFt, 4);
  const coatText = coats > 1 ? ` × ${coats} coats` : '';
  return {
    areaSqFt: roundTo(areaSqFt, 4), wasteBp, requiredSqFt, coveragePerUnitSqFt, units, purchasedCoverageSqFt,
    formula: `ceil(${roundTo(areaSqFt, 2)} sq ft${coatText} × (1 + ${wasteBp / 100}% waste) = ${roundTo(requiredSqFt, 2)} ÷ ${coveragePerUnitSqFt} sq ft/unit) = ${units} units (${roundTo(purchasedCoverageSqFt, 2)} sq ft)`,
  };
}

export const floorAreaSqFt = (design: DesignDocument): number => sqMmToSqFt(polygonArea(design.room.outline));

/** Selected wall area minus openings (doors, windows). Requires a known ceiling height. */
export function wallAreaSqFt(design: DesignDocument, wallIds?: string[]): number {
  const h = design.room.ceilingHeightMm;
  if (h === null) throw new DomainError('validation', 'Ceiling height is required to calculate wall area');
  const walls = wallsOf(design.room.outline).filter((w) => !wallIds || wallIds.includes(w.id));
  const ids = new Set(walls.map((w) => w.id));
  const gross = walls.reduce((s, w) => s + w.lengthMm * h, 0);
  const openings = design.openings
    .filter((o) => ids.has(o.wallId) && (o.kind === 'door' || o.kind === 'window'))
    .reduce((s, o) => s + o.widthMm * Math.min(o.heightMm, Math.max(0, h - o.sillMm)), 0);
  return sqMmToSqFt(Math.max(0, gross - openings));
}

export function surfaceQuantity(design: DesignDocument, surface: SurfaceSelection, coveragePerUnitSqFt: number): PackCalculation {
  let area: number;
  switch (surface.kind) {
    case 'flooring':
    case 'tile':
      area = floorAreaSqFt(design);
      break;
    case 'wall_covering':
    case 'paint':
    case 'backsplash':
      area = wallAreaSqFt(design, surface.wallIds);
      break;
    case 'countertop':
      throw new DomainError('validation', 'Countertops require templating review and are quoted, not pack-calculated');
  }
  return { surfaceId: surface.id, ...packsFor(area, coveragePerUnitSqFt, surface.wasteBp ?? 0, surface.kind === 'paint' ? surface.coats ?? 1 : 1) };
}
