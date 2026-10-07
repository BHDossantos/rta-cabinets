import { useState } from 'react';
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
import { type DemoAccount, getDemoAccount, setDemoAccount } from './storage';

export function App() {
  const route = useHashRoute();
  const [account, setAccount] = useState<DemoAccount>(() => getDemoAccount());
  const section = route[0] ?? '';

  const changeAccount = (a: DemoAccount) => {
    setDemoAccount(a);
    setAccount(a);
  };

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
      page = <AccountPage account={account} />;
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
      <Header current={section} account={account} onAccountChange={changeAccount} />
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
