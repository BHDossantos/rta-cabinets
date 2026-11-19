import { it, expect } from 'vitest';
import { sortCatalog } from '../src/catalogSort';
it('sorts priced items first, keeps quote-only prices unknown, and leaves source order intact', () => {
  const items = [
    { code: 'B', name: 'Beta', retailPrice: 200, purchasability: 'purchasable' },
    { code: 'Q', name: 'Quote', retailPrice: 1, purchasability: 'quote_required' },
    { code: 'A', name: 'Alpha', retailPrice: 0, purchasability: 'purchasable' },
    { code: 'N', name: 'No price', retailPrice: null, purchasability: 'purchasable' },
  ];
  expect(sortCatalog(items, 'price-asc').map(x => x.code)).toEqual(['A', 'B', 'N', 'Q']);
  expect(sortCatalog(items, 'price-desc').map(x => x.code)).toEqual(['B', 'A', 'N', 'Q']);
  expect(sortCatalog(items, 'name').map(x => x.code)).toEqual(['A', 'B', 'N', 'Q']);
  expect(items.map(x => x.code)).toEqual(['B', 'Q', 'A', 'N']);
  expect(sortCatalog(items, 'default')).toBe(items);
});
