import { type DesignDocument, type DesignInstance, type DisplayUnit, parseLength, wallsOf, formatLength } from '@rta/core';
import { type FormEvent, useEffect, useState } from 'react';
import type { PublicSku } from '../api';
import { lengthFieldValue } from '../format';
import {
  BodyOptions, DEFAULT_WALL_UNIT_ELEVATION_MM, FrontOptions, HingeOptions, compatibleFronts, compatibleHinges, nextFreeOffset,
  nextInstanceId,
} from './cabinetParts';

/**
 * Numeric, keyboard-only placement (AC08.5): choose a body, a wall and an offset
 * from the wall's start corner. Dragging on the plan is an optional enhancement.
 */
export function AddCabinetForm({
  doc, skus, items, unit, onAdd,
}: {
  doc: DesignDocument;
  skus: Map<string, PublicSku>;
  items: PublicSku[];
  unit: DisplayUnit;
  onAdd: (inst: DesignInstance) => void;
}) {
  const walls = wallsOf(doc.room.outline);
  const bodies = items.filter((s) => s.kind === 'body');
  const [skuCode, setSkuCode] = useState(bodies[0]?.code ?? '');
  const [wallId, setWallId] = useState(walls[0]?.id ?? 'w1');
  const body = skus.get(skuCode);
  const [offsetText, setOffsetText] = useState('0');
  const [offsetEdited, setOffsetEdited] = useState(false);
  const [elevText, setElevText] = useState('0');
  const [front, setFront] = useState('');
  const [hinge, setHinge] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Suggest the next free position along the wall until the user types their own.
  useEffect(() => {
    if (!offsetEdited) setOffsetText(lengthFieldValue(nextFreeOffset(doc, skus, wallId, body?.mounting ?? 'base'), unit));
  }, [doc, skus, wallId, body?.mounting, unit, offsetEdited]);

  useEffect(() => {
    setElevText(lengthFieldValue(body?.mounting === 'wall' ? DEFAULT_WALL_UNIT_ELEVATION_MM : 0, unit));
    setFront(compatibleFronts(body, items).matching[0]?.code ?? '');
    setHinge(compatibleHinges(body, items)[0]?.code ?? '');
  }, [body, items, unit]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!body) return setError('Choose a cabinet');
    let offsetMm: number, elevationMm: number;
    try {
      offsetMm = parseLength(offsetText, unit);
      elevationMm = parseLength(elevText, unit);
    } catch (err) {
      return setError(err instanceof Error ? err.message : 'Invalid length');
    }
    setError(null);
    onAdd({
      id: nextInstanceId(doc), skuCode: body.code, wallId, offsetMm, elevationMm,
      frontSkuCode: front || undefined, hingeSkuCode: hinge || undefined,
    });
    setOffsetEdited(false);
  };

  const wall = walls.find((w) => w.id === wallId);

  return (
    <form className="add-form card" onSubmit={submit} aria-labelledby="add-h">
      <h3 id="add-h">Add a cabinet</h3>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="add-sku">Cabinet body</label>
          <select id="add-sku" value={skuCode} onChange={(e) => setSkuCode(e.target.value)}>
            <BodyOptions items={items} />
          </select>
        </div>
        <div className="field">
          <label htmlFor="add-wall">Wall</label>
          <select id="add-wall" value={wallId} onChange={(e) => setWallId(e.target.value)}>
            {walls.map((w) => <option key={w.id} value={w.id}>{w.id} ({formatLength(w.lengthMm, unit)})</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="add-offset">Offset from start of {wallId}</label>
          <div className="input-with-unit">
            <input id="add-offset" type="text" inputMode="decimal" value={offsetText} aria-describedby="add-offset-hint"
              onChange={(e) => { setOffsetText(e.target.value); setOffsetEdited(true); }} />
            <span className="unit" aria-hidden="true">{unit}</span>
          </div>
          <span id="add-offset-hint" className="small muted">
            Suggested: next free position{wall ? ` on a ${formatLength(wall.lengthMm, unit)} wall` : ''}.
          </span>
        </div>
        <div className="field">
          <label htmlFor="add-elev">Mounting height (bottom above floor)</label>
          <div className="input-with-unit">
            <input id="add-elev" type="text" inputMode="decimal" value={elevText} onChange={(e) => setElevText(e.target.value)} />
            <span className="unit" aria-hidden="true">{unit}</span>
          </div>
        </div>
        <div className="field">
          <label htmlFor="add-front">Front (compatible only)</label>
          <select id="add-front" value={front} onChange={(e) => setFront(e.target.value)}>
            <FrontOptions body={body} items={items} />
          </select>
        </div>
        <div className="field">
          <label htmlFor="add-hinge">Hinge (compatible only)</label>
          <select id="add-hinge" value={hinge} onChange={(e) => setHinge(e.target.value)}>
            <HingeOptions body={body} items={items} />
          </select>
        </div>
      </div>
      {error && <p className="field-error" role="alert">⛔ {error}</p>}
      <button type="submit" className="btn btn-primary">Add cabinet</button>
    </form>
  );
}
