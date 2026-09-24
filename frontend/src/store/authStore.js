import { create } from 'zustand';

// The token is held in memory only; Supabase's own client persists and refreshes the session,
// and App.jsx repopulates this store from it on load.
export const useAuthStore = create((set) => ({
  user: null,
  token: null,
  isAuthLoading: true,

  setAuthLoading: (isLoading) => set({ isAuthLoading: isLoading }),

  setAuth: (user, token) => set({ user, token, isAuthLoading: false }),

  logout: () => set({ user: null, token: null, isAuthLoading: false }),
}));
