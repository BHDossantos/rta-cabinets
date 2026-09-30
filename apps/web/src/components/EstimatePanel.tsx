import type { DesignDocument, DesignExpansion, Quote, ValidationReport } from '@rta/core';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api';
import { QuoteSummary } from './QuoteSummary';
import { ErrorState, Loading, Notice } from './States';
import { ValidationPanel } from './ValidationPanel';

type Result = { quote: Quote; expansion: DesignExpansion; validation: ValidationReport };

/** Step 3: server-calculated itemized design estimate. */
export function EstimatePanel({ doc, onSelectObject }: { doc: DesignDocument; onSelectObject: (id: string) => void }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: Result }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    api.quoteDesign(doc)
      .then((data) => live && setState({ status: 'ready', data }))
      .catch((e) => live && setState({ status: 'error', message: errorMessage(e) }));
    return () => { live = false; };
  }, [doc, attempt]);

  if (state.status === 'loading') return <Loading label="Requesting estimate from the server…" />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={() => setAttempt((a) => a + 1)} />;
  const { quote, expansion, validation } = state.data;

  return (
    <div className="estimate">
      <ValidationPanel report={validation} source="server" onSelectObject={onSelectObject} />
      {expansion.incomplete.length > 0 && (
        <Notice tone="warning" title="Incomplete cabinet systems">
          <ul>
            {expansion.incomplete.map((x) => <li key={`${x.instanceId}-${x.role}`}>{x.instanceId}: {x.message}. Select a compatible {x.role} in the layout.</li>)}
          </ul>
        </Notice>
      )}
      {expansion.flagged.length > 0 && (
        <Notice tone="warning" title="Flagged selections (not priced here)">
          <ul>
            {expansion.flagged.map((f) => <li key={f.refId + f.label}>{f.label} ({f.refId}): {f.status === 'quote_required' ? 'quote required' : 'visualization only'}</li>)}
          </ul>
        </Notice>
      )}
      {doc.instances.length === 0 ? (
        <Notice tone="info" title="Nothing to price yet">Add cabinets in the layout step to get an itemized estimate.</Notice>
      ) : (
        <QuoteSummary quote={quote} caption="Itemized design estimate" />
      )}
    </div>
  );
}
