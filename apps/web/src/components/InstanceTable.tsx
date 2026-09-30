import { type DesignDocument, type DesignInstance, type DisplayUnit, type Severity, formatLength, wallsOf } from '@rta/core';
import type { PublicSku } from '../api';
import { SEVERITY_ICON, SEVERITY_LABEL } from '../format';
import { BodyOptions, FrontOptions, HingeOptions } from './cabinetParts';
import { LengthInput } from './LengthInput';

/** Structured object list: every placement property is editable without a pointer. */
export function InstanceTable({
  doc, skus, items, unit, selectedId, issues, onSelect, onChange, onDelete, onDuplicate,
}: {
  doc: DesignDocument;
  skus: Map<string, PublicSku>;
  items: PublicSku[];
  unit: DisplayUnit;
  selectedId: string | null;
  issues: Map<string, Severity>;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<DesignInstance>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const walls = wallsOf(doc.room.outline);
  if (doc.instances.length === 0) {
    return (
      <div className="state state-empty">
        <p className="state-title">No cabinets placed yet.</p>
        <p>Use “Add a cabinet” to place one by wall and offset.</p>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="table instance-table">
        <caption>Placed cabinets ({doc.instances.length})</caption>
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Cabinet</th>
            <th scope="col">Wall</th>
            <th scope="col">Offset</th>
            <th scope="col">Height above floor</th>
            <th scope="col">Front</th>
            <th scope="col">Hinge</th>
            <th scope="col">Checks</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {doc.instances.map((inst) => {
            const body = skus.get(inst.skuCode);
            const sev = issues.get(inst.id);
            const selected = inst.id === selectedId;
            return (
              <tr key={inst.id} className={selected ? 'is-selected' : undefined} aria-selected={selected}>
                <th scope="row">
                  <button type="button" className="link-btn" onClick={() => onSelect(inst.id)} aria-pressed={selected}>
                    {inst.id}
                  </button>
                  {selected && <span className="small"> (selected)</span>}
                </th>
                <td>
                  <select aria-label={`Cabinet body for ${inst.id}`} value={inst.skuCode} onChange={(e) => onChange(inst.id, { skuCode: e.target.value })}>
                    {!body && <option value={inst.skuCode}>{inst.skuCode} (unavailable)</option>}
                    <BodyOptions items={items} />
                  </select>
                  {body && <div className="small muted">{formatLength(body.dimensions.widthMm, unit)} W</div>}
                </td>
                <td>
                  <select aria-label={`Wall for ${inst.id}`} value={inst.wallId} onChange={(e) => onChange(inst.id, { wallId: e.target.value })}>
                    {!walls.some((w) => w.id === inst.wallId) && <option value={inst.wallId}>{inst.wallId} (missing)</option>}
                    {walls.map((w) => <option key={w.id} value={w.id}>{w.id}</option>)}
                  </select>
                </td>
                <td>
                  <LengthInput label={`Offset for ${inst.id}`} hideLabel valueMm={inst.offsetMm} unit={unit} onCommit={(mm) => onChange(inst.id, { offsetMm: mm })} />
                </td>
                <td>
                  <LengthInput label={`Height above floor for ${inst.id}`} hideLabel valueMm={inst.elevationMm} unit={unit} onCommit={(mm) => onChange(inst.id, { elevationMm: mm })} />
                </td>
                <td>
                  <select aria-label={`Front for ${inst.id}`} value={inst.frontSkuCode ?? ''} onChange={(e) => onChange(inst.id, { frontSkuCode: e.target.value || undefined })}>
                    {inst.frontSkuCode && !items.some((s) => s.code === inst.frontSkuCode) && <option value={inst.frontSkuCode}>{inst.frontSkuCode} (unavailable)</option>}
                    <FrontOptions body={body} items={items} />
                  </select>
                </td>
                <td>
                  <select aria-label={`Hinge for ${inst.id}`} value={inst.hingeSkuCode ?? ''} onChange={(e) => onChange(inst.id, { hingeSkuCode: e.target.value || undefined })}>
                    {inst.hingeSkuCode && !items.some((s) => s.code === inst.hingeSkuCode) && <option value={inst.hingeSkuCode}>{inst.hingeSkuCode} (unavailable)</option>}
                    <HingeOptions body={body} items={items} />
                  </select>
                </td>
                <td className="small">{sev ? <span className={`badge badge-${sev}`}>{SEVERITY_ICON[sev]} {SEVERITY_LABEL[sev]}</span> : '✓ OK'}</td>
                <td>
                  <div className="btn-row tight">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDuplicate(inst.id)} aria-label={`Duplicate ${inst.id}`}>Duplicate</button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => onDelete(inst.id)} aria-label={`Delete ${inst.id}`}>Delete</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
