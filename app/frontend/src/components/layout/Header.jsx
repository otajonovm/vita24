import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, MapPin, Search, ShoppingCart } from "lucide-react";
import { formatSom } from "../../lib/format";
import { fetchMedicines } from "../../services/api";
import { useBranchStore } from "../../store/useBranchStore";
import { useCartStore } from "../../store/useCartStore";
import BranchModal from "../modals/BranchModal";

export default function Header() {
  const navigate = useNavigate();
  const branch = useBranchStore((state) => state.branch);
  const openModal = useBranchStore((state) => state.openModal);
  const itemCount = useCartStore((state) =>
    state.items.reduce((sum, item) => sum + item.quantity, 0)
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [openResults, setOpenResults] = useState(false);

  useEffect(() => {
    if (!branch) openModal();
  }, [branch, openModal]);

  useEffect(() => {
    if (query.trim().length < 2 || !branch) {
      setResults([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      const data = await fetchMedicines({ branchId: branch.id, search: query });
      setResults(data.slice(0, 6));
      setOpenResults(true);
    }, 220);

    return () => clearTimeout(timer);
  }, [query, branch]);

  const placeholder = useMemo(
    () => (branch ? `${branch.name} bo'yicha qidiring` : "Avval filial tanlang"),
    [branch]
  );

  return (
    <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur">
      <div className="mx-auto grid max-w-6xl grid-cols-[auto_auto_1fr_auto] items-center gap-3 px-4 py-3 max-md:grid-cols-2">
        <Link to="/" className="flex items-center gap-2.5 no-underline">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-sm font-extrabold text-white">
            V
          </span>
          <span>
            <strong className="block text-[15px] font-extrabold tracking-tight text-slate-900">
              Vita24
            </strong>
            <small className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">
              Onlayn dorixona
            </small>
          </span>
        </Link>

        <button
          type="button"
          onClick={openModal}
          className="flex min-w-[168px] items-center gap-2 rounded-xl bg-brand-soft px-3 py-2 text-left max-md:justify-self-end"
        >
          <MapPin className="h-4 w-4 shrink-0 text-brand" />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-brand">
              Filial
            </span>
            <strong className="block truncate text-sm text-slate-900">
              {branch ? branch.name : "Tanlanmagan"}
            </strong>
          </span>
          <ChevronDown className="h-4 w-4 text-brand" />
        </button>

        <div className="relative max-md:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            placeholder={placeholder}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => results.length > 0 && setOpenResults(true)}
            onBlur={() => setTimeout(() => setOpenResults(false), 160)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none ring-brand/30 focus:ring-2"
          />
          {openResults && results.length > 0 && (
            <div className="absolute inset-x-0 top-[calc(100%+6px)] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              {results.map((medicine) => (
                <button
                  key={medicine.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3.5 py-3 text-left last:border-0 hover:bg-slate-50"
                  onMouseDown={() => {
                    setQuery("");
                    setOpenResults(false);
                    navigate(`/?q=${encodeURIComponent(medicine.name)}`);
                  }}
                >
                  <span className="text-sm font-medium text-slate-800">{medicine.name}</span>
                  <em className="text-sm not-italic font-semibold text-brand">
                    {formatSom(medicine.price)}
                  </em>
                </button>
              ))}
            </div>
          )}
        </div>

        <Link
          to="/cart"
          className="relative inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-white no-underline hover:bg-brand-hover max-md:col-span-2 max-md:justify-center"
        >
          <ShoppingCart className="h-4 w-4" />
          Savatcha
          {itemCount > 0 && (
            <b className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-slate-900 px-1 text-[11px] font-bold text-white">
              {itemCount}
            </b>
          )}
        </Link>
      </div>
      <BranchModal />
    </header>
  );
}
