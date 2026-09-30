import {
  type DesignDocument, type DisplayUnit, type MeasurementSource, type RoomType, DESIGN_SCHEMA_VERSION, checkOutline,
  emptyDesign, formatLength, inchesToMm, parseLength, rectangleOutline, wallsOf,
} from '@rta/core';
import { type FormEvent, useState } from 'react';
import { lengthFieldValue } from '../format';
import { Notice } from './States';

const SUGGESTED_CEILING_MM = inchesToMm(96); // 8 ft: an editable suggestion only, never a measurement.

type CeilingMode = 'measured' | 'suggested' | 'unknown';

function tryParse(text: string, unit: DisplayUnit): { mm: number | null; error: string | null } {
  if (!text.trim()) return { mm: null, error: 'Required' };
  try {
    const mm = parseLength(text, unit);
    if (mm <= 0) return { mm: null, error: 'Must be greater than zero' };
    return { mm, error: null };
  } catch (e) {
    return { mm: null, error: e instanceof Error ? e.message : 'Invalid length' };
  }
}

/** Step 1: rectangular room measurements with fractional-inch entry. */
export function RoomForm({
  initial, projectName, unit, catalogVersion, onUnitChange, onSubmit, onCancel,
}: {
  initial: DesignDocument | null;
  projectName: string;
  unit: DisplayUnit;
  catalogVersion: string;
  onUnitChange: (u: DisplayUnit) => void;
  onSubmit: (doc: DesignDocument, name: string) => void;
  onCancel?: () => void;
}) {
  const walls = initial ? wallsOf(initial.room.outline) : [];
  const [name, setName] = useState(projectName || 'My kitchen');
  const [type, setType] = useState<RoomType>(initial?.room.type ?? 'kitchen');
  const [width, setWidth] = useState(walls[0] ? lengthFieldValue(walls[0].lengthMm, unit) : '');
  const [depth, setDepth] = useState(walls[1] ? lengthFieldValue(walls[1].lengthMm, unit) : '');
  const [ceilingMode, setCeilingMode] = useState<CeilingMode>(initial?.room.ceilingSource ?? 'suggested');
  const [ceiling, setCeiling] = useState(lengthFieldValue(initial?.room.ceilingHeightMm ?? SUGGESTED_CEILING_MM, unit));
  const [source, setSource] = useState<MeasurementSource>(initial?.room.measurementSource ?? 'customer');
  const [touched, setTouched] = useState(false);

  const w = tryParse(width, unit);
  const d = tryParse(depth, unit);
  const c = ceilingMode === 'unknown' ? { mm: null, error: null } : tryParse(ceiling, unit);
  const outlineProblems = w.mm && d.mm ? checkOutline(rectangleOutline(w.mm, d.mm)).problems : [];
  const valid = w.mm !== null && d.mm !== null && c.error === null && outlineProblems.length === 0;

  const switchUnit = (u: DisplayUnit) => {
    // Convert entered text so switching units never changes the measured value.
    if (w.mm !== null) setWidth(lengthFieldValue(w.mm, u));
    if (d.mm !== null) setDepth(lengthFieldValue(d.mm, u));
    if (c.mm !== null) setCeiling(lengthFieldValue(c.mm, u));
    onUnitChange(u);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || w.mm === null || d.mm === null) return;
    const room = {
      id: initial?.room.id ?? 'room1',
      name,
      type,
      exposure: type === 'exterior' ? ('exterior' as const) : ('interior' as const),
      outline: rectangleOutline(w.mm, d.mm),
      ceilingHeightMm: ceilingMode === 'unknown' ? null : c.mm,
      ceilingSource: ceilingMode,
      measurementSource: source,
    };
    const doc: DesignDocument = initial
      ? { ...initial, schemaVersion: DESIGN_SCHEMA_VERSION, room }
      : emptyDesign(catalogVersion, room);
    onSubmit(doc, name);
  };

  const hint = unit === 'in' ? 'Inches. Fractions allowed, e.g. 120 1/2 or 10\' 0 1/2"' : 'Millimeters, e.g. 3060';

  return (
    <form className="room-form card" onSubmit={submit} noValidate>
      <h2>Step 1: Room measurements</h2>
      <p className="muted">Enter the inside dimensions of a rectangular room, wall to wall. Walls are numbered w1 to w4 counter-clockwise from the corner where w1 starts.</p>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="rf-name">Project name</label>
          <input id="rf-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="rf-type">Room type</label>
          <select id="rf-type" value={type} onChange={(e) => setType(e.target.value as RoomType)}>
            <option value="kitchen">Kitchen</option>
            <option value="bathroom">Bathroom</option>
            <option value="laundry">Laundry</option>
            <option value="closet">Closet</option>
            <option value="other_interior">Other interior room</option>
            <option value="exterior">Exterior / outdoor kitchen</option>
          </select>
        </div>
        <fieldset className="field">
          <legend>Display units</legend>
          <div className="segmented">
            <label><input type="radio" name="rf-unit" checked={unit === 'in'} onChange={() => switchUnit('in')} /> Inches</label>
            <label><input type="radio" name="rf-unit" checked={unit === 'mm'} onChange={() => switchUnit('mm')} /> Millimeters</label>
          </div>
        </fieldset>
      </div>

      <div className="form-grid">
        <LengthText id="rf-width" label="Room width (walls w1 and w3)" value={width} onChange={setWidth} unit={unit} hint={hint} parsed={w} touched={touched} />
        <LengthText id="rf-depth" label="Room depth (walls w2 and w4)" value={depth} onChange={setDepth} unit={unit} hint={hint} parsed={d} touched={touched} />
      </div>

      <fieldset className="field">
        <legend>Ceiling height</legend>
        <div className="radio-stack">
          <label><input type="radio" name="rf-ceil" checked={ceilingMode === 'measured'} onChange={() => setCeilingMode('measured')} /> I measured it</label>
          <label><input type="radio" name="rf-ceil" checked={ceilingMode === 'suggested'} onChange={() => setCeilingMode('suggested')} /> Not measured yet: use a suggested height (editable)</label>
          <label><input type="radio" name="rf-ceil" checked={ceilingMode === 'unknown'} onChange={() => setCeilingMode('unknown')} /> Unknown</label>
        </div>
        {ceilingMode !== 'unknown' && (
          <LengthText id="rf-ceiling" label={ceilingMode === 'measured' ? 'Measured ceiling height' : 'Suggested ceiling height (8 ft default, edit if you know better)'}
            value={ceiling} onChange={setCeiling} unit={unit} hint={hint} parsed={c} touched={touched} />
        )}
        {ceilingMode !== 'measured' && (
          <p className="small">⚠ Review required: fit cannot be verified until the ceiling height is measured.</p>
        )}
      </fieldset>

      <div className="field">
        <label htmlFor="rf-source">Who took these measurements?</label>
        <select id="rf-source" value={source} onChange={(e) => setSource(e.target.value as MeasurementSource)}>
          <option value="customer">I measured (customer-entered)</option>
          <option value="professional">Professionally measured</option>
          <option value="unverified">Estimate / unverified</option>
        </select>
      </div>

      {outlineProblems.length > 0 && <Notice tone="error" title="Room outline problem">{outlineProblems.join('; ')}</Notice>}
      {initial && initial.instances.length > 0 && (
        <Notice tone="info">Cabinets you already placed stay where they are; changing the room re-runs all checks rather than stretching cabinets.</Notice>
      )}

      <div className="btn-row">
        <button type="submit" className="btn btn-primary">{initial ? 'Update room' : 'Continue to layout'}</button>
        {onCancel && <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function LengthText({
  id, label, value, onChange, unit, hint, parsed, touched,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: DisplayUnit;
  hint: string;
  parsed: { mm: number | null; error: string | null };
  touched: boolean;
}) {
  const showError = parsed.error && (touched || value.trim() !== '');
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-with-unit">
        <input id={id} type="text" inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)}
          aria-invalid={showError ? true : undefined} aria-describedby={`${id}-hint`} />
        <span className="unit" aria-hidden="true">{unit}</span>
      </div>
      <span id={`${id}-hint`} className="small muted">
        {parsed.mm !== null ? `= ${formatLength(parsed.mm, 'in')} / ${formatLength(parsed.mm, 'mm')}` : hint}
      </span>
      {showError && <span className="field-error" role="alert">⛔ {parsed.error}</span>}
    </div>
  );
}
