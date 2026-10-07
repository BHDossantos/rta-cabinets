import { parseQuickOrder } from '@rta/core';
import { useEffect, useMemo, useState } from 'react';
import { type PublicSku, api, errorMessage } from '../api';
import { addManyToCart } from '../cartActions';
import { QuoteSummary } from '../components/QuoteSummary';
import { ErrorState, Loading, Notice } from '../components/States';

/**
 * Quick order by SKU for contractors and repeat buyers (competitive research:
 * Lily Ann Quick Order, Conestoga reorder). Paste lines or load a CSV exported
 * from a spreadsheet; every code is checked against the live catalog and the
 * total comes from the server before anything reaches the cart.
 */
export function QuickOrderPage() {
  const [catalog, setCatalog] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; items: PublicSku[] }>({ status: 'loading' });
  const [text, setText] = useState('');
  const [quote, setQuote] = useState<{ status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: Awaited<ReturnType<typeof api.quoteLines>>['quote'] }>({ status: 'idle' });
  const [cart, setCart] = useState<{ busy: boolean; done: boolean; error: string | null }>({ busy: false, done: false, error: null });

  useEffect(() => {
    api.skus().then((r) => setCatalog({ status: 'ready', items: r.items })).catch((e) => setCatalog({ status: 'error', message: errorMessage(e) }));
  }, []);

  const parsed = useMemo(() => parseQuickOrder(text), [text]);
  const skus = useMemo(() => new Map((catalog.status === 'ready' ? catalog.items : []).map((s) => [s.code.toUpperCase(), s])), [catalog]);
  const rows = parsed.lines.map((l) => {
    const sku = skus.get(l.skuCode);
    const problem = !sku ? 'Unknown or unavailable SKU' : sku.purchasability !== 'purchasable' ? 'Sold by quote only' : null;
    return { ...l, sku, problem };
  });
  const valid = rows.filter((r) => !r.problem).map((r) => ({ skuCode: r.sku!.code, quantity: r.quantity }));
  const validKey = JSON.stringify(valid);

  // Server-priced preview of the valid lines (debounced).
  useEffect(() => {
    setCart((c) => ({ ...c, done: false }));
    if (valid.length === 0) {
      setQuote({ status: 'idle' });
      return;
    }
    setQuote({ status: 'loading' });
    const t = setTimeout(() => {
      api.quoteLines(valid).then((r) => setQuote({ status: 'ready', data: r.quote })).catch((e) => setQuote({ status: 'error', message: errorMessage(e) }));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validKey]);

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 200_000) {
      setCart({ busy: false, done: false, error: 'That file is too large for a quick order (200 KB maximum).' });
      return;
    }
    // Read locally; nothing is uploaded. Skip a header row such as "sku,qty".
    const content = await file.text();
    setText(content.split(/\r?\n/).filter((l, i) => !(i === 0 && /sku|code/i.test(l))).join('\n'));
  };

  const addAll = async () => {
    setCart({ busy: true, done: false, error: null });
    try {
      await addManyToCart(valid);
      setCart({ busy: false, done: true, error: null });
    } catch (e) {
      setCart({ busy: false, done: false, error: errorMessage(e) });
    }
  };

  if (catalog.status === 'loading') return <div className="container page"><Loading label="Loading catalog…" /></div>;
  if (catalog.status === 'error') return <div className="container page"><h1>Quick order</h1><ErrorState message={catalog.message} /></div>;

  const problems = parsed.errors.length + rows.filter((r) => r.problem).length;

  return (
    <div className="container page">
      <h1>Quick order by SKU</h1>
      <p className="lead">Already know your cabinet codes? Paste them here, one per line, or load a CSV from your spreadsheet.</p>
      <div className="grid-2">
        <section className="card" aria-labelledby="qo-in">
          <h2 id="qo-in" className="h3">Your list</h2>
          <div className="field">
            <label htmlFor="qo-text">SKU and quantity, one per line</label>
            <textarea id="qo-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
              placeholder={'B36 2\nW30 3\n2 x F36-WHT\nHK-STD 5'} aria-describedby="qo-help" />
            <span id="qo-help" className="small muted">Formats: “B36 2”, “B36,2”, “2 x B36”. Repeated codes are added together.</span>
          </div>
          <div className="field">
            <label htmlFor="qo-file">Or load a CSV file (columns: SKU, quantity)</label>
            <input id="qo-file" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => void loadFile(e.target.files?.[0])} />
          </div>
        </section>

        <section className="card" aria-labelledby="qo-check" aria-live="polite">
          <h2 id="qo-check" className="h3">Check ({valid.length} ready{problems ? `, ${problems} to fix` : ''})</h2>
          {parsed.lines.length === 0 && parsed.errors.length === 0 ? <p className="muted">Lines you type appear here with their product names.</p> : (
            <div className="table-wrap">
              <table className="table compact">
                <thead><tr><th>Line</th><th>SKU</th><th>Qty</th><th>Product</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.skuCode}>
                      <td>{r.lines.join(', ')}</td>
                      <th scope="row">{r.skuCode}</th>
                      <td>{r.quantity}</td>
                      <td>{r.problem ? <span className="field-error">⛔ {r.problem}</span> : <>✓ {r.sku!.name}</>}</td>
                    </tr>
                  ))}
                  {parsed.errors.map((e) => (
                    <tr key={`e${e.line}`}>
                      <td>{e.line}</td>
                      <td colSpan={3}><span className="field-error">⛔ “{e.text.trim()}”: {e.message}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {quote.status === 'loading' && <Loading label="Pricing…" />}
      {quote.status === 'error' && <Notice tone="error" title="Could not price this list">{quote.message}</Notice>}
      {quote.status === 'ready' && (
        <section className="card" aria-labelledby="qo-price">
          <h2 id="qo-price" className="h3">Price</h2>
          <QuoteSummary quote={quote.data} caption="Quick order lines" />
          {cart.error && <Notice tone="error" title="Could not add to cart">{cart.error}</Notice>}
          {cart.done ? (
            <Notice tone="success" title="Added to your cart"><a href="#/cart">Go to cart</a> to check out.</Notice>
          ) : (
            <button type="button" className="btn btn-primary" disabled={cart.busy || valid.length === 0} onClick={() => void addAll()}>
              {cart.busy ? 'Adding…' : `Add ${valid.length} item${valid.length === 1 ? '' : 's'} to cart`}
            </button>
          )}
          {problems > 0 && <p className="small muted">Lines marked ⛔ are not added. Fix them above or leave them out.</p>}
        </section>
      )}
    </div>
  );
}
