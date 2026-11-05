import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Search, X } from "lucide-react";
import { formatPriceLabel } from "../../lib/format";
import { resolveMediaUrl } from "../../lib/media";
import { forgetRecentSearch, readRecentSearches, rememberSearch } from "../../lib/searchMemory";
import { peekPublicSettings } from "../../lib/publicSettings";
import { logSearchClick, suggestMedicines } from "../../services/api";
import { useBranchStore } from "../../store/useBranchStore";
import { useCartStore } from "../../store/useCartStore";
import { useToastStore } from "../../store/useToastStore";

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

function ResultButton({ medicine, query, active, onPick, onAdd, t, branchId }) {
  const inStock = Number(medicine.stockCount) > 0;
  const imageSrc = resolveMediaUrl(medicine.imageUrl);
  return (
    <div className={`flex w-full items-start gap-2 px-3.5 py-2.5 ${active ? "bg-emerald-50" : "hover:bg-slate-50"}`}>
      <button
        type="button"
        onMouseDown={(event) => {
          event.preventDefault();
          onPick(medicine);
        }}
        className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-emerald-50 text-[10px] font-bold text-[#087B51]">
          {imageSrc ? (
            <img src={imageSrc} alt="" className="h-full w-full object-contain p-0.5" loading="lazy" />
          ) : (
            "Rx"
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-800">
            <Highlight text={medicine.name} query={query} />
            {medicine.dosage ? <span className="ml-1 font-normal text-slate-500">{medicine.dosage}</span> : null}
          </span>
          {medicine.matchReason ? <span className="mt-0.5 block text-xs text-slate-500">{medicine.matchReason}</span> : null}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-bold tabular-nums text-slate-900">{formatPriceLabel(medicine, t)}</span>
          <span className={`text-[11px] font-semibold ${inStock ? "text-[#087B51]" : "text-slate-400"}`}>
            {inStock ? t("search.inStock") : t("search.outOfStock")}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={t("medicine.add")}
        className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-[#087B51] hover:bg-emerald-50"
        onMouseDown={(event) => {
          event.preventDefault();
          onAdd?.(medicine);
        }}
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2 p-3" aria-hidden>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center gap-3">
          <span className="h-10 w-10 animate-pulse rounded-lg bg-slate-100" />
          <span className="h-3 flex-1 animate-pulse rounded bg-slate-100" />
          <span className="h-3 w-16 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export default function SearchBox({
  query,
  setQuery,
  groups = { medicines: [], ingredients: [], symptoms: [] },
  suggestions = [],
  popularQueries = [],
  popular = [],
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
  const requireBranch = useBranchStore((state) => state.requireBranch);
  const branch = useBranchStore((state) => state.branch);
  const addToCart = useCartStore((state) => state.addToCart);
  const pushToast = useToastStore((state) => state.push);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recent, setRecent] = useState([]);
  const [idlePopular, setIdlePopular] = useState(popularQueries);
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const trimmed = query.trim();
  const showIdle = openResults && trimmed.length < 2 && !searching;
  const settings = peekPublicSettings();
  const telegramUrl = settings?.telegramBotUrl || (settings?.telegramBotUsername ? `https://t.me/${settings.telegramBotUsername}` : "");

  const sections = useMemo(() => {
    const medicineItems = groups.medicines || [];
    const analogItems = groups.ingredients || [];
    const symptomItems = groups.symptoms || [];
    const rows = [
      { key: "medicines", title: t("search.medicinesGroup"), items: medicineItems },
      {
        key: "ingredients",
        title: medicineItems.some((item) => Number(item.stockCount) <= 0) ? t("search.analogs") : t("search.ingredientGroup"),
        items: analogItems,
      },
      { key: "symptoms", title: t("search.symptomGroup"), items: symptomItems },
    ];
    return rows.filter((section) => section.items.length);
  }, [groups, t]);

  const flat = useMemo(() => {
    const rows = sections.flatMap((section) => section.items.map((medicine) => ({ type: "medicine", medicine })));
    suggestions.forEach((name) => rows.push({ type: "suggest", name }));
    return rows;
  }, [sections, suggestions]);

  const hasResults = sections.length > 0 || suggestions.length > 0 || popular.length > 0 || idlePopular.length > 0;
  const missed = openResults && trimmed.length >= 2 && !searching && !searchError && flat.length === 0;

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

  function quickAdd(medicine) {
    if (!requireBranch() || !branch) return;
    const stockCount = Number(medicine.stockCount) || 0;
    if (stockCount <= 0) {
      pushToast(t("medicine.soldOut"), "info", { duration: 1800 });
      return;
    }
    const added = addToCart(medicine, branch.id, medicine.dosageUnit || "tabletka");
    if (!added) {
      pushToast(t("cart.onlyLeft", { count: stockCount }), "info", { duration: 2200 });
      return;
    }
    pushToast(t("medicine.added", { name: medicine.name }), "info", { duration: 1600 });
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
    "absolute inset-x-0 top-[calc(100%+6px)] z-20 max-h-[min(24rem,70dvh)] w-full overflow-y-auto overscroll-contain rounded-2xl border border-slate-100 bg-white shadow-sm";

  return (
    <div ref={boxRef} className={`relative ${className || ""}`}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="off"
        value={query}
        placeholder={t("search.placeholder")}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpenResults(true);
        }}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpenResults(false), 160)}
        className="h-11 w-full rounded-full border border-slate-200 bg-slate-50 pl-10 pr-11 text-base outline-none ring-[#087b51]/30 placeholder:truncate placeholder:text-slate-400 focus:bg-white focus:ring-2 md:text-sm lg:h-12"
      />
      {trimmed ? (
        <button
          type="button"
          aria-label={t("search.clear")}
          className="absolute right-2.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          onMouseDown={(event) => {
            event.preventDefault();
            setQuery("");
            setOpenResults(true);
            inputRef.current?.focus();
          }}
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}

      {searching && openResults && trimmed.length >= 2 ? (
        <div className={panelClass}>
          <SkeletonRows />
        </div>
      ) : null}

      {searchError && openResults && !searching ? (
        <div className={`${panelClass} p-3 text-sm font-semibold text-red-700`}>{searchError}</div>
      ) : null}

      {showIdle ? (
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
      ) : null}

      {openResults && trimmed.length >= 2 && !searching && !searchError && hasResults && flat.length > 0 ? (
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
                    onAdd={quickAdd}
                    t={t}
                    branchId={branchId}
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
      ) : null}

      {missed ? (
        <div className={`${panelClass} p-3`}>
          <p className="text-sm font-semibold text-slate-700">{t("search.none")}</p>
          {suggestions.length > 0 &&
            suggestions.map((name) => (
              <button key={name} type="button" className="mt-2 block text-left text-sm font-bold text-[#087B51]" onMouseDown={() => goToQuery(name)}>
                {t("search.didYouMean", { name })}
              </button>
            ))}
          {(popularQueries.length > 0 || idlePopular.length > 0) && (
            <div className="mt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t("search.popularQueries")}</p>
              {(popularQueries.length ? popularQueries : idlePopular).slice(0, 6).map((item) => (
                <button
                  key={item.query || item}
                  type="button"
                  className="mt-1 block w-full rounded-lg px-1 py-1.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
                  onMouseDown={() => goToQuery(item.query || item)}
                >
                  {item.query || item}
                </button>
              ))}
            </div>
          )}
          {telegramUrl ? (
            <a
              href={telegramUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex text-sm font-bold text-[#087B51] no-underline"
              onMouseDown={(event) => event.preventDefault()}
            >
              {t("search.openTelegram")}
            </a>
          ) : (
            <p className="mt-3 text-xs font-semibold text-slate-500">{t("search.askPharmacist")}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
