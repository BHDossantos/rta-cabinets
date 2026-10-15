import { type FormEvent, useState } from 'react';
import { ApiError, api, errorMessage } from '../api';
import { Notice } from '../components/States';
import { navigate } from '../router';
import { type DemoAccount, adoptGuestPointers } from '../storage';

type Mode = 'signin' | 'register';

/**
 * Sign in and account creation (spec section 6). A guest's design and cart move
 * into the account automatically. Phone and address are asked for only when an
 * order or service needs them.
 */
export function SignInPage({ account, onSignedIn }: { account: DemoAccount; onSignedIn: () => Promise<void> }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [form, setForm] = useState({ name: '', email: '', password: '', accountType: 'homeowner' as 'homeowner' | 'pro', businessName: '', acceptTerms: false });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const [showPassword, setShowPassword] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const wasGuest = account === 'guest';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFields({});
    setState({ busy: true, error: null });
    try {
      const r = mode === 'signin'
        ? await api.login(form.email, form.password)
        : await api.register({ ...form, businessName: form.accountType === 'pro' ? form.businessName : undefined });
      if (wasGuest) adoptGuestPointers(`user:${r.user.id}`, r.attached);
      await onSignedIn();
      navigate(r.attached.projectId ? '/design' : '/account');
    } catch (err) {
      if (err instanceof ApiError && err.details?.fields) setFields(err.details.fields as Record<string, string>);
      setState({ busy: false, error: errorMessage(err) });
      return;
    }
  };

  const fieldError = (k: string) => fields[k] ? <span id={`${k}-err`} className="field-error" role="alert">⛔ {fields[k]}</span> : null;
  const described = (k: string) => (fields[k] ? `${k}-err` : undefined);

  return (
    <div className="container page">
      <div className="card auth-card">
        <div className="tabs" role="tablist" aria-label="Account">
          <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => { setMode('signin'); setFields({}); setState({ busy: false, error: null }); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => { setMode('register'); setFields({}); setState({ busy: false, error: null }); }}>Create account</button>
        </div>
        <h1 className="h2">{mode === 'signin' ? 'Sign in' : 'Create your account'}</h1>
        {wasGuest && <p className="small muted">Any design or cart you started as a guest moves into your account.</p>}

        <form onSubmit={submit} className="stack" noValidate>
          {mode === 'register' && (
            <>
              <fieldset>
                <legend>I am a</legend>
                <div className="radio-stack">
                  <label><input type="radio" name="acct" checked={form.accountType === 'homeowner'} onChange={() => set('accountType', 'homeowner')} /> Homeowner</label>
                  <label><input type="radio" name="acct" checked={form.accountType === 'pro'} onChange={() => set('accountType', 'pro')} /> Contractor, designer or builder</label>
                </div>
                {fieldError('accountType')}
              </fieldset>
              <div className="field">
                <label htmlFor="su-name">Your name</label>
                <input id="su-name" autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!fields.name || undefined} aria-describedby={described('name')} />
                {fieldError('name')}
              </div>
              {form.accountType === 'pro' && (
                <div className="field">
                  <label htmlFor="su-biz">Business name</label>
                  <input id="su-biz" autoComplete="organization" value={form.businessName} onChange={(e) => set('businessName', e.target.value)} aria-invalid={!!fields.businessName || undefined} aria-describedby={described('businessName')} />
                  {fieldError('businessName')}
                  <span className="small muted">Trade pricing starts once you join a Pro plan. Directory listing needs verification.</span>
                </div>
              )}
            </>
          )}
          <div className="field">
            <label htmlFor="su-email">Email</label>
            <input id="su-email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} aria-invalid={!!fields.email || undefined} aria-describedby={described('email')} />
            {fieldError('email')}
          </div>
          <div className="field">
            <label htmlFor="su-pass">Password</label>
            <input id="su-pass" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={form.password} onChange={(e) => set('password', e.target.value)} aria-invalid={!!fields.password || undefined}
              aria-describedby={[described('password'), mode === 'register' ? 'pw-hint' : undefined].filter(Boolean).join(' ') || undefined} />
            {mode === 'register' && <span id="pw-hint" className="small muted">At least 10 characters. A short phrase is easy to remember.</span>}
            {fieldError('password')}
            <label className="check"><input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} /> <span>Show password</span></label>
          </div>
          {mode === 'register' && (
            <div className="field">
              <label className="check">
                <input type="checkbox" checked={form.acceptTerms} onChange={(e) => set('acceptTerms', e.target.checked)} aria-invalid={!!fields.acceptTerms || undefined} />
                <span>I agree to the terms of sale and privacy policy (final wording pending legal review)</span>
              </label>
              {fieldError('acceptTerms')}
            </div>
          )}
          {state.error && !Object.keys(fields).length && <Notice tone="error" title={mode === 'signin' ? 'Could not sign in' : 'Could not create the account'}>{state.error}</Notice>}
          <button type="submit" className="btn btn-primary" disabled={state.busy}>
            {state.busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
          {mode === 'signin' && <p className="small muted">Forgot your password? Password reset by email is coming soon; contact support meanwhile.</p>}
        </form>
      </div>
    </div>
  );
}
