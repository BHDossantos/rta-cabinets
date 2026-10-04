import {
  type Appliance, type DesignDocument, type DisplayUnit, type Opening, type Severity, formatLength, inchesToMm, parseLength, wallsOf,
} from '@rta/core';
import { type FormEvent, useState } from 'react';
import { SEVERITY_ICON, SEVERITY_LABEL } from '../format';
import { LengthInput } from './LengthInput';

type OpeningKind = Opening['kind'];
type ApplianceKind = Appliance['kind'];
type FixtureKind = OpeningKind | ApplianceKind;

const OPENING_KINDS: { value: OpeningKind; label: string }[] = [
  { value: 'door', label: 'Door' },
  { value: 'window', label: 'Window' },
  { value: 'column', label: 'Column' },
  { value: 'obstruction', label: 'Other obstruction' },
];
const APPLIANCE_KINDS: { value: ApplianceKind; label: string }[] = [
  { value: 'range', label: 'Range / cooktop' },
  { value: 'refrigerator', label: 'Refrigerator' },
  { value: 'dishwasher', label: 'Dishwasher' },
  { value: 'sink', label: 'Sink' },
  { value: 'hood', label: 'Hood' },
  { value: 'microwave', label: 'Microwave' },
  { value: 'other', label: 'Other appliance' },
];
export const FIXTURE_LABEL: Record<string, string> = Object.fromEntries(
  [...OPENING_KINDS, ...APPLIANCE_KINDS].map((k) => [k.value, k.label]),
);

const isOpeningKind = (k: FixtureKind): k is OpeningKind => OPENING_KINDS.some((o) => o.value === k);

