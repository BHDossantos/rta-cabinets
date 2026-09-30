import {
  type DesignDocument, type DisplayUnit, type Point, type Severity, type WallSegment, footprintOnWall, formatLength,
  inchesToMm, wallsOf,
} from '@rta/core';
import { type KeyboardEvent, type PointerEvent, useMemo, useRef } from 'react';
import type { PublicSku } from '../api';
import { SEVERITY_ICON, SEVERITY_LABEL } from '../format';

const SNAP_MM = inchesToMm(0.5);

export interface PlanViewProps {
  doc: DesignDocument;
  skus: Map<string, PublicSku>;
  unit: DisplayUnit;
  selectedId?: string | null;
  issues?: Map<string, Severity>;
  /** Transient preview while dragging (not recorded in history). */
  preview?: { id: string; offsetMm: number } | null;
  onSelect?: (id: string | null) => void;
  onDrag?: (id: string, offsetMm: number) => void;
  onDragEnd?: (id: string, offsetMm: number) => void;
  onNudge?: (id: string, deltaMm: number) => void;
  onDelete?: (id: string) => void;
  interactive?: boolean;
  title?: string;
}

/**
 * Top-down 2D plan in canonical mm. The plan is drawn with +y up (y is flipped
 * into SVG space) so the outline reads as a normal floor plan. The canvas is
 * neutral; orange is used only for the selection outline.
 */
