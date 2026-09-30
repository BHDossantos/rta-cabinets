import type { Quote } from '@rta/core';
import { useEffect, useRef, useState } from 'react';
import { ApiError, type CartView, api, errorMessage } from '../api';
import { loadCurrentCart } from '../cartActions';
import { QuoteSummary } from '../components/QuoteSummary';
import { EmptyState, ErrorState, Loading, Notice } from '../components/States';
import { cents, money, stageLabel } from '../format';
import { navigate } from '../router';
import { type DemoAccount, setCartId } from '../storage';

type CheckoutProblem =
  | { kind: 'acceptance'; totalCents: number; quote?: Quote }
  | { kind: 'incomplete' }
  | { kind: 'divergence'; message: string }
  | { kind: 'blocked'; message: string; results: { message: string; objectIds: string[] }[] }
  | { kind: 'error'; message: string; retryable: boolean };

function newKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CartPage({ account }: { account: DemoAccount }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; cart: CartView | null }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    loadCurrentCart()
      .then((cart) => live && setState({ status: 'ready', cart }))
      .catch((e) => live && setState({ status: 'error', message: errorMessage(e) }));
    return () => { live = false; };
  }, [attempt]);

  return (
    <div className="container page">
      <h1>Cart</h1>
      {state.status === 'loading' && <Loading label="Loading cart…" />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={() => setAttempt((a) => a + 1)} />}
      {state.status === 'ready' && !state.cart && (
        <EmptyState title="Your cart is empty.">
          <p>Build a cart from your design estimate, or add products from the shop.</p>
          <div className="btn-row">
            <a className="btn btn-primary" href="#/design">Go to planner</a>
            <a className="btn btn-secondary" href="#/shop">Shop materials</a>
          </div>
        </EmptyState>
      )}
      {state.status === 'ready' && state.cart && (
        <CartDetail cart={state.cart} account={account} onChange={(cart) => setState({ status: 'ready', cart })} />
      )}
    </div>
  );
}

