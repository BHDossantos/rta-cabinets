/**
 * Versioned layout rule engine (spec section 9). The same engine validates manual
 * edits and generated layouts. Results are deterministic for identical inputs,
 * catalog version and ruleset version (AC09.4).
 */
import { type Catalog, isCompatible } from './catalog';
import type { DesignDocument, DesignInstance } from './design';
import {
  checkOutline, convexOverlap, footprintOnWall, intervalsOverlap, quadInsideRoom, wallsOf,
  type Point, type WallSegment, EPS_MM,
} from './geometry';
import { formatLength } from './units';

export type Severity = 'blocker' | 'review_required' | 'advisory';

export interface RuleDefinition {
  id: string;
  version: number;
  severity: Severity;
  description: string;
  source: string;
  parameters: Record<string, number>;
  /** Role allowed to override; null = cannot be overridden. */
  overrideRole: string | null;
}

export interface Ruleset {
  version: string;
  effectiveDate: string;
  rules: RuleDefinition[];
}

export interface ValidationResult {
  ruleId: string;
  ruleVersion: number;
  severity: Severity;
  objectIds: string[];
  message: string;
  suggestion?: string;
}

export interface Override {
  ruleId: string;
  objectIds: string[];
  reviewerId: string;
  reviewerRole: string;
  reason: string;
  at: string;
}

export type FitStatus = 'verified' | 'incomplete' | 'failed';

export interface ValidationReport {
  rulesetVersion: string;
  catalogVersion: string;
  fitStatus: FitStatus;
  results: ValidationResult[];
  /** Overridden results are retained (spec: "retained original warning"). */
  overridden: { result: ValidationResult; override: Override }[];
  counts: Record<Severity, number>;
}

/**
 * Default ruleset. Numeric parameters are SYNTHETIC FIXTURES pending factory and
 * appliance documentation (D16, D19); they are data, not engineering truth.
 */
export const DEFAULT_RULESET: Ruleset = {
  version: '2026.09.0-fixture',
  effectiveDate: '2026-09-30',
  rules: [
    r('room.outline', 'blocker', 'Room outline must be closed and non-self-intersecting'),
    r('room.ceiling_known', 'review_required', 'Ceiling height must be measured before fit can be verified', 'designer'),
    r('sku.active', 'blocker', 'Only active SKUs can be placed in a purchasable design'),
    r('sku.pro_only', 'blocker', 'Pro-only SKU requires trade entitlement'),
    r('wall.exists', 'blocker', 'Object must reference a wall of the room'),
    r('wall.fit', 'blocker', 'Object must fit within its wall length'),
    r('room.contains', 'blocker', 'Object must be inside the room (not embedded in a wall)'),
    r('collision', 'blocker', 'Objects must not overlap'),
    r('opening.door', 'blocker', 'Base and tall units cannot block a door opening'),
    r('opening.window', 'blocker', 'Units cannot overlap a window opening'),
    r('ceiling.height', 'blocker', 'Unit top must be below the ceiling'),
    r('appliance.dimensions', 'review_required', 'Appliance dimensions are unknown', 'designer'),
    r('mounting.base_on_floor', 'advisory', 'Base units are expected at floor level'),
    r('mounting.wall_clearance', 'review_required', 'Wall units need clearance above base units', 'designer', { minClearanceMm: 457 }),
    r('compat.front_required', 'review_required', 'Body requires a compatible front', 'designer'),
    r('compat.front', 'blocker', 'Front must be compatible with body'),
    r('compat.hinge', 'blocker', 'Hinge must be compatible with body'),
    r('material.exterior', 'blocker', 'Exterior rooms require exterior-rated products'),
    r('run.gap', 'advisory', 'Small gaps along a run usually need a filler', undefined, { maxGapMm: 152 }),
  ],
};

function r(id: string, severity: Severity, description: string, overrideRole: string | null = null, parameters: Record<string, number> = {}): RuleDefinition {
  return { id, version: 1, severity, description, source: 'fixture', parameters, overrideRole };
}