export function PlanView({
  doc, skus, unit, selectedId, issues, preview, onSelect, onDrag, onDragEnd, onNudge, onDelete, interactive = true,
  title = 'Room plan, top-down view',
}: PlanViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; wall: WallSegment; startOffset: number; start: Point; last: number; pointerId: number } | null>(null);

  const outline = doc.room.outline;
  const walls = useMemo(() => (outline.length >= 3 ? wallsOf(outline) : []), [outline]);
  const wallById = useMemo(() => new Map(walls.map((w) => [w.id, w])), [walls]);

  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const minX = Math.min(...xs, 0), maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0), maxY = Math.max(...ys, 1);
  const size = Math.max(maxX - minX, maxY - minY, 1000);
  const fs = size / 38;
  const pad = fs * 3.2;
  const padX = fs * 7.5; // room for vertical wall labels
  const toSvg = (p: Point) => ({ x: p.x, y: maxY + minY - p.y });
  const pts = (poly: Point[]) => poly.map((p) => { const s = toSvg(p); return `${s.x},${s.y}`; }).join(' ');

  const clientToPlan = (clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: maxY + minY - pt.y };
  };

  const onPointerDown = (e: PointerEvent<SVGGElement>, id: string, wall: WallSegment, offsetMm: number) => {
    if (!interactive) return;
    onSelect?.(id);
    const start = clientToPlan(e.clientX, e.clientY);
    if (!start || !onDrag) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { id, wall, startOffset: offsetMm, start, last: offsetMm, pointerId: e.pointerId };
  };
  const onPointerMove = (e: PointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const p = clientToPlan(e.clientX, e.clientY);
    if (!p) return;
    const along = (p.x - d.start.x) * d.wall.dir.x + (p.y - d.start.y) * d.wall.dir.y;
    const next = Math.max(0, Math.round((d.startOffset + along) / SNAP_MM) * SNAP_MM);
    if (next !== d.last) {
      d.last = next;
      onDrag?.(d.id, next);
    }
  };
  const onPointerUp = (e: PointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (d.last !== d.startOffset) onDragEnd?.(d.id, d.last);
  };
  const onKey = (e: KeyboardEvent<SVGGElement>, id: string) => {
    const step = inchesToMm(e.shiftKey ? 0.125 : 1);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onNudge?.(id, -step); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onNudge?.(id, step); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(id); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onDelete?.(id); }
  };

  if (walls.length === 0) return <p>No room outline yet.</p>;

  // Draw base/tall first, then wall units (dashed, overhead) on top.
  const ordered = [...doc.instances].sort((a, b) => {
    const ma = skus.get(a.skuCode)?.mounting === 'wall' ? 1 : 0;
    const mb = skus.get(b.skuCode)?.mounting === 'wall' ? 1 : 0;
    return ma - mb;
  });

  return (
    <svg
      ref={svgRef}
      className="plan-svg"
      viewBox={`${minX - padX} ${minY - pad} ${maxX - minX + padX * 2} ${maxY - minY + pad * 2}`}
      role="group"
      aria-label={title}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onSelect?.(null); }}
    >
      <title>{title}</title>
      <defs>
        <pattern id="hatch-blocker" patternUnits="userSpaceOnUse" width={fs * 0.8} height={fs * 0.8} patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2={fs * 0.8} stroke="#1D1D1D" strokeWidth={fs * 0.12} />
        </pattern>
      </defs>
      <polygon points={pts(outline)} className="plan-floor" />
      {walls.map((w) => {
        const a = toSvg(w.start), b = toSvg(w.end);
        const mid = { x: (w.start.x + w.end.x) / 2 - w.inward.x * fs * 1.6, y: (w.start.y + w.end.y) / 2 - w.inward.y * fs * 1.6 };
        const m = toSvg(mid);
        // Keep labels of vertical walls outside the room instead of centred over the wall line.
        const anchor = Math.abs(w.inward.x) > 0.5 ? (w.inward.x > 0 ? 'end' : 'start') : 'middle';
        return (
          <g key={w.id}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="plan-wall" strokeWidth={fs * 0.35} />
            <text x={m.x} y={m.y} fontSize={fs} textAnchor={anchor} dominantBaseline="middle" className="plan-wall-label">
              {w.id} · {formatLength(w.lengthMm, unit)}
            </text>
          </g>
        );
      })}
      {ordered.map((inst) => {
        const sku = skus.get(inst.skuCode);
        const wall = wallById.get(inst.wallId);
        if (!sku || !wall) return null;
        const offset = preview && preview.id === inst.id ? preview.offsetMm : inst.offsetMm;
        const quad = footprintOnWall(wall, offset, sku.dimensions.widthMm, sku.dimensions.depthMm);
        const c = toSvg({ x: quad.reduce((s, p) => s + p.x, 0) / 4, y: quad.reduce((s, p) => s + p.y, 0) / 4 });
        const sev = issues?.get(inst.id);
        const selected = selectedId === inst.id;
        const isWall = sku.mounting === 'wall';
        const label = `Cabinet ${inst.id}, ${sku.code}, on wall ${wall.id} at ${formatLength(offset, unit)} from wall start${sev ? `, ${SEVERITY_LABEL[sev]}` : ''}${selected ? ', selected' : ''}`;
        return (
          <g
            key={inst.id}
            className={`plan-item${selected ? ' is-selected' : ''}${isWall ? ' is-wall-unit' : ''}${sev ? ` sev-${sev}` : ''}`}
            tabIndex={interactive ? 0 : undefined}
            role={interactive ? 'button' : undefined}
            aria-label={label}
            aria-pressed={interactive ? selected : undefined}
            onPointerDown={(e) => onPointerDown(e, inst.id, wall, offset)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={(e) => onKey(e, inst.id)}
          >
            <polygon points={pts(quad)} className="plan-item-shape" strokeWidth={fs * (selected ? 0.3 : 0.12)} strokeDasharray={isWall ? `${fs * 0.5} ${fs * 0.3}` : undefined} />
            {sev === 'blocker' && <polygon points={pts(quad)} fill="url(#hatch-blocker)" opacity={0.35} pointerEvents="none" />}
            <text x={c.x} y={c.y - fs * 0.35} fontSize={fs * 0.8} textAnchor="middle" className="plan-item-label" pointerEvents="none">
              {inst.id}
            </text>
            <text x={c.x} y={c.y + fs * 0.65} fontSize={fs * 0.65} textAnchor="middle" className="plan-item-sub" pointerEvents="none">
              {sev ? `${SEVERITY_ICON[sev]} ` : ''}{sku.code}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
