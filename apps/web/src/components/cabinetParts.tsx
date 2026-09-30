import { type DesignDocument, inchesToMm } from '@rta/core';
import type { PublicSku } from '../api';

/** Default mounting elevation shown in the add form; always editable. */
export const DEFAULT_WALL_UNIT_ELEVATION_MM = inchesToMm(54);

export const isCompatiblePart = (body: PublicSku, part: PublicSku): boolean =>
  !!part.compatibleWith && (part.compatibleWith.includes(body.familyId) || part.compatibleWith.includes(body.code));

export function compatibleFronts(body: PublicSku | undefined, items: PublicSku[]): { matching: PublicSku[]; other: PublicSku[] } {
  if (!body) return { matching: [], other: [] };
  const fronts = items.filter((s) => s.kind === 'front' && isCompatiblePart(body, s));
  const same = (s: PublicSku) => Math.abs(s.dimensions.widthMm - body.dimensions.widthMm) < 1;
  return { matching: fronts.filter(same), other: fronts.filter((s) => !same(s)) };
}

export const compatibleHinges = (body: PublicSku | undefined, items: PublicSku[]): PublicSku[] =>
  body ? items.filter((s) => s.kind === 'hardware' && isCompatiblePart(body, s)) : [];

export const needsRole = (body: PublicSku | undefined, role: 'front' | 'hinge'): boolean =>
  !!body?.dependencies?.some((d) => d.role === role && !d.includedInKit);

/** End of the last unit on this wall at the same level: the next free offset for a new unit. */
export function nextFreeOffset(doc: DesignDocument, skus: Map<string, PublicSku>, wallId: string, mounting: string): number {
  const level = (m: string | undefined) => (m === 'wall' ? 'upper' : 'floor');
  let end = 0;
  for (const i of doc.instances) {
    const s = skus.get(i.skuCode);
    if (i.wallId !== wallId || !s || level(s.mounting) !== level(mounting)) continue;
    end = Math.max(end, i.offsetMm + s.dimensions.widthMm);
  }
  return end;
}

export function nextInstanceId(doc: DesignDocument): string {
  const max = doc.instances.reduce((m, i) => {
    const n = /^c(\d+)$/.exec(i.id);
    return n ? Math.max(m, Number(n[1])) : m;
  }, 0);
  return `c${max + 1}`;
}

/** Front <select> options grouped by width match. Compatibility is always enforced. */
export function FrontOptions({ body, items }: { body: PublicSku | undefined; items: PublicSku[] }) {
  const { matching, other } = compatibleFronts(body, items);
  return (
    <>
      <option value="">No front yet</option>
      {matching.length > 0 && (
        <optgroup label="Matches body width">
          {matching.map((f) => <option key={f.code} value={f.code}>{f.code}: {f.finish ?? f.name}</option>)}
        </optgroup>
      )}
      {other.length > 0 && (
        <optgroup label="Other compatible widths">
          {other.map((f) => <option key={f.code} value={f.code}>{f.code}: {f.finish ?? f.name}</option>)}
        </optgroup>
      )}
    </>
  );
}

export function HingeOptions({ body, items }: { body: PublicSku | undefined; items: PublicSku[] }) {
  return (
    <>
      <option value="">No hinge yet</option>
      {compatibleHinges(body, items).map((h) => <option key={h.code} value={h.code}>{h.code}: {h.name}</option>)}
    </>
  );
}

export function BodyOptions({ items }: { items: PublicSku[] }) {
  const bodies = items.filter((s) => s.kind === 'body');
  const groups: [string, string][] = [['base', 'Base cabinets'], ['wall', 'Wall cabinets'], ['tall', 'Tall cabinets']];
  return (
    <>
      {groups.map(([m, label]) => {
        const list = bodies.filter((b) => b.mounting === m);
        return list.length ? (
          <optgroup key={m} label={label}>
            {list.map((b) => <option key={b.code} value={b.code}>{b.code}: {b.name}</option>)}
          </optgroup>
        ) : null;
      })}
    </>
  );
}