interface Placed {
  id: string;
  kind: 'instance' | 'appliance';
  wall: WallSegment;
  offsetMm: number;
  widthMm: number;
  depthMm: number;
  elevationMm: number;
  heightMm: number;
  mounting: string;
  quad: Point[];
}

export interface ValidateOptions {
  ruleset?: Ruleset;
  overrides?: Override[];
  /** Whether the viewer has trade entitlement (server-derived, never client-supplied). */
  tradeEntitled?: boolean;
}

export function validateDesign(design: DesignDocument, catalog: Catalog, opts: ValidateOptions = {}): ValidationReport {
  const ruleset = opts.ruleset ?? DEFAULT_RULESET;
  const rules = new Map(ruleset.rules.map((x) => [x.id, x]));
  const results: ValidationResult[] = [];
  const unit = 'in' as const;
  const emit = (ruleId: string, objectIds: string[], message: string, suggestion?: string) => {
    const rule = rules.get(ruleId);
    if (!rule) return; // Rule disabled in this ruleset.
    results.push({ ruleId, ruleVersion: rule.version, severity: rule.severity, objectIds: [...objectIds].sort(), message, suggestion });
  };

  const outline = checkOutline(design.room.outline);
  if (!outline.valid) {
    for (const p of outline.problems) emit('room.outline', [design.room.id], p, 'Re-measure and close the room outline');
    return finalize(results, ruleset, design, opts.overrides);
  }
  if (design.room.ceilingHeightMm === null || design.room.ceilingSource !== 'measured') {
    emit('room.ceiling_known', [design.room.id], design.room.ceilingHeightMm === null
      ? 'Ceiling height is unknown'
      : 'Ceiling height is a suggestion, not a measurement', 'Enter the measured ceiling height');
  }

  const walls = wallsOf(design.room.outline);
  const wallById = new Map(walls.map((w) => [w.id, w]));
  const placed: Placed[] = [];

  for (const inst of design.instances) {
    const sku = catalog.skus.get(inst.skuCode);
    if (!sku) {
      emit('sku.active', [inst.id], `SKU ${inst.skuCode} is not in catalog ${catalog.version}`, 'Choose an active replacement');
      continue;
    }
    if (sku.status !== 'active') {
      emit('sku.active', [inst.id], `${sku.name} (${sku.code}) is ${sku.status}`,
        sku.replacementCodes?.length ? `Approved replacements: ${sku.replacementCodes.join(', ')}` : 'Choose an active SKU');
    }
    if (sku.proOnly && !opts.tradeEntitled) emit('sku.pro_only', [inst.id], `${sku.code} is available to Pro members only`);
    if (design.room.exposure === 'exterior' && !sku.exteriorRated) {
      emit('material.exterior', [inst.id], `${sku.code} is not rated for exterior use`, 'Choose an exterior-rated product');
    }
    checkCompatibility(inst, catalog, emit);

    const wall = wallById.get(inst.wallId);
    if (!wall) {
      emit('wall.exists', [inst.id], `Wall ${inst.wallId} does not exist`, 'Place the unit on an existing wall');
      continue;
    }
    const { widthMm, depthMm, heightMm } = sku.dimensions;
    placed.push({
      id: inst.id, kind: 'instance', wall, offsetMm: inst.offsetMm, widthMm, depthMm,
      elevationMm: inst.elevationMm, heightMm, mounting: sku.mounting,
      quad: footprintOnWall(wall, inst.offsetMm, widthMm, depthMm),
    });
    if (sku.mounting === 'base' && Math.abs(inst.elevationMm) > EPS_MM) {
      emit('mounting.base_on_floor', [inst.id], `${sku.code} is raised ${formatLength(inst.elevationMm, unit)} off the floor`);
    }
  }

  for (const app of design.appliances) {
    const wall = wallById.get(app.wallId);
    if (app.widthMm === null || app.depthMm === null || app.heightMm === null) {
      emit('appliance.dimensions', [app.id], `${app.kind} dimensions are unknown; fit cannot be verified`, 'Enter the appliance specification dimensions');
    }
    if (!wall) {
      emit('wall.exists', [app.id], `Wall ${app.wallId} does not exist`);
      continue;
    }
    if (app.widthMm !== null) {
      const depth = app.depthMm ?? 0;
      placed.push({
        id: app.id, kind: 'appliance', wall, offsetMm: app.offsetMm, widthMm: app.widthMm, depthMm: depth,
        elevationMm: app.elevationMm, heightMm: app.heightMm ?? 0, mounting: 'appliance',
        quad: footprintOnWall(wall, app.offsetMm, app.widthMm, Math.max(depth, 1)),
      });
    }
  }

  const ceiling = design.room.ceilingHeightMm;
  for (const p of placed) {
    if (p.offsetMm < -EPS_MM || p.offsetMm + p.widthMm > p.wall.lengthMm + EPS_MM) {
      const over = Math.max(-p.offsetMm, p.offsetMm + p.widthMm - p.wall.lengthMm);
      emit('wall.fit', [p.id], `Extends ${formatLength(over, unit)} beyond wall ${p.wall.id} (${formatLength(p.wall.lengthMm, unit)})`,
        'Move, replace with a narrower approved size, or adjust fillers');
    } else if (p.depthMm > 0 && !quadInsideRoom(p.quad, design.room.outline)) {
      emit('room.contains', [p.id], 'Unit footprint extends outside the room', 'Move the unit so it sits fully inside the room');
    }
    if (ceiling !== null && p.heightMm > 0 && p.elevationMm + p.heightMm > ceiling + EPS_MM) {
      emit('ceiling.height', [p.id], `Top at ${formatLength(p.elevationMm + p.heightMm, unit)} exceeds ceiling ${formatLength(ceiling, unit)}`);
    }
    for (const o of design.openings) {
      if (o.wallId !== p.wall.id) continue;
      if (!intervalsOverlap(p.offsetMm, p.offsetMm + p.widthMm, o.offsetMm, o.offsetMm + o.widthMm)) continue;
      const vertical = intervalsOverlap(p.elevationMm, p.elevationMm + p.heightMm, o.sillMm, o.sillMm + o.heightMm);
      if (o.kind === 'door' && (p.mounting === 'base' || p.mounting === 'tall' || p.kind === 'appliance')) {
        emit('opening.door', [p.id, o.id], `Blocks door ${o.id}`, 'Move the unit clear of the door');
      } else if (o.kind !== 'door' && vertical) {
        emit('opening.window', [p.id, o.id], `Overlaps ${o.kind} ${o.id}`, 'Move the unit or choose a shorter unit');
      }
    }
  }

  // Pairwise collisions (2D footprint + vertical overlap), deterministic order.
  const sorted = [...placed].sort((a, b) => a.id.localeCompare(b.id));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!, b = sorted[j]!;
      if (!intervalsOverlap(a.elevationMm, a.elevationMm + Math.max(a.heightMm, 1), b.elevationMm, b.elevationMm + Math.max(b.heightMm, 1))) continue;
      if (convexOverlap(a.quad, b.quad)) emit('collision', [a.id, b.id], `${a.id} overlaps ${b.id}`, 'Move one of the objects');
    }
  }

  // Wall-unit clearance above base units on the same wall.
  const minClear = rules.get('mounting.wall_clearance')?.parameters.minClearanceMm ?? 0;
  for (const w of placed.filter((p) => p.mounting === 'wall')) {
    for (const b of placed.filter((p) => p.mounting === 'base' && p.wall.id === w.wall.id)) {
      if (!intervalsOverlap(w.offsetMm, w.offsetMm + w.widthMm, b.offsetMm, b.offsetMm + b.widthMm)) continue;
      const gap = w.elevationMm - (b.elevationMm + b.heightMm);
      if (gap >= 0 && gap < minClear - EPS_MM) {
        emit('mounting.wall_clearance', [w.id, b.id], `Only ${formatLength(gap, unit)} above base unit ${b.id}`);
      }
    }
  }

  // Gaps along each wall run (base level) that likely need a filler.
  const maxGap = rules.get('run.gap')?.parameters.maxGapMm ?? 0;
  for (const wall of walls) {
    const run = placed
      .filter((p) => p.wall.id === wall.id && (p.mounting === 'base' || p.mounting === 'tall' || p.kind === 'appliance') && p.elevationMm < EPS_MM)
      .sort((a, b) => a.offsetMm - b.offsetMm);
    for (let i = 1; i < run.length; i++) {
      const prev = run[i - 1]!, cur = run[i]!;
      const gap = cur.offsetMm - (prev.offsetMm + prev.widthMm);
      if (gap > EPS_MM && gap <= maxGap) {
        emit('run.gap', [prev.id, cur.id], `${formatLength(gap, unit)} gap between ${prev.id} and ${cur.id}`, 'Add an approved filler or close the gap');
      }
    }
  }

  return finalize(results, ruleset, design, opts.overrides);
}

