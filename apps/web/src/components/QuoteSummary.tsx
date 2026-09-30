import type { Quote } from '@rta/core';
import { money, stageLabel } from '../format';

/**
 * Renders a server-calculated quote verbatim. Nothing here computes prices; the
 * client only formats the integer minor units returned by the API.
 */
export function QuoteSummary({ quote, caption = 'Itemized estimate' }: { quote: Quote; caption?: string }) {
  const freightPending = quote.shipping.status !== 'quoted';
  const taxPending = quote.taxStatus !== 'calculated';
  return (
    <div className="quote">
      <div className="table-wrap">
        <table className="table">
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Stage</th>
              <th scope="col" className="num">Qty</th>
              <th scope="col" className="num">Unit</th>
              <th scope="col">Adjustments</th>
              <th scope="col" className="num">Line total</th>
            </tr>
          </thead>
          <tbody>
            {quote.lines.map((l) => (
              <tr key={`${l.skuCode}-${l.stage ?? ''}`}>
                <td>
                  <strong>{l.skuCode}</strong>
                  <div className="small">{l.description}</div>
                  {l.instanceIds.length > 0 && <div className="small muted">For: {l.instanceIds.join(', ')}</div>}
                </td>
                <td className="small">{stageLabel(l.stage)}</td>
                <td className="num">{l.quantity}</td>
                <td className="num">{money(l.unitPrice)}</td>
                <td className="small">
                  {l.adjustments.length === 0 ? '—' : l.adjustments.map((a) => (
                    <div key={a.label}>{a.label}: {money(a.amount)}</div>
                  ))}
                </td>
                <td className="num">{money(l.lineTotal)}</td>
              </tr>
            ))}
            {quote.lines.length === 0 && (
              <tr><td colSpan={6}>No priced lines.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {quote.excluded.length > 0 && (
        <div className="notice notice-warning">
          <span className="notice-icon" aria-hidden="true">⚠</span>
          <div>
            <strong>Not included in this total</strong>
            <ul>
              {quote.excluded.map((x) => (
                <li key={x.skuCode}>
                  {x.description} ({x.skuCode}) × {x.quantity}: {x.reason === 'quote_required' ? 'requires a separate quote' : x.reason === 'visualization_only' ? 'visualization only, not sold' : x.reason === 'no_price' ? 'price not available' : 'unavailable'}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <dl className="totals">
        <div><dt>Merchandise subtotal</dt><dd>{money(quote.merchandiseSubtotal)}</dd></div>
        <div>
          <dt>{quote.tradePricingApplied ? 'Trade pricing adjustments' : 'Adjustments'}</dt>
          <dd>{money(quote.adjustmentsTotal)}</dd>
        </div>
        <div><dt>Merchandise total</dt><dd>{money(quote.merchandiseTotal)}</dd></div>
        <div>
          <dt>Freight</dt>
          <dd>{freightPending ? <span className="status-pending">⏳ Pending: {quote.shipping.description ?? 'quoted for your address'}</span> : money(quote.shipping.amount)}</dd>
        </div>
        <div>
          <dt>Tax</dt>
          <dd>{taxPending ? <span className="status-pending">⏳ Pending</span> : `${money(quote.tax)} (calculated by server)`}</dd>
        </div>
        <div className="totals-grand">
          <dt>{quote.isEstimate ? 'Estimated total (not final)' : 'Total'}</dt>
          <dd>{money(quote.total)}</dd>
        </div>
      </dl>
      <p className="small muted">
        {quote.isEstimate && 'This is an estimate: freight, tax or excluded items may change the payable amount. '}
        Calculated by the server · price book {quote.priceBookVersion} · policy {quote.policyVersion} · calculation {quote.calculationId} · valid until{' '}
        {new Date(quote.expiresAt).toLocaleString()}. Labor, installation and countertops are not included unless listed.
      </p>
    </div>
  );
}
