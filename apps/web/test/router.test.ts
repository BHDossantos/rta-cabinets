import { describe, expect, it } from 'vitest';
import { parseHash } from '../src/router';
describe('demo navigation', () => {
  it('decodes valid links and ignores query strings', () => {
    expect(parseHash('#/orders/order%201?source=demo')).toEqual(['orders', 'order 1']);
  });
  it('keeps malformed input on the not-found path instead of crashing', () => {
    expect(parseHash('#/%E0%A4%A')).toEqual(['%E0%A4%A']);
    expect(parseHash('#/orders/100%')).toEqual(['orders', '100%']);
  });
});
