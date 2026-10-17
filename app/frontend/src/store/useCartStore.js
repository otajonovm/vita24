import { create } from "zustand";
import { persist } from "zustand/middleware";
import { lineTotal, unitMultiplier } from "../lib/mockData";

const RESERVATION_MS = 15 * 60 * 1000;

function reservationTimestamp(order) {
  const raw = order?.reservedUntil || order?.reservationUntil;
  if (!raw) return Date.now() + RESERVATION_MS;
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now() + RESERVATION_MS;
}

function sameLine(item, medicineId, selectedUnit) {
  return item.medicine.id === medicineId && item.selectedUnit === selectedUnit;
}

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],
      prescription: null,
      pendingOrder: null,
      reservationUntil: null,
      checkoutHoldUntil: null,
      paymentMethod: "payme",
      deliveryType: "DELIVERY",
      promo: null,
      savedAddress: {
        street: "",
        apartment: "",
        floor: "",
        intercom: "",
        entrance: "",
        landmark: "",
        lat: null,
        lng: null,
      },
      setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
      setDeliveryType: (deliveryType) => set({ deliveryType }),
      setPromo: (promo) => set({ promo }),
      setSavedAddress: (patch) =>
        set({
          savedAddress: {
            ...get().savedAddress,
            ...patch,
          },
        }),
      ensureCheckoutHold: () => {
        const current = get().checkoutHoldUntil;
        const cap = Date.now() + RESERVATION_MS;
        if (!current || current < Date.now() || current > cap) {
          set({ checkoutHoldUntil: cap });
        }
      },

      addToCart: (medicine, branchId, selectedUnit = medicine.dosageUnit || "tabletka", addQty = 1) => {
        const items = get().items;
        const existing = items.find((item) => sameLine(item, medicine.id, selectedUnit));
        const packSize = unitMultiplier(selectedUnit);
        const count = Math.max(1, Math.floor(Number(addQty) || 1));
        const nextQty = (existing?.quantity || 0) + count;

        if (nextQty * packSize > medicine.stockCount) return false;

        if (existing) {
          set({
            items: items.map((item) =>
              sameLine(item, medicine.id, selectedUnit)
                ? { ...item, quantity: item.quantity + count, medicine }
                : item
            ),
          });
          return true;
        }

        set({
          items: [
            ...items,
            {
              medicine,
              quantity: count,
              branchId,
              selectedUnit,
            },
          ],
        });
        return true;
      },

      removeFromCart: (medicineId, selectedUnit) => {
        const current = get().items;
        const removed = current.find((item) => sameLine(item, medicineId, selectedUnit)) || null;
        set({
          items: current.filter((item) => !sameLine(item, medicineId, selectedUnit)),
        });
        return removed;
      },

      restoreLine: (line) => {
        if (!line?.medicine?.id) return;
        const items = get().items;
        if (items.some((item) => sameLine(item, line.medicine.id, line.selectedUnit))) return;
        set({ items: [...items, line] });
      },

      updateQuantity: (medicineId, selectedUnit, quantity) => {
        if (quantity < 1) {
          get().removeFromCart(medicineId, selectedUnit);
          return;
        }

        set({
          items: get().items.map((item) => {
            if (!sameLine(item, medicineId, selectedUnit)) return item;
            const maxUnits = Math.max(
              1,
              Math.floor(item.medicine.stockCount / unitMultiplier(selectedUnit))
            );
            return { ...item, quantity: Math.min(quantity, maxUnits) };
          }),
        });
      },

      clearCart: () =>
        set({
          items: [],
          prescription: null,
        }),

      clearSession: () =>
        set({
          items: [],
          prescription: null,
          pendingOrder: null,
          reservationUntil: null,
          checkoutHoldUntil: null,
          promo: null,
          savedAddress: {
            street: "",
            apartment: "",
            floor: "",
            intercom: "",
            entrance: "",
            landmark: "",
            lat: null,
            lng: null,
          },
        }),

      applyBranchStock: (branchId, rows) =>
        set({
          items: get().items.map((item) => {
            const row = (rows || []).find((entry) => entry.id === item.medicine.id);
            const available = row ? Number(row.available) || 0 : 0;
            return {
              ...item,
              branchId,
              medicine: {
                ...item.medicine,
                stockCount: available,
                available,
                price: row && row.price != null ? Number(row.price) : item.medicine.price,
              },
            };
          }),
        }),

      setPrescription: (prescription) => set({ prescription }),
      clearPrescription: () => set({ prescription: null }),

      startReservation: (order) => {
        set({
          pendingOrder: order,
          reservationUntil: reservationTimestamp(order),
          checkoutHoldUntil: null,
        });
      },

      clearReservation: () =>
        set({ pendingOrder: null, reservationUntil: null, checkoutHoldUntil: null }),

      hasPrescriptionItems: () =>
        get().items.some((item) => item.medicine.isPrescription),

      getTotalAmount: () => get().items.reduce((sum, item) => sum + lineTotal(item), 0),

      getItemCount: () => get().items.reduce((sum, item) => sum + item.quantity, 0),

      getLineQuantity: (medicineId, selectedUnit) =>
        get().items.find((item) => sameLine(item, medicineId, selectedUnit))?.quantity || 0,
    }),
    {
      name: "vita24-cart",
      version: 6,
      migrate: (persisted) => {
        const cap = Date.now() + RESERVATION_MS;
        const now = Date.now();
        const hasItems = Array.isArray(persisted.items) && persisted.items.length > 0;
        const pending = persisted.pendingOrder;

        return {
          ...persisted,
          deliveryType: persisted.deliveryType === "PICKUP" ? "PICKUP" : "DELIVERY",
          promo: persisted.promo || null,
          savedAddress: {
            street: "",
            apartment: "",
            floor: "",
            intercom: "",
            entrance: "",
            landmark: "",
            lat: null,
            lng: null,
            ...(persisted.savedAddress || {}),
          },
          reservationUntil: pending ? reservationTimestamp(pending) : null,
          checkoutHoldUntil: pending
            ? null
            : hasItems && (!persisted.checkoutHoldUntil || persisted.checkoutHoldUntil <= now)
              ? cap
              : persisted.checkoutHoldUntil && persisted.checkoutHoldUntil > cap
                ? cap
                : persisted.checkoutHoldUntil,
        };
      },
      partialize: (state) => ({
        items: state.items,
        prescription: state.prescription,
        pendingOrder: state.pendingOrder,
        reservationUntil: state.reservationUntil,
        checkoutHoldUntil: state.checkoutHoldUntil,
        paymentMethod: state.paymentMethod,
        deliveryType: state.deliveryType,
        promo: state.promo,
        savedAddress: state.savedAddress,
      }),
    }
  )
);
