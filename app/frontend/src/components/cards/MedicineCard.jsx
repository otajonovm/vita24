import {
  LiaCartPlusSolid,
  LiaFilePrescriptionSolid,
  LiaHeart,
  LiaHeartSolid,
  LiaMinusSolid,
  LiaPillsSolid,
  LiaPlusSolid,
} from "react-icons/lia";
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
    <article className="flex h-full min-w-0 flex-col rounded-2xl border border-slate-100 bg-white p-2 shadow-sm transition-all hover:border-[#087b51]/40 hover:shadow-md md:p-2.5">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-50 md:aspect-square">
        {medicine.imageUrl ? (
          <img
            src={medicine.imageUrl}
            alt={medicine.name}
            className="h-full w-full object-contain p-1.5"
          />
        ) : (
          <span className="grid h-full w-full place-items-center text-[#087b51]">
            <LiaPillsSolid className="h-9 w-9 md:h-11 md:w-11" aria-hidden />
          </span>
        )}
        <button
          type="button"
          aria-label={isFavorite ? "Saralangandan olib tashlash" : "Saralanganlarga qo'shish"}
          onClick={() => toggleFavorite(medicine)}
          className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-slate-400 shadow-sm transition hover:text-red-500 md:right-1.5 md:top-1.5 md:h-8 md:w-8"
        >
          {isFavorite ? (
            <LiaHeartSolid className="h-4 w-4 text-red-500 md:h-[1.125rem] md:w-[1.125rem]" aria-hidden />
          ) : (
            <LiaHeart className="h-4 w-4 md:h-[1.125rem] md:w-[1.125rem]" aria-hidden />
          )}
        </button>
        {inStock && (
          <span className="absolute left-1 top-1 max-w-[calc(100%-2.5rem)] truncate rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 md:left-1.5 md:top-1.5 md:text-[10px]">
            Omborda bor
          </span>
        )}
      </div>

      <div className="mt-1.5 flex min-w-0 flex-1 flex-col md:mt-2">
        <h3 className="line-clamp-2 text-[13px] font-bold leading-snug text-slate-900 md:text-sm">
          {medicine.name}
        </h3>
        <p className="mt-0.5 truncate text-[11px] text-slate-500 md:text-xs">{medicine.dosage}</p>
        {medicine.isPrescription && (
          <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[9px] font-semibold text-red-600 md:text-[10px]">
            <LiaFilePrescriptionSolid className="h-3 w-3 shrink-0" aria-hidden />
            Retsept
          </span>
        )}

        <strong className="mt-auto pt-1.5 text-[13px] font-bold tabular-nums text-slate-900 md:pt-2 md:text-sm">
          {formatSom(displayPrice)}
        </strong>

        {quantity === 0 ? (
          <button
            type="button"
            disabled={!inStock}
            onClick={handleAdd}
            className="mt-1.5 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#087b51] px-2 text-xs font-bold text-white transition hover:bg-[#066341] disabled:cursor-not-allowed disabled:opacity-40 md:mt-2"
          >
            <LiaCartPlusSolid className="h-4 w-4" aria-hidden />
            Savatga
          </button>
        ) : (
          <div className="mt-1.5 inline-flex h-10 w-full items-center justify-between rounded-full bg-[#e7f6ef] px-1 md:mt-2">
            <button
              type="button"
              aria-label="Kamaytirish"
              onClick={() => updateQuantity(medicine.id, selectedUnit, quantity - 1)}
              className="grid h-7 w-7 place-items-center rounded-full bg-white text-slate-800"
            >
              <LiaMinusSolid className="h-3.5 w-3.5" aria-hidden />
            </button>
            <span className="min-w-4 text-center text-sm font-bold">{quantity}</span>
            <button
              type="button"
              aria-label="Ko'paytirish"
              disabled={(quantity + 1) * pack > medicine.stockCount}
              onClick={() => updateQuantity(medicine.id, selectedUnit, quantity + 1)}
              className="grid h-7 w-7 place-items-center rounded-full bg-white text-slate-800 disabled:opacity-40"
            >
              <LiaPlusSolid className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
