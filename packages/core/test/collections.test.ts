import { describe, expect, it } from 'vitest';
import { FIXTURE_COLLECTIONS, FIXTURE_POLICY, FIXTURE_PRICE_BOOK, TEN_BY_TEN, fixtureCatalog, priceQuote, tenByTenLines } from '../src';

const catalog = fixtureCatalog();
const byId = (id: string) => FIXTURE_COLLECTIONS.find((c) => c.id === id)!;

describe('collections and the 10x10 benchmark', () => {
  it('builds the published 10x10 from bodies, matching fronts and hinges', () => {
    const r = tenByTenLines(byId('white-shaker'), catalog);
    expect(r.missing).toEqual([]);
    const q = Object.fromEntries(r.lines.map((l) => [l.skuCode, l.quantity]));
    expect(q).toEqual({ B30: 2, B36: 2, B48: 1, W30: 2, W36: 3, 'F30-WHT': 4, 'F36-WHT': 5, 'F48-WHT': 1, 'HK-STD': 10 });
    expect(TEN_BY_TEN.reduce((n, i) => n + i.quantity, 0)).toBe(10);
  });

  it('prices each collection with the real pricing engine, so price changes flow through', () => {
    const price = (book = FIXTURE_PRICE_BOOK) => priceQuote(catalog, book, FIXTURE_POLICY, {
      lines: tenByTenLines(byId('natural-oak'), catalog).lines, entitlement: { tradePricing: false, proOnlySkus: false },
      shipping: { status: 'pending_quote' }, taxStatus: 'pending', now: new Date('2026-10-07T00:00:00Z'), calculationId: 'x',
    }).merchandiseTotal.amount;
    const base = price();
    expect(base).toBe(2 * 20000 + 2 * 18000 + 26000 + 3 * 15500 + 2 * 14000 + 4 * 9500 + 5 * 11000 + 14500 + 10 * 4000);
    expect(price({ ...FIXTURE_PRICE_BOOK, version: 'v2', prices: { B36: 21000 } })).toBe(base + 2 * 1000);
  });

  it('reports what a collection cannot supply instead of inventing a price', () => {
    const r = tenByTenLines(byId('brushed-aluminum'), catalog);
    expect(r.missing.map((m) => m.bodyCode)).toEqual(['B36', 'B30', 'B48', 'W36', 'W30']);
    expect(r.lines).toEqual([]);
  });
});
