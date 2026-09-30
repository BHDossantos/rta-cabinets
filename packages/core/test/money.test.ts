import { describe, expect, it } from 'vitest';
import { add, dollars, formatMoney, money, percentOf } from '../src';

describe('money', () => {
  it('uses integer minor units', () => {
    expect(() => money(10.5)).toThrow();
    expect(add(dollars(0.1), dollars(0.2)).amount).toBe(30);
  });
  it('applies basis points with half-up rounding', () => {
    expect(percentOf(dollars(540), 800).amount).toBe(4320);
    expect(percentOf(money(5), 1000).amount).toBe(1); // 0.5 cent rounds up
    expect(percentOf(money(1000), -1000).amount).toBe(-100);
  });
  it('formats', () => {
    expect(formatMoney(money(68320))).toBe('$683.20');
    expect(formatMoney(money(-5))).toBe('-$0.05');
  });
});
