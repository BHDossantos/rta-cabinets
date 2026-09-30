/**
 * Server pricing authority (spec section 12). The browser never supplies trusted
 * prices. Precedence: base price book -> eligible trade/region/volume adjustment
 * -> approved promotion -> shipping -> tax. Finance must approve real stacking,
 * taxability and margin rules; values used in tests are synthetic fixtures.
 */
import { type Catalog, getSku } from './catalog';
import { DomainError } from './errors';
import { type Money, add, money, multiply, percentOf, subtract, sum, zero } from './money';

export interface PriceBook {
  id: string;
  version: string;
  /** Explicit per-SKU overrides in minor units; falls back to SKU retail price. */
  prices: Record<string, number>;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface PricingPolicy {
  version: string;
  /** Trade discount for entitled members, basis points on eligible lines. */
  tradeDiscountBp: number;
  /** Tax category -> rate bp. Missing category = tax pending. */
  taxRatesBp: Record<string, number> | null;
  taxShipping: boolean;
  quoteValidityHours: number;
}

export interface Entitlement {
  tradePricing: boolean;
  proOnlySkus: boolean;
}

export interface PriceLineInput {
  skuCode: string;
  quantity: number;
  /** Design instance IDs that produced this line (traceability). */
  instanceIds?: string[];
  stage?: string;
}

export interface ShippingQuote {
  status: 'quoted' | 'pending_quote';
  amount?: Money;
  description?: string;
}

export interface QuoteRequest {
  lines: PriceLineInput[];
  entitlement: Entitlement;
  shipping: ShippingQuote;
  taxStatus?: 'calculated' | 'pending';
  promotion?: { code: string; percentBp: number };
  designRevisionId?: string;
  now: Date;
  calculationId: string;
}

export interface QuoteLine {
  skuCode: string;
  description: string;
  quantity: number;
  unitPrice: Money;
  lineSubtotal: Money;
  adjustments: { kind: 'trade' | 'promotion'; label: string; amount: Money }[];
  lineTotal: Money;
  tax: Money;
  instanceIds: string[];
  stage?: string;
}

export interface ExcludedItem {
  skuCode: string;
  quantity: number;
  reason: 'quote_required' | 'visualization_only' | 'unavailable' | 'no_price';
  description: string;
}

export interface Quote {
  calculationId: string;
  designRevisionId?: string;
  priceBookVersion: string;
  policyVersion: string;
  catalogVersion: string;
  tradePricingApplied: boolean;
  lines: QuoteLine[];
  excluded: ExcludedItem[];
  merchandiseSubtotal: Money;
  adjustmentsTotal: Money;
  merchandiseTotal: Money;
  shipping: ShippingQuote;
  taxStatus: 'calculated' | 'pending';
  tax: Money;
  total: Money;
  /** True when shipping/tax pending or exclusions exist: the total is not final. */
  isEstimate: boolean;
  createdAt: string;
  expiresAt: string;
}

export function priceQuote(catalog: Catalog, book: PriceBook, policy: PricingPolicy, req: QuoteRequest): Quote {
  const lines: QuoteLine[] = [];
  const excluded: ExcludedItem[] = [];
  const taxAvailable = req.taxStatus !== 'pending' && policy.taxRatesBp !== null;

  for (const input of req.lines) {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new DomainError('validation', `Quantity for ${input.skuCode} must be a positive integer`);
    }
    const sku = getSku(catalog, input.skuCode);
    if (sku.status !== 'active') {
      excluded.push({ skuCode: sku.code, quantity: input.quantity, reason: 'unavailable', description: sku.name });
      continue;
    }
    if (sku.proOnly && !req.entitlement.proOnlySkus) {
      throw new DomainError('entitlement_required', `${sku.code} requires Pro entitlement`);
    }
    if (sku.purchasability !== 'purchasable') {
      excluded.push({ skuCode: sku.code, quantity: input.quantity, reason: sku.purchasability, description: sku.name });
      continue;
    }
    const base = book.prices[sku.code] ?? sku.retailPrice;
    if (base === null || base === undefined) {
      excluded.push({ skuCode: sku.code, quantity: input.quantity, reason: 'no_price', description: sku.name });
      continue;
    }
    const unitPrice = money(base);
    const lineSubtotal = multiply(unitPrice, input.quantity);
    const adjustments: QuoteLine['adjustments'] = [];
    let running = lineSubtotal;
    if (req.entitlement.tradePricing && policy.tradeDiscountBp > 0 && sku.kind !== 'sample') {
      const amt = percentOf(running, -policy.tradeDiscountBp);
      adjustments.push({ kind: 'trade', label: `Trade ${policy.tradeDiscountBp / 100}%`, amount: amt });
      running = add(running, amt);
    }
    if (req.promotion && req.promotion.percentBp > 0) {
      const amt = percentOf(running, -req.promotion.percentBp);
      adjustments.push({ kind: 'promotion', label: `Promotion ${req.promotion.code}`, amount: amt });
      running = add(running, amt);
    }
    const rate = taxAvailable ? policy.taxRatesBp![sku.taxCategory] : undefined;
    const tax = rate === undefined ? zero() : percentOf(running, rate);
    lines.push({
      skuCode: sku.code, description: sku.name, quantity: input.quantity, unitPrice, lineSubtotal, adjustments,
      lineTotal: running, tax, instanceIds: [...(input.instanceIds ?? [])].sort(), stage: input.stage,
    });
  }

