import { create } from 'zustand';
import { db, User, Product, Order } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';

interface CartItem {
  product: Product;
  quantity: number;
}

interface AppState {
  currentUser: User | null;
  isOfflineMode: boolean;
  cart: CartItem[];
  
  login: (user: User) => void;
  logout: () => void;
  toggleOfflineMode: () => void;
  addToCart: (product: Product, quantity: number) => void;
  removeFromCart: (productId: number) => void;
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

  addToCart: (product, quantity) => set((state) => {
    const existing = state.cart.find(item => item.product.id === product.id);
    if (existing) {
      return {
        cart: state.cart.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      };
    }
    return { cart: [...state.cart, { product, quantity }] };
  }),

  removeFromCart: (productId) => set((state) => ({
    cart: state.cart.filter(item => item.product.id !== productId)
  })),

  clearCart: () => set({ cart: [] }),

  getCartTotal: () => {
    const { cart } = get();
    return cart.reduce((total, item) => total + (item.product.price * item.quantity), 0);
  }
}));
