import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LiaChevronDownSolid,
  LiaClipboardListSolid,
  LiaHeartSolid,
  LiaMapMarkerSolid,
  LiaSearchSolid,
  LiaShoppingBagSolid,
} from "react-icons/lia";
import { formatSom } from "../../lib/format";
import { branchShortLabel } from "../../lib/categoryIcons";
import { fetchMedicines } from "../../services/api";
import { useBranchStore } from "../../store/useBranchStore";
import { useCartStore } from "../../store/useCartStore";
import BranchModal from "../modals/BranchModal";

function SearchField({ query, setQuery, results, openResults, setOpenResults, navigate, className }) {
  return (
    <div className={`relative ${className}`}>
      <LiaSearchSolid className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={query}
        placeholder="Dori yoki faol modda..."
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => results.length > 0 && setOpenResults(true)}
        onBlur={() => setTimeout(() => setOpenResults(false), 160)}
        className="h-11 w-full rounded-full border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none ring-[#087b51]/30 placeholder:truncate placeholder:text-slate-400 focus:bg-white focus:ring-2 lg:h-12"
      />
      {openResults && results.length > 0 && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
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
              <span className="text-sm font-bold tabular-nums text-slate-900">
                {formatSom(medicine.price)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
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

  const hideSearch =
    location.pathname.startsWith("/branch-admin") || location.pathname.startsWith("/admin");

  const searchProps = { query, setQuery, results, openResults, setOpenResults, navigate };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur">
      <div className="mx-auto hidden w-full max-w-7xl items-center gap-4 px-6 py-3 lg:flex">
        <Link to="/" className="flex shrink-0 items-center gap-2.5 no-underline">
          <span className="grid h-11 w-11 shrink-0 overflow-hidden rounded-[12px]">
            <img
              src="/logo.jpg"
              alt="Vita24"
              className="h-full w-full scale-[1.35] object-cover"
              width={44}
              height={44}
            />
          </span>
          <span>
            <strong className="block text-base font-extrabold text-slate-900">Vita24</strong>
            <small className="block text-[11px] font-semibold uppercase tracking-wider text-[#087b51]">
              Onlayn dorixona
            </small>
          </span>
        </Link>

        <button
          type="button"
          onClick={openModal}
          className="flex min-w-44 items-center gap-2 rounded-xl bg-[#e7f6ef] px-3 py-2 text-left"
        >
          <LiaMapMarkerSolid className="h-4 w-4 shrink-0 text-[#087b51]" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase text-[#087b51]">Filial</span>
            <strong className="block truncate text-sm text-slate-900">{branchShortLabel(branch)}</strong>
          </span>
          <LiaChevronDownSolid className="h-4 w-4 text-[#087b51]" aria-hidden />
        </button>

        {!hideSearch && <SearchField {...searchProps} className="mx-auto w-full max-w-[450px]" />}

        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/favorites"
            className="inline-flex h-12 items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-700 no-underline hover:bg-slate-50"
          >
            <LiaHeartSolid className="h-4 w-4 text-[#087b51]" aria-hidden />
            Sevimlilar
          </Link>
          <Link
            to="/orders"
            className="inline-flex h-12 items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-700 no-underline hover:bg-slate-50"
          >
            <LiaClipboardListSolid className="h-4 w-4 text-[#087b51]" aria-hidden />
            Buyurtmalarim
          </Link>
          <Link
            to="/cart"
            className="relative inline-flex h-12 items-center gap-2 rounded-xl bg-[#087b51] px-4 text-sm font-bold text-white no-underline hover:bg-[#066341]"
          >
            <LiaShoppingBagSolid className="h-4 w-4" aria-hidden />
            Savatcha
            {itemCount > 0 && (
              <b className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[11px] font-bold text-[#087b51]">
                {itemCount}
              </b>
            )}
          </Link>
        </div>
      </div>

      <div className="mx-auto hidden w-full max-w-7xl items-center gap-3 px-6 py-2.5 md:flex lg:hidden">
        <Link to="/" className="flex shrink-0 items-center gap-2 no-underline">
          <span className="grid h-10 w-10 shrink-0 overflow-hidden rounded-[12px]">
            <img
              src="/logo.jpg"
              alt="Vita24"
              className="h-full w-full scale-[1.35] object-cover"
              width={40}
              height={40}
            />
          </span>
          <strong className="text-sm font-extrabold text-slate-900">Vita24</strong>
        </Link>
        <button
          type="button"
          onClick={openModal}
          className="flex min-w-0 max-w-48 items-center gap-1.5 rounded-xl bg-[#e7f6ef] px-2.5 py-2 text-left"
        >
          <LiaMapMarkerSolid className="h-4 w-4 shrink-0 text-[#087b51]" aria-hidden />
          <strong className="truncate text-xs text-slate-900">{branchShortLabel(branch)}</strong>
          <LiaChevronDownSolid className="h-4 w-4 shrink-0 text-[#087b51]" aria-hidden />
        </button>
        {!hideSearch && <SearchField {...searchProps} className="min-w-0 flex-1" />}
        <Link
          to="/favorites"
          className="grid h-11 w-11 place-items-center rounded-xl text-[#087b51] hover:bg-slate-50"
          aria-label="Sevimlilar"
        >
          <LiaHeartSolid className="h-5 w-5" aria-hidden />
        </Link>
        <Link
          to="/orders"
          className="grid h-11 w-11 place-items-center rounded-xl text-[#087b51] hover:bg-slate-50"
          aria-label="Buyurtmalarim"
        >
          <LiaClipboardListSolid className="h-5 w-5" aria-hidden />
        </Link>
        <Link
          to="/cart"
          className="relative grid h-11 w-11 place-items-center rounded-xl bg-[#087b51] text-white"
          aria-label="Savatcha"
        >
          <LiaShoppingBagSolid className="h-5 w-5" aria-hidden />
          {itemCount > 0 && (
            <b className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-[#087b51]">
              {itemCount}
            </b>
          )}
        </Link>
      </div>

      <div className="mx-auto w-full max-w-7xl px-3 py-2.5 md:hidden">
        <div className="flex items-center gap-2">
          <Link to="/" className="shrink-0 no-underline" aria-label="Vita24 bosh sahifa">
            <span className="grid h-10 w-10 overflow-hidden rounded-[12px]">
              <img
                src="/logo.jpg"
                alt="Vita24"
                className="h-full w-full scale-[1.35] object-cover"
                width={40}
                height={40}
              />
            </span>
          </Link>
          <button
            type="button"
            onClick={openModal}
            className="min-w-0 flex-1 rounded-xl bg-[#e7f6ef] px-2.5 py-1.5 text-left"
          >
            <span className="flex items-center gap-1 text-[#087b51]">
              <LiaMapMarkerSolid className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate text-xs font-semibold text-slate-800">
                {branchShortLabel(branch)}
              </span>
              <LiaChevronDownSolid className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </span>
          </button>
          <Link
            to="/cart"
            className="relative grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-[#087b51]"
            aria-label="Savatcha"
          >
            <LiaShoppingBagSolid className="h-5 w-5" aria-hidden />
            {itemCount > 0 && (
              <b className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#087b51] px-1 text-[10px] font-bold text-white">
                {itemCount}
              </b>
            )}
          </Link>
        </div>
        {!hideSearch && <SearchField {...searchProps} className="mt-2.5" />}
      </div>
      <BranchModal />
    </header>
  );
}
