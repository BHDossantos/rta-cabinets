import { type FormEvent, useState } from 'react';
import { api, errorMessage } from '../api';
import { EmptyState, ErrorState, Loading, Notice } from '../components/States';
import type { DemoAccount } from '../storage';

type Pro = { orgId: string; displayName: string; services: string[]; verified: boolean };

export function InstallersPage({ account }: { account: DemoAccount }) {
  const [zip, setZip] = useState('');
  const [zipError, setZipError] = useState<string | null>(null);
  const [search, setSearch] = useState<{ status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; zip: string; results: Pro[]; message?: string }>({ status: 'idle' });
  const [chosen, setChosen] = useState<string[]>([]);
  const [summary, setSummary] = useState('');
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState<{ id: string; recipients: string[]; history: { orgId: string; action: string; at: string }[] } | null>(null);
  const [sendState, setSendState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  const doSearch = async (e?: FormEvent) => {
    e?.preventDefault();
    const z = zip.trim();
    if (!/^\d{5}$/.test(z)) {
      setZipError('Enter a 5-digit ZIP code');
      return;
    }
    setZipError(null);
    setSearch({ status: 'loading' });
    setChosen([]);
    setSent(null);
    try {
      const r = await api.directory(z);
      setSearch({ status: 'ready', zip: z, results: r.results, message: r.message });
    } catch (err) {
      setSearch({ status: 'error', message: errorMessage(err) });
    }
  };

  const nameOf = (id: string) => (search.status === 'ready' ? search.results.find((r) => r.orgId === id)?.displayName : undefined) ?? id;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (search.status !== 'ready' || chosen.length === 0) return;
    setSendState({ busy: true, error: null });
    try {
      const r = await api.createLead({ service: 'cabinet_install', zip: search.zip, recipients: chosen, summary, phone: phone || undefined });
      setSent(r);
      setSendState({ busy: false, error: null });
    } catch (err) {
      setSendState({ busy: false, error: errorMessage(err) });
    }
  };

  return (
    <div className="container page">
      <h1>Find an installer</h1>
      <p className="lead">
        Installers quote and contract for labor directly with you; we supply the materials. Only professionals with current
        verification who serve your ZIP code are listed.
      </p>
      <form className="filters" onSubmit={doSearch} role="search">
        <div className="field">
          <label htmlFor="zip">ZIP code</label>
          <input id="zip" inputMode="numeric" autoComplete="postal-code" maxLength={5} value={zip} onChange={(e) => setZip(e.target.value)}
            aria-invalid={zipError ? true : undefined} aria-describedby={zipError ? 'zip-err' : undefined} />
          {zipError && <span id="zip-err" className="field-error" role="alert">⛔ {zipError}</span>}
        </div>
        <button type="submit" className="btn btn-primary">Search</button>
      </form>

      {search.status === 'loading' && <Loading label="Searching installers…" />}
      {search.status === 'error' && <ErrorState message={search.message} onRetry={() => void doSearch()} />}
      {search.status === 'ready' && search.results.length === 0 && (
        <EmptyState title={search.message ?? 'No installers found for this ZIP code.'}>
          <p>Try a nearby ZIP code, or contact support for manual assistance.</p>
        </EmptyState>
      )}
      {search.status === 'ready' && search.results.length > 0 && !sent && (
        <form onSubmit={submit} className="stack">
          <fieldset>
            <legend>Choose who should receive your request ({search.results.length} found for {search.zip})</legend>
            <ul className="pro-list">
              {search.results.map((p) => (
                <li key={p.orgId} className="card">
                  <label className="check">
                    <input type="checkbox" checked={chosen.includes(p.orgId)}
                      onChange={(e) => setChosen((c) => (e.target.checked ? [...c, p.orgId] : c.filter((x) => x !== p.orgId)))} />
                    <span>
                      <strong>{p.displayName}</strong>
                      <span className="small"> · {p.verified ? '✓ Verification current' : 'Not verified'} · Services: {p.services.join(', ').replace(/_/g, ' ')}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="small muted">A paid membership badge does not mean a professional is licensed, insured or vetted. Check credentials before hiring.</p>
          </fieldset>

          {account === 'guest' ? (
            <Notice tone="info" title="Sign in required to request a quote">
              Requests share your name and email with the installers you choose, so you need an account. In this development build, choose
              a demo account in the header.
            </Notice>
          ) : (
            <>
              <div className="field">
                <label htmlFor="lead-summary">Describe your project</label>
                <textarea id="lead-summary" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={1000}
                  placeholder="e.g. Kitchen, 3 base cabinets on one wall, cabinets ordered from the factory" />
              </div>
              <div className="field">
                <label htmlFor="lead-phone">Phone (optional)</label>
                <input id="lead-phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="card surface">
                <h2 className="h4">Who receives this request</h2>
                {chosen.length === 0 ? (
                  <p>No one yet. Select at least one installer above.</p>
                ) : (
                  <>
                    <p>Only these installers will receive it (it is not sent to anyone else):</p>
                    <ul>{chosen.map((c) => <li key={c}><strong>{nameOf(c)}</strong></li>)}</ul>
                    <p className="small">They will see: your name, email{phone ? ', phone' : ''}, ZIP {search.zip} and your project description. No financing or payment information is shared.</p>
                  </>
                )}
              </div>
              {sendState.error && <Notice tone="error">{sendState.error}</Notice>}
              <button type="submit" className="btn btn-primary" disabled={chosen.length === 0 || sendState.busy}>
                {sendState.busy ? 'Sending…' : `Send request to ${chosen.length} installer${chosen.length === 1 ? '' : 's'}`}
              </button>
            </>
          )}
        </form>
      )}

      {sent && (
        <Notice tone="success" title="Request sent">
          <p>Reference {sent.id}. Delivered to:</p>
          <ul>
            {sent.history.map((h) => <li key={h.orgId}>{nameOf(h.orgId)}: {h.action} {new Date(h.at).toLocaleString()}</li>)}
          </ul>
          <p>Each installer responds directly. Response status will appear here as they reply.</p>
        </Notice>
      )}
    </div>
  );
}