function checkCompatibility(
  inst: DesignInstance, catalog: Catalog,
  emit: (ruleId: string, ids: string[], msg: string, suggestion?: string) => void,
) {
  const body = catalog.skus.get(inst.skuCode);
  if (!body) return;
  const needsFront = body.dependencies?.some((d) => d.role === 'front' && !d.includedInKit);
  if (inst.frontSkuCode) {
    const front = catalog.skus.get(inst.frontSkuCode);
    if (!front || front.status !== 'active') emit('compat.front', [inst.id], `Front ${inst.frontSkuCode} is not available`);
    else if (!isCompatible(body, front)) emit('compat.front', [inst.id], `Front ${front.code} is not compatible with ${body.code}`, 'Choose a front approved for this body');
  } else if (needsFront) {
    emit('compat.front_required', [inst.id], `${body.code} has no front selected; the system is incomplete`, 'Select a compatible front');
  }
  if (inst.hingeSkuCode) {
    const hinge = catalog.skus.get(inst.hingeSkuCode);
    if (!hinge || hinge.status !== 'active' || !isCompatible(body, hinge)) {
      emit('compat.hinge', [inst.id], `Hinge ${inst.hingeSkuCode} is not compatible with ${body.code}`);
    }
  }
}

function finalize(results: ValidationResult[], ruleset: Ruleset, design: DesignDocument, overrides: Override[] = []): ValidationReport {
  const rules = new Map(ruleset.rules.map((x) => [x.id, x]));
  const key = (x: { ruleId: string; objectIds: string[] }) => `${x.ruleId}|${[...x.objectIds].sort().join(',')}`;
  const active: ValidationResult[] = [];
  const overridden: ValidationReport['overridden'] = [];
  for (const res of results) {
    const ov = overrides.find((o) => key(o) === key(res));
    const rule = rules.get(res.ruleId);
    if (ov && rule?.overrideRole && rule.overrideRole === ov.reviewerRole && ov.reason.trim()) overridden.push({ result: res, override: ov });
    else active.push(res);
  }
  const order: Record<Severity, number> = { blocker: 0, review_required: 1, advisory: 2 };
  active.sort((a, b) => order[a.severity] - order[b.severity] || a.ruleId.localeCompare(b.ruleId) || a.objectIds.join().localeCompare(b.objectIds.join()) || a.message.localeCompare(b.message));
  const counts = { blocker: 0, review_required: 0, advisory: 0 } as Record<Severity, number>;
  for (const x of active) counts[x.severity]++;
  const fitStatus: FitStatus = counts.blocker > 0 ? 'failed' : counts.review_required > 0 ? 'incomplete' : 'verified';
  return { rulesetVersion: ruleset.version, catalogVersion: design.catalogVersion, fitStatus, results: active, overridden, counts };
}
