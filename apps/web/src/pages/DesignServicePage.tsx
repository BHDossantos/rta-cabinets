import { type FormEvent, useEffect, useState } from 'react';
import { type DesignRequestInput, type DesignRequestView, type MyProject, api, errorMessage } from '../api';
import { Notice } from '../components/States';
import { DESIGN_REQUEST_LABEL } from '../format';
import { type DemoAccount, getProjectId } from '../storage';

/**
 * What the free design service includes is an open business decision (D07). The
 * page states each term explicitly and marks undecided ones, so the customer knows
 * exactly what they are requesting before they submit (AC11.5).
 */
const SERVICE_TERMS: { label: string; value: string | null }[] = [
  { label: 'Price', value: 'Free with no obligation to buy' },
  { label: 'Rooms per request', value: null },
  { label: 'What you receive', value: 'A floor plan and wall elevations built from our standard cabinets, an itemized price, and a list of anything that needs a quote' },
  { label: 'Included revisions', value: null },
  { label: 'First response', value: null },
  { label: 'Not included', value: 'Site measuring, installation, plumbing, electrical and permit drawings' },
];

const SERVICES = [
  { value: 'layout', label: 'Cabinet layout' },
  { value: 'finish_selection', label: 'Door style and finish advice' },
  { value: 'countertops', label: 'Countertop planning (quoted separately)' },
  { value: 'review_my_design', label: 'Check a design I already made' },
];

const EMPTY: DesignRequestInput = {
  roomType: 'kitchen', zip: '', timeline: '', budgetRange: '', services: ['layout'], appliances: '', preferredMaterials: '',
  contactPreference: 'email', phone: '', notes: '',
};

