import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { GripVertical, Pill, Search } from "lucide-react";
import { formatSom } from "../../lib/format";
import { resolveMediaUrl } from "../../lib/media";
import { fetchAdminBranches, fetchAdminCatalog, fetchShowcase, reorderShowcase, setMedicineHome } from "../../services/api";
import { useToastStore } from "../../store/useToastStore";
import { AdminSkeleton, EmptyState, ErrorState } from "./ui";

function errorText(error, fallback) {
  return error.response?.data?.error?.message || error.message || fallback;
}

function metaLine(item) {
  return [item.dosage, item.categoryName || item.category?.name, item.manufacturer].filter(Boolean).join(" · ");
}

export function ShowcasePanel() {
  const { t } = useTranslation();
  const push = useToastStore((state) => state.push);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [items, setItems] = useState([]);
  const [limit, setLimit] = useState(20);
  const [results, setResults] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState("");
  const [overId, setOverId] = useState("");

  async function load(nextBranch = branchId, silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const data = await fetchShowcase(nextBranch);
      setItems(data.items || []);
      setLimit(data.limit || 20);
    } catch (err) {
      setError(errorText(err, t("admin.errorTitle")));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetchAdminBranches()
      .then((list) => {
        if (!active) return;
        const open = (list || []).filter((branch) => branch.status !== "archived");
        setBranches(open);
        const id = open[0]?.id || "";
        setBranchId(id);
        load(id);
      })
      .catch((err) => {
        if (active) setError(errorText(err, t("admin.errorTitle")));
      });
    return () => {
      active = false;
    };
  }, [t]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      fetchAdminCatalog({ search: query, active: "active", page: 1, limit: 20 })
        .then((data) => {
          if (active) setResults(data.items || []);
        })
        .catch(() => {
          if (active) setResults([]);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  function onPaste(event) {
    const text = event.clipboardData?.getData("text");
    if (typeof text !== "string" || text === "") return;
    event.preventDefault();
    const el = event.currentTarget;
    const start = el.selectionStart ?? search.length;
    const end = el.selectionEnd ?? search.length;
    setSearch(`${search.slice(0, start)}${text}${search.slice(end)}`.slice(0, 80));
  }

  const selectedIds = new Set(items.map((item) => item.id));
  const visibleResults = results.filter((row) => !selectedIds.has(row.id));
  const full = items.length >= limit;

  async function add(row) {
    if (full) {
      push(t("admin.showcaseFull", { max: limit }), "error");
      return;
    }
    setBusyId(row.id);
    try {
      await setMedicineHome(row.id, true);
      await load(branchId, true);
      push(t("admin.showcaseAdded", { name: row.name }));
    } catch (err) {
      push(errorText(err, t("admin.errorTitle")), "error");
    } finally {
      setBusyId("");
    }
  }

  async function remove(row) {
    setBusyId(row.id);
    try {
      await setMedicineHome(row.id, false);
      setItems((current) => current.filter((item) => item.id !== row.id));
      push(t("admin.showcaseRemoved", { name: row.name }));
    } catch (err) {
      push(errorText(err, t("admin.errorTitle")), "error");
    } finally {
      setBusyId("");
    }
  }

  async function dropOn(targetId) {
    const sourceId = dragId;
    setDragId("");
    setOverId("");
    if (!sourceId || sourceId === targetId) return;
    const ids = items.map((item) => item.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const nextIds = [...ids];
    const [moved] = nextIds.splice(from, 1);
    nextIds.splice(to, 0, moved);
    const previous = items;
    const byId = new Map(items.map((item) => [item.id, item]));
    setItems(nextIds.map((id, index) => ({ ...byId.get(id), homeSortOrder: index + 1 })));
    try {
      await reorderShowcase(nextIds);
    } catch (err) {
      setItems(previous);
      push(errorText(err, t("admin.errorTitle")), "error");
    }
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">{t("admin.nav.showcase")}</h1>
          <p className="mt-1 text-sm font-semibold text-slate-700">{t("admin.showcaseCount", { count: items.length, max: limit })}</p>
        </div>
        <select
          aria-label={t("admin.colBranch")}
          value={branchId}
          onChange={(event) => {
            const next = event.target.value;
            setBranchId(next);
            load(next, true);
          }}
          className="h-11 rounded-xl border border-slate-200 px-3 text-sm"
        >
          {branches.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </div>

      {error && <ErrorState title={error} onRetry={() => load(branchId)} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <h2 className="text-sm font-extrabold text-slate-900">{t("admin.showcaseSelectedTitle")}</h2>
          <p className="mt-1 text-xs text-slate-500">{t("admin.showcaseDragHint")}</p>
          {loading ? (
            <div className="mt-3"><AdminSkeleton rows={3} /></div>
          ) : items.length === 0 ? (
            <div className="mt-3"><EmptyState title={t("admin.showcaseEmpty")} body={t("admin.showcaseEmptyBody")} /></div>
          ) : (
            <ul className="mt-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  draggable
                  onDragStart={() => setDragId(item.id)}
                  onDragEnd={() => {
                    setDragId("");
                    setOverId("");
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setOverId(item.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    dropOn(item.id);
                  }}
                  className={`flex items-center gap-2 border-t border-slate-100 py-3 ${overId === item.id && dragId ? "bg-emerald-50" : ""} ${dragId === item.id ? "opacity-50" : ""}`}
                >
                  <span className="grid h-9 w-9 shrink-0 cursor-grab place-items-center text-slate-400" aria-hidden>
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">{item.name}</p>
                    <p className="truncate text-xs text-slate-500">{metaLine(item)}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => remove(item)}
                    className="h-10 shrink-0 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-50"
                  >
                    {t("admin.showcaseRemove")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <h2 className="text-sm font-extrabold text-slate-900">{t("admin.showcaseSearchResults")}</h2>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value.slice(0, 80))}
              onPaste={onPaste}
              placeholder={t("admin.showcaseSearch")}
              aria-label={t("admin.search")}
              className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-sm outline-none ring-brand/30 focus:ring-2"
            />
          </div>
          {search.trim().length < 2 ? (
            <p className="mt-3 text-sm text-slate-500">{t("admin.showcaseSearchHint")}</p>
          ) : searching ? (
            <div className="mt-3"><AdminSkeleton rows={3} /></div>
          ) : visibleResults.length === 0 ? (
            <div className="mt-3"><EmptyState title={t("admin.catalogEmpty")} body={t("admin.showcaseSearchEmpty")} /></div>
          ) : (
            <ul className="mt-2">
              {visibleResults.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 border-t border-slate-100 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{row.name}</p>
                    <p className="truncate text-xs text-slate-500">{metaLine(row)}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === row.id || full}
                    onClick={() => add(row)}
                    className="h-10 shrink-0 rounded-xl bg-brand px-3 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {t("admin.toShowcase")}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {full && <p className="mt-3 text-xs font-semibold text-amber-800">{t("admin.showcaseFull", { max: limit })}</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <h2 className="text-sm font-extrabold text-slate-900">{t("admin.showcasePreview")}</h2>
        <p className="mt-1 text-xs text-slate-500">{t("admin.showcasePreviewHint")}</p>
        {items.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{t("admin.showcasePreviewEmpty")}</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5 lg:gap-5">
            {items.map((item) => {
              const image = resolveMediaUrl(item.imageUrl);
              return (
                <article key={item.id} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
                  <div className="grid h-36 place-items-center overflow-hidden rounded-xl border border-emerald-100/50 bg-emerald-50/70 md:h-40">
                    {image ? (
                      <img src={image} alt="" className="h-full w-full object-contain p-2" />
                    ) : (
                      <Pill className="h-12 w-12 stroke-[1.5] text-[#087B51]" aria-hidden />
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-bold text-slate-900">{item.name}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{item.dosage || item.manufacturer}</p>
                  <p className="mt-2 text-sm font-extrabold text-slate-900">{item.price == null ? "—" : formatSom(item.price)}</p>
                  {item.stockCount === 0 && <p className="mt-1 text-xs font-semibold text-red-600">{t("admin.outStock")}</p>}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
