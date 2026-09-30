/**
 * Canonical length unit is decimal millimeters (spec section 8). Feet/inches are
 * display conversions only; stored geometry is never re-rounded on unit switch.
 */
import { DomainError } from './errors';

export const MM_PER_INCH = 25.4;
export type DisplayUnit = 'in' | 'mm';

/** Default conversion tolerance for round-trips (AC08.1). Factory may tighten it. */
export const CONVERSION_TOLERANCE_MM = 0.001;

export const inchesToMm = (inches: number): number => inches * MM_PER_INCH;
export const mmToInches = (mm: number): number => mm / MM_PER_INCH;

/**
 * Parse a user-entered length into millimeters.
 * Accepts: `35.5`, `35 1/2`, `35-1/2"`, `1/2`, `2' 11 1/2"`, `2ft 6in`, `900mm`, `90cm`.
 * A bare number is interpreted in `defaultUnit`.
 */
export function parseLength(input: string, defaultUnit: DisplayUnit = 'in'): number {
  const raw = input.trim().toLowerCase();
  if (!raw) throw new DomainError('validation', 'Length is required');

  const metric = /^(-?\d+(?:\.\d+)?)\s*(mm|cm|m)$/.exec(raw);
  if (metric) {
    const value = Number(metric[1]);
    const factor = metric[2] === 'mm' ? 1 : metric[2] === 'cm' ? 10 : 1000;
    return nonNegative(value * factor, input);
  }

  const imperial = /^(?:(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*)?(?:(\d+(?:\.\d+)?)?(?:[\s-]+)?(?:(\d+)\/(\d+))?\s*(?:"|in|inch|inches)?)?$/.exec(raw);
  const hasImperialMarker = /'|"|ft|feet|in\b|inch|\//.test(raw);
  if (imperial && (hasImperialMarker || defaultUnit === 'in')) {
    const [, feet, whole, num, den] = imperial;
    if (feet === undefined && whole === undefined && num === undefined) {
      throw new DomainError('validation', `Cannot parse length "${input}"`);
    }
    if (den !== undefined && Number(den) === 0) {
      throw new DomainError('validation', `Invalid fraction in "${input}"`);
    }
    const inches =
      (feet ? Number(feet) * 12 : 0) +
      (whole ? Number(whole) : 0) +
      (num && den ? Number(num) / Number(den) : 0);
    return nonNegative(inchesToMm(inches), input);
  }

  const plain = /^-?\d+(?:\.\d+)?$/.exec(raw);
  if (plain && defaultUnit === 'mm') return nonNegative(Number(raw), input);

  throw new DomainError('validation', `Cannot parse length "${input}"`);
}

function nonNegative(mm: number, input: string): number {
  if (!Number.isFinite(mm) || mm < 0) throw new DomainError('validation', `Length must be a non-negative number: "${input}"`);
  return mm;
}

/** Format millimeters for display. Inches are shown to the nearest 1/16 by default. */
export function formatLength(mm: number, unit: DisplayUnit, denominator = 16): string {
  if (unit === 'mm') return `${roundTo(mm, 1)} mm`;
  const totalInches = mmToInches(mm);
  const sign = totalInches < 0 ? '-' : '';
  const abs = Math.abs(totalInches);
  let whole = Math.floor(abs);
  let num = Math.round((abs - whole) * denominator);
  if (num === denominator) {
    whole += 1;
    num = 0;
  }
  if (num === 0) return `${sign}${whole}"`;
  const g = gcd(num, denominator);
  return `${sign}${whole > 0 ? `${whole} ` : ''}${num / g}/${denominator / g}"`;
}

export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Ceil that ignores binary floating-point noise, e.g. 110.00000000000001 -> 110. */
export function ceilSafe(value: number): number {
  return Math.ceil(roundTo(value, 6));
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export const SQ_MM_PER_SQ_FT = MM_PER_INCH * MM_PER_INCH * 144;
export const sqMmToSqFt = (sqMm: number): number => sqMm / SQ_MM_PER_SQ_FT;
export const sqFtToSqMm = (sqFt: number): number => sqFt * SQ_MM_PER_SQ_FT;
