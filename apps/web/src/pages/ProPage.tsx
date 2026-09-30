import { useEffect, useState } from 'react';
import { type MeView, api, errorMessage } from '../api';
import { ErrorState, Loading, Notice } from '../components/States';
import type { DemoAccount } from '../storage';

export function ProPage({ account }: { account: DemoAccount }) {
  const [me, setMe] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; me: MeView }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setMe({ status: 'loading' });
    api.me()
      .then((m) => live && setMe({ status: 'ready', me: m }))
      .catch((e) => live && setMe({ status: 'error', message: errorMessage(e) }));
    return () => { live = false; };
  }, [attempt, account]);

  return (
    <div className="container page">
      <h1>Pro membership</h1>
      <p className="lead">For contractors, designers and other trade buyers who plan and order cabinets for clients.</p>

      <div className="grid-2">
        <section className="card plan-card" aria-labelledby="plan-h">
          <h2 id="plan-h">Pro Annual (pilot)</h2>
          <p className="price">Price: set by the business, pending approval</p>
          <ul>
            <li>Trade pricing on eligible lines, applied by the server in every quote</li>
            <li>Access to Pro-only cabinet configurations</li>
            <li>Access to installer leads, subject to verification</li>
            <li>Project tools for client work</li>
          </ul>
          <p className="small muted">Plan limits and billing terms are being finalized. Enrollment opens once pricing is approved.</p>
          <button type="button" className="btn btn-primary" disabled aria-describedby="plan-h">Enrollment not open yet</button>
        </section>

        <section className="card" aria-labelledby="verify-h">
          <h2 id="verify-h">Membership is not verification</h2>
          <p>
            Paying for a membership gives access to tools and pricing. It does not mean a business is licensed, insured or vetted.
            Directory listing and lead access require a separate verification of the credentials our verification policy asks for.
          </p>
          <p>A membership badge must never be presented to customers as a license, insurance or quality endorsement.</p>
        </section>
      </div>

      <section className="card" aria-labelledby="status-h">
        <h2 id="status-h">Your current access</h2>
        {me.status === 'loading' && <Loading />}
        {me.status === 'error' && <ErrorState message={me.message} onRetry={() => setAttempt((a) => a + 1)} />}
        {me.status === 'ready' && (
          me.me.user ? (
            <ul className="kv-list">
              <li>Signed in as <strong>{me.me.user.name}</strong> ({me.me.user.roles.join(', ')})</li>
              <li>{me.me.entitlement.tradePricing ? '✓ Trade pricing active' : '✕ Trade pricing not active'}</li>
              <li>{me.me.entitlement.proOnlySkus ? '✓ Pro-only configurations available' : '✕ Pro-only configurations not available'}</li>
              <li>{me.me.entitlement.leadAccess ? '✓ Lead access included in plan' : '✕ No lead access'}</li>
            </ul>
          ) : (
            <Notice tone="info" title="Not signed in">Choose the Pro demo account in the header to see trade pricing in estimates and carts.</Notice>
          )
        )}
      </section>
    </div>
  );
}
