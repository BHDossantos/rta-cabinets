import { describe, expect, it } from 'vitest';
import { DEFAULT_RULESET, checkOutline, fixtureCatalog, outlineFromWalls, validateDesign } from '../src';
import { IN, exampleA, inst, room } from './helpers';

const catalog = fixtureCatalog();
const ids = (r: ReturnType<typeof validateDesign>, ruleId: string) => r.results.filter((x) => x.ruleId === ruleId).map((x) => x.objectIds);

describe('Example A — standard wall layout (spec 32)', () => {
  it('fits exactly on a 120" wall', () => {
    const report = validateDesign(exampleA(120), catalog);
    expect(report.counts.blocker).toBe(0);
    expect(report.fitStatus).toBe('verified');
  });

  it('fails on a 119" wall without shrinking any SKU', () => {
    const design = exampleA(119);
    const report = validateDesign(design, catalog);
    expect(report.fitStatus).toBe('failed');
    expect(ids(report, 'wall.fit')).toContainEqual(['fil-r']);
    // SKU dimensions are catalog truth; the engine never resizes a 36" body.
    expect(catalog.skus.get('B36')!.dimensions.widthMm).toBeCloseTo(IN(36), 9);
    expect(design.instances.find((i) => i.id === 'c1')!.skuCode).toBe('B36');
  });

  it('keeps a suggested 8-foot ceiling from verifying fit', () => {
    const d = exampleA(120);
    d.room.ceilingSource = 'suggested';
    const report = validateDesign(d, catalog);
    expect(report.fitStatus).toBe('incomplete');
    expect(ids(report, 'room.ceiling_known')).toHaveLength(1);
  });
});

