/**
 * Money is stored as integer minor units with an explicit currency (spec section 12).
 * Percentages are expressed in basis points (1% = 100 bp). Rounding is half-up
 * away from zero at each explicitly documented step.
 */
import { DomainError } from './errors';

export type Currency = 'USD';
export interface Money {
  readonly amount: number; // integer minor units (cents)
  readonly currency: Currency;
}

export function money(amount: number, currency: Currency = 'USD'): Money {
  if (!Number.isInteger(amount)) throw new DomainError('validation', `Money amount must be integer minor units, got ${amount}`);
  return { amount, currency };
}

export const dollars = (value: number, currency: Currency = 'USD'): Money => money(Math.round(value * 100), currency);
export const zero = (currency: Currency = 'USD'): Money => money(0, currency);

function same(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new DomainError('validation', `Currency mismatch ${a.currency}/${b.currency}`);
}

export function add(a: Money, b: Money): Money {
  same(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  same(a, b);
  return money(a.amount - b.amount, a.currency);
}

export function multiply(a: Money, quantity: number): Money {
  if (!Number.isInteger(quantity)) throw new DomainError('validation', 'Quantity must be an integer');
  return money(a.amount * quantity, a.currency);
}

/** Apply basis points with half-up rounding (e.g. 800 bp tax on $540.00 = $43.20). */
export function percentOf(a: Money, basisPoints: number): Money {
  const raw = (a.amount * basisPoints) / 10_000;
  return money(roundHalfUp(raw), a.currency);
}

export function sum(values: Money[], currency: Currency = 'USD'): Money {
  return values.reduce((acc, v) => add(acc, v), zero(currency));
}

function roundHalfUp(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) + 1e-9);
}

export function formatMoney(m: Money): string {
  const sign = m.amount < 0 ? '-' : '';
  const abs = Math.abs(m.amount);
  return `${sign}$${Math.floor(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
}
