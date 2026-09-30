import { describe, expect, it } from 'vitest';
import { CONVERSION_TOLERANCE_MM, formatLength, inchesToMm, mmToInches, parseLength } from '../src';

describe('units (spec 8, AC08.1)', () => {
  it.each([
    ['35.5', 35.5], ['35 1/2', 35.5], ['35-1/2"', 35.5], ['1/2', 0.5], ["2' 11 1/2\"", 35.5], ['2ft 6in', 30], ['96"', 96], ["8'", 96],
  ])('parses %s as %f inches', (input, inches) => {
    expect(parseLength(input)).toBeCloseTo(inchesToMm(inches), 9);
  });

  it('parses metric input', () => {
    expect(parseLength('900mm')).toBe(900);
    expect(parseLength('90cm')).toBe(900);
    expect(parseLength('2.4m')).toBeCloseTo(2400, 9);
    expect(parseLength('600', 'mm')).toBe(600);
  });

  it('rejects garbage, negatives and zero denominators', () => {
    for (const bad of ['', 'abc', '-3', '1/0', '12 feet tall']) expect(() => parseLength(bad)).toThrow();
  });

  it('round-trips inches -> mm -> inches within tolerance without cumulative rounding', () => {
    let mm = parseLength('35 7/16');
    for (let i = 0; i < 100; i++) mm = inchesToMm(mmToInches(mm));
    expect(Math.abs(mm - inchesToMm(35 + 7 / 16))).toBeLessThan(CONVERSION_TOLERANCE_MM);
  });

  it('formats fractional inches and millimeters', () => {
    expect(formatLength(inchesToMm(35.5), 'in')).toBe('35 1/2"');
    expect(formatLength(inchesToMm(36), 'in')).toBe('36"');
    expect(formatLength(inchesToMm(0.25), 'in')).toBe('1/4"');
    expect(formatLength(914.4, 'mm')).toBe('914.4 mm');
  });
});
