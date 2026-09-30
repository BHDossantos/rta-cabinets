import { useEffect, useId, useState } from 'react';
import { ApiError, type PublicSku, api, errorMessage } from '../api';
import { addToCart } from '../cartActions';
import { Dialog } from '../components/Dialog';
import { EmptyState, ErrorState, Loading, Notice } from '../components/States';
import { bothUnits, cents, stageLabel } from '../format';
import type { DemoAccount } from '../storage';

const KINDS = [
  { value: '', label: 'All products' },
  { value: 'body', label: 'Cabinet bodies' },
  { value: 'front', label: 'Fronts' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'filler', label: 'Fillers' },
  { value: 'surface', label: 'Surfaces' },
  { value: 'sample', label: 'Samples' },
];

const PURCHASABILITY: Record<string, string> = {
  purchasable: 'Available to order',
  quote_required: 'Quote required',
  visualization_only: 'Visualization only',
};

export function ShopPage({ account }: { account: DemoAccount }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [query, setQuery] = useState({ q: '', kind: '' });
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; items: PublicSku[] }>({ status: 'loading' });
  const [selected, setSelected] = useState<PublicSku | null>(null);
  const [attempt, setAttempt] = useState(0);
  const searchId = useId();

  // Debounce the search text.
  useEffect(() => {
    const t = setTimeout(() => setQuery({ q: q.trim(), kind }), 250);
    return () => clearTimeout(t);
  }, [q, kind]);

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    api.skus({ q: query.q, kind: query.kind })
      .then((r) => live && setState({ status: 'ready', items: r.items }))
      .catch((e) => live && setState({ status: 'error', message: errorMessage(e) }));
    return () => { live = false; };
  }, [query, attempt]);

  return (
    <div className="container page">
      <h1>Shop materials</h1>
      <p className="lead">
        Standard cabinet bodies, fronts, hardware and samples. Buying without a design? Fit has not been verified; use the{' '}
        <a href="#/design">planner</a> to check measurements first.
      </p>
      <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <div className="field">
          <label htmlFor={searchId}>Search by SKU, name or finish</label>
          <input id={searchId} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. B36 or Shaker" />
        </div>
        <div className="field">
          <label htmlFor="kind-filter">Product type</label>
          <select id="kind-filter" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
      </form>

      {state.status === 'loading' && <Loading label="Loading products…" />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={() => setAttempt((a) => a + 1)} />}
      {state.status === 'ready' && state.items.length === 0 && (
        <EmptyState title="No products match your search.">
          <button type="button" className="btn btn-secondary" onClick={() => { setQ(''); setKind(''); }}>Clear filters</button>
        </EmptyState>
      )}
      {state.status === 'ready' && state.items.length > 0 && (
        <>
          <p className="small muted" aria-live="polite">{state.items.length} product{state.items.length === 1 ? '' : 's'}</p>
          <ul className="product-grid">
            {state.items.map((s) => (
              <li key={s.code} className="product-card">
                <div className="product-thumb" aria-hidden="true">{s.code}</div>
                <h2 className="h4">{s.name}</h2>
                <p className="small muted">SKU {s.code} · {stageLabel(s.fulfillmentStage)}</p>
                <p className="small">W {bothUnits(s.dimensions.widthMm)}</p>
                <p className="price">
                  {s.retailPrice !== null && s.purchasability === 'purchasable' ? <>List price {cents(s.retailPrice)}</> : PURCHASABILITY[s.purchasability]}
                </p>
                <button type="button" className="btn btn-secondary" onClick={() => setSelected(s)} aria-label={`View details for ${s.name}`}>
                  View details
                </button>
              </li>
            ))}
          </ul>
          <p className="small muted">List prices come from the server's current price book. Trade pricing, freight and tax are applied in your cart quote.</p>
        </>
      )}

      <Dialog open={!!selected} title={selected?.name ?? ''} onClose={() => setSelected(null)} variant="drawer">
        {selected && <ProductDetail sku={selected} account={account} />}
      </Dialog>
    </div>
  );
}

