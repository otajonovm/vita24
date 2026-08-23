import { Heart, Minus, Pill, Plus } from "lucide-react";
import { formatSom } from "../../lib/format";
import { unitMultiplier } from "../../lib/mockData";
import { useBranchStore } from "../../store/useBranchStore";
import { useCartStore } from "../../store/useCartStore";
import { useFavoritesStore } from "../../store/useFavoritesStore";

export default function MedicineCard({ medicine }) {
  const branch = useBranchStore((state) => state.branch);
  const requireBranch = useBranchStore((state) => state.requireBranch);
  const addToCart = useCartStore((state) => state.addToCart);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const selectedUnit = medicine.dosageUnit || "tabletka";
  const quantity = useCartStore((state) => state.getLineQuantity(medicine.id, selectedUnit));
  const isFavorite = useFavoritesStore((state) => state.isFavorite(medicine.id));
  const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite);

  const pack = unitMultiplier(selectedUnit);
  const inStock = medicine.stockCount >= pack;
  const displayPrice = medicine.price * pack;

  const handleAdd = () => {
    if (!requireBranch() || !branch || !inStock) return;
    addToCart(medicine, branch.id, selectedUnit);
  };

  return (
    <article className="flex flex-col rounded-2xl border border-slate-100 bg-white p-2.5 shadow-sm">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-slate-50">
        {medicine.imageUrl ? (
          <img
            src={medicine.imageUrl}
            alt={medicine.name}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="grid h-full w-full place-items-center text-brand">
            <Pill className="h-10 w-10" />
          </span>
        )}
        <button
          type="button"
          aria-label={isFavorite ? "Saralangandan olib tashlash" : "Saralanganlarga qo'shish"}
          onClick={() => toggleFavorite(medicine)}
          className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-white/95 shadow-sm"
        >
          <Heart
            className={`h-4 w-4 ${isFavorite ? "fill-red-500 text-red-500" : "text-slate-400"}`}
          />
        </button>
        {inStock && (
          <span className="absolute left-1.5 top-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
            Omborda bor
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-1 flex-col">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-900">{medicine.name}</h3>
        <p className="mt-0.5 text-xs text-slate-500">{medicine.dosage}</p>
        {medicine.isPrescription && (
          <span className="mt-1 inline-flex w-fit rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
            Retsept talab qilinadi
          </span>
        )}

        <strong className="mt-auto pt-2 text-sm font-bold tabular-nums text-slate-900">
          {formatSom(displayPrice)}
        </strong>

        {quantity === 0 ? (
          <button
            type="button"
            disabled={!inStock}
            onClick={handleAdd}
            className="mt-2 inline-flex h-12 items-center justify-center rounded-xl bg-brand px-2 text-xs font-bold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40 md:h-10"
          >
            + Savatga
          </button>
        ) : (
          <div className="mt-2 inline-flex h-12 items-center justify-between rounded-full bg-brand-soft px-1 md:h-10">
            <button
              type="button"
              aria-label="Kamaytirish"
              onClick={() => updateQuantity(medicine.id, selectedUnit, quantity - 1)}
              className="grid h-7 w-7 place-items-center rounded-full bg-white text-slate-800"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-4 text-center text-sm font-bold">{quantity}</span>
            <button
              type="button"
              aria-label="Ko'paytirish"
              disabled={(quantity + 1) * pack > medicine.stockCount}
              onClick={() => updateQuantity(medicine.id, selectedUnit, quantity + 1)}
              className="grid h-7 w-7 place-items-center rounded-full bg-white text-slate-800 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
