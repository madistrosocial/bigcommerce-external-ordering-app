import { create } from 'zustand';
import type { User, Product } from './api';

export interface CartItem {
  lineId: string;
  product: Product;
  variant?: any;
  quantity: number;
  price_at_sale: number;
  original_price: number;
  discount_type: 'free' | 'percent' | null;
  discount_value: number | null;
}

interface AppState {
  currentUser: User | null;
  isOfflineMode: boolean;
  cart: CartItem[];
  
  login: (user: User) => void;
  logout: () => void;
  setOfflineMode: (offline: boolean) => void;
  toggleOfflineMode: () => void;
  addToCart: (
    product: Product,
    quantity: number,
    variant?: any,
    priceAtSale?: number,
    originalPrice?: number,
    discountType?: 'free' | 'percent' | null,
    discountValue?: number | null
  ) => void;
  removeFromCartAtIndex: (index: number) => void;
  updateCartQuantityAtIndex: (index: number, delta: number) => void;
  updateCartItemAtIndex: (
    index: number,
    updates: Partial<Pick<CartItem, 'price_at_sale' | 'original_price' | 'discount_type' | 'discount_value' | 'quantity'>>
  ) => void;
  removeFromCart: (productId: number, variantId?: number) => void;
  updateCartQuantity: (productId: number, delta: number, variantId?: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;
}

function makeLineId() {
  return Math.random().toString(36).slice(2, 10);
}

export const useStore = create<AppState>((set, get) => ({
  currentUser: JSON.parse(localStorage.getItem('vansales_user') || 'null'),
  isOfflineMode: !navigator.onLine,
  cart: [],

  login: (user) => {
    localStorage.setItem('vansales_user', JSON.stringify(user));
    set({ currentUser: user });
  },

  logout: () => {
    localStorage.removeItem('vansales_user');
    set({ currentUser: null, cart: [] });
  },

  setOfflineMode: (offline) => set({ isOfflineMode: offline }),
  toggleOfflineMode: () => set((state) => ({ isOfflineMode: !state.isOfflineMode })),

  addToCart: (product, quantity, variant, priceAtSale, originalPrice, discountType, discountValue) => set((state) => {
    const rawPrice = parseFloat(variant?.price || product.price);
    const resolvedOriginal = originalPrice ?? rawPrice;
    const resolvedPrice = priceAtSale ?? rawPrice;

    // Only merge into an existing line if product, variant AND price all match
    const existing = state.cart.find(item =>
      item.product.id === product.id &&
      (!variant || item.variant?.id === variant.id) &&
      item.price_at_sale === resolvedPrice
    );

    if (existing) {
      return {
        cart: state.cart.map(item =>
          item.lineId === existing.lineId
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      };
    }

    return {
      cart: [
        ...state.cart,
        {
          lineId: makeLineId(),
          product,
          quantity,
          variant,
          price_at_sale: resolvedPrice,
          original_price: resolvedOriginal,
          discount_type: discountType ?? null,
          discount_value: discountValue ?? null,
        }
      ]
    };
  }),

  removeFromCartAtIndex: (index) => set((state) => ({
    cart: state.cart.filter((_, i) => i !== index)
  })),

  updateCartItemAtIndex: (index, updates) => set((state) => ({
    cart: state.cart.map((item, i) =>
      i === index ? { ...item, ...updates } : item
    )
  })),

  updateCartQuantityAtIndex: (index, delta) => set((state) => ({
    cart: state.cart
      .map((item, i) =>
        i === index ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
      )
      .filter(item => item.quantity > 0)
  })),

  // Legacy helpers kept for any code that still uses them
  updateCartQuantity: (productId, delta, variantId) => set((state) => ({
    cart: state.cart.map(item =>
      item.product.id === productId && (!variantId || item.variant?.id === variantId)
        ? { ...item, quantity: Math.max(0, item.quantity + delta) }
        : item
    ).filter(item => item.quantity > 0)
  })),

  removeFromCart: (productId, variantId) => set((state) => ({
    cart: state.cart.filter(item =>
      !(item.product.id === productId && (!variantId || item.variant?.id === variantId))
    )
  })),

  clearCart: () => set({ cart: [] }),

  getCartTotal: () => {
    const { cart } = get();
    return cart.reduce((total, item) => total + (item.price_at_sale * item.quantity), 0);
  }
}));
