import { type DesignDocument, type DesignInstance, emptyDesign, inchesToMm, rectangleOutline } from '../src';

export const IN = inchesToMm;

/** A room whose first wall (w1) is `wallIn` inches long. */
export function room(wallIn: number, depthIn = 120, ceilingIn: number | null = 96): DesignDocument {
  return emptyDesign('fixture-2026.09', {
    id: 'room-1', name: 'Kitchen', type: 'kitchen', exposure: 'interior',
    outline: rectangleOutline(IN(wallIn), IN(depthIn)),
    ceilingHeightMm: ceilingIn === null ? null : IN(ceilingIn),
    ceilingSource: ceilingIn === null ? 'unknown' : 'measured', measurementSource: 'customer',
  });
}

export function inst(id: string, skuCode: string, offsetIn: number, extra: Partial<DesignInstance> = {}): DesignInstance {
  const isBody = /^[BWT]\d/.test(skuCode);
  const width = Number(/\d+/.exec(skuCode)?.[0] ?? 0);
  const front = isBody && !skuCode.includes('RETIRED') ? (skuCode.startsWith('T') ? 'F24-TALL' : `F${width}-WHT`) : undefined;
  return {
    id, skuCode, wallId: 'w1', offsetMm: IN(offsetIn), elevationMm: skuCode.startsWith('W') ? IN(54) : 0,
    frontSkuCode: front, hingeSkuCode: isBody ? 'HK-STD' : undefined, ...extra,
  };
}

/** Example A layout: 3" filler + 36 + 30 + 48 + 3" filler = 120". */
export function exampleA(wallIn = 120): DesignDocument {
  const d = room(wallIn);
  d.instances = [
    inst('fil-l', 'FIL3', 0),
    inst('c1', 'B36', 3),
    inst('c2', 'B30', 39),
    inst('c3', 'B48', 69),
    inst('fil-r', 'FIL3', 117),
  ];
  return d;
}
