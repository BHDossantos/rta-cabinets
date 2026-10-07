/**
 * SYNTHETIC TEST FIXTURES (spec section 32). These do not define real factory
 * sizes, prices, discounts, shipping charges, credit terms or tolerances. Replace
 * with the factory's approved SKU/BOM package (D16) before any live use.
 */
import { type Sku, createCatalog, type Catalog } from './catalog';
import type { PriceBook, PricingPolicy } from './pricing';
import { inchesToMm } from './units';
import type { PlanConfig } from './membership';
import type { Collection } from './collections';

const IN = inchesToMm;
const factory = { bomRevision: 'FIXTURE-1', panelThicknessMm: 18, edgeTreatment: 'PVC 1mm' };

function body(code: string, widthIn: number, mounting: 'base' | 'wall' | 'tall', price: number, extra: Partial<Sku> = {}): Sku {
  const dims = mounting === 'base' ? { d: 24, h: 34.5 } : mounting === 'wall' ? { d: 12, h: 30 } : { d: 24, h: 84 };
  return {
    code, familyId: `FAM-${mounting.toUpperCase()}-PLY`, name: `${widthIn}" ${mounting} cabinet body (plywood)`, kind: 'body', status: 'active', mounting,
    dimensions: { widthMm: IN(widthIn), depthMm: IN(dims.d), heightMm: IN(dims.h) }, material: 'plywood', purchasability: 'purchasable',
    fulfillmentStage: 'A', retailPrice: price, images: [`/img/${code.toLowerCase()}.svg`], taxCategory: 'cabinetry',
    packed: { weightKg: 20, packages: 1, freightOnly: false }, factory,
    dependencies: [{ role: 'front', quantity: 1 }, { role: 'hinge', quantity: 1 }], ...extra,
  };
}

function front(code: string, widthIn: number, finish: string, compat: string[], price: number, material: Sku['material'] = 'mdf'): Sku {
  return {
    code, familyId: 'FAM-FRONT', name: `${widthIn}" ${finish} front`, kind: 'front', status: 'active', mounting: 'none',
    dimensions: { widthMm: IN(widthIn), depthMm: 19, heightMm: IN(30) }, material, finish, purchasability: 'purchasable',
    fulfillmentStage: 'B', retailPrice: price, images: [], taxCategory: 'cabinetry', compatibleWith: compat, factory,
  };
}

