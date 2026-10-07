import { useEffect, useMemo, useState } from 'react';
import { type CollectionView, api, errorMessage } from '../api';
import { addToCart } from '../cartActions';
import { EmptyState, ErrorState, Loading, Notice } from '../components/States';
import { cents } from '../format';
import { navigate } from '../router';
import { getPreferredFinish, setPreferredFinish } from '../storage';

type Data = Awaited<ReturnType<typeof api.collections>>;

/**
 * Door-style collections. Patterns adopted from leading cabinet sites: a "10x10
 * kitchen" price on every style for like-for-like comparison, sample doors from
 * the style page, stock and lead-time badges, and choosing a style once for the
 * whole design. Every price here comes from the server's pricing engine.
 */
export function CollectionsPage() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: Data }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [sort, setSort] = useState<'price' | 'name'>('price');
  const [preferred, setPreferred] = useState(getPreferredFinish());
  const [sampleState, setSampleState] = useState<Record<string, { busy?: boolean; ok?: boolean; error?: string }>>({});

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    api.collections()
      .then((data) => live && setState({ status: 'ready', data }))
      .catch((e) => live && setState({ status: 'error', message: errorMessage(e) }));
    return () => { live = false; };
  }, [attempt]);

  const sorted = useMemo(() => {
    if (state.status !== 'ready') return [];
    const list = [...state.data.collections];
    if (sort === 'name') return list.sort((a, b) => a.name.localeCompare(b.name));
    return list.sort((a, b) => (a.tenByTen.retailCents ?? Infinity) - (b.tenByTen.retailCents ?? Infinity));
  }, [state, sort]);

  if (state.status === 'loading') return <div className="container page"><Loading label="Loading door styles…" /></div>;
  if (state.status === 'error') return <div className="container page"><h1>Door styles</h1><ErrorState message={state.message} onRetry={() => setAttempt((a) => a + 1)} /></div>;
  const def = state.data.tenByTenDefinition;

  const orderSample = async (c: CollectionView) => {
    if (!c.sample) return;
    setSampleState((s) => ({ ...s, [c.id]: { busy: true } }));
    try {
      await addToCart(c.sample.code, 1);
      setSampleState((s) => ({ ...s, [c.id]: { ok: true } }));
    } catch (e) {
      setSampleState((s) => ({ ...s, [c.id]: { error: errorMessage(e) } }));
    }
  };
  const designWith = (c: CollectionView) => {
    setPreferredFinish(c.finish);
    setPreferred(c.finish);
    navigate('/design');
  };

  return (
    <div className="container page">
      <h1>Door styles</h1>
      <p className="lead">
        Every style goes on the same stocked cabinet bodies. Pick a door style, see what a standard kitchen costs in it, and order a
        sample door to see the color at home.
      </p>

      <div className="filters" role="group" aria-label="Sort styles">
        <div className="field">
          <label htmlFor="col-sort">Sort by</label>
          <select id="col-sort" value={sort} onChange={(e) => setSort(e.target.value as 'price' | 'name')}>
            <option value="price">10x10 price, low to high</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      {sorted.length === 0 ? <EmptyState title="No door styles are available yet" /> : (
        <ul className="collection-grid">
          {sorted.map((c) => {
            const ss = sampleState[c.id] ?? {};
            return (
              <li key={c.id} className="card collection-card">
                <div className="swatch" style={{ background: c.swatchHex }} role="img" aria-label={`${c.name} color swatch`} />
                <h2 className="h3">{c.name}{preferred === c.finish && <span className="badge badge-neutral"> ✓ Your style</span>}</h2>
                <p className="small muted">{c.doorStyle.replace('_', ' ')} door · {c.material}{c.exteriorRated ? ' · outdoor rated' : ''}</p>
                <p className="small">{c.description}</p>

                <div className="ten-by-ten">
                  {c.tenByTen.available ? (
                    <>
                      <span className="small">10x10 kitchen, cabinets only</span>
                      <strong className="price">{cents(c.tenByTen.retailCents!)}</strong>
                      {c.tenByTen.tradeCents !== null && <span className="small">Your trade price: <strong>{cents(c.tenByTen.tradeCents)}</strong></span>}
                    </>
                  ) : (
                    <span className="small">10x10 price not available: {c.tenByTen.missing.length} standard cabinet{c.tenByTen.missing.length === 1 ? '' : 's'} not offered in this style.</span>
                  )}
                </div>

                <ul className="badges" aria-label="Availability">
                  <li className="badge badge-neutral">{c.bodiesInStock ? '✓ Cabinet bodies in stock' : '⏳ Some bodies on backorder'}</li>
                  <li className="badge badge-neutral">
                    {c.frontLeadTimeDays ? `Doors made to order: ${c.frontLeadTimeDays.min}–${c.frontLeadTimeDays.max} business days` : 'Door lead time to be confirmed'}
                  </li>
                </ul>

                <div className="btn-row">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => designWith(c)}>Design with this style</button>
                  {c.sample && (
                    <button type="button" className="btn btn-secondary btn-sm" disabled={ss.busy} onClick={() => void orderSample(c)}>
                      {ss.busy ? 'Adding…' : `Order sample door${c.sample.priceCents !== null ? ` (${cents(c.sample.priceCents)})` : ''}`}
                    </button>
                  )}
                </div>
                <div aria-live="polite">
                  {ss.ok && <Notice tone="success" title="Sample added">Samples ship separately from cabinets. <a href="#/cart">View cart</a></Notice>}
                  {ss.error && <Notice tone="error" title="Could not add sample">{ss.error}</Notice>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section className="card" aria-labelledby="tbt-h">
        <h2 id="tbt-h" className="h3">What is a 10x10 kitchen?</h2>
        <p>
          A common way to compare cabinet prices: an L-shaped kitchen with two 10-foot walls. Our 10x10 is always this exact list,
          priced from the current price list (version {state.data.collections[0]?.tenByTen.priceBookVersion}), so styles compare like for like.
        </p>
        <ul>{def.items.map((i) => <li key={i.bodyCode}>{i.quantity} × {i.label} with its door and hinges</li>)}</ul>
        <p className="small muted">Not included: {def.excludes.join(', ')}. Your own kitchen will differ; the planner prices your exact layout.</p>
      </section>

      <section className="card" aria-labelledby="cmp-h">
        <h2 id="cmp-h" className="h3">Compare styles</h2>
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>Style</th><th>Door</th><th>Material</th><th className="num">10x10 price</th><th>Doors ship in</th><th>Sample</th></tr></thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.id}>
                  <th scope="row">{c.name}</th>
                  <td>{c.doorStyle.replace('_', ' ')}</td>
                  <td>{c.material}</td>
                  <td className="num">{c.tenByTen.retailCents !== null ? cents(c.tenByTen.retailCents) : 'n/a'}</td>
                  <td>{c.frontLeadTimeDays ? `${c.frontLeadTimeDays.min}–${c.frontLeadTimeDays.max} days` : 'To be confirmed'}</td>
                  <td>{c.sample?.priceCents != null ? cents(c.sample.priceCents) : 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