export function DesignServicePage({ account }: { account: DemoAccount }) {
  const [form, setForm] = useState<DesignRequestInput>(EMPTY);
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<MyProject[]>([]);
  const [projectState, setProjectState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [projectError, setProjectError] = useState('');
  const [projectAttempt, setProjectAttempt] = useState(0);
  const [missing, setMissing] = useState<string[]>([]);
  const [state, setState] = useState<{ busy: boolean; error: string | null; sent: DesignRequestView | null }>({ busy: false, error: null, sent: null });
  const set = <K extends keyof DesignRequestInput>(k: K, v: DesignRequestInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const signedIn = account !== 'guest';

  useEffect(() => setMissing([]), [form]);

  useEffect(() => {
    let live = true;
    setProjectId('');
    setProjects([]);
    setProjectState('loading');
    if (!signedIn) return;
    api.myProjects().then(({ projects: saved }) => {
      if (!live) return;
      setProjects(saved);
      const current = saved.find((p) => p.id === getProjectId());
      setProjectId(current?.id ?? '');
      if (current) setForm((f) => ({ ...f, roomType: current.roomType }));
      setProjectState('ready');
    }).catch((e) => {
      if (!live) return;
      setProjectError(errorMessage(e));
      setProjectState('error');
    });
    return () => { live = false; };
  }, [account, signedIn, projectAttempt]);

  const selectedProject = projects.find((p) => p.id === projectId);
  const chooseProject = (id: string) => {
    setProjectId(id);
    const selected = projects.find((p) => p.id === id);
    if (selected) setForm((f) => ({ ...f, roomType: selected.roomType }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (state.busy || projectState === 'loading' || (projectId && !selectedProject)) return;
    // Show missing requirements before submission (spec 11, request form).
    const m: string[] = [];
    if (!/^\d{5}$/.test(form.zip)) m.push('zip');
    if (!form.timeline) m.push('timeline');
    if (!form.budgetRange) m.push('budgetRange');
    if (form.services.length === 0) m.push('services');
    if (form.contactPreference !== 'email' && !form.phone?.trim()) m.push('phone');
    if (m.length) {
      setMissing(m);
      return;
    }
    setState({ busy: true, error: null, sent: null });
    try {
      const sent = await api.createDesignRequest({ ...form, phone: form.phone || undefined, projectId: selectedProject?.id });
      setState({ busy: false, error: null, sent });
    } catch (err) {
      setState({ busy: false, error: errorMessage(err), sent: null });
    }
  };

  const err = (k: string, text: string) => (missing.includes(k) ? <span className="field-error" role="alert">⛔ {text}</span> : null);

  return (
    <div className="container page">
      <h1>Free design service</h1>
      <p className="lead">
        Send us your room details and a designer lays out a kitchen using the cabinets we actually make, then sends you a plan and
        an itemized price to review.
      </p>

      <section className="card" aria-labelledby="terms-h">
        <h2 id="terms-h" className="h3">What's included</h2>
        <dl className="kv">
          {SERVICE_TERMS.map((t) => (
            <div key={t.label}>
              <dt>{t.label}</dt>
              <dd>{t.value ?? <span className="muted">To be confirmed before launch</span>}</dd>
            </div>
          ))}
        </dl>
        <p className="small muted">
          Good measurements make a better design. Use the <a href="#/measure">measuring guide</a> before you send your request.
        </p>
      </section>

      <ol className="steps-inline" aria-label="How it works">
        <li><strong>1. Send details</strong><span>Room size, appliances and what you want</span></li>
        <li><strong>2. We design</strong><span>A designer asks questions here if anything is missing</span></li>
        <li><strong>3. You review</strong><span>Approve the plan or ask for changes</span></li>
        <li><strong>4. Order</strong><span>The approved design becomes your cart</span></li>
      </ol>

      {state.sent ? (
        <Notice tone="success" title={`Request ${state.sent.id} received`}>
          <p>{state.sent.projectId && `Attached design: ${state.sent.projectId}, revision ${state.sent.revisionNumber}. `}Status: {DESIGN_REQUEST_LABEL[state.sent.state] ?? state.sent.state}. You can follow it and reply to the designer from <a href="#/account">your account</a>.</p>
        </Notice>
      ) : !signedIn ? (
        <Notice tone="info" title="Sign in to request a design">
          Design requests are kept in your account so the designer can ask questions and you can follow the status. <a href="#/signin">Sign in or create an account</a> to continue.
        </Notice>
      ) : (
        <form className="card stack" onSubmit={submit} aria-labelledby="req-h" noValidate>
          <h2 id="req-h" className="h3">Request a design</h2>
          {missing.length > 0 && <Notice tone="error" title="A few details are missing">Fill in the fields marked below, then send again.</Notice>}
          <div className="form-grid">
            <div className="field">
              <label htmlFor="dr-room">Room</label>
              <select id="dr-room" disabled={Boolean(selectedProject)} value={form.roomType} onChange={(e) => set('roomType', e.target.value)}>
                <option value="kitchen">Kitchen</option>
                <option value="bathroom">Bathroom</option>
                <option value="laundry">Laundry</option>
                <option value="closet">Closet</option>
                <option value="other_interior">Other room</option>
                <option value="exterior">Exterior</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="dr-zip">Project ZIP code</label>
              <input id="dr-zip" inputMode="numeric" maxLength={5} autoComplete="postal-code" value={form.zip} onChange={(e) => set('zip', e.target.value)}
                aria-invalid={missing.includes('zip') || undefined} />
              {err('zip', 'Enter a 5-digit ZIP code')}
            </div>
            <div className="field">
              <label htmlFor="dr-time">When do you want to start?</label>
              <select id="dr-time" value={form.timeline} onChange={(e) => set('timeline', e.target.value)} aria-invalid={missing.includes('timeline') || undefined}>
                <option value="">Choose…</option>
                <option>As soon as possible</option>
                <option>1–3 months</option>
                <option>3–6 months</option>
                <option>Just exploring</option>
              </select>
              {err('timeline', 'Choose a timeline')}
            </div>
            <div className="field">
              <label htmlFor="dr-budget">Cabinet budget</label>
              <select id="dr-budget" value={form.budgetRange} onChange={(e) => set('budgetRange', e.target.value)} aria-invalid={missing.includes('budgetRange') || undefined}>
                <option value="">Choose…</option>
                <option>Under $5,000</option>
                <option>$5,000–$10,000</option>
                <option>$10,000–$20,000</option>
                <option>Over $20,000</option>
                <option>Not sure yet</option>
              </select>
              {err('budgetRange', 'Choose a budget range')}
            </div>
          </div>

          <fieldset>
            <legend>What do you need?</legend>
            {SERVICES.map((s) => (
              <label key={s.value} className="check">
                <input type="checkbox" checked={form.services.includes(s.value)}
                  onChange={(e) => set('services', e.target.checked ? [...form.services, s.value] : form.services.filter((x) => x !== s.value))} />
                <span>{s.label}</span>
              </label>
            ))}
            {err('services', 'Choose at least one')}
          </fieldset>

          <div className="field">
            <label htmlFor="dr-app">Appliances and fixtures to plan around</label>
            <textarea id="dr-app" rows={2} value={form.appliances} onChange={(e) => set('appliances', e.target.value)}
              placeholder="e.g. 30 in range, 36 in fridge, dishwasher left of sink" />
          </div>
          <div className="field">
            <label htmlFor="dr-mat">Door styles or finishes you like</label>
            <input id="dr-mat" value={form.preferredMaterials} onChange={(e) => set('preferredMaterials', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="dr-notes">Anything else the designer should know?</label>
            <textarea id="dr-notes" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>

          <section aria-labelledby="saved-design-h" className="stack">
            <h3 id="saved-design-h">Design for human review</h3>
            <p className="small muted">Choose a saved layout or request help without one. Only saved changes are included; save your latest edits in the planner first. This request does not place an order.</p>
            {projectState === 'loading' && <p role="status">Loading your saved designs…</p>}
            {projectState === 'error' && <Notice tone="error" title="Could not load saved designs">
              <p>{projectError} You can retry or send a request without a saved design.</p>
              <button type="button" className="btn btn-secondary" onClick={() => setProjectAttempt((n) => n + 1)}>Retry saved designs</button>
            </Notice>}
            {projectState === 'ready' && <>
              <label htmlFor="dr-project">Saved design to attach</label>
              <select id="dr-project" value={projectId} onChange={(e) => chooseProject(e.target.value)} disabled={state.busy}>
                <option value="">No saved design — start from my details</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name} · revision {p.latestRevision}</option>)}
              </select>
              {projects.length === 0 && <p>No saved designs yet. <a href="#/design">Create a layout in the planner</a> or continue with your room details.</p>}
              {selectedProject && <div className="small" aria-live="polite">
                <p>{selectedProject.name}: {selectedProject.roomType.replaceAll('_', ' ')} · {selectedProject.cabinets} cabinets · revision {selectedProject.latestRevision}</p>
                <p>Last saved: {new Date(selectedProject.updatedAt).toLocaleString()}. The latest saved revision at submission will be attached for the designer to review.</p>
              </div>}
            </>}
          </section>

          <fieldset>
            <legend>How should we contact you?</legend>
            <div className="radio-stack">
              {(['email', 'phone', 'either'] as const).map((c) => (
                <label key={c}><input type="radio" name="dr-contact" checked={form.contactPreference === c} onChange={() => set('contactPreference', c)} /> {c === 'either' ? 'Either' : c === 'email' ? 'Email' : 'Phone'}</label>
              ))}
            </div>
            {form.contactPreference !== 'email' && (
              <div className="field">
                <label htmlFor="dr-phone">Phone</label>
                <input id="dr-phone" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} aria-invalid={missing.includes('phone') || undefined} />
                {err('phone', 'Enter a phone number, or choose email')}
              </div>
            )}
          </fieldset>

          {state.error && <Notice tone="error" title="Could not send the request">{state.error}</Notice>}
          <button type="submit" className="btn btn-primary" disabled={state.busy || projectState === 'loading'}>{state.busy ? 'Sending…' : 'Send design request'}</button>
        </form>
      )}
    </div>
  );
}
