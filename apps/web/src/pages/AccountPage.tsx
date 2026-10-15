import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { type DesignRequestView, type MyOrder, type MyProject, api, errorMessage } from '../api';
import { EmptyState, ErrorState, Loading, Notice } from '../components/States';
import { DESIGN_REQUEST_LABEL, GROUP_STATUS_LABEL, PAYMENT_LABEL, cents } from '../format';
import { navigate } from '../router';
import { type DemoAccount, setProjectId } from '../storage';

type Load<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

/** Customer dashboard (spec section 4): saved designs, orders and design requests in one place. */
export function AccountPage({ account, roles }: { account: DemoAccount; roles: string[] }) {
  if (account === 'guest') {
    return (
      <div className="container page">
        <h1>Your account</h1>
        <Notice tone="info" title="Sign in to see your projects and orders">
          <a href="#/signin">Sign in or create an account</a>. Guest designs stay in this browser only; download your plan before leaving.
        </Notice>
      </div>
    );
  }
  const staff = roles.includes('internal_designer') || roles.includes('admin');
  return (
    <>
      {staff ? <DesignQueue /> : <CustomerDashboard />}
      {roles.includes('admin') && <StaffAccess />}
    </>
  );
}

const STAFF_ROLE_LABEL: Record<string, string> = { internal_designer: 'Designer', factory_planner: 'Factory planner', admin: 'Administrator' };

