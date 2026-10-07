import { describe, expect, it } from 'vitest';
import { parseQuickOrder } from '../src';

describe('quick order parsing', () => {
  it('accepts common pasted formats and merges duplicates', () => {
    const r = parseQuickOrder(['B36 2', 'b30,1', 'W36\t3', '2 x F36-WHT', '3x HK-STD', 'FIL3 x2', 'SMP-WHT', '', '# comment', 'B36 1'].join('\n'));
    expect(r.errors).toEqual([]);
    expect(r.lines.map((l) => [l.skuCode, l.quantity])).toEqual([
      ['B36', 3], ['B30', 1], ['W36', 3], ['F36-WHT', 2], ['HK-STD', 3], ['FIL3', 2], ['SMP-WHT', 1],
    ]);
    expect(r.lines[0]!.lines).toEqual([1, 10]);
  });

  it('reports bad lines with their line numbers and keeps the good ones', () => {
    const r = parseQuickOrder('B36 0\nB36 2 extra words\n?? 2\nB30 2000\nW30 1');
    expect(r.errors.map((e) => e.line)).toEqual([1, 2, 3, 4]);
    expect(r.lines).toEqual([{ skuCode: 'W30', quantity: 1, lines: [5] }]);
  });
});
