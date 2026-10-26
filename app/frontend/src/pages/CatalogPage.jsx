import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import MedicineCard from "../components/cards/MedicineCard";
import ProductGrid from "../components/cards/ProductGrid";
import CategoryBar from "../components/home/CategoryBar";
import SearchEmpty from "../components/search/SearchEmpty";
import { EmptyState, ErrorState, LoadingButton, RefetchBar, SkeletonGrid } from "../components/ui";
import { fetchCategories, getMedicines } from "../services/api";
import { rememberSearch } from "../lib/searchMemory";
import { createRequestGate, isCanceled } from "../lib/requestGate";
import { userError } from "../lib/userError";
import { useBranchStore } from "../store/useBranchStore";

const PAGE_SIZE = 24;

export default function CatalogPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const branch = useBranchStore((state) => state.branch);
  const [categories, setCategories] = useState([]);
  const [categoryError, setCategoryError] = useState("");
  const [categoryReloadKey, setCategoryReloadKey] = useState(0);
  const [medicines, setMedicines] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [suggestion, setSuggestion] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [popular, setPopular] = useState([]);
  const [missCategories, setMissCategories] = useState([]);
  const categoryId = searchParams.get("category") || "";
  const query = searchParams.get("q") || "";
  const sort = searchParams.get("sort") || "popular";
  const inStockOnly = searchParams.get("stock") === "1";
  const requestGate = useRef(createRequestGate());

  useEffect(() => {
    setPage(1);
  }, [branch?.id, categoryId, query, sort, inStockOnly]);

  useEffect(() => {
    if (!branch?.id) {
      setCategories([]);
      return undefined;
    }
    let active = true;
    setCategoryError("");
    fetchCategories(branch.id)
      .then((data) => {
        if (active) setCategories(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!active) return;
        setCategories([]);
        setCategoryError(userError(err, t, "catalog.loadFailed"));
      });
    return () => {
      active = false;
    };
  }, [branch?.id, t, categoryReloadKey]);

  useEffect(() => {
    if (!branch && !query.trim()) {
      setMedicines([]);
      return undefined;
    }
    let active = true;
    const requestId = requestGate.current.next();
    const controller = new AbortController();
    if (page === 1) setLoading(true);
    setError("");
    getMedicines({
      branchId: branch.id,
      categoryId,
      search: query,
      sort: sort === "popular" ? "popular" : sort,
      page,
      limit: PAGE_SIZE,
      inStockOnly,
      signal: controller.signal,
    })
      .then((data) => {
        if (!active || !requestGate.current.isLatest(requestId)) return;
        const rows = data || [];
        setMedicines((current) => (page === 1 ? rows : [...current, ...rows]));
        setHasMore(rows.length === PAGE_SIZE);
        if (page === 1) {
          setSuggestion(rows.suggestion || "");
          setSuggestions(rows.suggestions || []);
          setPopular(rows.popular || []);
          setMissCategories(rows.categories || []);
          if (query.trim()) rememberSearch(query.trim());
        }
      })
      .catch((err) => {
        if (!active || isCanceled(err) || !requestGate.current.isLatest(requestId)) return;
        if (page === 1) setMedicines([]);
        setError(userError(err, t, "catalog.loadFailed"));
      })
      .finally(() => {
        if (active && requestGate.current.isLatest(requestId)) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [branch, categoryId, query, sort, inStockOnly, page, reloadKey, t]);

  const setCategory = (id) => {
    const next = new URLSearchParams(searchParams);
    if (!id || id === categoryId) next.delete("category");
    else next.set("category", id);
    setSearchParams(next);
  };

  const setSort = (value) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "popular") next.delete("sort");
    else next.set("sort", value);
    setSearchParams(next);
  };

  const emptyText = query.trim() ? t("empty.notFound") : t("catalog.empty");

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 max-w-full">
          <h1 className="text-xl font-extrabold text-slate-900">{t("catalog.title")}</h1>
          <p className="mt-1 break-words text-sm text-slate-500">
            {branch ? `${branch.name}${query ? ` · "${query}"` : ""}` : t("catalog.pickBranch")}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            {t("catalog.sortLabel")}
            <select
              aria-label={t("catalog.sortLabel")}
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-base md:text-sm"
            >
              <option value="popular">{t("catalog.sort.popular")}</option>
              <option value="price_asc">{t("catalog.sort.cheap")}</option>
              <option value="price_desc">{t("catalog.sort.expensive")}</option>
              <option value="name">{t("catalog.sort.name")}</option>
            </select>
          </label>
          <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(event) => {
                const next = new URLSearchParams(searchParams);
                if (event.target.checked) next.set("stock", "1");
                else next.delete("stock");
                setSearchParams(next);
              }}
              className="h-4 w-4 accent-[#087B51]"
            />
            {t("catalog.inStockOnly")}
          </label>
        </div>
      </div>
      {categoryError ? (
        <ErrorState title={categoryError} onRetry={() => setCategoryReloadKey((value) => value + 1)} retryLabel={t("common.retry")} />
      ) : null}
      <CategoryBar categories={categories} activeId={categoryId} onSelect={setCategory} />
      {loading && page === 1 && medicines.length === 0 && <SkeletonGrid count={8} />}
      {!loading && error && page === 1 && medicines.length === 0 && (
        <ErrorState title={error} onRetry={() => setReloadKey((value) => value + 1)} retryLabel={t("common.retry")} />
      )}
      {!loading && !error && medicines.length === 0 && query.trim() && (
        <SearchEmpty
          suggestion={suggestion}
          suggestions={suggestions}
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
        <EmptyState title={emptyText} />
      )}
      <div className="relative">
        <RefetchBar show={loading && medicines.length > 0} />
        {medicines.length > 0 && (
          <ProductGrid>
            {medicines.map((medicine) => (
              <MedicineCard key={medicine.id} medicine={medicine} />
            ))}
          </ProductGrid>
        )}
      </div>
      {hasMore && (
        <LoadingButton
          type="button"
          loading={loading && page > 1}
          loadingText={t("common.loading")}
          onClick={() => setPage((current) => current + 1)}
          className="h-11 justify-self-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 disabled:opacity-50"
        >
          {t("catalog.more")}
        </LoadingButton>
      )}
    </div>
  );
}
