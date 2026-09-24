import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem('token') || null,
  isAuthLoading: true,

  setAuthLoading: (isLoading) => set({ isAuthLoading: isLoading }),

  setAuth: (user, token) => {
    localStorage.setItem('token', token);
    set({ user, token, isAuthLoading: false });
  },
  
  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, token: null, isAuthLoading: false });
  },
}));
