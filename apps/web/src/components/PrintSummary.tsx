import { type DesignDocument, type DisplayUnit, type ValidationReport, formatLength, wallsOf } from '@rta/core';
import type { PublicSku } from '../api';
import { SEVERITY_ICON, SEVERITY_LABEL, FIT_LABEL } from '../format';
import { PlanView } from './PlanView';

/**
 * Printable plan summary (hidden on screen). Includes revision id, units, item
 * legend, warnings and generation time (spec section 8, portability).
 */
export function PrintSummary({
  doc, skus, unit, projectName, revisionId, report, generatedAt,
}: {
  doc: DesignDocument;
  skus: Map<string, PublicSku>;
  unit: DisplayUnit;
  projectName: string;
  revisionId: string | null;
  report: ValidationReport | null;
  generatedAt: string | null;
}) {
  const walls = wallsOf(doc.room.outline);
  return (
    <section className="print-only print-summary" aria-hidden="true">
      <h1>{projectName}: plan summary</h1>
      <table className="table compact">
        <tbody>
          <tr><th scope="row">Revision</th><td>{revisionId ?? 'Unsaved draft (no revision id)'}</td></tr>
          <tr><th scope="row">Generated</th><td>{generatedAt ?? new Date().toISOString()}</td></tr>
          <tr><th scope="row">Units</th><td>Dimensions shown in {unit === 'in' ? 'inches' : 'millimeters'}; stored in millimeters. Catalog {doc.catalogVersion}.</td></tr>
          <tr><th scope="row">Scale</th><td>Not to scale. Do not measure from this printout; use the written dimensions.</td></tr>
          <tr>
            <th scope="row">Room</th>
            <td>
              {walls.map((w) => `${w.id} ${formatLength(w.lengthMm, unit)}`).join(', ')} · ceiling{' '}
              {doc.room.ceilingHeightMm === null ? 'unknown' : `${formatLength(doc.room.ceilingHeightMm, unit)} (${doc.room.ceilingSource})`} · measurements: {doc.room.measurementSource}
            </td>
          </tr>
          <tr><th scope="row">Fit status</th><td>{report ? FIT_LABEL[report.fitStatus]?.text : 'Not checked'}</td></tr>
        </tbody>
      </table>
      <div className="print-plan">
        <PlanView doc={doc} skus={skus} unit={unit} interactive={false} title="Plan view (not to scale)" />
      </div>
      <h2>Item legend</h2>
      <table className="table compact">
        <thead>
          <tr><th>ID</th><th>SKU</th><th>Description</th><th>Wall</th><th>Offset</th><th>Height above floor</th><th>W × D × H</th><th>Front</th><th>Hinge</th></tr>
        </thead>
        <tbody>
          {doc.instances.map((i) => {
            const s = skus.get(i.skuCode);
            return (
              <tr key={i.id}>
                <td>{i.id}</td><td>{i.skuCode}</td><td>{s?.name ?? 'Unknown SKU'}</td><td>{i.wallId}</td>
                <td>{formatLength(i.offsetMm, unit)}</td><td>{formatLength(i.elevationMm, unit)}</td>
                <td>{s ? `${formatLength(s.dimensions.widthMm, unit)} × ${formatLength(s.dimensions.depthMm, unit)} × ${formatLength(s.dimensions.heightMm, unit)}` : '—'}</td>
                <td>{i.frontSkuCode ?? 'none'}</td><td>{i.hingeSkuCode ?? 'none'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h2>Outstanding warnings</h2>
      {report && report.results.length > 0 ? (
        <ul>
          {report.results.map((r, i) => (
            <li key={i}>{SEVERITY_ICON[r.severity]} {SEVERITY_LABEL[r.severity]}: {r.message} ({r.objectIds.join(', ')}; rule {r.ruleId} v{r.ruleVersion})</li>
          ))}
        </ul>
      ) : (
        <p>None reported by rules {report?.rulesetVersion ?? ''}.</p>
      )}
      <p>
        Pricing is not included in this summary. Freight, tax, labor, installation and countertops are not included; request an estimate for current prices.
      </p>
    </section>
  );
}
