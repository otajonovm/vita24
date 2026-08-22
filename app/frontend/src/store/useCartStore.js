import { create } from "zustand";
import { persist } from "zustand/middleware";
import { lineTotal, unitMultiplier } from "../lib/mockData";

const RESERVATION_MS = 15 * 60 * 1000;

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

      addToCart: (medicine, branchId, selectedUnit = medicine.dosageUnit || "tabletka") => {
        const items = get().items;
        const existing = items.find((item) => sameLine(item, medicine.id, selectedUnit));
        const packSize = unitMultiplier(selectedUnit);
        const nextQty = (existing?.quantity || 0) + 1;

        if (nextQty * packSize > medicine.stockCount) return;

        if (existing) {
          set({
            items: items.map((item) =>
              sameLine(item, medicine.id, selectedUnit)
                ? { ...item, quantity: item.quantity + 1, medicine }
                : item
            ),
          });
          return;
        }

        set({
          items: [
            ...items,
            {
              medicine,
              quantity: 1,
              branchId,
              selectedUnit,
            },
          ],
        });
      },

      removeFromCart: (medicineId, selectedUnit) => {
        set({
          items: get().items.filter((item) => !sameLine(item, medicineId, selectedUnit)),
        });
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

      setPrescription: (prescription) => set({ prescription }),
      clearPrescription: () => set({ prescription: null }),

      startReservation: (order) => {
        const until = order?.reservedUntil
          ? new Date(order.reservedUntil).getTime()
          : Date.now() + RESERVATION_MS;
        set({
          pendingOrder: order,
          reservationUntil: until,
        });
      },

      clearReservation: () => set({ pendingOrder: null, reservationUntil: null }),

      hasPrescriptionItems: () =>
        get().items.some((item) => item.medicine.isPrescription),

      getTotalAmount: () => get().items.reduce((sum, item) => sum + lineTotal(item), 0),

      getItemCount: () => get().items.reduce((sum, item) => sum + item.quantity, 0),

      getLineQuantity: (medicineId, selectedUnit) =>
        get().items.find((item) => sameLine(item, medicineId, selectedUnit))?.quantity || 0,
    }),
    {
      name: "vita24-cart",
      partialize: (state) => ({
        items: state.items,
        prescription: state.prescription,
        pendingOrder: state.pendingOrder,
        reservationUntil: state.reservationUntil,
      }),
    }
  )
);
