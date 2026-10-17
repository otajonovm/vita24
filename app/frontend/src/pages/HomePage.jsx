import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { PackageSearch, RefreshCw, Store } from "lucide-react";
import MedicineCard from "../components/cards/MedicineCard";
import CategoryBar from "../components/home/CategoryBar";
import PromoCarousel from "../components/home/PromoCarousel";
import PrescriptionModal from "../components/modals/PrescriptionModal";
import SearchEmpty from "../components/search/SearchEmpty";
import { fetchCategories, getMedicines } from "../services/api";
import { createRequestGate, isCanceled } from "../lib/requestGate";
import { userError } from "../lib/userError";
import { useBranchStore } from "../store/useBranchStore";

function MedicineCardSkeleton() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="h-36 animate-pulse rounded-xl border border-emerald-100/50 bg-emerald-50/70 md:h-40" />
      <div className="mt-2 h-4 w-4/5 animate-pulse rounded bg-slate-100" />
      <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-slate-100" />
      <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-slate-100" />
      <div className="mt-2 h-11 animate-pulse rounded-xl bg-slate-100" />
    </div>
  );
}

export default function HomePage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const branch = useBranchStore((state) => state.branch);
  const openModal = useBranchStore((state) => state.openModal);
  const [categories, setCategories] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [popular, setPopular] = useState([]);
  const [missCategories, setMissCategories] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [rxOpen, setRxOpen] = useState(false);
  const requestGate = useRef(createRequestGate());
  const query = searchParams.get("q") || "";
  const categoryId = searchParams.get("category") || "";

  useEffect(() => {
    let active = true;
    fetchCategories(branch?.id || "").then((data) => {
      if (active && Array.isArray(data) && data.length > 0) setCategories(data);
    });
    return () => {
      active = false;
    };
  }, [branch?.id]);

  const loadMedicines = useCallback(() => {
    let active = true;
    const requestId = requestGate.current.next();
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const showcase = !query && !categoryId;
    const catalogRequest = getMedicines({
      branchId: branch?.id || undefined,
      search: query,
      categoryId,
      page: 1,
      limit: showcase ? 48 : 5000,
      signal: controller.signal,
    });
    const featuredRequest = showcase
      ? getMedicines({ branchId: branch?.id || undefined, featured: true, inStockOnly: false, limit: 20, signal: controller.signal }).catch((err) => (isCanceled(err) ? null : []))
      : Promise.resolve([]);
    Promise.all([catalogRequest, featuredRequest])
      .then(([data, featured]) => {
        if (!active || !requestGate.current.isLatest(requestId)) return;
        const rows = data || [];
        const picked = Array.isArray(featured) ? featured : [];
        const pickedIds = new Set(picked.map((item) => item.id));
        const merged = showcase ? [...picked, ...rows.filter((item) => !pickedIds.has(item.id))].slice(0, 48) : rows;
        setMedicines(merged);
        setSuggestion(rows.suggestion || "");
        setPopular(rows.popular || []);
        setMissCategories(rows.categories || []);
      })
      .catch((err) => {
        if (!active || isCanceled(err) || !requestGate.current.isLatest(requestId)) return;
        setMedicines([]);
        setError(userError(err, t, "home.loadFailed"));
      })
      .finally(() => {
        if (active && requestGate.current.isLatest(requestId)) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [branch?.id, query, categoryId, t]);

  useEffect(() => loadMedicines(), [loadMedicines, reloadKey]);

  const setCategory = (id) => {
    const next = new URLSearchParams(searchParams);
    if (!id || id === categoryId) next.delete("category");
    else next.set("category", id);
    setSearchParams(next);
  };

  const refresh = () => setReloadKey((current) => current + 1);
  const activeCategory = categories.find((item) => item.id === categoryId);
  const title = query ? t("home.searchTitle") : activeCategory?.name || t("home.title");
  const emptyText = query
    ? t("home.emptySearch")
    : categoryId
      ? t("home.emptyCategory")
      : t("home.emptyBranch");

  return (
    <div className="grid w-full min-w-0 gap-4 md:gap-5 lg:gap-8">
      <section className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm md:px-6 md:py-5">
        <p className="text-base font-extrabold leading-snug text-slate-900 md:text-xl">{t("home.heroTitle")}</p>
        <p className="mt-2 text-sm font-semibold text-[#087B51]">{t("home.heroSteps")}</p>
      </section>
      <PromoCarousel onUpload={() => setRxOpen(true)} />
      <CategoryBar categories={categories} activeId={categoryId} onSelect={setCategory} />

      <section className="min-w-0">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="min-w-0 text-base font-extrabold text-slate-900 md:text-xl">{title}</h2>
          {!query && !categoryId ? (
            <Link to="/catalog" className="shrink-0 text-sm font-bold text-[#087B51] no-underline">
              {t("home.allMedicines")}
            </Link>
          ) : !loading ? (
            <span className="shrink-0 text-xs font-semibold text-slate-400">{t("common.count", { count: medicines.length })}</span>
          ) : null}
        </div>

        {!branch?.id && (
          <button
            type="button"
            onClick={openModal}
            className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#087B51]"
          >
            <Store className="h-4 w-4" aria-hidden />
            {t("home.defaultBranch")}
          </button>
        )}

        {loading && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5 lg:gap-5">
            {Array.from({ length: 10 }, (_, index) => (
              <MedicineCardSkeleton key={index} />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center shadow-sm">
            <p className="text-sm font-semibold text-slate-700">{error}</p>
            <button
              type="button"
              onClick={refresh}
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-[#087B51] px-4 text-sm font-bold text-white hover:bg-[#066341]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              {t("common.refresh")}
            </button>
          </div>
        )}

        {!loading && !error && medicines.length === 0 && query.trim() && (
          <SearchEmpty
            suggestion={suggestion}
            popular={popular}
            categories={missCategories.length ? missCategories : categories}
            onSuggest={(name) => {
              const next = new URLSearchParams(searchParams);
              next.set("q", name);
              next.delete("category");
              setSearchParams(next);
            }}
            onCategory={setCategory}
          />
        )}

        {!loading && !error && medicines.length === 0 && !query.trim() && (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center shadow-sm">
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-emerald-100/50 bg-emerald-50/70 text-[#087B51]">
              <PackageSearch className="h-6 w-6 stroke-[1.5]" aria-hidden />
            </span>
            <p className="mt-3 max-w-sm text-sm font-semibold text-slate-700">{emptyText}</p>
            <button
              type="button"
              onClick={refresh}
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-[#087B51] px-4 text-sm font-bold text-white hover:bg-[#066341]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              {t("common.refresh")}
            </button>
          </div>
        )}

        {!loading && !error && medicines.length > 0 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5 lg:gap-5">
            {medicines.map((medicine) => (
              <MedicineCard key={medicine.id} medicine={medicine} />
            ))}
          </div>
        )}
      </section>
      <PrescriptionModal open={rxOpen} onClose={() => setRxOpen(false)} />
    </div>
  );
}
