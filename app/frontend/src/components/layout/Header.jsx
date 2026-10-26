import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Heart, MapPin, ShoppingCart, User } from "lucide-react";
import { createRequestGate, isCanceled } from "../../lib/requestGate";
import SearchBox from "../search/SearchBox";
import { fetchBranches, suggestMedicines } from "../../services/api";
import { useAuthStore } from "../../store/useAuthStore";
import { useBranchStore } from "../../store/useBranchStore";
import { useCartStore } from "../../store/useCartStore";
import BranchModal from "../modals/BranchModal";
import LanguageSwitcher from "./LanguageSwitcher";
import NotificationBell from "./NotificationBell";
import { useTranslation } from "react-i18next";

export default function Header() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const branch = useBranchStore((state) => state.branch);
  const setBranch = useBranchStore((state) => state.setBranch);
  const openModal = useBranchStore((state) => state.openModal);
  const hydrated = useBranchStore((state) => state.hydrated);
  const skipped = useBranchStore((state) => state.skipped);
  const user = useAuthStore((state) => state.user);
  const branchLocked =
    location.pathname.startsWith("/branch-admin") && user?.role === "BRANCH_ADMIN";
  const itemCount = useCartStore((state) =>
    state.items.reduce((sum, item) => sum + item.quantity, 0)
  );
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState({ medicines: [], ingredients: [], symptoms: [] });
  const [suggestions, setSuggestions] = useState([]);
  const [openResults, setOpenResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchGate = useRef(createRequestGate());
  const submittedQuery = useRef("");

  useEffect(() => {
    if (!branch?.id) return undefined;
    let active = true;
    fetchBranches()
      .then((list) => {
        if (!active) return;
        const fresh = (list || []).find((item) => item.id === branch.id);
        if (!fresh) return;
        if (fresh.isOpen !== branch.isOpen || fresh.workingHours !== branch.workingHours) {
          setBranch({ ...branch, isOpen: fresh.isOpen, workingHours: fresh.workingHours });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [branch?.id]);

  useEffect(() => {
    const mark = () => useBranchStore.setState({ hydrated: true });
    const persistApi = useBranchStore.persist;
    if (!persistApi) {
      mark();
      return undefined;
    }
    if (persistApi.hasHydrated()) mark();
    const unsub = persistApi.onFinishHydration(mark);
    const timer = window.setTimeout(mark, 300);
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!hydrated || branch || branchLocked || skipped) return;
    openModal();
  }, [hydrated, branch, branchLocked, skipped, openModal]);

  useEffect(() => {
    const needle = query.trim();
    const pageQuery = new URLSearchParams(location.search).get("q") || "";
    const onThisResult =
      (location.pathname === "/catalog" || location.pathname === "/") && pageQuery === needle && needle.length > 0;
    if (needle.length < 2 || onThisResult || submittedQuery.current === needle) {
      setGroups({ medicines: [], ingredients: [], symptoms: [] });
      setSuggestions([]);
      setSearching(false);
      setSearchError("");
      return undefined;
    }
    if (submittedQuery.current && submittedQuery.current !== needle) submittedQuery.current = "";

    const controller = new AbortController();
    const requestId = searchGate.current.next();
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      setOpenResults(true);
      try {
        const data = await suggestMedicines({
          branchId: branch?.id,
          search: needle,
          signal: controller.signal,
        });
        if (!searchGate.current.isLatest(requestId)) return;
        setGroups({
          medicines: data.medicines || [],
          ingredients: data.ingredients || [],
          symptoms: data.symptoms || [],
        });
        setSuggestions(data.suggestions || []);
        setOpenResults(true);
      } catch (error) {
        if (isCanceled(error) || !searchGate.current.isLatest(requestId)) return;
        setGroups({ medicines: [], ingredients: [], symptoms: [] });
        setSuggestions([]);
        setSearchError(t("error.generic"));
        setOpenResults(true);
      } finally {
        if (searchGate.current.isLatest(requestId)) setSearching(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, branch, location.pathname, location.search]);

  const hideSearch =
    location.pathname.startsWith("/branch-admin") || location.pathname.startsWith("/admin");

  function openBranchPicker() {
    if (branchLocked) return;
    openModal();
  }

  const searchProps = {
    query,
    setQuery,
    groups,
    suggestions,
    openResults,
    setOpenResults,
    navigate,
    branchId: branch?.id,
    onSubmitQuery: (value) => {
      submittedQuery.current = value;
      setGroups({ medicines: [], ingredients: [], symptoms: [] });
      setSuggestions([]);
      setOpenResults(false);
    },
    searching,
    searchError,
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur">
      {branch?.isOpen === false && (
        <p className="bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-900">
          {t("branch.closed", {
            time: String(branch.workingHours || "08:00").split(/[-–]/)[0].trim() || "08:00",
            defaultValue: "Filial hozir yopiq, ochilish vaqti {{time}}",
          })}
        </p>
      )}
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
              {t("header.brand")}
            </small>
          </span>
        </Link>

        <button
          type="button"
          onClick={openBranchPicker}
          disabled={branchLocked}
          title={branch ? `${branch.name}. ${t("header.branchHint")}` : t("branch.pick")}
          className="flex min-w-56 max-w-xs items-center gap-2 rounded-xl bg-[#e7f6ef] px-3 py-2 text-left"
        >
          <MapPin className="h-4 w-4 shrink-0 text-[#087b51]" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase text-[#087b51]">{t("header.branch")}</span>
            <strong className="block truncate text-sm text-slate-900">{branch?.name || t("branch.pick")}</strong>
            <span className="block truncate text-[10px] font-medium text-slate-500">{t("header.branchHint")}</span>
          </span>
          {!branchLocked && <ChevronDown className="h-4 w-4 shrink-0 text-[#087b51]" aria-hidden />}
        </button>

        {!hideSearch && <SearchBox {...searchProps} className="mx-auto w-full max-w-[450px]" />}

        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
          <LanguageSwitcher />
          <Link
            to="/favorites"
            className="inline-flex h-12 items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-700 no-underline hover:bg-slate-50"
          >
            <Heart className="h-4 w-4 text-[#087b51]" aria-hidden />
            {t("nav.favorites")}
          </Link>
          <Link
            to="/profile"
            className="inline-flex h-12 items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-700 no-underline hover:bg-slate-50"
          >
            <User className="h-4 w-4 text-[#087b51]" aria-hidden />
            {t("nav.profile")}
          </Link>
          <Link
            to="/cart"
            className="relative inline-flex h-12 items-center gap-2 rounded-xl bg-[#087b51] px-4 text-sm font-bold text-white no-underline hover:bg-[#066341]"
          >
            <ShoppingCart className="h-4 w-4" aria-hidden />
            {t("nav.cart")}
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
          onClick={openBranchPicker}
          disabled={branchLocked}
          title={branch ? `${branch.name}. ${t("header.branchHint")}` : t("branch.pick")}
          className="flex min-w-0 max-w-64 items-center gap-1.5 rounded-xl bg-[#e7f6ef] px-2.5 py-2 text-left"
        >
          <MapPin className="h-4 w-4 shrink-0 text-[#087b51]" aria-hidden />
          <span className="min-w-0">
            <strong className="block truncate text-xs text-slate-900">{branch?.name || t("branch.pick")}</strong>
            <span className="block truncate text-[10px] font-medium text-slate-500">{t("header.branchHint")}</span>
          </span>
          {!branchLocked && <ChevronDown className="h-4 w-4 shrink-0 text-[#087b51]" aria-hidden />}
        </button>
        {!hideSearch && <SearchBox {...searchProps} className="min-w-0 flex-1" />}
        <NotificationBell />
        <LanguageSwitcher />
        <Link
          to="/favorites"
          className="grid h-11 w-11 place-items-center rounded-xl text-[#087b51] hover:bg-slate-50"
          aria-label={t("nav.favorites")}
        >
          <Heart className="h-5 w-5" aria-hidden />
        </Link>
        <Link
          to="/profile"
          className="grid h-11 w-11 place-items-center rounded-xl text-[#087b51] hover:bg-slate-50"
          aria-label={t("nav.profile")}
        >
          <User className="h-5 w-5" aria-hidden />
        </Link>
        <Link
          to="/cart"
          className="relative grid h-11 w-11 place-items-center rounded-xl bg-[#087b51] text-white"
          aria-label={t("nav.cart")}
        >
          <ShoppingCart className="h-5 w-5" aria-hidden />
          {itemCount > 0 && (
            <b className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-[#087b51]">
              {itemCount}
            </b>
          )}
        </Link>
      </div>

      <div className="mx-auto w-full max-w-7xl px-3 py-2.5 md:hidden">
        <div className="flex items-center gap-2">
          <Link to="/" className="shrink-0 no-underline" aria-label={t("header.home")}>
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
            onClick={openBranchPicker}
            disabled={branchLocked}
            title={branch ? `${branch.name}. ${t("header.branchHint")}` : t("branch.pick")}
            className="min-w-0 flex-1 rounded-xl bg-[#e7f6ef] px-2.5 py-1.5 text-left disabled:cursor-default"
          >
            <span className="flex items-center gap-1 text-[#087b51]">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-slate-800">
                  {branch?.name || t("branch.pick")}
                </span>
                <span className="block truncate text-[10px] font-medium text-slate-500">{t("header.branchHint")}</span>
              </span>
              {!branchLocked && <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            </span>
          </button>
          <NotificationBell />
          <Link
            to="/cart"
            className="relative grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-[#087b51]"
            aria-label={t("nav.cart")}
          >
            <ShoppingCart className="h-5 w-5" aria-hidden />
            {itemCount > 0 && (
              <b className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#087b51] px-1 text-[10px] font-bold text-white">
                {itemCount}
              </b>
            )}
          </Link>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          {!hideSearch && <SearchBox {...searchProps} className="min-w-0 flex-1" />}
          <LanguageSwitcher />
        </div>
      </div>
      <BranchModal />
    </header>
  );
}
