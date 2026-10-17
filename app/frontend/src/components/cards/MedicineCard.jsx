import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { FileText, Heart, Minus, Pill, Plus, ShoppingCart } from "lucide-react";
import { formatSom } from "../../lib/format";
import { resolveMediaUrl } from "../../lib/media";
import { unitMultiplier } from "../../lib/mockData";
import { useBranchStore } from "../../store/useBranchStore";
import { useCartStore } from "../../store/useCartStore";
import { useFavoritesStore } from "../../store/useFavoritesStore";
import { useToastStore } from "../../store/useToastStore";

export default function MedicineCard({ medicine }) {
  const { t } = useTranslation();
  const branch = useBranchStore((state) => state.branch);
  const requireBranch = useBranchStore((state) => state.requireBranch);
  const addToCart = useCartStore((state) => state.addToCart);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const selectedUnit = medicine.dosageUnit || "tabletka";
  const quantity = useCartStore((state) => state.getLineQuantity(medicine.id, selectedUnit));
  const isFavorite = useFavoritesStore((state) => state.isFavorite(medicine.id));
  const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite);
  const pushToast = useToastStore((state) => state.push);
  const [imgError, setImgError] = useState(false);

  const imageSrc = resolveMediaUrl(medicine.imageUrl);
  const showImage = Boolean(imageSrc) && !imgError;
  const stockCount = Number(medicine.stockCount) || 0;
  const soldOut = stockCount <= 0;
  const pack = unitMultiplier(selectedUnit);
  const dosage = medicine.dosage || medicine.dosageForm || "";

  useEffect(() => {
    setImgError(false);
  }, [medicine.imageUrl]);

  const handleAdd = () => {
    if (soldOut || !requireBranch() || !branch) return;
    const added = addToCart(medicine, branch.id, selectedUnit);
    if (!added) {
      pushToast(t("cart.onlyLeft", { count: stockCount }), "info", { duration: 2200 });
      return;
    }
    pushToast(
      medicine.isPrescription
        ? t("medicine.addedRx", { name: medicine.name })
        : t("medicine.added", { name: medicine.name }),
      "info",
      { duration: 1800 }
    );
  };

  return (
    <article className="flex h-full min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm transition-all hover:border-[#087B51]/35 hover:shadow-md">
      <div className="relative h-36 w-full overflow-hidden rounded-xl md:h-40">
        {showImage ? (
          <img
            src={imageSrc}
            alt={medicine.name}
            className="h-full w-full object-contain p-2"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="grid h-full w-full place-items-center rounded-xl border border-emerald-100/50 bg-emerald-50/70 text-[#087B51]">
            <Pill className="h-12 w-12 stroke-[1.5]" aria-hidden />
          </span>
        )}

        {medicine.isPrescription && (
          <span className="absolute left-1.5 top-1.5 inline-flex max-w-[calc(100%-2.75rem)] items-center gap-1 rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
            <FileText className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{t("medicine.rxBadge")}</span>
          </span>
        )}

        <button
          type="button"
          aria-label={isFavorite ? t("medicine.favRemove") : t("medicine.favAdd")}
          onClick={() => {
            toggleFavorite(medicine);
            pushToast(isFavorite ? t("medicine.favOff") : t("medicine.favOn"));
          }}
          className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-slate-400 shadow-sm transition hover:text-red-500"
        >
          <Heart className={`h-4 w-4 ${isFavorite ? "fill-red-500 text-red-500" : ""}`} aria-hidden />
        </button>
      </div>

      <div className="mt-2 flex min-w-0 flex-1 flex-col">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-900">
          {medicine.slug ? (
            <Link to={`/medicine/${medicine.slug}`} className="text-inherit no-underline">
              {medicine.name}
            </Link>
          ) : (
            medicine.name
          )}
        </h3>
        {dosage ? <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{dosage}</p> : null}

        <strong className="mt-auto pt-2 text-sm font-bold tabular-nums text-slate-900">
          {branch ? formatSom(medicine.price) : t("medicine.pickBranch")}
        </strong>
        {branch && stockCount > 0 && stockCount <= 5 && (
          <p className="mt-1 text-[11px] font-semibold text-amber-700">{t("cart.lowStock")}</p>
        )}
        {branch && quantity > 0 && (quantity + 1) * pack > stockCount && (
          <p className="mt-1 text-[11px] font-semibold text-amber-700">{t("cart.onlyLeft", { count: stockCount })}</p>
        )}

        {soldOut ? (
          <button
            type="button"
            disabled
            className="mt-2 inline-flex h-11 w-full cursor-not-allowed items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-400"
          >
            {t("medicine.soldOut")}
          </button>
        ) : quantity === 0 ? (
          <button
            type="button"
            onClick={handleAdd}
            className="mt-2 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[#087B51] px-2 text-xs font-bold text-white transition hover:bg-[#066341]"
          >
            <ShoppingCart className="h-4 w-4" aria-hidden />
            {t("medicine.add")}
          </button>
        ) : (
          <div className="mt-2 inline-flex h-11 w-full items-center justify-between rounded-xl bg-[#e7f6ef] px-1">
            <button
              type="button"
              aria-label={t("medicine.decrease")}
              onClick={() => updateQuantity(medicine.id, selectedUnit, quantity - 1)}
              className="grid h-8 w-8 place-items-center rounded-lg bg-white text-slate-800 shadow-sm"
            >
              <Minus className="h-4 w-4" aria-hidden />
            </button>
            <span className="min-w-6 text-center text-sm font-bold tabular-nums text-slate-900">{quantity}</span>
            <button
              type="button"
              aria-label={t("medicine.increase")}
              disabled={(quantity + 1) * pack > stockCount}
              title={(quantity + 1) * pack > stockCount ? t("cart.onlyLeft", { count: stockCount }) : undefined}
              onClick={() => updateQuantity(medicine.id, selectedUnit, quantity + 1)}
              className="grid h-8 w-8 place-items-center rounded-lg bg-white text-slate-800 shadow-sm disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
