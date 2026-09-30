import type { Severity, ValidationReport } from '@rta/core';
import { FIT_LABEL, SEVERITY_ICON, SEVERITY_LABEL } from '../format';

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`badge badge-${severity}`}>
      <span aria-hidden="true">{SEVERITY_ICON[severity]} </span>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function FitBadge({ status }: { status: string }) {
  const f = FIT_LABEL[status] ?? { icon: '?', text: status };
  return (
    <span className={`badge badge-fit-${status}`}>
      <span aria-hidden="true">{f.icon} </span>
      {f.text}
    </span>
  );
}

/** Live validation list. Clicking an object reference selects it on the plan. */
export function ValidationPanel({
  report, source, onSelectObject, selectedId,
}: {
  report: ValidationReport | null;
  source: 'preview' | 'server';
  onSelectObject?: (id: string) => void;
  selectedId?: string | null;
}) {
  if (!report) return <p className="muted">Validation will run once the room is defined.</p>;
  return (
    <section className="validation" aria-labelledby="validation-h">
      <h3 id="validation-h">Design checks</h3>
      <p aria-live="polite">
        <FitBadge status={report.fitStatus} />
      </p>
      <p className="muted small">
        {report.counts.blocker} blocker{report.counts.blocker === 1 ? '' : 's'}, {report.counts.review_required} review required,{' '}
        {report.counts.advisory} advisory · rules {report.rulesetVersion} ·{' '}
        {source === 'preview' ? 'instant preview in your browser; the server re-checks when you request an estimate' : 'checked by the server'}
      </p>
      {report.results.length === 0 ? (
        <p>No issues found by the current rules.</p>
      ) : (
        <ul className="validation-list">
          {report.results.map((r, i) => (
            <li key={`${r.ruleId}-${r.objectIds.join()}-${i}`} className={`validation-item sev-${r.severity}${r.objectIds.includes(selectedId ?? '') ? ' is-related' : ''}`}>
              <SeverityBadge severity={r.severity} />
              <div>
                <p className="validation-msg">{r.message}</p>
                {r.suggestion && <p className="small">Suggested fix: {r.suggestion}</p>}
                <p className="small muted">
                  Rule {r.ruleId} v{r.ruleVersion}
                  {r.objectIds.length > 0 && ' · Affects '}
                  {r.objectIds.map((id) => (
                    <button key={id} type="button" className="link-btn" onClick={() => onSelectObject?.(id)}>
                      {id}
                    </button>
                  ))}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
