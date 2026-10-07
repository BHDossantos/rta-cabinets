import { type FormEvent, useEffect, useState } from 'react';
import { type DesignRequestInput, type DesignRequestView, api, errorMessage } from '../api';
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
  const [attachProject, setAttachProject] = useState(true);
  const projectId = getProjectId();
  const [missing, setMissing] = useState<string[]>([]);
  const [state, setState] = useState<{ busy: boolean; error: string | null; sent: DesignRequestView | null }>({ busy: false, error: null, sent: null });
  const set = <K extends keyof DesignRequestInput>(k: K, v: DesignRequestInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const signedIn = account !== 'guest';

  useEffect(() => setMissing([]), [form]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
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
      const sent = await api.createDesignRequest({ ...form, phone: form.phone || undefined, projectId: attachProject && projectId ? projectId : undefined });
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
          <p>Status: {DESIGN_REQUEST_LABEL[state.sent.state] ?? state.sent.state}. You can follow it and reply to the designer from <a href="#/account">your account</a>.</p>
        </Notice>
      ) : !signedIn ? (
        <Notice tone="info" title="Sign in to request a design">
          Design requests are kept in your account so the designer can ask questions and you can follow the status. Choose a demo account in the
          header to continue.
        </Notice>
      ) : (
        <form className="card stack" onSubmit={submit} aria-labelledby="req-h" noValidate>
          <h2 id="req-h" className="h3">Request a design</h2>
          {missing.length > 0 && <Notice tone="error" title="A few details are missing">Fill in the fields marked below, then send again.</Notice>}
          <div className="form-grid">
            <div className="field">
              <label htmlFor="dr-room">Room</label>
              <select id="dr-room" value={form.roomType} onChange={(e) => set('roomType', e.target.value)}>
                <option value="kitchen">Kitchen</option>
                <option value="bathroom">Bathroom</option>
                <option value="laundry">Laundry</option>
                <option value="closet">Closet</option>
                <option value="other_interior">Other room</option>
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

          {projectId && (
            <label className="check">
              <input type="checkbox" checked={attachProject} onChange={(e) => setAttachProject(e.target.checked)} />
              <span>Attach my saved design ({projectId}) so the designer starts from my measurements</span>
            </label>
          )}

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
          <button type="submit" className="btn btn-primary" disabled={state.busy}>{state.busy ? 'Sending…' : 'Send design request'}</button>
        </form>
      )}
    </div>
  );
}
