import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useFavoritesStore = create(
  persist(
    (set, get) => ({
      items: [],

      isFavorite: (medicineId) => get().items.some((item) => item.id === medicineId),

      toggleFavorite: (medicine) => {
        const exists = get().items.some((item) => item.id === medicine.id);
        set({
          items: exists
            ? get().items.filter((item) => item.id !== medicine.id)
            : [...get().items, medicine],
        });
      },
    }),
    {
      name: "vita24-favorites",
      partialize: (state) => ({ items: state.items }),
    }
  )
);
