import { type DesignDocument, type DisplayUnit, formatLength, wallsOf } from '@rta/core';
import type { PublicSku } from '../api';

/** Elevation of one wall, looking at it from inside the room. Canonical mm. */
export function ElevationView({
  doc, skus, wallId, unit, selectedId, onSelect,
}: {
  doc: DesignDocument;
  skus: Map<string, PublicSku>;
  wallId: string;
  unit: DisplayUnit;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const wall = wallsOf(doc.room.outline).find((w) => w.id === wallId);
  if (!wall) return <p>Choose a wall to see its elevation.</p>;
  const ceiling = doc.room.ceilingHeightMm;
  const H = Math.max(ceiling ?? 2438.4, ...doc.instances.map((i) => {
    const s = skus.get(i.skuCode);
    return s && i.wallId === wallId ? i.elevationMm + s.dimensions.heightMm : 0;
  }));
  const W = Math.max(wall.lengthMm, 1);
  const fs = Math.max(W, H) / 32;
  const pad = fs * 2.5;
  const y = (mm: number) => H - mm;
  const items = doc.instances.filter((i) => i.wallId === wallId);

  return (
    <svg className="elev-svg" viewBox={`${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}`} role="img"
      aria-label={`Elevation of wall ${wall.id}, ${formatLength(wall.lengthMm, unit)} long, with ${items.length} cabinets`}>
      <rect x={0} y={0} width={W} height={H} className="elev-bg" />
      <line x1={0} y1={y(0)} x2={W} y2={y(0)} className="elev-floor" strokeWidth={fs * 0.2} />
      {ceiling !== null && (
        <>
          <line x1={0} y1={y(ceiling)} x2={W} y2={y(ceiling)} className="elev-ceiling" strokeWidth={fs * 0.12}
            strokeDasharray={doc.room.ceilingSource === 'measured' ? undefined : `${fs * 0.6} ${fs * 0.4}`} />
          <text x={fs * 0.3} y={y(ceiling) + fs * 1.1} fontSize={fs * 0.8} className="elev-label">
            Ceiling {formatLength(ceiling, unit)} ({doc.room.ceilingSource === 'measured' ? 'measured' : 'suggested, not measured'})
          </text>
        </>
      )}
      {items.map((i) => {
        const s = skus.get(i.skuCode);
        if (!s) return null;
        const selected = i.id === selectedId;
        return (
          <g key={i.id} className={`elev-item${selected ? ' is-selected' : ''}`} onClick={() => onSelect?.(i.id)}>
            <rect x={i.offsetMm} y={y(i.elevationMm + s.dimensions.heightMm)} width={s.dimensions.widthMm} height={s.dimensions.heightMm}
              strokeWidth={fs * (selected ? 0.25 : 0.1)} />
            <text x={i.offsetMm + s.dimensions.widthMm / 2} y={y(i.elevationMm + s.dimensions.heightMm / 2)} fontSize={fs * 0.8}
              textAnchor="middle" dominantBaseline="middle">
              {i.id} {s.code}
            </text>
          </g>
        );
      })}
      <text x={W / 2} y={H + fs * 1.6} fontSize={fs * 0.9} textAnchor="middle" className="elev-label">
        {wall.id}: {formatLength(wall.lengthMm, unit)}
      </text>
    </svg>
  );
}
