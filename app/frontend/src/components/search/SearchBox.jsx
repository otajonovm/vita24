import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { formatSom } from "../../lib/format";
import { forgetRecentSearch, readRecentSearches, rememberSearch } from "../../lib/searchMemory";
import { logSearchClick, suggestMedicines } from "../../services/api";

function Highlight({ text, query }) {
  const source = String(text || "");
  const needle = String(query || "").trim();
  const index = needle ? source.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  if (index < 0) return source;
  return (
    <>
      {source.slice(0, index)}
      <mark className="bg-transparent font-extrabold text-slate-950">{source.slice(index, index + needle.length)}</mark>
      {source.slice(index + needle.length)}
    </>
  );
}

function ResultButton({ medicine, query, active, onPick, t }) {
  const inStock = Number(medicine.stockCount) > 0;
  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onPick(medicine);
      }}
      className={`flex w-full items-start justify-between gap-3 px-3.5 py-2.5 text-left ${active ? "bg-emerald-50" : "hover:bg-slate-50"}`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">
          <Highlight text={medicine.name} query={query} />
          {medicine.dosage ? <span className="ml-1 font-normal text-slate-500">{medicine.dosage}</span> : null}
        </span>
        {medicine.matchReason ? <span className="mt-0.5 block text-xs text-slate-500">{medicine.matchReason}</span> : null}
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-bold tabular-nums text-slate-900">{formatSom(medicine.price)}</span>
        <span className={`text-[11px] font-semibold ${inStock ? "text-[#087B51]" : "text-slate-400"}`}>
          {inStock ? t("search.inStock") : t("search.outOfStock")}
        </span>
      </span>
    </button>
  );
}

