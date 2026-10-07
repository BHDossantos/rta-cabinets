/**
 * Browser storage helpers. Storage can be unavailable (private windows, blocked
 * site data), so every access is wrapped and the app works without it.
 */
export function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStore(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: keep working in memory */
  }
}

export function readJson<T>(key: string): T | null {
  const raw = readStore(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeStore(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** Development identity stub: which seeded demo account the API should treat us as. */
export type DemoAccount = 'guest' | 'u_home' | 'u_pro' | 'u_designer';

export const DEMO_ACCOUNTS: { id: DemoAccount; label: string }[] = [
  { id: 'guest', label: 'Guest' },
  { id: 'u_home', label: 'Homeowner (u_home)' },
  { id: 'u_pro', label: 'Pro (u_pro)' },
  { id: 'u_designer', label: 'Staff designer (u_designer)' },
];

export function getDemoAccount(): DemoAccount {
  const v = readStore('rta.demoAccount');
  return v === 'u_home' || v === 'u_pro' || v === 'u_designer' ? v : 'guest';
}

export function setDemoAccount(a: DemoAccount): void {
  writeStore('rta.demoAccount', a);
}

export const getGuestToken = (): string | null => readStore('rta.guestToken');
export const setGuestToken = (t: string | null): void => writeStore('rta.guestToken', t);

/** Project and cart pointers are kept per demo account so switching accounts does not mix data. */
export const projectKey = () => `rta.project.${getDemoAccount()}`;
export const cartKey = () => `rta.cart.${getDemoAccount()}`;
export const getProjectId = () => readStore(projectKey());
export const setProjectId = (id: string | null) => writeStore(projectKey(), id);
export const getCartId = () => readStore(cartKey());
export const setCartId = (id: string | null) => writeStore(cartKey(), id);

/** Door style chosen once and applied to every cabinet added in the planner. */
export const getPreferredFinish = (): string | null => readStore('rta.preferredFinish');
export const setPreferredFinish = (finish: string | null): void => writeStore('rta.preferredFinish', finish);
