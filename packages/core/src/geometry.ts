/**
 * Deterministic 2D geometry (spec section 8). All values are canonical millimeters.
 * The room outline is a simple polygon; walls are its edges in order.
 */
export interface Point {
  x: number;
  y: number;
}

export interface WallSegment {
  id: string;
  index: number;
  start: Point;
  end: Point;
  lengthMm: number;
  /** Unit vector along the wall, start -> end. */
  dir: Point;
  /** Unit vector pointing into the room. */
  inward: Point;
}

export const EPS_MM = 0.5;

export function signedArea(points: Point[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export const polygonArea = (points: Point[]): number => Math.abs(signedArea(points));

export function wallsOf(outline: Point[]): WallSegment[] {
  const ccw = signedArea(outline) > 0;
  return outline.map((start, i) => {
    const end = outline[(i + 1) % outline.length]!;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    const dir = len === 0 ? { x: 0, y: 0 } : { x: dx / len, y: dy / len };
    // Left normal is inward for counter-clockwise polygons.
    const inward = ccw ? { x: -dir.y, y: dir.x } : { x: dir.y, y: -dir.x };
    return { id: `w${i + 1}`, index: i, start, end, lengthMm: len, dir, inward };
  });
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const onSeg = (p: Point, q: Point, r: Point) =>
    Math.min(p.x, r.x) - 1e-9 <= q.x && q.x <= Math.max(p.x, r.x) + 1e-9 &&
    Math.min(p.y, r.y) - 1e-9 <= q.y && q.y <= Math.max(p.y, r.y) + 1e-9;
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(a, c, b)) return true;
  if (o2 === 0 && onSeg(a, d, b)) return true;
  if (o3 === 0 && onSeg(c, a, d)) return true;
  if (o4 === 0 && onSeg(c, b, d)) return true;
  return false;
}

export interface OutlineCheck {
  valid: boolean;
  problems: string[];
}

/** Validate a closed, non-self-intersecting polygon with non-zero area. */
export function checkOutline(outline: Point[]): OutlineCheck {
  const problems: string[] = [];
  if (outline.length < 3) problems.push('Room outline needs at least 3 corners');
  if (outline.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) problems.push('Room outline has missing coordinates');
  if (problems.length) return { valid: false, problems };
  const walls = wallsOf(outline);
  walls.forEach((w) => {
    if (w.lengthMm < EPS_MM) problems.push(`Wall ${w.id} has zero length`);
  });
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === walls.length - 1);
      if (adjacent) continue;
      const a = walls[i]!, b = walls[j]!;
      if (segmentsIntersect(a.start, a.end, b.start, b.end)) problems.push(`Walls ${a.id} and ${b.id} cross`);
    }
  }
  if (polygonArea(outline) < 1) problems.push('Room outline has no area');
  return { valid: problems.length === 0, problems };
}

/**
 * Build an outline by walking wall lengths with 90° left turns (rectangle, L, U).
 * `turns` gives the turn direction at the end of each wall: 'L' (left) or 'R' (right).
 * The walk must return to the origin, otherwise the outline is reported open.
 */
export function outlineFromWalls(lengthsMm: number[], turns?: ('L' | 'R')[]): { points: Point[]; closed: boolean; gapMm: number } {
  const dirs = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
  let heading = 0;
  let p: Point = { x: 0, y: 0 };
  const points: Point[] = [p];
  lengthsMm.forEach((len, i) => {
    const d = dirs[heading]!;
    p = { x: p.x + d.x * len, y: p.y + d.y * len };
    if (i < lengthsMm.length - 1) points.push(p);
    const t = turns?.[i] ?? 'L';
    heading = (heading + (t === 'L' ? 1 : 3)) % 4;
  });
  const gapMm = Math.hypot(p.x, p.y);
  return { points, closed: gapMm <= EPS_MM, gapMm };
}

export const rectangleOutline = (widthMm: number, depthMm: number): Point[] => [
  { x: 0, y: 0 }, { x: widthMm, y: 0 }, { x: widthMm, y: depthMm }, { x: 0, y: depthMm },
];

/** Footprint quad of an object placed against a wall at `offsetMm` from the wall start. */
export function footprintOnWall(wall: WallSegment, offsetMm: number, widthMm: number, depthMm: number): Point[] {
  const p0 = { x: wall.start.x + wall.dir.x * offsetMm, y: wall.start.y + wall.dir.y * offsetMm };
  const p1 = { x: p0.x + wall.dir.x * widthMm, y: p0.y + wall.dir.y * widthMm };
  const p2 = { x: p1.x + wall.inward.x * depthMm, y: p1.y + wall.inward.y * depthMm };
  const p3 = { x: p0.x + wall.inward.x * depthMm, y: p0.y + wall.inward.y * depthMm };
  return [p0, p1, p2, p3];
}

/**
 * Separating-axis test for two convex polygons. Touching edges do not count as
 * overlap; penetration must exceed `toleranceMm`.
 */
export function convexOverlap(a: Point[], b: Point[], toleranceMm = EPS_MM): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const axis = { x: -(q.y - p.y) / len, y: (q.x - p.x) / len };
      const proj = (pts: Point[]) => {
        let min = Infinity, max = -Infinity;
        for (const pt of pts) {
          const v = pt.x * axis.x + pt.y * axis.y;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        return { min, max };
      };
      const pa = proj(a), pb = proj(b);
      if (pa.max - pb.min <= toleranceMm || pb.max - pa.min <= toleranceMm) return false;
    }
  }
  return true;
}

export function pointInPolygon(pt: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** True when every corner of `quad` lies inside or on the room polygon (tolerance applied by shrinking). */
export function quadInsideRoom(quad: Point[], room: Point[]): boolean {
  const cx = quad.reduce((s, p) => s + p.x, 0) / quad.length;
  const cy = quad.reduce((s, p) => s + p.y, 0) / quad.length;
  return quad.every((p) => {
    const dx = cx - p.x, dy = cy - p.y;
    const d = Math.hypot(dx, dy) || 1;
    return pointInPolygon({ x: p.x + (dx / d) * EPS_MM, y: p.y + (dy / d) * EPS_MM }, room);
  });
}

export const intervalsOverlap = (a0: number, a1: number, b0: number, b1: number, tol = EPS_MM): boolean =>
  Math.min(a1, b1) - Math.max(a0, b0) > tol;
