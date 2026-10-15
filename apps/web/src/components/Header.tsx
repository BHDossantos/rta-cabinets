import { useState } from 'react';
import type { MeView } from '../api';
import { DEMO_ACCOUNTS, type DemoAccount, type DemoId } from '../storage';

const NAV = [
  { href: '#/', label: 'Home', key: '' },
  { href: '#/design', label: 'Design', key: 'design' },
  { href: '#/design-service', label: 'Free design', key: 'design-service' },
  { href: '#/collections', label: 'Door styles', key: 'collections' },
  { href: '#/shop', label: 'Shop', key: 'shop' },
  { href: '#/quick-order', label: 'Quick order', key: 'quick-order' },
  { href: '#/cart', label: 'Cart', key: 'cart' },
  { href: '#/installers', label: 'Installers', key: 'installers' },
  { href: '#/financing', label: 'Financing', key: 'financing' },
  { href: '#/pro', label: 'Pro', key: 'pro' },
  { href: '#/account', label: 'Account', key: 'account' },
];

export function Header({ current, account, me, onAccountChange, onSignOut }: {
  current: string;
  account: DemoAccount;
  me: MeView;
  onAccountChange: (a: DemoId) => void;
  onSignOut: () => void;
}) {
  const signedIn = me.via === 'session' && me.user;
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="container header-row">
        <a href="#/" className="brand" aria-label="RTA Cabinet Factory, home">
          <span className="brand-mark" aria-hidden="true">RTA</span>
          <span className="brand-name">Cabinet Factory</span>
        </a>
        <button type="button" className="btn btn-ghost menu-toggle" aria-expanded={menuOpen} aria-controls="site-nav" onClick={() => setMenuOpen((v) => !v)}>
          {menuOpen ? 'Close menu' : 'Menu'}
        </button>
        <nav id="site-nav" className={`site-nav${menuOpen ? ' is-open' : ''}`} aria-label="Main">
          <ul>
            {NAV.map((n) => (
              <li key={n.key}>
                <a href={n.href} aria-current={current === n.key ? 'page' : undefined} onClick={() => setMenuOpen(false)}>
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="account-area">
          {signedIn ? (
            <p className="signed-in">
              <span>Signed in as <strong>{me.user!.name}</strong></span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign out</button>
            </p>
          ) : (
            <a href="#/signin" className="btn btn-secondary btn-sm" aria-current={current === 'signin' ? 'page' : undefined}>Sign in</a>
          )}
          {!signedIn && me.demoAuth && (
            <div className="account-switcher">
              <label htmlFor="demo-account">
                Demo account <span className="dev-tag">development stub</span>
              </label>
              <select id="demo-account" value={account} onChange={(e) => onAccountChange(e.target.value as DemoId)}>
                {DEMO_ACCOUNTS.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