function CartDetail({ cart, account, onChange }: { cart: CartView; account: DemoAccount; onChange: (c: CartView) => void }) {
  const [draft, setDraft] = useState<Record<string, number>>(() => Object.fromEntries(cart.lines.map((l) => [l.skuCode, l.quantity])));
  const [busy, setBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(Object.fromEntries(cart.lines.map((l) => [l.skuCode, l.quantity])));
  }, [cart]);

  const dirty = cart.lines.some((l) => draft[l.skuCode] !== l.quantity);
  const describe = (code: string) => cart.quote.lines.find((l) => l.skuCode === code)?.description ?? cart.quote.excluded.find((x) => x.skuCode === code)?.description ?? '';

  const patch = async (lines: { skuCode: string; quantity: number }[]) => {
    setBusy(true);
    setEditError(null);
    try {
      onChange(await api.patchCart(cart.id, lines));
    } catch (e) {
      setEditError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const applyDraft = () => patch(cart.lines.map((l) => ({ skuCode: l.skuCode, quantity: draft[l.skuCode] ?? l.quantity })));
  const remove = (code: string) => patch(cart.lines.filter((l) => l.skuCode !== code).map((l) => ({ skuCode: l.skuCode, quantity: draft[l.skuCode] ?? l.quantity })));
  const rebuild = async () => {
    if (!cart.projectId) return;
    setBusy(true);
    setEditError(null);
    try {
      const next = await api.cartFromDesign(cart.projectId);
      setCartId(next.id);
      onChange(next);
    } catch (e) {
      setEditError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const cmp = cart.comparison;

  return (
    <div className="cart">
      {cart.projectId ? (
        <p className="muted">From design {cart.projectId}, revision {cart.revisionNumber}.</p>
      ) : (
        <Notice tone="warning" title="Fit not verified">These items were added without a design, so they have not been checked against room measurements.</Notice>
      )}

      {cmp && (cmp.matchesDesign ? (
        <Notice tone="success" title="Cart matches the design">Quantities match design revision {cart.revisionNumber}.</Notice>
      ) : (
        <Notice tone="warning" title="Cart no longer matches the drawing">
          <p>You changed quantities after the cart was built. The drawing and the cart now differ:</p>
          <ul>
            {cmp.divergences.map((d) => <li key={d.skuCode}>{d.skuCode}: design {d.designQuantity}, cart {d.cartQuantity}</li>)}
          </ul>
          <div className="btn-row">
            <button type="button" className="btn btn-secondary" onClick={() => void rebuild()} disabled={busy}>Rebuild cart from design</button>
            <a className="btn btn-secondary" href="#/design">Update design</a>
          </div>
        </Notice>
      ))}
      {cmp && cmp.incompleteSystems.length > 0 && (
        <Notice tone="error" title="Incomplete cabinet systems">
          <ul>
            {cmp.incompleteSystems.map((x) => (
              <li key={x.skuCode}>Missing {x.missingQuantity} × {x.skuCode} ({x.role}) needed by {x.instanceIds.join(', ')}</li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="table-wrap">
        <table className="table">
          <caption>Items ({cart.lines.length})</caption>
          <thead>
            <tr><th scope="col">Item</th><th scope="col">Stage</th><th scope="col">Quantity</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr>
          </thead>
          <tbody>
            {cart.lines.map((l) => (
              <tr key={`${l.skuCode}-${l.stage}`}>
                <td><strong>{l.skuCode}</strong><div className="small">{describe(l.skuCode)}</div>{l.instanceIds.length > 0 && <div className="small muted">For {l.instanceIds.join(', ')}</div>}</td>
                <td className="small">{stageLabel(l.stage)}</td>
                <td>
                  <div className="qty">
                    <button type="button" className="btn btn-secondary btn-icon" aria-label={`Decrease ${l.skuCode}`} disabled={busy || (draft[l.skuCode] ?? 0) <= 1}
                      onClick={() => setDraft((d) => ({ ...d, [l.skuCode]: Math.max(1, (d[l.skuCode] ?? 1) - 1) }))}>−</button>
                    <input type="number" min={1} max={999} aria-label={`Quantity for ${l.skuCode}`} value={draft[l.skuCode] ?? l.quantity}
                      onChange={(e) => setDraft((d) => ({ ...d, [l.skuCode]: Math.max(1, Math.min(999, Math.floor(Number(e.target.value) || 1))) }))} />
                    <button type="button" className="btn btn-secondary btn-icon" aria-label={`Increase ${l.skuCode}`} disabled={busy}
                      onClick={() => setDraft((d) => ({ ...d, [l.skuCode]: (d[l.skuCode] ?? 0) + 1 }))}>+</button>
                  </div>
                </td>
                <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove(l.skuCode)} disabled={busy}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editError && <Notice tone="error">{editError}</Notice>}
      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={() => void applyDraft()} disabled={!dirty || busy}>
          {busy ? 'Updating…' : 'Update quantities'}
        </button>
        {dirty && <span className="small">● Quantity changes not applied yet; totals below reflect the saved cart.</span>}
      </div>

      <section className="card" aria-labelledby="quote-h">
        <h2 id="quote-h">Server quote</h2>
        <QuoteSummary quote={cart.quote} caption="Cart quote" />
      </section>

      {cart.lines.length > 0 && <Checkout cart={cart} account={account} disabled={dirty || busy} />}
    </div>
  );
}

function Checkout({ cart, account, disabled }: { cart: CartView; account: DemoAccount; disabled: boolean }) {
  const [acceptedTotal, setAcceptedTotal] = useState(cart.quote.total.amount);
  const [ackIncomplete, setAckIncomplete] = useState(false);
  const [ackDivergence, setAckDivergence] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<CheckoutProblem | null>(null);
  // One Idempotency-Key per attempt; reused only when retrying the identical request after a network failure.
  const attemptRef = useRef<{ key: string; payload: string } | null>(null);
  const incomplete = (cart.comparison?.incompleteSystems.length ?? 0) > 0;

  useEffect(() => { setAcceptedTotal(cart.quote.total.amount); setProblem(null); }, [cart]);

  const submit = async (total = acceptedTotal) => {
    const body = {
      cartId: cart.id, acceptedTotalCents: total,
      ...(ackIncomplete ? { acknowledgeIncomplete: true } : {}),
      ...(ackDivergence ? { acknowledgeDivergence: true } : {}),
    };
    const payload = JSON.stringify(body);
    if (!attemptRef.current || attemptRef.current.payload !== payload) attemptRef.current = { key: newKey(), payload };
    setSubmitting(true);
    setProblem(null);
    try {
      const r = await api.checkout(attemptRef.current.key, body);
      attemptRef.current = null;
      setCartId(null);
      navigate(`/orders/${r.orderId}`);
    } catch (e) {
      const retryable = e instanceof ApiError && (e.status === 0 || e.status >= 500);
      if (!retryable) attemptRef.current = null;
      const d = (e instanceof ApiError ? e.details : undefined) ?? {};
      if (e instanceof ApiError && e.status === 409 && d.requiresAcceptance) {
        setProblem({ kind: 'acceptance', totalCents: Number(d.totalCents), quote: d.quote as Quote | undefined });
      } else if (e instanceof ApiError && e.status === 409 && d.incompleteSystems) {
        setProblem({ kind: 'incomplete' });
      } else if (e instanceof ApiError && e.status === 409 && d.latestRevision !== undefined) {
        setProblem({ kind: 'divergence', message: e.message });
      } else if (e instanceof ApiError && e.code === 'gate_failed') {
        setProblem({ kind: 'blocked', message: e.message, results: (d.results as { message: string; objectIds: string[] }[]) ?? [] });
      } else {
        setProblem({ kind: 'error', message: errorMessage(e), retryable });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="card checkout" aria-labelledby="checkout-h">
      <h2 id="checkout-h">Checkout</h2>
      <p>
        The server re-prices your cart, confirms freight, tax and stock, and creates one order per attempt. Payment is taken on the
        payment provider's hosted page; we never see your card number.
      </p>
      {account === 'guest' && <p className="small">Checking out as a guest. Create an account to keep your design and order history together.</p>}
      {incomplete && (
        <label className="check">
          <input type="checkbox" checked={ackIncomplete} onChange={(e) => setAckIncomplete(e.target.checked)} />
          I understand some cabinets are missing required parts (listed above) and want to order anyway.
        </label>
      )}
      <p><strong>Total you are accepting: {cents(acceptedTotal)}</strong></p>

      <div aria-live="polite">
        {problem?.kind === 'acceptance' && (
          <Notice tone="warning" title="Your total has changed">
            <p>
              Previous total {cents(acceptedTotal)}. New total <strong>{cents(problem.totalCents)}</strong>
              {problem.quote && <> (freight: {problem.quote.shipping.status === 'quoted' ? `${money(problem.quote.shipping.amount)}, ${problem.quote.shipping.description ?? ''}` : 'pending'}; tax: {problem.quote.taxStatus === 'calculated' ? money(problem.quote.tax) : 'pending'})</>}.
              Nothing has been charged. Review and accept the new total to continue.
            </p>
            {problem.quote && <details><summary>See the updated quote</summary><QuoteSummary quote={problem.quote} caption="Checkout quote" /></details>}
            <div className="btn-row">
              <button type="button" className="btn btn-primary" disabled={submitting} onClick={() => { setAcceptedTotal(problem.totalCents); void submit(problem.totalCents); }}>
                Accept {cents(problem.totalCents)} and place order
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setProblem(null)}>Not now</button>
            </div>
          </Notice>
        )}
        {problem?.kind === 'incomplete' && (
          <Notice tone="error" title="Required parts missing">Confirm the checkbox above to order an incomplete system, or rebuild the cart from your design.</Notice>
        )}
        {problem?.kind === 'divergence' && (
          <Notice tone="warning" title="Your design has a newer revision">
            <p>{problem.message}. Rebuild the cart from the latest design, or confirm you want this earlier revision.</p>
            <label className="check">
              <input type="checkbox" checked={ackDivergence} onChange={(e) => setAckDivergence(e.target.checked)} /> Order the earlier revision this cart was built from
            </label>
          </Notice>
        )}
        {problem?.kind === 'blocked' && (
          <Notice tone="error" title="Design has blockers">
            <p>{problem.message}</p>
            <ul>{problem.results.map((r, i) => <li key={i}>⛔ {r.message} ({r.objectIds.join(', ')})</li>)}</ul>
            <a href="#/design">Fix in planner</a>
          </Notice>
        )}
        {problem?.kind === 'error' && (
          <Notice tone="error" title="Checkout did not complete">
            {problem.message}
            {problem.retryable && <p>Retrying is safe: the same attempt key is reused, so you will not be charged twice.</p>}
          </Notice>
        )}
      </div>

      <button type="button" className="btn btn-primary btn-lg" onClick={() => void submit()} disabled={disabled || submitting || (incomplete && !ackIncomplete)}>
        {submitting ? 'Placing order…' : 'Place order'}
      </button>
      {disabled && <p className="small">Apply or discard quantity changes before checking out.</p>}
    </section>
  );
}
