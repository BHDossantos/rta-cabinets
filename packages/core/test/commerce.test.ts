import { describe, expect, it } from 'vitest';
import {
  FIXTURE_POLICY, type PriceBook, compareCartToDesign, dollars, expandDesign, fixtureCatalog, packsFor, priceQuote,
  revalidateQuote, surfaceQuantity, type Entitlement,
} from '../src';
import { exampleA, inst, room } from './helpers';

const catalog = fixtureCatalog();
const retail: Entitlement = { tradePricing: false, proOnlySkus: false };
const member: Entitlement = { tradePricing: true, proOnlySkus: true };
const now = new Date('2026-09-30T12:00:00Z');

// Example C price book: bodies $200, fronts $80, hardware kit $40.
const bookC: PriceBook = { id: 'ex-c', version: 'ex-c-1', effectiveFrom: '2026-01-01', prices: { B36: 20000, 'F36-WHT': 8000, 'HK-STD': 4000 } };
const linesC = [{ skuCode: 'B36', quantity: 2 }, { skuCode: 'F36-WHT', quantity: 2 }, { skuCode: 'HK-STD', quantity: 1 }];
const shipping = { status: 'quoted' as const, amount: dollars(100) };
const quoteC = (entitlement: Entitlement, at = now) =>
  priceQuote(catalog, bookC, FIXTURE_POLICY, { lines: linesC, entitlement, shipping, now: at, calculationId: 'calc-c' });

describe('Example B — pack quantities (spec 32)', () => {
  it('137 sq ft, 10% waste, 20 sq ft packs = 8 packs (160 sq ft)', () => {
    const r = packsFor(137, 20, 1000);
    expect(r.requiredSqFt).toBeCloseTo(150.7, 9);
    expect(r.units).toBe(8);
    expect(r.purchasedCoverageSqFt).toBe(160);
    expect(r.formula).toContain('8 units');
  });

  it('is immune to floating-point noise at exact boundaries', () => {
    expect(packsFor(100, 10, 1000).units).toBe(11); // 110.00000000000001 must not become 12
  });

  it('recalculates when the floor outline changes', () => {
    const d = room(120, 120);
    const surface = { id: 's1', kind: 'flooring' as const, skuCode: 'FLR-LVP-OAK', label: 'Oak LVP', purchasability: 'purchasable' as const, wasteBp: 1000 };
    const a = surfaceQuantity(d, surface, 20);
    expect(a.areaSqFt).toBeCloseTo(100, 6);
    expect(a.units).toBe(ceil(110 / 20));
    const bigger = room(144, 120);
    expect(surfaceQuantity(bigger, surface, 20).units).toBe(ceil(132 / 20));
  });

  it('subtracts openings from wall area and applies coats for paint', () => {
    const d = room(120, 120, 96); // 4 walls × 10 ft × 8 ft = 320 sq ft
    d.openings = [{ id: 'door', kind: 'door', wallId: 'w1', offsetMm: 0, widthMm: 36 * 25.4, sillMm: 0, heightMm: 80 * 25.4 }];
    const paint = { id: 'p', kind: 'paint' as const, skuCode: 'PNT-WHT-1G', label: 'Paint', purchasability: 'purchasable' as const, coats: 2 };
    const r = surfaceQuantity(d, paint, 350);
    expect(r.areaSqFt).toBeCloseTo(320 - 20, 6);
    expect(r.units).toBe(2); // 600 / 350
  });
});
const ceil = Math.ceil;

