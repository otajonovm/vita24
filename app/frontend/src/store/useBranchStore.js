import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useBranchStore = create(
  persist(
    (set, get) => ({
      branch: null,
      isModalOpen: false,

      setBranch: (branch) => set({ branch, isModalOpen: false }),
      openModal: () => set({ isModalOpen: true }),
      closeModal: () => {
        if (get().branch) set({ isModalOpen: false });
      },
      requireBranch: () => {
        if (!get().branch) {
          set({ isModalOpen: true });
          return false;
        }
        return true;
      },
    }),
    {
      name: "vita24-branch",
      partialize: (state) => ({ branch: state.branch }),
    }
  )
);
