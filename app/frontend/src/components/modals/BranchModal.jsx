import { useEffect, useMemo, useState } from "react";
import { Building2, Check, MapPin, Search, XCircle } from "lucide-react";
import { fetchBranches } from "../../services/api";
import { useBranchStore } from "../../store/useBranchStore";
import { useCartStore } from "../../store/useCartStore";

export default function BranchModal() {
  const { branch, isModalOpen, setBranch, closeModal } = useBranchStore();
  const clearCart = useCartStore((state) => state.clearCart);
  const [branches, setBranches] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isModalOpen) return undefined;
    let active = true;
    setLoading(true);
    fetchBranches()
      .then((data) => {
        if (active) setBranches(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isModalOpen]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return branches;
    return branches.filter((item) =>
      `${item.name} ${item.address} ${item.district || ""}`.toLowerCase().includes(needle)
    );
  }, [branches, query]);

  if (!isModalOpen) return null;

  const handleSelect = (nextBranch) => {
    if (branch && branch.id !== nextBranch.id) clearCart();
    setBranch(nextBranch);
  };

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-slate-900/45 p-5"
      onClick={closeModal}
      role="presentation"
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="branch-modal-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand">Filialni tanlang</p>
            <h2 id="branch-modal-title" className="mt-1 text-2xl font-extrabold text-slate-900">
              Qaysi dorixonadan olasiz?
            </h2>
          </div>
          {branch && (
            <button
              type="button"
              aria-label="Yopish"
              onClick={closeModal}
              className="grid h-9 w-9 place-items-center rounded-full bg-slate-50"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>

        <p className="mb-4 text-sm text-slate-500">
          Narx va qoldiq har bir filialda alohida. Filialni almashtirsangiz, savatcha tozalanadi.
        </p>

        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filial yoki tuman bo'yicha qidirish"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none ring-brand/30 focus:ring-2"
          />
        </div>

        {loading && <p className="text-sm text-slate-500">Filiallar yuklanmoqda...</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((item) => {
            const active = branch?.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item)}
                className={`rounded-2xl border p-4 text-left shadow-sm ${
                  active ? "border-brand bg-brand-soft" : "border-slate-100 bg-white"
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <Building2 className="h-5 w-5 text-brand" />
                  {active && <Check className="h-5 w-5 text-brand" />}
                </div>
                <strong className="block text-slate-900">{item.name}</strong>
                <span className="mt-1 flex items-start gap-1.5 text-sm text-slate-500">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  {item.address}
                </span>
                <em className="mt-2 block text-xs not-italic text-slate-500">
                  {item.phone}
                  {item.workingHours ? ` · ${item.workingHours}` : ""}
                </em>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
