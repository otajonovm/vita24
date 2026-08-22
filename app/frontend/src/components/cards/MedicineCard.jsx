import { useState } from "react";
import { FileText, Minus, Pill, Plus } from "lucide-react";
import { formatSom } from "../../lib/format";
import { unitMultiplier } from "../../lib/mockData";
import { useBranchStore } from "../../store/useBranchStore";
import { useCartStore } from "../../store/useCartStore";

export default function MedicineCard({ medicine }) {
  const branch = useBranchStore((state) => state.branch);
  const requireBranch = useBranchStore((state) => state.requireBranch);
  const addToCart = useCartStore((state) => state.addToCart);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const [selectedUnit, setSelectedUnit] = useState(medicine.dosageUnit || "tabletka");
  const quantity = useCartStore((state) =>
    state.getLineQuantity(medicine.id, selectedUnit)
  );

  const pack = unitMultiplier(selectedUnit);
  const inStock = medicine.stockCount >= pack;
  const displayPrice = medicine.price * pack;

  const handleAdd = () => {
    if (!requireBranch() || !branch || !inStock) return;
    addToCart(medicine, branch.id, selectedUnit);
  };

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="relative grid h-28 place-items-center rounded-2xl bg-brand-soft">
        {medicine.imageUrl ? (
          <img src={medicine.imageUrl} alt={medicine.name} className="h-full w-full rounded-2xl object-cover" />
        ) : (
          <Pill className="h-10 w-10 text-brand" />
        )}
        {medicine.isPrescription && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600">
            <FileText className="h-3 w-3" />
            Retsept talab qilinadi
          </span>
        )}
      </div>

      <div className="flex-1">
        <p className="text-xs font-medium text-slate-500">
          {medicine.dosage} · {selectedUnit}
        </p>
        <h3 className="mt-1 text-base font-bold text-slate-900">{medicine.name}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-slate-500">{medicine.description}</p>
      </div>

      <label className="text-xs font-semibold text-slate-500">
        O'lchov
        <select
          value={selectedUnit}
          onChange={(event) => setSelectedUnit(event.target.value)}
          className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"
        >
          <option value="tabletka">dona</option>
          <option value="pachka">pachka</option>
          {medicine.dosageUnit === "shprits" && <option value="shprits">shprits</option>}
        </select>
      </label>

      <div className="flex items-end justify-between gap-3">
        <div>
          <strong className="block font-bold tabular-nums text-slate-900">
            {formatSom(displayPrice)}
          </strong>
          <small
            className={`text-xs font-semibold ${
              inStock ? "text-emerald-700" : "text-slate-400"
            }`}
          >
            {inStock ? `${medicine.stockCount} dona` : "Qoldiq yo'q"}
          </small>
        </div>

        {quantity === 0 ? (
          <button
            type="button"
            disabled={!inStock}
            onClick={handleAdd}
            className="h-11 rounded-xl bg-brand px-3 text-sm font-bold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Savatchaga qo'shish
          </button>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-soft p-1">
            <button
              type="button"
              aria-label="Kamaytirish"
              onClick={() => updateQuantity(medicine.id, selectedUnit, quantity - 1)}
              className="grid h-8 w-8 place-items-center rounded-full bg-white text-slate-800"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-6 text-center text-sm font-bold">{quantity}</span>
            <button
              type="button"
              aria-label="Ko'paytirish"
              disabled={ (quantity + 1) * pack > medicine.stockCount }
              onClick={() => updateQuantity(medicine.id, selectedUnit, quantity + 1)}
              className="grid h-8 w-8 place-items-center rounded-full bg-white text-slate-800 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
