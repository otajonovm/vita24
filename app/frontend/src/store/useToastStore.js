import { create } from "zustand";

export const useToastStore = create((set) => ({
  message: "",
  toasts: [],
  push: (message, tone = "info", options = {}) => {
    const extra = typeof tone === "object" && tone ? tone : options || {};
    const resolvedTone = typeof tone === "string" ? tone : extra.tone || "info";
    const duration = Number(extra.duration) > 0 ? Number(extra.duration) : 3500;
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const toast = { id, message, tone: resolvedTone, action: extra.action || null };
    set((state) => ({
      message,
      toasts: [...(state.toasts || []), toast].slice(-4),
    }));
    window.clearTimeout(useToastStore.timeout);
    useToastStore.timeout = window.setTimeout(() => set({ message: "" }), duration);
    window.setTimeout(() => {
      set((state) => ({ toasts: (state.toasts || []).filter((item) => item.id !== id) }));
    }, duration);
  },
  dismiss: (id) => set((state) => ({ toasts: (state.toasts || []).filter((item) => item.id !== id) })),
}));
