import { useEffect, useState } from 'react';
import { type OrderView, api, errorMessage } from '../api';
import { QuoteSummary } from '../components/QuoteSummary';
import { ErrorState, Loading, Notice } from '../components/States';
import { GROUP_STATUS_LABEL, PAYMENT_LABEL, cents, stageLabel } from '../format';

export function OrderPage({ id }: { id: string }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; order: OrderView }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [mockPay, setMockPay] = useState(false);
  const [paying, setPaying] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  useEffect(() => {
    api.health().then((h) => setMockPay(h.mockPayments)).catch(() => setMockPay(false));
  }, []);

  const testPay = async (outcome: 'succeeded' | 'failed') => {
    setPaying({ busy: true, error: null });
    try {
      await api.testPayment(id, outcome);
      setPaying({ busy: false, error: null });
      setAttempt((a) => a + 1);
    } catch (e) {
      setPaying({ busy: false, error: errorMessage(e) });
    }
  };

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    api.getOrder(id)
      .then((order) => live && setState({ status: 'ready', order }))
      .catch((e) => live && setState({ status: 'error', message: errorMessage(e) }));
    return () => { live = false; };
  }, [id, attempt]);

  if (state.status === 'loading') return <div className="container page"><Loading label="Loading order…" /></div>;
  if (state.status === 'error') return <div className="container page"><h1>Order</h1><ErrorState message={state.message} onRetry={() => setAttempt((a) => a + 1)} /></div>;
  const o = state.order;
  const paymentLabel = PAYMENT_LABEL[o.paymentState] ?? o.paymentState;

  return (
    <div className="container page order">
      <h1>{o.paymentState === 'paid' ? 'Order confirmed' : 'Order received'}</h1>
      <Notice tone="info" title="What this means">
        {o.paymentState === 'paid'
          ? 'Payment has been verified. The factory reviews your order next, then releases it to production.'
          : 'Your order has been recorded. It is confirmed once the payment provider verifies your payment; this page updates when that happens.'}
      </Notice>
      <dl className="kv order-kv">
        <div><dt>Order reference</dt><dd><strong className="order-ref">{o.id}</strong></dd></div>
        <div><dt>Payment status</dt><dd><span className="badge badge-neutral" data-testid="payment-state">{o.paymentState === 'paid' ? '✓' : o.paymentState === 'failed' ? '⛔' : '⏳'} {paymentLabel}</span></dd></div>
        <div><dt>Purchased design revision</dt><dd>{o.projectId ? `${o.projectId}@r${o.revisionNumber}` : 'No design (direct purchase)'}</dd></div>
        <div><dt>Production</dt><dd>{o.manufacturingState === 'released' ? 'Released to production' : 'Not yet released to production'}</dd></div>
        <div><dt>Order total</dt><dd>{cents(o.totalCents)}</dd></div>
        <div><dt>Placed</dt><dd>{new Date(o.createdAt).toLocaleString()}</dd></div>
      </dl>

      {mockPay && o.paymentState === 'pending' && (
        <section className="card test-payment" aria-labelledby="testpay-h">
          <h2 id="testpay-h" className="h3">Test payment <span className="badge badge-neutral">development only</span></h2>
          <p className="small">
            No payment provider is connected yet. These buttons send the server a simulated provider notification for this order’s
            total of <strong>{cents(o.totalCents)}</strong>, so you can follow the order through payment. No money moves.
          </p>
          {paying.error && <Notice tone="error" title="Test payment failed">{paying.error}</Notice>}
          <div className="btn-row">
            <button type="button" className="btn btn-primary" disabled={paying.busy} onClick={() => void testPay('succeeded')}>
              {paying.busy ? 'Processing…' : 'Simulate successful payment'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={paying.busy} onClick={() => void testPay('failed')}>
              Simulate declined payment
            </button>
          </div>
        </section>
      )}
      {o.paymentState === 'failed' && (
        <Notice tone="error" title="Payment was declined">The reserved stock was released. Return to your cart to try again.</Notice>
      )}

      <section className="card" aria-labelledby="groups-h">
        <h2 id="groups-h">Delivery stages</h2>
        <p className="small muted">Items ship in separate stages. Lead times are confirmed after payment and factory review.</p>
        <ul className="group-list">
          {o.fulfillment.groups.map((g) => {
            const lines = o.lines.filter((l) => l.stage === g.stage);
            return (
              <li key={g.stage} className="card group-card">
                <h3 className="h4">{stageLabel(g.stage)}</h3>
                <p><strong>Status:</strong> {GROUP_STATUS_LABEL[g.status] ?? g.status} · {g.orderedQuantity} item{g.orderedQuantity === 1 ? '' : 's'}</p>
                <ul className="small">
                  {lines.map((l) => <li key={l.id}>{l.quantity} × {l.skuCode}: {l.description}</li>)}
                </ul>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card" aria-labelledby="ord-quote-h">
        <h2 id="ord-quote-h">Order pricing</h2>
        <QuoteSummary quote={o.quote} caption="Priced order lines" />
      </section>

      <section aria-labelledby="next-h">
        <h2 id="next-h">Next steps</h2>
        <ol>
          {o.paymentState !== 'paid' && <li>Complete payment on the payment provider's page if you have not already.</li>}
          {o.paymentState !== 'paid' && <li>We confirm the order after the provider verifies payment.</li>}
          <li>The factory reviews your order before production is released.</li>
          <li>You receive shipment details for each delivery stage.</li>
        </ol>
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={() => setAttempt((a) => a + 1)}>Refresh status</button>
          <a className="btn btn-secondary" href="#/installers">Find an installer</a>
        </div>
      </section>
    </div>
  );
}
