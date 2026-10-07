import { ApiError, type CartView, api } from './api';
import { getCartId, getDemoAccount, setCartId, setGuestToken } from './storage';

/** Load the current account's cart, forgetting a pointer the server no longer recognises. */
export async function loadCurrentCart(): Promise<CartView | null> {
  const id = getCartId();
  if (!id) return null;
  try {
    return await api.getCart(id);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 401)) {
      setCartId(null);
      return null;
    }
    throw e;
  }
}

/** Current cart, created on first use. Guests receive a cart-only token from the server. */
async function ensureCart(): Promise<CartView> {
  const existing = await loadCurrentCart();
  if (existing) return existing;
  const cart = await api.createCart();
  if (cart.guestToken && getDemoAccount() === 'guest') setGuestToken(cart.guestToken);
  setCartId(cart.id);
  return cart;
}

/** Add SKUs to the cart, merging quantities. Quantities only; the server prices and validates. */
export async function addManyToCart(items: { skuCode: string; quantity: number }[]): Promise<CartView> {
  const cart = await ensureCart();
  const lines = cart.lines.map((l) => ({ skuCode: l.skuCode, quantity: l.quantity }));
  for (const it of items) {
    const found = lines.find((l) => l.skuCode === it.skuCode);
    if (found) found.quantity += it.quantity;
    else lines.push({ ...it });
  }
  return api.patchCart(cart.id, lines);
}

export const addToCart = (skuCode: string, quantity: number): Promise<CartView> => addManyToCart([{ skuCode, quantity }]);
