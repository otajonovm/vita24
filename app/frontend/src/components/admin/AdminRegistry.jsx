import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  bulkRegistryImages,
  confirmRegistryMatch,
  decideRegistryImage,
  fetchRegistryReview,
  fetchRegistryStats,
  rejectRegistryMatch,
  searchRegistryDrugs,
  setAdminMedicineRx,
  setRegistryMatch,
} from "../../services/api";
import { resolveMediaUrl } from "../../lib/media";
import { userError } from "../../lib/userError";
import { LoadingButton } from "../ui";
import { EmptyState, ErrorState } from "./ui";

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-extrabold tabular-nums text-slate-900">{value ?? "…"}</p>
    </div>
  );
}

export function RegistryReviewPanel() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("matches");
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [pickerFor, setPickerFor] = useState(null);
  const [pickerQ, setPickerQ] = useState("");
  const [pickerResults, setPickerResults] = useState({ local: [], remote: [] });
  const [pickerBusy, setPickerBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function loadStats() {
    try {
      setStats(await fetchRegistryStats());
    } catch {
      /* ignore */
    }
  }

  async function loadList(nextPage = page) {
    setLoading(true);
    setError("");
    try {
      const data = await fetchRegistryReview({ tab, search: query, page: nextPage, limit: 12 });
      setItems(data.items || []);
      setPage(data.page || 1);
      setPages(data.pages || 1);
      setSelected(new Set());
    } catch (err) {
      setError(userError(err, t, "admin.errorTitle"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadList(1);
  }, [tab, query]);

  const selectedIds = useMemo(() => [...selected], [selected]);

  async function onConfirmMatch(row) {
    if (!row.registryDrug?.id) return;
    setBusyId(row.id);
    try {
      await confirmRegistryMatch(row.id, row.registryDrug.id);
      await Promise.all([loadList(page), loadStats()]);
    } catch (err) {
      setError(userError(err, t, "admin.registry.actionFailed"));
    } finally {
      setBusyId("");
    }
  }

  async function onRejectMatch(row) {
    setBusyId(row.id);
    try {
      await rejectRegistryMatch(row.id);
      await Promise.all([loadList(page), loadStats()]);
    } catch (err) {
      setError(userError(err, t, "admin.registry.actionFailed"));
    } finally {
      setBusyId("");
    }
  }

  async function onToggleRx(row) {
    setBusyId(row.id);
    try {
      await setAdminMedicineRx(row.id, !row.isPrescription);
      await Promise.all([loadList(page), loadStats()]);
    } catch (err) {
      setError(userError(err, t, "admin.registry.actionFailed"));
    } finally {
      setBusyId("");
    }
  }

  async function onImage(row, action, extra = {}) {
    setBusyId(row.id);
    try {
      await decideRegistryImage(row.id, { action, ...extra });
      await Promise.all([loadList(page), loadStats()]);
    } catch (err) {
      setError(userError(err, t, "admin.registry.actionFailed"));
    } finally {
      setBusyId("");
    }
  }

  async function onBulk(action) {
    if (!selectedIds.length) return;
    setBusyId("bulk");
    try {
      await bulkRegistryImages(selectedIds, action);
      await Promise.all([loadList(page), loadStats()]);
    } catch (err) {
      setError(userError(err, t, "admin.registry.actionFailed"));
    } finally {
      setBusyId("");
    }
  }

  async function openPicker(row) {
    setPickerFor(row);
    setPickerQ(row.name.split(/\s+/)[0] || row.name);
    setPickerResults({ local: [], remote: [] });
    setPickerBusy(true);
    try {
      const data = await searchRegistryDrugs(row.name.split(/\s+/)[0] || row.name);
      setPickerResults({ local: data.local || [], remote: data.remote || [] });
    } catch {
      setPickerResults({ local: [], remote: [] });
    } finally {
      setPickerBusy(false);
    }
  }

  async function runPickerSearch(event) {
    event?.preventDefault?.();
    if (!pickerQ.trim()) return;
    setPickerBusy(true);
    try {
      const data = await searchRegistryDrugs(pickerQ.trim());
      setPickerResults({ local: data.local || [], remote: data.remote || [] });
    } catch {
      setPickerResults({ local: [], remote: [] });
    } finally {
      setPickerBusy(false);
    }
  }

  async function chooseRegistry(registryDrugId) {
    if (!pickerFor) return;
    setBusyId(pickerFor.id);
    try {
      await setRegistryMatch(pickerFor.id, registryDrugId);
      setPickerFor(null);
      await Promise.all([loadList(page), loadStats()]);
    } catch (err) {
      setError(userError(err, t, "admin.registry.actionFailed"));
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="grid gap-4">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">{t("admin.registry.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("admin.registry.hint")}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={t("admin.registry.statRx")} value={stats?.rxTrue} />
        <Stat label={t("admin.registry.statOtc")} value={stats?.rxFalse} />
        <Stat label={t("admin.registry.statReview")} value={stats?.needsReview} />
        <Stat label={t("admin.registry.statUnmatched")} value={stats?.unmatched} />
        <Stat label={t("admin.registry.statNoImage")} value={stats?.noImage} />
        <Stat label={t("admin.registry.statPending")} value={stats?.pendingImages} />
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ["matches", t("admin.registry.tabMatches")],
          ["images", t("admin.registry.tabImages")],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`h-10 rounded-xl px-3 text-sm font-bold ${tab === id ? "bg-brand text-white" : "border border-slate-200 bg-white text-slate-700"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t("admin.registry.search")}
        className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
      />

      {tab === "images" && selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-2xl border border-amber-100 bg-amber-50 p-3">
          <p className="w-full text-sm font-semibold text-amber-900">
            {t("admin.registry.selected", { count: selectedIds.length })}
          </p>
          <LoadingButton
            type="button"
            loading={busyId === "bulk"}
            onClick={() => onBulk("approve")}
            className="h-10 rounded-xl bg-brand px-3 text-sm font-bold text-white"
          >
            {t("admin.registry.bulkApprove")}
          </LoadingButton>
          <LoadingButton
            type="button"
            loading={busyId === "bulk"}
            onClick={() => onBulk("reject")}
            className="h-10 rounded-xl border border-red-200 bg-white px-3 text-sm font-bold text-red-700"
          >
            {t("admin.registry.bulkReject")}
          </LoadingButton>
        </div>
      )}

      {loading && !items.length ? <p className="text-sm text-slate-500">{t("common.loading")}</p> : null}
      {error ? <ErrorState title={error} onRetry={() => loadList(page)} /> : null}
      {!loading && !error && !items.length ? <EmptyState title={t("admin.emptyTitle")} body={t("admin.emptyBody")} /> : null}

      <div className="grid gap-3">
        {items.map((row) => {
          const img = resolveMediaUrl(row.imageUrl);
          const checked = selected.has(row.id);
          return (
            <article key={row.id} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
              <div className="flex items-start gap-3">
                {tab === "images" && (
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      setSelected((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(row.id);
                        else next.delete(row.id);
                        return next;
                      });
                    }}
                    className="mt-1 h-5 w-5"
                    aria-label={t("admin.registry.selectRow")}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-extrabold text-slate-900">{row.name}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[row.dosageForm, row.dosage, row.manufacturer].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    {row.isPrescription ? t("admin.registry.rxYes") : t("admin.registry.rxNo")}
                    {row.rxSource ? ` · ${row.rxSource}` : ""}
                    {row.rxNeedsReview ? ` · ${t("admin.registry.needsReview")}` : ""}
                  </p>
                </div>
              </div>

              {tab === "matches" && (
                <div className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                  {row.registryDrug ? (
                    <>
                      <p className="font-bold text-slate-800">{t("admin.registry.mpaCandidate")}</p>
                      <p>{row.registryDrug.shortName}</p>
                      <p className="text-xs text-slate-500">
                        {[
                          row.registryDrug.dosageForm,
                          row.registryDrug.strength,
                          row.registryDrug.manufacturer,
                          row.registryDrug.isPrescription ? t("admin.registry.rxYes") : t("admin.registry.rxNo"),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="text-xs text-slate-500">
                        {t("admin.registry.score")}: {row.matchScore ?? "—"} · {row.matchStatus}
                      </p>
                    </>
                  ) : (
                    <p className="text-amber-800">{t("admin.registry.noCandidate")}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-2">
                    {row.registryDrug && (
                      <LoadingButton
                        type="button"
                        loading={busyId === row.id}
                        onClick={() => onConfirmMatch(row)}
                        className="h-10 rounded-xl bg-brand px-3 text-xs font-bold text-white"
                      >
                        {t("admin.registry.confirm")}
                      </LoadingButton>
                    )}
                    <button
                      type="button"
                      onClick={() => openPicker(row)}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
                    >
                      {t("admin.registry.pickOther")}
                    </button>
                    <LoadingButton
                      type="button"
                      loading={busyId === row.id}
                      onClick={() => onRejectMatch(row)}
                      className="h-10 rounded-xl border border-red-200 bg-white px-3 text-xs font-bold text-red-700"
                    >
                      {t("admin.registry.reject")}
                    </LoadingButton>
                    <LoadingButton
                      type="button"
                      loading={busyId === row.id}
                      onClick={() => onToggleRx(row)}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
                    >
                      {row.isPrescription ? t("admin.registry.markOtc") : t("admin.registry.markRx")}
                    </LoadingButton>
                  </div>
                </div>
              )}

              {tab === "images" && (
                <div className="mt-3 grid gap-3">
                  <div className="mx-auto h-56 w-full max-w-sm overflow-hidden rounded-2xl bg-emerald-50/60">
                    {img ? (
                      <img
                        src={img}
                        alt={row.name}
                        width={400}
                        height={400}
                        loading="lazy"
                        className="h-full w-full object-contain p-3"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-sm text-slate-500">{t("admin.registry.noImage")}</div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <LoadingButton
                      type="button"
                      loading={busyId === row.id}
                      onClick={() => onImage(row, "approve")}
                      className="h-10 rounded-xl bg-brand px-3 text-xs font-bold text-white"
                    >
                      {t("admin.registry.approveImage")}
                    </LoadingButton>
                    <LoadingButton
                      type="button"
                      loading={busyId === row.id}
                      onClick={() => onImage(row, "reject")}
                      className="h-10 rounded-xl border border-red-200 bg-white px-3 text-xs font-bold text-red-700"
                    >
                      {t("admin.registry.rejectImage")}
                    </LoadingButton>
                    {(row.registryImageCandidates || []).slice(0, 4).map((cand) => (
                      <button
                        key={`${cand.side}-${cand.url}`}
                        type="button"
                        onClick={() => onImage(row, "select-side", { side: cand.side, url: cand.url })}
                        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
                      >
                        {cand.side || t("admin.registry.otherSide")}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => loadList(page - 1)}
            className="h-10 rounded-xl border px-3 text-sm font-bold disabled:opacity-40"
          >
            {t("admin.prev")}
          </button>
          <span className="text-sm text-slate-600">{t("admin.page", { page, pages })}</span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => loadList(page + 1)}
            className="h-10 rounded-xl border px-3 text-sm font-bold disabled:opacity-40"
          >
            {t("admin.next")}
          </button>
        </div>
      )}

      {pickerFor && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-slate-900/40 p-0 sm:place-items-center sm:p-4" onClick={() => setPickerFor(null)}>
          <div
            className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 shadow-lg sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-base font-extrabold text-slate-900">{t("admin.registry.pickTitle")}</h3>
            <p className="mt-1 text-xs text-slate-500">{pickerFor.name}</p>
            <form onSubmit={runPickerSearch} className="mt-3 flex gap-2">
              <input
                value={pickerQ}
                onChange={(event) => setPickerQ(event.target.value)}
                className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
              />
              <LoadingButton type="submit" loading={pickerBusy} className="h-11 rounded-xl bg-brand px-3 text-sm font-bold text-white">
                {t("admin.registry.search")}
              </LoadingButton>
            </form>
            <div className="mt-3 grid gap-2">
              {[...pickerResults.local].map((item) => (
                <button
                  key={item.id || item.mpaId}
                  type="button"
                  onClick={() => chooseRegistry(item.id)}
                  className="rounded-xl border border-slate-100 p-3 text-left hover:border-brand"
                >
                  <p className="text-sm font-bold">{item.shortName}</p>
                  <p className="text-xs text-slate-500">
                    {[item.dosageForm, item.strength, item.manufacturer, item.isPrescription ? "Rx" : "OTC"].filter(Boolean).join(" · ")}
                  </p>
                </button>
              ))}
              {!pickerResults.local.length && !pickerBusy && (
                <p className="text-sm text-slate-500">{t("admin.registry.noLocalHits")}</p>
              )}
            </div>
            <button type="button" onClick={() => setPickerFor(null)} className="mt-4 h-11 w-full rounded-xl border text-sm font-bold">
              {t("admin.cancel")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
