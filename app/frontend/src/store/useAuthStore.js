import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      setSession: (user) =>
        set({
          user: user
            ? {
                id: user.id,
                name: user.name,
                phone: user.phone,
                role: user.role || "CUSTOMER",
                createdAt: user.createdAt,
              }
            : null,
          isAuthenticated: Boolean(user?.id),
        }),

      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: "vita24-auth",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