/** Admin-only: grant or remove staff roles for registered accounts (spec section 3). */
function StaffAccess() {
  const [users, setUsers] = useState<Load<{ id: string; name: string; email: string; roles: string[] }[]>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('internal_designer');
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api.adminUsers().then((r) => setUsers({ status: 'ready', data: r.users })).catch((e) => setUsers({ status: 'error', message: errorMessage(e) }));
  }, [attempt]);

  const change = async (targetEmail: string, grant: string[], revoke: string[]) => {
    setMsg(null);
    try {
      const r = await api.adminRoles(targetEmail, grant, revoke);
      setMsg({ tone: 'success', text: `${r.user.email} now has: ${r.user.roles.join(', ')}` });
      setAttempt((a) => a + 1);
    } catch (e) {
      setMsg({ tone: 'error', text: errorMessage(e) });
    }
  };

  return (
    <div className="container page">
      <section className="card" aria-labelledby="staff-h">
        <h2 id="staff-h" className="h3">Staff access</h2>
        <p className="small muted">The person must create an account first. Removing a role signs them out everywhere.</p>
        <form className="filters" onSubmit={(e: FormEvent) => { e.preventDefault(); if (email.trim()) void change(email.trim(), [role], []); }}>
          <div className="field">
            <label htmlFor="sa-email">Account email</label>
            <input id="sa-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="sa-role">Role</label>
            <select id="sa-role" value={role} onChange={(e) => setRole(e.target.value)}>
              {Object.entries(STAFF_ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-primary">Grant role</button>
        </form>
        {msg && <Notice tone={msg.tone} title={msg.tone === 'success' ? 'Saved' : 'Could not change roles'}>{msg.text}</Notice>}
        {users.status === 'error' && <ErrorState message={users.message} />}
        {users.status === 'ready' && (
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>Name</th><th>Email</th><th>Roles</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                {users.data.map((u) => (
                  <tr key={u.id}>
                    <th scope="row">{u.name}</th>
                    <td>{u.email}</td>
                    <td>{u.roles.map((r) => STAFF_ROLE_LABEL[r] ?? r.replace('_', ' ')).join(', ')}</td>
                    <td className="btn-row">
                      {u.roles.filter((r) => STAFF_ROLE_LABEL[r]).map((r) => (
                        <button key={r} type="button" className="btn btn-ghost btn-sm" onClick={() => void change(u.email, [], [r])}>Remove {STAFF_ROLE_LABEL[r]}</button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CustomerDashboard() {
  const [data, setData] = useState<Load<{ projects: MyProject[]; orders: MyOrder[]; requests: DesignRequestView[] }>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setData((d) => (d.status === 'ready' ? d : { status: 'loading' }));
    Promise.all([api.myProjects(), api.myOrders(), api.myDesignRequests()])
      .then(([p, o, r]) => live && setData({ status: 'ready', data: { projects: p.projects, orders: o.orders, requests: r.requests } }))
      .catch((e) => live && setData({ status: 'error', message: errorMessage(e) }));
    return () => { live = false; };
  }, [attempt]);

  if (data.status === 'loading') return <div className="container page"><Loading label="Loading your account…" /></div>;
  if (data.status === 'error') return <div className="container page"><h1>Your account</h1><ErrorState message={data.message} onRetry={() => setAttempt((a) => a + 1)} /></div>;
  const { projects, orders, requests } = data.data;

  const openProject = (id: string) => {
    setProjectId(id);
    navigate('/design');
  };

  return (
    <div className="container page">
      <h1>Your account</h1>
      <nav className="btn-row" aria-label="Account shortcuts">
        <a className="btn btn-primary" href="#/design">Start a new design</a>
        <a className="btn btn-secondary" href="#/design-service">Request a free design</a>
        <a className="btn btn-secondary" href="#/quick-order">Quick order by SKU</a>
      </nav>

      <section className="card" aria-labelledby="proj-h">
        <h2 id="proj-h" className="h3">Saved designs ({projects.length})</h2>
        {projects.length === 0 ? (
          <EmptyState title="No saved designs yet"><p><a href="#/design">Start a design</a> and it is saved here automatically.</p></EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>Design</th><th>Room</th><th>Cabinets</th><th>Last saved</th><th>Status</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{p.name}<div className="small muted">{p.id} · revision {p.latestRevision}</div></th>
                    <td>{p.roomType.replace('_', ' ')}</td>
                    <td>{p.cabinets}</td>
                    <td>{new Date(p.updatedAt).toLocaleDateString()}</td>
                    <td className="small">
                      {p.approvedRevision ? `✓ Revision ${p.approvedRevision} approved` : 'Not approved yet'}
                      {p.access.access === 'read_only' ? <div>View-only</div> : p.access.endsAt ? <div>Editable until {new Date(p.access.endsAt).toLocaleDateString()}</div> : null}
                    </td>
                    <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => openProject(p.id)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="ord-h">
        <h2 id="ord-h" className="h3">Orders ({orders.length})</h2>
        {orders.length === 0 ? (
          <EmptyState title="No orders yet" />
        ) : (
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>Order</th><th>Placed</th><th>Items</th><th className="num">Total</th><th>Payment</th><th>Delivery</th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <th scope="row"><a href={`#/orders/${o.id}`}>{o.id}</a></th>
                    <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                    <td>{o.items}</td>
                    <td className="num">{cents(o.totalCents)}</td>
                    <td className="small">{PAYMENT_LABEL[o.paymentState] ?? o.paymentState}</td>
                    <td className="small">{FULFILLMENT_LABEL[o.fulfillment] ?? GROUP_STATUS_LABEL[o.fulfillment] ?? o.fulfillment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="dr-h">
        <h2 id="dr-h" className="h3">Design requests ({requests.length})</h2>
        {requests.length === 0 ? (
          <EmptyState title="No design requests"><p><a href="#/design-service">Ask a designer</a> to lay out your room for free.</p></EmptyState>
        ) : (
          <ul className="request-list">
            {requests.map((r) => <RequestCard key={r.id} request={r} staff={false} onChanged={() => setAttempt((a) => a + 1)} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

const FULFILLMENT_LABEL: Record<string, string> = {
  unfulfilled: 'Not yet shipped',
  partially_shipped: 'Partly shipped',
  shipped: 'Shipped',
  partially_delivered: 'Partly delivered',
  delivered: 'Delivered',
};

/** Staff view: the designer queue with state-machine actions (spec section 11, review workflow). */
function DesignQueue() {
  const [data, setData] = useState<Load<DesignRequestView[]>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    let live = true;
    setData((d) => (d.status === 'ready' ? d : { status: 'loading' }));
    api.designQueue()
      .then((r) => live && setData({ status: 'ready', data: r.requests }))
      .catch((e) => live && setData({ status: 'error', message: errorMessage(e) }));
    return () => { live = false; };
  }, [attempt]);

  return (
    <div className="container page">
      <h1>Design request queue</h1>
      <p className="lead">Oldest first. Every status change is recorded with who made it and when.</p>
      {data.status === 'loading' && <Loading label="Loading queue…" />}
      {data.status === 'error' && <ErrorState message={data.message} onRetry={refresh} />}
      {data.status === 'ready' && (data.data.length === 0
        ? <EmptyState title="No design requests in the queue" />
        : <ul className="request-list">{data.data.map((r) => <RequestCard key={r.id} request={r} staff onChanged={refresh} />)}</ul>)}
    </div>
  );
}

/** Next states the UI offers; the server's state machine is the authority. */
const STAFF_ACTIONS: Record<string, { to: string; label: string; needsReason?: boolean }[]> = {
  submitted: [{ to: 'assigned', label: 'Assign to me' }, { to: 'rejected', label: 'Decline', needsReason: true }],
  assigned: [{ to: 'in_design', label: 'Start designing' }, { to: 'needs_information', label: 'Ask the customer', needsReason: true }],
  needs_information: [{ to: 'in_design', label: 'Resume designing' }],
  in_design: [{ to: 'customer_review', label: 'Send for customer review' }, { to: 'needs_information', label: 'Ask the customer', needsReason: true }],
  customer_review: [{ to: 'in_design', label: 'Revise' }],
};
const CUSTOMER_CAN_WITHDRAW = ['draft', 'submitted', 'assigned', 'needs_information', 'in_design', 'customer_review'];

function RequestCard({ request: r, staff, onChanged }: { request: DesignRequestView; staff: boolean; onChanged: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) void run(async () => { await api.designRequestMessage(r.id, text.trim()); setText(''); });
  };
  const act = (a: { to: string; needsReason?: boolean }) => {
    if (a.needsReason && !text.trim()) {
      setError('Type the question or reason in the message box first.');
      return;
    }
    void run(async () => { await api.designRequestTransition(r.id, a.to, a.needsReason ? text.trim() : undefined); setText(''); });
  };

  const waitingOnCustomer = r.state === 'needs_information' || r.state === 'customer_review';

  return (
    <li className="card request-card">
      <div className="card-head">
        <h3 className="h4">{r.id} · {r.roomType.replace('_', ' ')} · ZIP {r.zip}</h3>
        <span className="badge badge-neutral">{DESIGN_REQUEST_LABEL[r.state] ?? r.state}</span>
      </div>
      {!staff && waitingOnCustomer && <Notice tone="warning" title="Waiting for you">The designer needs your reply below.</Notice>}
      <p className="small">
        {r.timeline} · budget {r.budgetRange} · {r.services.join(', ').replace(/_/g, ' ')}
        {r.projectId ? ` · design ${r.projectId}@r${r.revisionNumber}` : ''} · sent {new Date(r.createdAt).toLocaleDateString()}
      </p>
      {r.notes && <p className="small"><strong>Notes:</strong> {r.notes}</p>}
      {r.messages.length > 0 && (
        <ol className="messages" aria-label="Messages">
          {r.messages.map((m, i) => (
            <li key={i} className={`message from-${m.from}`}>
              <strong>{m.from === 'designer' ? 'Designer' : 'Customer'}</strong> <span className="small muted">{new Date(m.at).toLocaleString()}</span>
              <p>{m.text}</p>
            </li>
          ))}
        </ol>
      )}
      {!['converted', 'rejected', 'withdrawn', 'superseded'].includes(r.state) && (
        <form onSubmit={send} className="stack">
          <div className="field">
            <label htmlFor={`msg-${r.id}`}>{staff ? 'Message to the customer' : 'Reply to the designer'}</label>
            <textarea id={`msg-${r.id}`} rows={2} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          {error && <p className="field-error" role="alert">⛔ {error}</p>}
          <div className="btn-row">
            <button type="submit" className="btn btn-secondary btn-sm" disabled={busy || !text.trim()}>Send message</button>
            {staff && (STAFF_ACTIONS[r.state] ?? []).map((a) => (
              <button key={a.to} type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(a)}>{a.label}</button>
            ))}
            {!staff && CUSTOMER_CAN_WITHDRAW.includes(r.state) && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                onClick={() => window.confirm('Withdraw this design request?') && void run(() => api.designRequestTransition(r.id, 'withdrawn'))}>
                Withdraw request
              </button>
            )}
          </div>
        </form>
      )}
      <details className="small">
        <summary>History ({r.history.length})</summary>
        <ol>{r.history.map((h, i) => <li key={i}>{new Date(h.at).toLocaleString()}: {DESIGN_REQUEST_LABEL[h.to] ?? h.to}{h.reason ? ` — ${h.reason}` : ''}</li>)}</ol>
      </details>
    </li>
  );
}