describe('rule engine', () => {
  it('detects collisions (AC09.1) and reports rule versions', () => {
    const d = room(120);
    d.instances = [inst('a', 'B36', 0), inst('b', 'B36', 30)];
    const report = validateDesign(d, catalog);
    const col = report.results.find((r) => r.ruleId === 'collision')!;
    expect(col.objectIds).toEqual(['a', 'b']);
    expect(col.severity).toBe('blocker');
    expect(col.ruleVersion).toBe(1);
    expect(report.rulesetVersion).toBe(DEFAULT_RULESET.version);
  });

  it('detects corner collisions across walls', () => {
    const d = room(120, 120);
    d.instances = [inst('end-w1', 'B36', 84), { ...inst('start-w2', 'B36', 0), wallId: 'w2' }];
    expect(ids(validateDesign(d, catalog), 'collision')).toContainEqual(['end-w1', 'start-w2']);
  });

  it('does not treat touching cabinets as colliding', () => {
    const d = room(120);
    d.instances = [inst('a', 'B36', 0), inst('b', 'B36', 36)];
    expect(ids(validateDesign(d, catalog), 'collision')).toHaveLength(0);
  });

  it('never leaves a cabinet silently embedded in a wall after a room edit (AC08.2, QA02)', () => {
    const d = room(120);
    d.instances = [inst('a', 'B48', 72)];
    expect(validateDesign(d, catalog).counts.blocker).toBe(0);
    const shrunk = room(100);
    shrunk.instances = d.instances;
    expect(ids(validateDesign(shrunk, catalog), 'wall.fit')).toContainEqual(['a']);
  });

  it('blocks an open outline (AC08.4)', () => {
    const open = outlineFromWalls([IN(120), IN(96), IN(100), IN(96)]);
    expect(open.closed).toBe(false);
    const closed = outlineFromWalls([IN(120), IN(96), IN(120), IN(96)]);
    expect(closed.closed).toBe(true);
    const bow = checkOutline([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }]);
    expect(bow.valid).toBe(false);
    const d = room(120);
    d.room.outline = [{ x: 0, y: 0 }, { x: 1000, y: 0 }];
    expect(validateDesign(d, catalog).fitStatus).toBe('failed');
  });

  it('treats an unknown appliance dimension as incomplete, never verified (AC08.4, QA03)', () => {
    const d = exampleA(120);
    d.appliances = [{ id: 'dw', kind: 'dishwasher', wallId: 'w2', offsetMm: 0, widthMm: null, depthMm: null, heightMm: null, elevationMm: 0 }];
    const report = validateDesign(d, catalog);
    expect(report.fitStatus).toBe('incomplete');
    expect(ids(report, 'appliance.dimensions')).toEqual([['dw']]);
  });

  it('blocks retired SKUs and suggests approved replacements (AC09.2)', () => {
    const d = room(120);
    d.instances = [inst('old', 'B36-RETIRED', 0)];
    const r = validateDesign(d, catalog).results.find((x) => x.ruleId === 'sku.active')!;
    expect(r.severity).toBe('blocker');
    expect(r.suggestion).toContain('B36');
  });

  it('blocks incompatible fronts and flags missing fronts as incomplete', () => {
    const d = room(120);
    d.instances = [inst('a', 'B36', 0, { frontSkuCode: 'F36-ALU' }), inst('b', 'B36', 36, { frontSkuCode: undefined })];
    const report = validateDesign(d, catalog);
    expect(ids(report, 'compat.front')).toEqual([['a']]);
    expect(ids(report, 'compat.front_required')).toEqual([['b']]);
  });

  it('requires exterior-rated products in exterior rooms', () => {
    const d = room(120);
    d.room.exposure = 'exterior';
    d.instances = [inst('ply', 'B36', 0), inst('alu', 'B36-EXT', 36, { frontSkuCode: 'F36-ALU' })];
    expect(ids(validateDesign(d, catalog), 'material.exterior')).toEqual([['ply']]);
  });

  it('blocks units over doors and windows and above the ceiling', () => {
    const d = room(120, 120, 84);
    d.openings = [
      { id: 'door', kind: 'door', wallId: 'w1', offsetMm: IN(0), widthMm: IN(32), sillMm: 0, heightMm: IN(80) },
      { id: 'win', kind: 'window', wallId: 'w1', offsetMm: IN(60), widthMm: IN(36), sillMm: IN(42), heightMm: IN(36) },
    ];
    d.instances = [inst('base-door', 'B30', 10), inst('wall-win', 'W36', 60), inst('tall', 'T24', 96)];
    const report = validateDesign(d, catalog);
    expect(ids(report, 'opening.door')).toContainEqual(['base-door', 'door']);
    expect(ids(report, 'opening.window')).toContainEqual(['wall-win', 'win']);
    expect(ids(report, 'opening.window')).not.toContainEqual(['base-door', 'win']);
    expect(ids(report, 'ceiling.height')).toEqual([]); // 84" tall at 84" ceiling fits exactly
    d.room.ceilingHeightMm = IN(83);
    expect(ids(validateDesign(d, catalog), 'ceiling.height')).toContainEqual(['tall']);
  });

  it('flags pro-only SKUs unless trade-entitled', () => {
    const d = room(120);
    d.instances = [inst('p', 'B36-PRO', 0)];
    expect(ids(validateDesign(d, catalog), 'sku.pro_only')).toEqual([['p']]);
    expect(ids(validateDesign(d, catalog, { tradeEntitled: true }), 'sku.pro_only')).toEqual([]);
  });

  it('allows an authorized override of review results but retains the original warning', () => {
    const d = exampleA(120);
    d.room.ceilingSource = 'suggested';
    const override = { ruleId: 'room.ceiling_known', objectIds: ['room-1'], reviewerId: 'u1', reviewerRole: 'designer', reason: 'Verified on site visit', at: '2026-09-30T00:00:00Z' };
    const report = validateDesign(d, catalog, { overrides: [override] });
    expect(report.fitStatus).toBe('verified');
    expect(report.overridden).toHaveLength(1);
    // Wrong role or empty reason does not override; blockers cannot be overridden.
    expect(validateDesign(d, catalog, { overrides: [{ ...override, reviewerRole: 'sales' }] }).fitStatus).toBe('incomplete');
    const bad = exampleA(119);
    const blk = validateDesign(bad, catalog).results.find((x) => x.ruleId === 'wall.fit')!;
    expect(validateDesign(bad, catalog, { overrides: [{ ...override, ruleId: 'wall.fit', objectIds: blk.objectIds }] }).fitStatus).toBe('failed');
  });

  it('produces identical results for identical inputs (AC09.4)', () => {
    const d = room(120);
    d.instances = [inst('z', 'B36', 0), inst('a', 'B36', 20), inst('m', 'B48', 100)];
    const shuffled = { ...d, instances: [...d.instances].reverse() };
    expect(JSON.stringify(validateDesign(d, catalog))).toBe(JSON.stringify(validateDesign(shuffled, catalog)));
  });

  it('suggests fillers for small gaps', () => {
    const d = room(120);
    d.instances = [inst('a', 'B36', 0), inst('b', 'B36', 38)];
    expect(ids(validateDesign(d, catalog), 'run.gap')).toEqual([['a', 'b']]);
  });
});