describe('Example C — retail and member quote (spec 32)', () => {
  it('retail total is $748.00', () => {
    const q = quoteC(retail);
    expect(q.merchandiseSubtotal.amount).toBe(60000);
    expect(q.tax.amount).toBe(4800);
    expect(q.total.amount).toBe(74800);
    expect(q.isEstimate).toBe(false);
  });

  it('member total is $683.20 with a 10% trade adjustment', () => {
    const q = quoteC(member);
    expect(q.merchandiseTotal.amount).toBe(54000);
    expect(q.adjustmentsTotal.amount).toBe(-6000);
    expect(q.tax.amount).toBe(4320);
    expect(q.total.amount).toBe(68320);
  });

  it('identical carts under the same price version get identical totals (AC12.1)', () => {
    expect(quoteC(member).total).toEqual(quoteC(member).total);
  });

  it('expired entitlement requires explicit acceptance of $748 — never a silent charge (AC12.3)', () => {
    const original = quoteC(member);
    const result = revalidateQuote(original, (e) => quoteC(e), { entitlement: retail, now, locked: false });
    expect(result.status).toBe('requires_acceptance');
    if (result.status === 'requires_acceptance') {
      expect(result.previousTotal.amount).toBe(68320);
      expect(result.newQuote.total.amount).toBe(74800);
      expect(result.reason).toBe('entitlement_changed');
    }
    // A locked, unexpired quote is honored under the approved policy (D08).
    expect(revalidateQuote(original, (e) => quoteC(e), { entitlement: retail, now, locked: true }).status).toBe('honored');
    // Expiry always forces revalidation.
    const later = new Date(now.getTime() + 73 * 3600_000);
    expect(revalidateQuote(original, (e) => quoteC(e, later), { entitlement: member, now: later, locked: true }).status).toBe('requires_acceptance');
  });

  it('labels pending freight/tax and excluded items rather than showing zero as final', () => {
    const q = priceQuote(catalog, bookC, { ...FIXTURE_POLICY, taxRatesBp: null }, {
      lines: [...linesC, { skuCode: 'CTR-QUARTZ', quantity: 1 }], entitlement: retail,
      shipping: { status: 'pending_quote' }, now, calculationId: 'x',
    });
    expect(q.taxStatus).toBe('pending');
    expect(q.isEstimate).toBe(true);
    expect(q.excluded).toEqual([expect.objectContaining({ skuCode: 'CTR-QUARTZ', reason: 'quote_required' })]);
  });

  it('refuses pro-only SKUs for retail buyers (AC16.1)', () => {
    expect(() => priceQuote(catalog, bookC, FIXTURE_POLICY, { lines: [{ skuCode: 'B36-PRO', quantity: 1 }], entitlement: retail, shipping, now, calculationId: 'x' })).toThrow(/Pro/);
  });
});

describe('design to cart (spec 12)', () => {
  it('expands bodies into fronts and hinges, grouped by stage with instance links (AC09.5)', () => {
    const exp = expandDesign(exampleA(120), catalog);
    const byCode = Object.fromEntries(exp.lines.map((l) => [l.skuCode, l]));
    expect(byCode['B36']).toMatchObject({ quantity: 1, stage: 'A', instanceIds: ['c1'] });
    expect(byCode['HK-STD']).toMatchObject({ quantity: 3, stage: 'A', instanceIds: ['c1', 'c2', 'c3'] });
    expect(byCode['F48-WHT']).toMatchObject({ quantity: 1, stage: 'B' });
    expect(byCode['FIL3']).toMatchObject({ quantity: 2, instanceIds: ['fil-l', 'fil-r'] });
    expect(exp.incomplete).toEqual([]);
  });

  it('flags quote-only and visual-only selections rather than silently omitting them', () => {
    const d = exampleA(120);
    d.surfaces = [
      { id: 'ctr', kind: 'countertop', skuCode: 'CTR-QUARTZ', label: 'Quartz countertop', purchasability: 'quote_required' },
      { id: 'wallcolor', kind: 'paint', label: 'Sage green walls', purchasability: 'visualization_only' },
    ];
    expect(expandDesign(d, catalog).flagged.map((f) => [f.refId, f.status])).toEqual([['ctr', 'quote_required'], ['wallcolor', 'visualization_only']]);
  });

  it('reports incomplete systems when a required front is missing', () => {
    const d = room(120);
    d.instances = [inst('a', 'B36', 0, { frontSkuCode: undefined })];
    expect(expandDesign(d, catalog).incomplete).toEqual([expect.objectContaining({ instanceId: 'a', role: 'front' })]);
  });

  it('detects cart divergence and removed required hinges/fronts (AC12.4, QA05)', () => {
    const exp = expandDesign(exampleA(120), catalog);
    expect(compareCartToDesign(exp.lines, exp).matchesDesign).toBe(true);
    const edited = exp.lines.filter((l) => l.skuCode !== 'F36-WHT').map((l) => (l.skuCode === 'HK-STD' ? { ...l, quantity: 2 } : l));
    const cmp = compareCartToDesign(edited, exp);
    expect(cmp.matchesDesign).toBe(false);
    expect(cmp.incompleteSystems.map((x) => [x.skuCode, x.missingQuantity])).toEqual([['HK-STD', 1], ['F36-WHT', 1]]);
  });
});