export const FIXTURE_SKUS: Sku[] = [
  body('B30', 30, 'base', 18000),
  body('B36', 36, 'base', 20000),
  body('B48', 48, 'base', 26000),
  body('W30', 30, 'wall', 14000),
  body('W36', 36, 'wall', 15500),
  body('T24', 24, 'tall', 42000, { dimensions: { widthMm: IN(24), depthMm: IN(24), heightMm: IN(84) } }),
  body('B36-RETIRED', 36, 'base', 19000, { status: 'discontinued', replacementCodes: ['B36'] }),
  body('B36-EXT', 36, 'base', 32000, { familyId: 'FAM-BASE-ALU', material: 'aluminum', exteriorRated: true, name: '36" base cabinet body (aluminum, exterior-rated)' }),
  body('B36-PRO', 36, 'base', 21000, { proOnly: true, name: '36" base body, Pro-only configuration' }),
  {
    code: 'FIL3', familyId: 'FAM-FILLER', name: '3" filler', kind: 'filler', status: 'active', mounting: 'base',
    dimensions: { widthMm: IN(3), depthMm: 19, heightMm: IN(34.5) }, material: 'plywood', purchasability: 'purchasable',
    fulfillmentStage: 'B', retailPrice: 2500, images: [], taxCategory: 'cabinetry', factory,
  },
  front('F30-WHT', 30, 'White Shaker', ['FAM-BASE-PLY', 'FAM-WALL-PLY'], 7000),
  front('F36-WHT', 36, 'White Shaker', ['FAM-BASE-PLY', 'FAM-WALL-PLY', 'FAM-BASE-ALU'], 8000),
  front('F48-WHT', 48, 'White Shaker', ['FAM-BASE-PLY'], 10500),
  front('F36-OAK', 36, 'Natural Oak', ['FAM-BASE-PLY', 'FAM-WALL-PLY'], 11000, 'wood'),
  front('F30-OAK', 30, 'Natural Oak', ['FAM-BASE-PLY', 'FAM-WALL-PLY'], 9500, 'wood'),
  front('F48-OAK', 48, 'Natural Oak', ['FAM-BASE-PLY'], 14500, 'wood'),
  front('F24-TALL', 24, 'White Shaker', ['FAM-TALL-PLY'], 16000),
  front('F36-ALU', 36, 'Brushed Aluminum', ['FAM-BASE-ALU'], 14000, 'aluminum'),
  {
    code: 'HK-STD', familyId: 'FAM-HW', name: 'Soft-close hinge kit', kind: 'hardware', status: 'active', mounting: 'none',
    dimensions: { widthMm: 100, depthMm: 100, heightMm: 50 }, material: 'other', purchasability: 'purchasable',
    fulfillmentStage: 'A', retailPrice: 4000, images: [], taxCategory: 'cabinetry',
    compatibleWith: ['FAM-BASE-PLY', 'FAM-WALL-PLY', 'FAM-TALL-PLY', 'FAM-BASE-ALU'],
  },
  {
    code: 'FLR-LVP-OAK', familyId: 'FAM-FLOOR', name: 'Oak luxury vinyl plank (20 sq ft/pack)', kind: 'surface', status: 'active', mounting: 'none',
    dimensions: { widthMm: 180, depthMm: 1220, heightMm: 5 }, material: 'pvc', purchasability: 'purchasable', fulfillmentStage: 'third_party',
    retailPrice: 5999, images: [], taxCategory: 'surfaces', coverageSqFt: 20,
  },
  {
    code: 'PNT-WHT-1G', familyId: 'FAM-PAINT', name: 'Interior paint, 1 gal (350 sq ft/coat)', kind: 'surface', status: 'active', mounting: 'none',
    dimensions: { widthMm: 170, depthMm: 170, heightMm: 190 }, material: 'other', purchasability: 'purchasable', fulfillmentStage: 'third_party',
    retailPrice: 4299, images: [], taxCategory: 'surfaces', coverageSqFt: 350,
  },
  {
    code: 'SMP-WHT', familyId: 'FAM-SAMPLE', name: 'White Shaker door sample', kind: 'sample', status: 'active', mounting: 'none',
    dimensions: { widthMm: 150, depthMm: 19, heightMm: 200 }, material: 'mdf', finish: 'White Shaker', purchasability: 'purchasable',
    fulfillmentStage: 'samples', retailPrice: 900, images: [], taxCategory: 'cabinetry',
  },
  {
    code: 'SMP-OAK', familyId: 'FAM-SAMPLE', name: 'Natural Oak door sample', kind: 'sample', status: 'active', mounting: 'none',
    dimensions: { widthMm: 150, depthMm: 19, heightMm: 200 }, material: 'wood', finish: 'Natural Oak', purchasability: 'purchasable',
    fulfillmentStage: 'samples', retailPrice: 900, images: [], taxCategory: 'cabinetry',
  },
  {
    code: 'SMP-ALU', familyId: 'FAM-SAMPLE', name: 'Brushed Aluminum door sample', kind: 'sample', status: 'active', mounting: 'none',
    dimensions: { widthMm: 150, depthMm: 19, heightMm: 200 }, material: 'aluminum', finish: 'Brushed Aluminum', purchasability: 'purchasable',
    fulfillmentStage: 'samples', retailPrice: 900, images: [], taxCategory: 'cabinetry',
  },
  {
    code: 'CTR-QUARTZ', familyId: 'FAM-COUNTER', name: 'Quartz countertop (templated)', kind: 'surface', status: 'active', mounting: 'none',
    dimensions: { widthMm: 1, depthMm: 1, heightMm: 30 }, material: 'other', purchasability: 'quote_required', fulfillmentStage: 'third_party',
    retailPrice: null, images: [], taxCategory: 'surfaces',
  },
];

export const fixtureCatalog = (): Catalog => createCatalog('fixture-2026.09', structuredClone(FIXTURE_SKUS));

export const FIXTURE_PRICE_BOOK: PriceBook = { id: 'retail-us', version: 'fixture-pb-1', prices: {}, effectiveFrom: '2026-09-01' };

export const FIXTURE_POLICY: PricingPolicy = {
  version: 'fixture-policy-1',
  tradeDiscountBp: 1000,
  taxRatesBp: { cabinetry: 800, surfaces: 800 },
  taxShipping: false,
  quoteValidityHours: 72,
};

export const FIXTURE_PLANS: PlanConfig[] = [
  { id: 'pro-annual', name: 'Pro Annual (pilot)', interval: 'year', priceCents: null, limits: { activeProjects: 50, seats: 3, rendersPerMonth: 100 }, tradePricing: true, proOnlySkus: true, leadAccess: true },
];

/** SYNTHETIC collections; lead times are placeholders until the factory confirms them (D18). */
export const FIXTURE_COLLECTIONS: Collection[] = [
  {
    id: 'white-shaker', name: 'White Shaker', doorStyle: 'shaker', finish: 'White Shaker', material: 'mdf', swatchHex: '#F4F2EC',
    description: 'Painted five-piece shaker door on stocked plywood bodies.', sampleSkuCode: 'SMP-WHT', frontLeadTimeDays: { min: 5, max: 10 },
  },
  {
    id: 'natural-oak', name: 'Natural Oak', doorStyle: 'shaker', finish: 'Natural Oak', material: 'wood', swatchHex: '#C8A273',
    description: 'Clear-finished oak shaker door on stocked plywood bodies.', sampleSkuCode: 'SMP-OAK', frontLeadTimeDays: { min: 10, max: 15 },
  },
  {
    id: 'brushed-aluminum', name: 'Brushed Aluminum (outdoor)', doorStyle: 'slab', finish: 'Brushed Aluminum', material: 'aluminum', swatchHex: '#B8BCC0',
    description: 'Aluminum slab door for exterior-rated aluminum bodies. Outdoor kitchens are sold by individual cabinet.',
    sampleSkuCode: 'SMP-ALU', frontLeadTimeDays: null, exteriorRated: true,
  },
];
