import { type FormEvent, useState } from 'react';
import { api, errorMessage } from '../api';
import { Notice } from '../components/States';
import { type DemoAccount, getProjectId } from '../storage';

/** Draft disclosure identifier recorded with consent; final text requires business/legal approval. */
const DISCLOSURE_VERSION = 'fin-referral-disclosure-DRAFT-2026-09';

export function FinancingPage({ account }: { account: DemoAccount }) {
  const projectId = getProjectId();
  const [amount, setAmount] = useState('');
  const [linkProject, setLinkProject] = useState(!!projectId);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<{ status: 'idle' } | { status: 'busy' } | { status: 'error'; message: string } | { status: 'done'; id: string; message: string }>({ status: 'idle' });
  const [amountError, setAmountError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const dollars = Number(amount.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setAmountError('Enter the amount you would like to discuss, in dollars');
      return;
    }
    setAmountError(null);
    if (!consent) return;
    setState({ status: 'busy' });
    try {
      const r = await api.financingReferral({
        projectId: linkProject && projectId ? projectId : undefined,
        requestedAmountCents: Math.round(dollars * 100),
        consent: { accepted: true, disclosureVersion: DISCLOSURE_VERSION },
      });
      setState({ status: 'done', id: r.id, message: r.message });
    } catch (err) {
      setState({ status: 'error', message: errorMessage(err) });
    }
  };

  return (
    <div className="container page narrow">
      <h1>Financing</h1>
      <p className="lead">
        Financing is provided by an external financing partner, not by RTA Cabinet Factory. The partner decides eligibility,
        terms and any required disclosures.
      </p>
      <h2>How the referral works</h2>
      <ol>
        <li>With your consent, we send your name, email and the amount you want to discuss to the partner.</li>
        <li>The partner contacts you. Any credit application, identity check or income details are handled in the partner's own secure application, never on this site.</li>
        <li>Submitting this form is a request to be contacted. It is not an application or a credit approval, and no rate or terms are promised here.</li>
      </ol>

      {account === 'guest' ? (
        <Notice tone="info" title="Sign in required">
          A referral is linked to your account so we can record your consent. In this development build, choose a demo account in the header.
        </Notice>
      ) : state.status === 'done' ? (
        <Notice tone="success" title="Submitted for contact — not a credit approval">
          <p>Reference {state.id}. {state.message}</p>
          <p>The financing partner will contact you directly.</p>
        </Notice>
      ) : (
        <form className="card stack" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="fin-amount">Amount you would like to discuss (USD)</label>
            <div className="input-with-unit">
              <input id="fin-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
                aria-invalid={amountError ? true : undefined} aria-describedby={amountError ? 'fin-amount-err' : undefined} />
              <span className="unit" aria-hidden="true">USD</span>
            </div>
            {amountError && <span id="fin-amount-err" className="field-error" role="alert">⛔ {amountError}</span>}
          </div>
          {projectId && (
            <label className="check">
              <input type="checkbox" checked={linkProject} onChange={(e) => setLinkProject(e.target.checked)} />
              Include my current design project reference ({projectId})
            </label>
          )}
          <div className="consent card surface">
            <p className="small">
              <strong>Disclosure ({DISCLOSURE_VERSION}).</strong> By checking the box below you agree that RTA Cabinet Factory may share your
              name, email, project reference and requested amount with its financing partner so the partner can contact you about financing.
              This does not authorize a credit check. You can withdraw consent by contacting support. Marketing contact is not included.
            </p>
            <label className="check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
              I consent to sharing my contact details with the financing partner for this purpose.
            </label>
          </div>
          {state.status === 'error' && <Notice tone="error">{state.message}</Notice>}
          <button type="submit" className="btn btn-primary" disabled={!consent || state.status === 'busy'}>
            {state.status === 'busy' ? 'Submitting…' : 'Request contact from partner'}
          </button>
          {!consent && <p className="small">Consent is required to send a referral.</p>}
        </form>
      )}
    </div>
  );
}
