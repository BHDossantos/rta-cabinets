import { useEffect, useState } from 'react';

/** Minimal hash router: "#/orders/ord_1" -> ["orders", "ord_1"]. */
export function parseHash(hash: string): string[] {
  const path = hash.replace(/^#/, '').split('?')[0] ?? '';
  return path.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
}

export function useHashRoute(): string[] {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path: string): void {
  window.location.hash = path.startsWith('#') ? path : `#${path}`;
}
