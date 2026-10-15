import { useCallback, useEffect, useState } from 'react';
import { type MeView, api } from './api';
import { Loading } from './components/States';
import { SignInPage } from './pages/SignInPage';
import { Header } from './components/Header';
import { AccountPage } from './pages/AccountPage';
import { CartPage } from './pages/CartPage';
import { DesignServicePage } from './pages/DesignServicePage';
import { MeasurePage } from './pages/MeasurePage';
import { CollectionsPage } from './pages/CollectionsPage';
import { QuickOrderPage } from './pages/QuickOrderPage';
import { FinancingPage } from './pages/FinancingPage';
import { HomePage } from './pages/HomePage';
import { InstallersPage } from './pages/InstallersPage';
import { OrderPage } from './pages/OrderPage';
import { PlannerPage } from './pages/PlannerPage';
import { ProPage } from './pages/ProPage';
import { ShopPage } from './pages/ShopPage';
import { useHashRoute } from './router';
import { type DemoAccount, type DemoId, getDemoAccount, setDemoAccount, setIdentity } from './storage';

export function App() {
  const route = useHashRoute();
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [me, setMe] = useState<MeView | null>(null);
  const section = route[0] ?? '';

  /**
   * Ask the server who this is: a signed-in session wins; otherwise a demo account
   * if the server allows them (development); otherwise a guest.
   */
  const refreshIdentity = useCallback(async () => {
    setIdentity('guest');
    let first: MeView;
    try {
      first = await api.me();
    } catch {
      first = { user: null, via: null, demoAuth: false, entitlement: { tradePricing: false, proOnlySkus: false, leadAccess: false } };
    }
    let next: DemoAccount = 'guest';
    let view = first;
    if (first.via === 'session' && first.user) next = `user:${first.user.id}`;
    else if (first.demoAuth && getDemoAccount() !== 'guest') {
      next = getDemoAccount();
      setIdentity(next);
      view = await api.me().catch(() => first);
    }
    setIdentity(next);
    setMe(view);
    setAccount(next);
  }, []);

  useEffect(() => { void refreshIdentity(); }, [refreshIdentity]);

  const changeAccount = (a: DemoId) => {
    setDemoAccount(a);
    void refreshIdentity();
  };

  if (!account || !me) return <div className="container page"><Loading label="Loading…" /></div>;

  let page;
  switch (section) {
    case '':
      page = <HomePage />;
      break;
    case 'design':
      page = <PlannerPage account={account} />;
      break;
    case 'shop':
      page = <ShopPage account={account} />;
      break;
    case 'cart':
      page = <CartPage account={account} />;
      break;
    case 'orders':
      page = <OrderPage id={route[1] ?? ''} />;
      break;
    case 'installers':
      page = <InstallersPage account={account} />;
      break;
    case 'financing':
      page = <FinancingPage account={account} />;
      break;
    case 'design-service':
      page = <DesignServicePage account={account} />;
      break;
    case 'collections':
      page = <CollectionsPage />;
      break;
    case 'quick-order':
      page = <QuickOrderPage />;
      break;
    case 'measure':
      page = <MeasurePage />;
      break;
    case 'account':
      page = <AccountPage account={account} roles={me.user?.roles ?? []} />;
      break;
    case 'signin':
      page = <SignInPage account={account} onSignedIn={refreshIdentity} />;
      break;
    case 'pro':
      page = <ProPage account={account} />;
      break;
    default:
      page = (
        <div className="container page">
          <h1>Page not found</h1>
          <p>
            <a href="#/">Return to the home page</a>
          </p>
        </div>
      );
  }

  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          // The hash is used for routing, so move focus without changing it.
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <Header current={section} account={account} me={me} onAccountChange={changeAccount}
        onSignOut={async () => { await api.logout().catch(() => undefined); await refreshIdentity(); window.location.hash = '#/'; }} />
      {/* Remount the page when the demo account changes so data is reloaded for that identity. */}
      <main id="main" tabIndex={-1} key={`${account}:${section}`}>
        {page}
      </main>
      <footer className="site-footer no-print">
        <div className="container">
          <p className="small">
            RTA Cabinet Factory · Development build using synthetic catalog, prices and policies. Product data, prices,
            plan terms and financing partners shown here are placeholders pending business approval.
          </p>
        </div>
      </footer>
    </>
  );
}