export default function SearchBox({
  query,
  setQuery,
  groups = { medicines: [], ingredients: [], symptoms: [] },
  suggestions = [],
  popularQueries = [],
  openResults,
  setOpenResults,
  navigate,
  onSubmitQuery,
  searching = false,
  searchError = "",
  branchId,
  className,
}) {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recent, setRecent] = useState([]);
  const [idlePopular, setIdlePopular] = useState(popularQueries);
  const boxRef = useRef(null);
  const trimmed = query.trim();
  const showIdle = openResults && trimmed.length < 2 && !searching;
  const sections = useMemo(
    () => [
      { key: "medicines", title: t("search.medicinesGroup"), items: groups.medicines || [] },
      { key: "ingredients", title: t("search.ingredientGroup"), items: groups.ingredients || [] },
      { key: "symptoms", title: t("search.symptomGroup"), items: groups.symptoms || [] },
    ].filter((section) => section.items.length),
    [groups, t]
  );
  const flat = useMemo(() => {
    const rows = sections.flatMap((section) => section.items.map((medicine) => ({ type: "medicine", medicine })));
    suggestions.forEach((name) => rows.push({ type: "suggest", name }));
    return rows;
  }, [sections, suggestions]);
  const missed = openResults && trimmed.length >= 2 && flat.length === 0 && !searching && !searchError;

  useEffect(() => {
    setActiveIndex(-1);
  }, [trimmed, flat.length]);

  function goToQuery(value) {
    const next = String(value || "").trim();
    if (next) rememberSearch(next);
    setOpenResults(false);
    onSubmitQuery?.(next);
    navigate(next ? `/catalog?q=${encodeURIComponent(next)}` : "/catalog");
  }

  function openMedicine(medicine) {
    if (trimmed) rememberSearch(trimmed);
    if (trimmed && medicine?.id) {
      logSearchClick({ query: trimmed, medicineId: medicine.id, branchId }).catch(() => {});
    }
    setQuery("");
    setOpenResults(false);
    navigate(medicine.slug ? `/medicine/${medicine.slug}` : `/catalog?q=${encodeURIComponent(medicine.name)}`);
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      setOpenResults(false);
      return;
    }
    if (!openResults) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!flat.length) return;
      event.preventDefault();
      setActiveIndex((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        if (next < 0) return flat.length - 1;
        return next % flat.length;
      });
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const picked = flat[activeIndex];
      if (picked?.type === "medicine") openMedicine(picked.medicine);
      else if (picked?.type === "suggest") goToQuery(picked.name);
      else goToQuery(trimmed);
    }
  }

  async function onFocus() {
    setRecent(readRecentSearches());
    setOpenResults(true);
    if (trimmed.length >= 2 || idlePopular.length) return;
    try {
      const data = await suggestMedicines({ branchId, search: "" });
      setIdlePopular(data.popularQueries || []);
    } catch {
      setIdlePopular([]);
    }
  }

  let cursor = -1;
  const panelClass =
    "z-20 w-full overflow-y-auto overscroll-contain border border-slate-100 bg-white shadow-sm max-md:fixed max-md:inset-x-0 max-md:top-14 max-md:max-h-[calc(100dvh-3.5rem)] max-md:rounded-none md:absolute md:inset-x-0 md:top-[calc(100%+6px)] md:max-h-[min(24rem,70dvh)] md:rounded-2xl";

  return (
    <div ref={boxRef} className={`relative ${className || ""}`}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={query}
        placeholder={t("search.placeholder")}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpenResults(true);
        }}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpenResults(false), 160)}
        className="h-11 w-full rounded-full border border-slate-200 bg-slate-50 pl-10 pr-4 text-base outline-none ring-[#087b51]/30 placeholder:truncate placeholder:text-slate-400 focus:bg-white focus:ring-2 md:text-sm lg:h-12"
      />
      {searching && openResults && (
        <div className={`${panelClass} p-3 text-sm font-semibold text-slate-600`}>{t("common.searching")}</div>
      )}
      {searchError && openResults && !searching && (
        <div className={`${panelClass} p-3 text-sm font-semibold text-red-700`}>{searchError}</div>
      )}
      {showIdle && (
        <div className={panelClass}>
          {recent.length > 0 && (
            <div className="p-2">
              <p className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-400">{t("search.recent")}</p>
              {recent.map((item) => (
                <div key={item} className="flex items-center">
                  <button type="button" className="min-w-0 flex-1 rounded-xl px-2 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50" onMouseDown={() => goToQuery(item)}>
                    {item}
                  </button>
                  <button
                    type="button"
                    aria-label={t("search.recentClear")}
                    className="grid h-9 w-9 place-items-center text-slate-400"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setRecent(forgetRecentSearch(item));
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {idlePopular.length > 0 && (
            <div className="border-t border-slate-100 p-2">
              <p className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-400">{t("search.popularQueries")}</p>
              {idlePopular.map((item) => (
                <button key={item.query} type="button" className="block w-full rounded-xl px-2 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50" onMouseDown={() => goToQuery(item.query)}>
                  {item.query}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {openResults && trimmed.length >= 2 && !searching && !searchError && (sections.length > 0 || suggestions.length > 0) && (
        <div className={panelClass}>
          {sections.map((section) => (
            <div key={section.key} className="border-b border-slate-100 last:border-0">
              <p className="px-3.5 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-slate-400">{section.title}</p>
              {section.items.map((medicine) => {
                cursor += 1;
                const index = cursor;
                return (
                  <ResultButton
                    key={`${section.key}-${medicine.id}`}
                    medicine={medicine}
                    query={trimmed}
                    active={index === activeIndex}
                    onPick={openMedicine}
                    t={t}
                  />
                );
              })}
            </div>
          ))}
          {suggestions.length > 0 && (
            <div className="p-3">
              {suggestions.map((name) => {
                cursor += 1;
                const index = cursor;
                return (
                  <button
                    key={name}
                    type="button"
                    className={`block w-full rounded-xl px-1 py-2 text-left text-sm font-bold text-[#087B51] ${index === activeIndex ? "bg-emerald-50" : ""}`}
                    onMouseDown={() => goToQuery(name)}
                  >
                    {t("search.didYouMean", { name })}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {missed && <div className={`${panelClass} p-3 text-sm font-semibold text-slate-700`}>{t("search.none")}</div>}
    </div>
  );
}
