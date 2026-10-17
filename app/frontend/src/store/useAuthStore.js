import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

function mapUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role || "CUSTOMER",
    branchId: user.branchId || null,
    mustChangePassword: Boolean(user.mustChangePassword),
    totpEnabled: user.totpEnabled == null ? null : Boolean(user.totpEnabled),
    status: user.status || "ACTIVE",
    blockReason: user.blockReason || null,
    createdAt: user.createdAt,
    lastStreet: user.lastStreet || "",
    lastApartment: user.lastApartment || "",
    lastFloor: user.lastFloor || "",
    lastIntercom: user.lastIntercom || "",
    lastLat: user.lastLat ?? null,
    lastLng: user.lastLng ?? null,
  };
}

export function setPharmacistRemember(remember) {
  localStorage.setItem("vita24-pharmacist-remember", remember ? "1" : "0");
}

function pharmacistStorage() {
  const remember = () => localStorage.getItem("vita24-pharmacist-remember") !== "0";
  return {
    getItem(name) {
      return remember() ? localStorage.getItem(name) : sessionStorage.getItem(name);
    },
    setItem(name, value) {
      if (remember()) {
        localStorage.setItem(name, value);
        sessionStorage.removeItem(name);
      } else {
        sessionStorage.setItem(name, value);
        localStorage.removeItem(name);
      }
    },
    removeItem(name) {
      localStorage.removeItem(name);
      sessionStorage.removeItem(name);
    },
  };
}

function createSessionStore(storageKey) {
  return create(
    persist(
      (set) => ({
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
        setSession: (user, token, extra) =>
          set((state) => ({
            user: mapUser(user),
            token: token === undefined ? state.token : token || null,
            refreshToken:
              extra && Object.prototype.hasOwnProperty.call(extra, "refreshToken")
                ? extra.refreshToken || null
                : state.refreshToken,
            isAuthenticated: Boolean(user?.id || user?.phone),
          })),
        logout: () => set({ user: null, token: null, refreshToken: null, isAuthenticated: false }),
      }),
      {
        name: storageKey,
        partialize: (state) => ({
          user: state.user,
          token: state.token,
          refreshToken: state.refreshToken,
          isAuthenticated: state.isAuthenticated,
        }),
        ...(storageKey === "vita24-pharmacist"
          ? { storage: createJSONStorage(() => pharmacistStorage()) }
          : {}),
      }
    )
  );
}

export const useAuthStore = createSessionStore("vita24-customer");
export const usePharmacistAuth = createSessionStore("vita24-pharmacist");
export const useAdminAuth = createSessionStore("vita24-admin");