  const missingTaxCategory = taxAvailable && lines.some((l) => policy.taxRatesBp![getSku(catalog, l.skuCode).taxCategory] === undefined);
  const taxStatus: Quote['taxStatus'] = taxAvailable && !missingTaxCategory ? 'calculated' : 'pending';
  const merchandiseSubtotal = sum(lines.map((l) => l.lineSubtotal));
  const merchandiseTotal = sum(lines.map((l) => l.lineTotal));
  const adjustmentsTotal = subtract(merchandiseTotal, merchandiseSubtotal);
  let tax = taxStatus === 'calculated' ? sum(lines.map((l) => l.tax)) : zero();
  const shippingAmount = req.shipping.status === 'quoted' ? req.shipping.amount ?? zero() : zero();
  if (taxStatus === 'calculated' && policy.taxShipping && req.shipping.status === 'quoted') {
    const shipRate = policy.taxRatesBp!['shipping'];
    if (shipRate !== undefined) tax = add(tax, percentOf(shippingAmount, shipRate));
  }
  const total = add(add(merchandiseTotal, shippingAmount), tax);
  const expiresAt = new Date(req.now.getTime() + policy.quoteValidityHours * 3600_000);
  return {
    calculationId: req.calculationId, designRevisionId: req.designRevisionId,
    priceBookVersion: book.version, policyVersion: policy.version, catalogVersion: catalog.version,
    tradePricingApplied: req.entitlement.tradePricing, lines, excluded,
    merchandiseSubtotal, adjustmentsTotal, merchandiseTotal, shipping: req.shipping, taxStatus, tax, total,
    isEstimate: taxStatus === 'pending' || req.shipping.status !== 'quoted' || excluded.length > 0,
    createdAt: req.now.toISOString(), expiresAt: expiresAt.toISOString(),
  };
}

export type QuoteHonorResult =
  | { status: 'honored'; quote: Quote }
  | { status: 'requires_acceptance'; reason: 'expired' | 'entitlement_changed'; previousTotal: Money; newQuote: Quote };

/**
 * Checkout revalidation (spec section 12 step 7, AC12.3, Example C). A locked,
 * unexpired quote is honored. Otherwise reprice with the *current* entitlement and
 * require explicit customer acceptance of any change; never silently charge.
 */
export function revalidateQuote(
  quote: Quote,
  reprice: (entitlement: Entitlement) => Quote,
  current: { entitlement: Entitlement; now: Date; locked: boolean },
): QuoteHonorResult {
  const expired = current.now.getTime() > Date.parse(quote.expiresAt);
  const entitlementChanged = quote.tradePricingApplied !== current.entitlement.tradePricing;
  if (current.locked && !expired) return { status: 'honored', quote };
  if (!expired && !entitlementChanged) return { status: 'honored', quote };
  const newQuote = reprice(current.entitlement);
  if (newQuote.total.amount === quote.total.amount && !expired) return { status: 'honored', quote };
  return { status: 'requires_acceptance', reason: expired ? 'expired' : 'entitlement_changed', previousTotal: quote.total, newQuote };
}
