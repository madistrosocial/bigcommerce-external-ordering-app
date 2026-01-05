import { create } from 'zustand';
import type { User, Product } from './api';

interface CartItem {
  product: Product;
  variant?: any;
  quantity: number;
}

interface AppState {
  currentUser: User | null;
  isOfflineMode: boolean;
  cart: CartItem[];
  
  login: (user: User) => void;
  logout: () => void;
  toggleOfflineMode: () => void;
  addToCart: (product: Product, quantity: number, variant?: any) => void;
  removeFromCart: (productId: number, variantId?: number) => void;
  updateCartQuantity: (productId: number, delta: number, variantId?: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;
}

export const useStore = create<AppState>((set, get) => ({
  currentUser: JSON.parse(localStorage.getItem('vansales_user') || 'null'),
  isOfflineMode: false,
  cart: [],

  login: (user) => {
    localStorage.setItem('vansales_user', JSON.stringify(user));
    set({ currentUser: user });
  },

  logout: () => {
    localStorage.removeItem('vansales_user');
    set({ currentUser: null, cart: [] });
  },

  toggleOfflineMode: () => set((state) => ({ isOfflineMode: !state.isOfflineMode })),

  addToCart: (product, quantity, variant) => set((state) => {
    const existing = state.cart.find(item => 
      item.product.id === product.id && 
      (!variant || item.variant?.id === variant.id)
    );
    if (existing) {
      return {
        cart: state.cart.map(item => 
          item.product.id === product.id && (!variant || item.variant?.id === variant.id)
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      };
    }
    return { cart: [...state.cart, { product, quantity, variant }] };
  }),

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
    return cart.reduce((total, item) => total + (parseFloat(item.product.price) * item.quantity), 0);
  }
}));