function ProductDetail({ sku, account }: { sku: PublicSku; account: DemoAccount }) {
  const [qty, setQty] = useState(1);
  const [status, setStatus] = useState<{ kind: 'idle' } | { kind: 'busy' } | { kind: 'ok'; lines: number } | { kind: 'error'; message: string; needsIdentity?: boolean }>({ kind: 'idle' });
  const d = sku.dimensions;
  const canBuy = sku.purchasability === 'purchasable';

  const add = async () => {
    setStatus({ kind: 'busy' });
    try {
      const cart = await addToCart(sku.code, qty);
      setStatus({ kind: 'ok', lines: cart.lines.length });
    } catch (e) {
      setStatus({ kind: 'error', message: errorMessage(e), needsIdentity: e instanceof ApiError && e.status === 401 });
    }
  };

  return (
    <div className="product-detail">
      <p className="muted">SKU {sku.code} · {sku.kind}{sku.mounting !== 'none' ? ` · ${sku.mounting} mounted` : ''}</p>
      <table className="table compact">
        <caption>Dimensions (inches and millimeters)</caption>
        <tbody>
          <tr><th scope="row">Width</th><td>{bothUnits(d.widthMm)}</td></tr>
          <tr><th scope="row">Depth</th><td>{bothUnits(d.depthMm)}</td></tr>
          <tr><th scope="row">Height</th><td>{bothUnits(d.heightMm)}</td></tr>
        </tbody>
      </table>
      <dl className="kv">
        <div><dt>Delivery stage</dt><dd>{stageLabel(sku.fulfillmentStage)}</dd></div>
        <div><dt>Material</dt><dd>{sku.material}{sku.finish ? ` · ${sku.finish}` : ''}</dd></div>
        <div><dt>Availability</dt><dd>{PURCHASABILITY[sku.purchasability]}</dd></div>
        <div><dt>List price</dt><dd>{sku.retailPrice !== null ? cents(sku.retailPrice) : 'Quote required'}</dd></div>
        {sku.compatibleWith && sku.compatibleWith.length > 0 && (
          <div><dt>Compatible with</dt><dd>{sku.compatibleWith.join(', ')}</dd></div>
        )}
        {sku.kind === 'body' && <div><dt>Body family</dt><dd>{sku.familyId}</dd></div>}
      </dl>
      {sku.dependencies && sku.dependencies.some((x) => !x.includedInKit) && (
        <Notice tone="info" title="Needs additional parts">
          This body requires {sku.dependencies.filter((x) => !x.includedInKit).map((x) => `${x.quantity} × ${x.role}`).join(' and ')}, sold separately.
          Choose compatible parts in the planner so your system is complete.
        </Notice>
      )}
      <Notice tone="warning" title="Fit not verified">Buying outside the planner does not check your room measurements.</Notice>
      {canBuy ? (
        <div className="add-row">
          <div className="field qty-field">
            <label htmlFor="pd-qty">Quantity</label>
            <input id="pd-qty" type="number" min={1} max={99} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} />
          </div>
          <button type="button" className="btn btn-primary" onClick={add} disabled={status.kind === 'busy'}>
            {status.kind === 'busy' ? 'Adding…' : 'Add to cart'}
          </button>
        </div>
      ) : (
        <p>This item is not sold online. Request a quote through a design review.</p>
      )}
      <div aria-live="polite">
        {status.kind === 'ok' && (
          <Notice tone="success" title="Added to cart">
            <a href="#/cart">View cart</a> ({status.lines} line{status.lines === 1 ? '' : 's'})
          </Notice>
        )}
        {status.kind === 'error' && (
          <Notice tone="error" title="Could not add to cart">
            {status.message}
            {status.needsIdentity && account === 'guest' && (
              <p>
                Guests get a cart after starting a design. <a href="#/design">Start a design</a> or choose a demo account in the header.
              </p>
            )}
          </Notice>
        )}
      </div>
    </div>
  );
}
