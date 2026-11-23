export function worksheetKey(name: string, field: string) { return `${name}:${field}`; }
export function worksheetCell(values: Record<string, string>, applicable: readonly string[], name: string, field: string) {
  return applicable.includes(field) ? values[worksheetKey(name, field)] ?? '' : '—';
}
