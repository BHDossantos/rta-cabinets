export type CatalogSort = 'default' | 'price-asc' | 'price-desc' | 'name';
export function sortCatalog<T extends { name: string; code: string; retailPrice: number | null; purchasability: string }>(items: T[], sort: CatalogSort): T[] {
  if (sort === 'default') return items;
  return [...items].sort((a, b) => {
    const byName = a.name.localeCompare(b.name) || a.code.localeCompare(b.code);
    if (sort === 'name') return byName;
    const aPrice = a.purchasability === 'purchasable' ? a.retailPrice : null;
    const bPrice = b.purchasability === 'purchasable' ? b.retailPrice : null;
    if (aPrice === null) return bPrice === null ? byName : 1;
    if (bPrice === null) return -1;
    return (sort === 'price-asc' ? aPrice - bPrice : bPrice - aPrice) || byName;
  });
}
