import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useBranchStore = create(
  persist(
    (set, get) => ({
      branch: null,
      isModalOpen: false,
      hydrated: false,
      skipped: false,

      setBranch: (branch) => set({ branch, isModalOpen: false, skipped: false }),
      openModal: () => set({ isModalOpen: true }),
      closeModal: () => set({ isModalOpen: false, skipped: true }),
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
      onRehydrateStorage: () => () => {
        useBranchStore.setState({ hydrated: true });
      },
    }
  )
);