function nextId(prefix: string, ids: string[]): string {
  let n = 1;
  while (ids.includes(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function FixturesPanel({
  doc, unit, issues, onAddOpening, onAddAppliance, onChangeOpening, onChangeAppliance, onDelete,
}: {
  doc: DesignDocument;
  unit: DisplayUnit;
  issues: Map<string, Severity>;
  onAddOpening: (o: Opening) => void;
  onAddAppliance: (a: Appliance) => void;
  onChangeOpening: (id: string, patch: Partial<Opening>) => void;
  onChangeAppliance: (id: string, patch: Partial<Appliance>) => void;
  onDelete: (id: string) => void;
}) {
  const walls = wallsOf(doc.room.outline);
  const [kind, setKind] = useState<FixtureKind>('door');
  const [wallId, setWallId] = useState(walls[0]?.id ?? 'w1');
  const [text, setText] = useState({ offset: '', width: '', sill: '', height: '', depth: '' });
  const [applianceUnknown, setApplianceUnknown] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const opening = isOpeningKind(kind);
  const field = (key: keyof typeof text) => ({
    value: text[key],
    onChange: (e: { target: { value: string } }) => setText((t) => ({ ...t, [key]: e.target.value })),
  });

  const chooseKind = (k: FixtureKind) => {
    setKind(k);
    setError(null);
  };

  const allIds = [...doc.openings.map((o) => o.id), ...doc.appliances.map((a) => a.id), ...doc.instances.map((i) => i.id)];

  /** Every size is typed by the customer; nothing is pre-filled or assumed. */
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const read = (label: string, value: string, min: number) => {
      if (!value.trim()) throw new Error(`${label} is required`);
      const mm = parseLength(value, unit);
      if (mm < min) throw new Error(`${label} must be greater than zero`);
      return mm;
    };
    try {
      const offsetMm = read('Offset', text.offset, 0);
      if (opening) {
        onAddOpening({
          id: nextId(kind === 'door' ? 'door' : kind === 'window' ? 'win' : 'obs', allIds), kind, wallId, offsetMm,
          widthMm: read('Width', text.width, 0.001), sillMm: kind === 'door' ? 0 : read('Bottom above floor', text.sill, 0),
          heightMm: read('Height', text.height, 0.001),
        });
      } else {
        const known = !applianceUnknown;
        onAddAppliance({
          id: nextId('app', allIds), kind, wallId, offsetMm, elevationMm: kind === 'hood' || kind === 'microwave' ? inchesToMm(54) : 0,
          widthMm: known ? read('Width', text.width, 0.001) : null,
          depthMm: known ? read('Depth', text.depth, 0.001) : null,
          heightMm: known ? read('Height', text.height, 0.001) : null,
        });
      }
      setError(null);
      setText({ offset: '', width: '', sill: '', height: '', depth: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid length');
    }
  };

  const fixtures = [
    ...doc.openings.map((o) => ({ type: 'opening' as const, item: o })),
    ...doc.appliances.map((a) => ({ type: 'appliance' as const, item: a })),
  ];

  return (
    <section className="card" aria-labelledby="fix-h">
      <h2 id="fix-h" className="h3">Doors, windows and appliances</h2>
      <p className="small muted">
        Measure each one from the start corner of its wall. Cabinets cannot block doors or overlap windows, and an appliance with unknown
        dimensions keeps the design at “review required” until it is measured.
      </p>

      <form className="fixture-form" onSubmit={submit} aria-label="Add a door, window or appliance">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="fix-kind">Type</label>
            <select id="fix-kind" value={kind} onChange={(e) => chooseKind(e.target.value as FixtureKind)}>
              <optgroup label="Openings and obstructions">
                {OPENING_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </optgroup>
              <optgroup label="Appliances and fixtures">
                {APPLIANCE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </optgroup>
            </select>
          </div>
          <div className="field">
            <label htmlFor="fix-wall">Wall</label>
            <select id="fix-wall" value={wallId} onChange={(e) => setWallId(e.target.value)}>
              {walls.map((w) => <option key={w.id} value={w.id}>{w.id} ({formatLength(w.lengthMm, unit)})</option>)}
            </select>
          </div>
          <TextLength id="fix-offset" label={`Offset from start of ${wallId}`} unit={unit} {...field('offset')} />
          {opening ? (
            <>
              <TextLength id="fix-width" label="Width" unit={unit} {...field('width')} />
              {kind !== 'door' && <TextLength id="fix-sill" label="Bottom above floor" unit={unit} {...field('sill')} />}
              <TextLength id="fix-height" label="Height" unit={unit} {...field('height')} />
            </>
          ) : (
            <fieldset className="field fixture-dims">
              <legend>Appliance size</legend>
              <label className="check">
                <input type="checkbox" checked={applianceUnknown} onChange={(e) => setApplianceUnknown(e.target.checked)} />
                <span>Unknown — I'll measure it later</span>
              </label>
              {!applianceUnknown && (
                <div className="form-grid">
                  <TextLength id="fix-aw" label="Width" unit={unit} {...field('width')} />
                  <TextLength id="fix-ad" label="Depth" unit={unit} {...field('depth')} />
                  <TextLength id="fix-ah" label="Height" unit={unit} {...field('height')} />
                </div>
              )}
            </fieldset>
          )}
        </div>
        {error && <p className="field-error" role="alert">⛔ {error}</p>}
        <button type="submit" className="btn btn-secondary">Add {FIXTURE_LABEL[kind]?.toLowerCase()}</button>
      </form>

      {fixtures.length === 0 ? (
        <p className="small muted">No doors, windows or appliances yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table compact fixture-table">
            <caption>Doors, windows and appliances ({fixtures.length})</caption>
            <thead>
              <tr><th>ID</th><th>Type</th><th>Wall</th><th>Offset</th><th>Width</th><th>Size details</th><th>Checks</th><th><span className="visually-hidden">Actions</span></th></tr>
            </thead>
            <tbody>
              {fixtures.map(({ type, item }) => {
                const sev = issues.get(item.id);
                return (
                  <tr key={item.id}>
                    <th scope="row">{item.id}</th>
                    <td>{FIXTURE_LABEL[item.kind] ?? item.kind}</td>
                    <td>
                      <label className="visually-hidden" htmlFor={`fw-${item.id}`}>Wall for {item.id}</label>
                      <select id={`fw-${item.id}`} value={item.wallId} onChange={(e) => (type === 'opening'
                        ? onChangeOpening(item.id, { wallId: e.target.value }) : onChangeAppliance(item.id, { wallId: e.target.value }))}>
                        {walls.map((w) => <option key={w.id} value={w.id}>{w.id}</option>)}
                      </select>
                    </td>
                    <td>
                      <LengthInput label={`Offset of ${item.id}`} hideLabel valueMm={item.offsetMm} unit={unit} min={0}
                        onCommit={(v) => (type === 'opening' ? onChangeOpening(item.id, { offsetMm: v }) : onChangeAppliance(item.id, { offsetMm: v }))} />
                    </td>
                    <td>
                      {type === 'opening' ? (
                        <LengthInput label={`Width of ${item.id}`} hideLabel valueMm={(item as Opening).widthMm} unit={unit} min={1}
                          onCommit={(v) => onChangeOpening(item.id, { widthMm: v })} />
                      ) : <span className="muted">See size details</span>}
                    </td>
                    <td className="small">
                      {type === 'opening'
                        ? `${formatLength((item as Opening).heightMm, unit)} high, ${formatLength((item as Opening).sillMm, unit)} above floor`
                        : <ApplianceDims a={item as Appliance} unit={unit} onChange={(patch) => onChangeAppliance(item.id, patch)} />}
                    </td>
                    <td className="small">{sev ? `${SEVERITY_ICON[sev]} ${SEVERITY_LABEL[sev]}` : '✓ OK'}</td>
                    <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(item.id)} aria-label={`Delete ${item.id}`}>Delete</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ApplianceDims({ a, unit, onChange }: { a: Appliance; unit: DisplayUnit; onChange: (patch: Partial<Appliance>) => void }) {
  const known = a.widthMm !== null && a.depthMm !== null && a.heightMm !== null;
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState({ width: '', depth: '', height: '' });
  const [error, setError] = useState<string | null>(null);
  if (known) {
    return (
      <div className="fixture-dims-inline">
        <LengthInput label={`Width of ${a.id}`} valueMm={a.widthMm!} unit={unit} min={1} onCommit={(v) => onChange({ widthMm: v })} />
        <LengthInput label={`Depth of ${a.id}`} valueMm={a.depthMm!} unit={unit} min={1} onCommit={(v) => onChange({ depthMm: v })} />
        <LengthInput label={`Height of ${a.id}`} valueMm={a.heightMm!} unit={unit} min={1} onCommit={(v) => onChange({ heightMm: v })} />
      </div>
    );
  }
  if (!editing) {
    return <>Unknown <button type="button" className="link-btn" onClick={() => setEditing(true)}>Enter measurements</button></>;
  }
  const save = () => {
    try {
      const parse = (label: string, v: string) => {
        if (!v.trim()) throw new Error(`${label} is required`);
        const mm = parseLength(v, unit);
        if (mm <= 0) throw new Error(`${label} must be greater than zero`);
        return mm;
      };
      onChange({ widthMm: parse('Width', vals.width), depthMm: parse('Depth', vals.depth), heightMm: parse('Height', vals.height) });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid length');
    }
  };
  return (
    <div className="fixture-dims-inline">
      {(['width', 'depth', 'height'] as const).map((k) => (
        <TextLength key={k} id={`m-${a.id}-${k}`} label={`${k[0]!.toUpperCase()}${k.slice(1)} of ${a.id}`} unit={unit}
          value={vals[k]} onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))} />
      ))}
      {error && <p className="field-error" role="alert">⛔ {error}</p>}
      <div className="btn-row">
        <button type="button" className="btn btn-secondary btn-sm" onClick={save}>Save</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setError(null); }}>Cancel</button>
      </div>
    </div>
  );
}

/** Empty-by-default length field; the value is parsed (fractions allowed) on submit. */
function TextLength({ id, label, unit, value, onChange }: {
  id: string; label: string; unit: DisplayUnit; value: string; onChange: (e: { target: { value: string } }) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-with-unit">
        <input id={id} type="text" inputMode="decimal" autoComplete="off" value={value} onChange={onChange}
          placeholder={unit === 'in' ? 'e.g. 32 1/2' : 'e.g. 825'} />
        <span className="unit" aria-hidden="true">{unit}</span>
      </div>
    </div>
  );
}
