import { ApiError, type CartView, api } from './api';
import { getCartId, setCartId } from './storage';

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

/** Add a SKU to the manual cart (creating one if needed). Quantities only; the server prices. */
export async function addToCart(skuCode: string, quantity: number): Promise<CartView> {
  let cart = await loadCurrentCart();
  if (!cart) {
    cart = await api.createCart();
    setCartId(cart.id);
  }
  const lines = cart.lines.map((l) => ({ skuCode: l.skuCode, quantity: l.quantity }));
  const existing = lines.find((l) => l.skuCode === skuCode);
  if (existing) existing.quantity += quantity;
  else lines.push({ skuCode, quantity });
  return api.patchCart(cart.id, lines);
}
